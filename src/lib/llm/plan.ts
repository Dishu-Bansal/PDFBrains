/* Plan mode: the LLM is asked for a JSON-only plan of PDF operations (tool,
 * params, output file name, description). The user confirms the plan in the
 * chat, then every step is executed locally in a for loop, without the LLM. */

import type { LlmMessage, LlmTool } from "./types";
import { getLlmProvider } from "./index";
import { registerPdfTools } from "./pdfTools";
import {
  convertHtmlToPdf,
  convertOfficeToPdf,
  convertPdfToExcel,
  convertPdfToPdfa,
  convertPdfToPowerpoint,
  convertPdfToWord,
} from "../api";
import {
  deletePages,
  extractPages,
  imagesToPdf,
  mergePdfBlobs,
  mergeSelectedPages,
  pdfPageCount,
  splitBySize,
  splitIntoGroups,
  zipBlobs,
} from "../process";
import { renderPageToJpeg } from "../pdf";

registerPdfTools();

export type PlanToolName =
  | "merge-pdf"
  | "extract-pages"
  | "remove-pages"
  | "split-pdf"
  | "organize-pdf"
  | "word-to-pdf"
  | "powerpoint-to-pdf"
  | "excel-to-pdf"
  | "html-to-pdf"
  | "jpg-to-pdf"
  | "pdf-to-word"
  | "pdf-to-powerpoint"
  | "pdf-to-excel"
  | "pdf-to-pdfa"
  | "pdf-to-jpg";

/** Thrown when the model replies without calling create_plan. Carries the
 * model's text so the caller can show it as a regular chat reply. */
export class PlanRequestError extends Error {
  content: string;
  reasoningContent?: string;

  constructor(content: string, reasoningContent?: string) {
    super(content || "The AI did not return a plan. Try rewording the request.");
    this.name = "PlanRequestError";
    this.content = content;
    this.reasoningContent = reasoningContent;
  }
}

export interface PlanStep {
  tool: PlanToolName;
  params: {
    files?: string[];
    file?: string;
    pages?: number[];
    groups?: number[][];
    every?: number;
    sizeMB?: number;
    outputPrefix?: string;
    order?: { file: string; page: number }[];
    outputFormat?: string;
  };
  outputFile: string;
  description: string;
}

export interface PlannerFile {
  name: string;
  /** Page count when known, so the model can pick split sizes accurately. */
  pages?: number;
}

const PLAN_TOOLS: PlanToolName[] = [
  "merge-pdf",
  "extract-pages",
  "remove-pages",
  "split-pdf",
  "organize-pdf",
  "word-to-pdf",
  "powerpoint-to-pdf",
  "excel-to-pdf",
  "html-to-pdf",
  "jpg-to-pdf",
  "pdf-to-word",
  "pdf-to-powerpoint",
  "pdf-to-excel",
  "pdf-to-pdfa",
  "pdf-to-jpg",
];

const OFFICE_TO_PDF = new Set(["word-to-pdf", "powerpoint-to-pdf", "excel-to-pdf", "html-to-pdf"]);
const PDF_TO_FORMAT = new Set([
  "pdf-to-word",
  "pdf-to-powerpoint",
  "pdf-to-excel",
  "pdf-to-pdfa",
  "pdf-to-jpg",
]);

const WORD_FORMATS = new Set(["doc", "docx", "odt"]);
const PPT_FORMATS = new Set(["ppt", "pptx", "odp"]);
const PDFA_FORMATS = new Set(["pdfa1b", "pdfa2b", "pdfa2u", "pdfa3b", "pdfa3u"]);

function plannerPrompt(files: PlannerFile[]): string {
  const fileLines = files.length
    ? files.map((file) => `- ${file.name}${file.pages ? ` (${file.pages} pages)` : ""}`).join("\n")
    : "- none";
  return [
    "You are the operations planner for PDFBrains, a browser PDF tool suite.",
    "The user wants a sequence of PDF operations that produces a final file.",
    `Attached files (reference them by exact name):\n${fileLines}`,
    "",
    "Available tools, and when to use them:",
    "- split-pdf: split ONE PDF into multiple parts (by groups of 1-based pages, every N pages, or sizeMB) and package them as a ZIP. USE THIS whenever the user asks to split, divide or break a PDF into parts; never emulate splitting with one extract step per part.",
    "- organize-pdf: build a new PDF by taking pages from one or more files in a chosen order (reorder, rearrange, shuffle, compile pages across files). USE THIS for organize/reorder/compile requests instead of chaining many extract and merge steps.",
    "- merge-pdf: merge whole PDF files into one, in order (params: files: string[]).",
    "- extract-pages: pull specific 1-based pages out of ONE PDF into a new PDF (params: file, pages: number[]).",
    "- remove-pages: delete specific 1-based pages from a PDF, keeping the rest (params: file, pages: number[]).",
    "- pdf-to-word: convert a PDF to Word (outputFormat doc|docx|odt, default docx; output ends .docx).",
    "- pdf-to-powerpoint: convert a PDF to PowerPoint (outputFormat ppt|pptx|odp, default pptx; output ends .pptx).",
    "- pdf-to-excel: convert a PDF to Excel (output ends .xlsx).",
    "- pdf-to-pdfa: convert a PDF to PDF/A (outputFormat pdfa1b|pdfa2b|pdfa2u|pdfa3b|pdfa3u, default pdfa2b; output ends .pdf).",
    "- pdf-to-jpg: convert PDF pages to JPG images packaged as a ZIP (params: file, pages?: number[]; default all pages; output ends .zip).",
    "- word-to-pdf, powerpoint-to-pdf, excel-to-pdf: convert an Office file to PDF (params: file; output ends .pdf).",
    "- html-to-pdf: convert an HTML file to PDF (params: file; output ends .pdf).",
    "- jpg-to-pdf: convert images to a PDF, one page per image (params: files: string[]; output ends .pdf).",
    "Conversions take one input file (a PDF, office, HTML or image file) and",
    "produce one output file; they can follow local steps (for example extract",
    "pages, then convert the result to Word).",
    "",
    "Plan the steps in dependency order. A step may use, as input, an attached",
    "file, a file produced by an earlier step (by its outputFile name), or a",
    "split part name like <outputPrefix>_2.pdf. A split step creates parts",
    "named <outputPrefix>_1.pdf, <outputPrefix>_2.pdf, ... plus a ZIP saved",
    "under its outputFile.",
    "Prefer the FEWEST steps: if one split-pdf or organize-pdf call expresses",
    "part of the request, use it instead of expanding into many smaller steps.",
    "Every step must set a unique outputFile name (ending in .pdf, or .zip for",
    "a split) and a short human-readable description shown to the user for",
    "confirmation.",
    "",
    "The conversation history follows this message. Use it to understand what",
    "the user asked before and which plans you already produced; the latest",
    "user message may ask you to revise a previous plan. Output the FULL new",
    "plan (all steps), not just the changed ones.",
    "",
    "Respond with ONLY the JSON plan via the create_plan tool. No prose.",
  ].join("\n");
}

function createPlanTool(): LlmTool {
  return {
    name: "create_plan",
    description: "Returns the JSON plan of PDF operations. Respond with ONLY this JSON plan.",
    parameters: {
      type: "object",
      properties: {
        plan: {
          type: "array",
          description:
            "Ordered steps. Later steps may reference files produced by earlier steps by their outputFile names.",
          items: {
            type: "object",
            properties: {
              tool: { type: "string", enum: PLAN_TOOLS },
              params: {
                type: "object",
                oneOf: [
                  {
                    type: "object",
                    description: "For merge-pdf: input file names in merge order.",
                    properties: {
                      files: { type: "array", items: { type: "string" } },
                    },
                    required: ["files"],
                  },
                  {
                    type: "object",
                    description: "For extract-pages and remove-pages: input file and 1-based pages.",
                    properties: {
                      file: { type: "string" },
                      pages: { type: "array", items: { type: "integer" } },
                    },
                    required: ["file", "pages"],
                  },
                  {
                    type: "object",
                    description:
                      "For split-pdf: input file and exactly one of groups, every or sizeMB.",
                    properties: {
                      file: { type: "string" },
                      groups: { type: "array", items: { type: "array", items: { type: "integer" } } },
                      every: { type: "integer" },
                      sizeMB: { type: "number" },
                      outputPrefix: { type: "string" },
                    },
                    required: ["file"],
                  },
                  {
                    type: "object",
                    description: "For organize-pdf: input files and the output page order.",
                    properties: {
                      files: { type: "array", items: { type: "string" } },
                      order: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            file: { type: "string" },
                            page: { type: "integer" },
                          },
                          required: ["file", "page"],
                        },
                      },
                    },
                    required: ["files", "order"],
                  },
                  {
                    type: "object",
                    description:
                      "For all single-file conversions (word/ppt/excel/html-to-pdf, pdf-to-word/powerpoint/excel/pdfa/jpg): input file name; outputFormat optional for pdf-to-word/powerpoint/pdfa; pages optional (1-based) for pdf-to-jpg.",
                    properties: {
                      file: { type: "string" },
                      outputFormat: { type: "string" },
                      pages: { type: "array", items: { type: "integer" } },
                    },
                    required: ["file"],
                  },
                  {
                    type: "object",
                    description: "For jpg-to-pdf: image file names, one page per image.",
                    properties: {
                      files: { type: "array", items: { type: "string" } },
                    },
                    required: ["files"],
                  },
                ],
              },
              outputFile: {
                type: "string",
                description:
                  "Output file name: ends with .pdf, or .zip for a split step. Must be unique across the plan.",
              },
              description: {
                type: "string",
                description: "Short human description shown to the user for confirmation.",
              },
            },
            required: ["tool", "params", "outputFile", "description"],
          },
        },
      },
      required: ["plan"],
    },
  };
}

/**
 * Asks the active LLM for a JSON-only operation plan. The model is forced to
 * answer through the create_plan tool, so the reply is structured JSON.
 * `history` carries the earlier conversation (requests, replies and previous
 * plans) so a follow-up message can revise an earlier plan.
 */
export async function runLlmPlan(
  userText: string,
  files: PlannerFile[],
  history: LlmMessage[] = []
): Promise<PlanStep[]> {
  const provider = getLlmProvider();
  const messages: LlmMessage[] = [
    { role: "system", content: plannerPrompt(files) },
    ...history,
    { role: "user", content: userText },
  ];
  const result = await provider.chat(messages, {
    tools: [createPlanTool()],
    // "auto" rather than a forced choice: thinking models (deepseek-reasoner)
    // reject a forced tool_choice. Only create_plan is offered, so the model
    // can either call it or answer in prose.
    toolChoice: "auto",
    temperature: 0,
  });

  const call = result.toolCalls?.find((c) => c.name === "create_plan");
  if (!call) {
    throw new PlanRequestError(result.content, result.reasoningContent);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(call.arguments);
  } catch {
    throw new Error("The AI returned a plan that could not be read. Try again.");
  }
  return validatePlan(parsed);
}

function validatePlan(raw: unknown): PlanStep[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("The AI returned an invalid plan.");
  }
  const plan = (raw as { plan?: unknown }).plan;
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new Error("The AI returned an empty plan.");
  }

  const tools = new Set<string>(PLAN_TOOLS);
  const outputs = new Set<string>();
  const steps: PlanStep[] = [];

  for (const item of plan) {
    if (!item || typeof item !== "object") {
      throw new Error("The plan contains an invalid step.");
    }
    const step = item as {
      tool?: unknown;
      params?: {
        files?: unknown;
        file?: unknown;
        pages?: unknown;
        groups?: unknown;
        every?: unknown;
        sizeMB?: unknown;
        outputPrefix?: unknown;
        order?: unknown;
        outputFormat?: unknown;
      };
      outputFile?: unknown;
      description?: unknown;
    };

    if (typeof step.tool !== "string" || !tools.has(step.tool)) {
      throw new Error(`Unknown tool in the plan: ${String(step.tool)}.`);
    }
    const outputFile =
      typeof step.outputFile === "string" && step.outputFile.trim() ? step.outputFile.trim() : null;
    if (!outputFile) {
      throw new Error("A plan step is missing its output file name.");
    }
    if (outputs.has(outputFile)) {
      throw new Error(`Duplicate output file "${outputFile}" in the plan.`);
    }
    outputs.add(outputFile);

    const params = step.params ?? {};
    const description = typeof step.description === "string" ? step.description : "";
    const tool = step.tool as PlanToolName;

    if (tool === "merge-pdf") {
      const files = Array.isArray(params.files)
        ? params.files.filter((name): name is string => typeof name === "string")
        : [];
      if (files.length === 0) {
        throw new Error("A merge step has no input files.");
      }
      steps.push({ tool, params: { files }, outputFile, description });
    } else if (tool === "extract-pages" || tool === "remove-pages") {
      const file = typeof params.file === "string" ? params.file : "";
      const pages = Array.isArray(params.pages)
        ? params.pages.map(Number).filter((n) => Number.isInteger(n) && n >= 1)
        : [];
      if (!file) {
        throw new Error(`A ${tool} step is missing its input file.`);
      }
      if (pages.length === 0) {
        throw new Error(`A ${tool} step has no pages.`);
      }
      steps.push({ tool, params: { file, pages }, outputFile, description });
    } else if (tool === "split-pdf") {
      const file = typeof params.file === "string" ? params.file : "";
      if (!file) {
        throw new Error("A split step is missing its input file.");
      }
      const groups = Array.isArray(params.groups)
        ? params.groups
            .map((group) =>
              Array.isArray(group)
                ? group.map(Number).filter((n) => Number.isInteger(n) && n >= 1)
                : []
            )
            .filter((group) => group.length > 0)
        : [];
      const every =
        typeof params.every === "number" && Number.isInteger(params.every) && params.every >= 1
          ? params.every
          : undefined;
      const sizeMB =
        typeof params.sizeMB === "number" && params.sizeMB > 0 && Number.isFinite(params.sizeMB)
          ? params.sizeMB
          : undefined;
      const modeCount = [groups.length > 0, every !== undefined, sizeMB !== undefined].filter(Boolean).length;
      if (modeCount !== 1) {
        throw new Error(
          "A split step needs exactly one of groups, every or sizeMB (found none or several)."
        );
      }
      const outputPrefix =
        typeof params.outputPrefix === "string" && params.outputPrefix.trim()
          ? params.outputPrefix.trim()
          : undefined;
      steps.push({ tool, params: { file, groups, every, sizeMB, outputPrefix }, outputFile, description });
    } else if (tool === "organize-pdf") {
      const files = Array.isArray(params.files)
        ? params.files.filter((name): name is string => typeof name === "string")
        : [];
      const order = Array.isArray(params.order)
        ? params.order
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const e = entry as { file?: unknown; page?: unknown };
              const file = typeof e.file === "string" ? e.file : "";
              const page = typeof e.page === "number" && Number.isInteger(e.page) && e.page >= 1 ? e.page : null;
              return file && page !== null ? { file, page } : null;
            })
            .filter((entry): entry is { file: string; page: number } => entry !== null)
        : [];
      if (files.length === 0) {
        throw new Error("An organize step has no input files.");
      }
      if (order.length === 0) {
        throw new Error("An organize step has an empty page order.");
      }
      for (const entry of order) {
        if (!files.includes(entry.file)) {
          throw new Error(`An organize step references unknown file "${entry.file}".`);
        }
      }
      steps.push({ tool, params: { files, order }, outputFile, description });
    } else if (OFFICE_TO_PDF.has(tool)) {
      const file = typeof params.file === "string" ? params.file : "";
      if (!file) {
        throw new Error(`A ${tool} step is missing its input file.`);
      }
      steps.push({ tool, params: { file }, outputFile, description });
    } else if (tool === "jpg-to-pdf") {
      const files = Array.isArray(params.files)
        ? params.files.filter((name): name is string => typeof name === "string")
        : [];
      if (files.length === 0) {
        throw new Error("A jpg-to-pdf step has no image files.");
      }
      steps.push({ tool, params: { files }, outputFile, description });
    } else if (PDF_TO_FORMAT.has(tool)) {
      const file = typeof params.file === "string" ? params.file : "";
      if (!file) {
        throw new Error(`A ${tool} step is missing its input file.`);
      }
      let outputFormat = typeof params.outputFormat === "string" ? params.outputFormat.trim() : "";
      if (tool === "pdf-to-word" && !WORD_FORMATS.has(outputFormat)) outputFormat = "docx";
      if (tool === "pdf-to-powerpoint" && !PPT_FORMATS.has(outputFormat)) outputFormat = "pptx";
      if (tool === "pdf-to-pdfa" && !PDFA_FORMATS.has(outputFormat)) outputFormat = "pdfa2b";
      if (tool === "pdf-to-excel" || tool === "pdf-to-jpg") outputFormat = "";
      const pages =
        tool === "pdf-to-jpg"
          ? Array.isArray(params.pages)
            ? params.pages.map(Number).filter((n) => Number.isInteger(n) && n >= 1)
            : []
          : undefined;
      steps.push({
        tool,
        params: pages ? { file, pages, outputFormat: outputFormat || undefined } : { file, outputFormat: outputFormat || undefined },
        outputFile,
        description,
      });
    } else {
      throw new Error(`Unknown tool in the plan: ${tool}.`);
    }
  }
  return steps;
}

export interface PlanExecution {
  finalName: string;
  finalBlob: Blob;
}

/**
 * Executes every step locally in a for loop, without the LLM. Inputs are
 * resolved from the attached files plus the outputs of earlier steps.
 */
export async function executePlan(
  steps: PlanStep[],
  sources: Map<string, Blob>,
  onStep?: (index: number, step: PlanStep) => void
): Promise<PlanExecution> {
  const workspace = new Map(sources);
  for (let index = 0; index < steps.length; index++) {
    onStep?.(index, steps[index]);
    const output = await runStep(steps[index], workspace);
    workspace.set(steps[index].outputFile, output);
  }
  const finalName = steps[steps.length - 1]?.outputFile;
  const finalBlob = finalName ? workspace.get(finalName) : undefined;
  if (!finalBlob) {
    throw new Error("The plan produced no output file.");
  }
  return { finalName, finalBlob };
}

async function runStep(step: PlanStep, workspace: Map<string, Blob>): Promise<Blob> {
  const resolve = (name: string): Blob => {
    const blob = workspace.get(name);
    if (!blob) {
      throw new Error(
        `Missing input file "${name}" for step ${step.tool}. Make sure the plan references attached files by their exact names.`
      );
    }
    return blob;
  };

  if (step.tool === "merge-pdf") {
    return mergePdfBlobs((step.params.files ?? []).map(resolve));
  }
  if (step.tool === "extract-pages") {
    return extractPages(resolve(step.params.file ?? ""), step.params.pages ?? []);
  }
  if (step.tool === "remove-pages") {
    return deletePages(resolve(step.params.file ?? ""), step.params.pages ?? []);
  }
  if (step.tool === "split-pdf") {
    const source = resolve(step.params.file ?? "");
    const prefix =
      step.params.outputPrefix?.trim() ||
      step.outputFile.replace(/\.zip$/i, "").replace(/\.pdf$/i, "");
    let parts: Blob[];
    if (step.params.groups?.length) {
      parts = await splitIntoGroups(source, step.params.groups);
    } else if (step.params.every) {
      const count = await pdfPageCount(source);
      const groups: number[][] = [];
      for (let start = 1; start <= count; start += step.params.every) {
        const end = Math.min(start + step.params.every - 1, count);
        const group: number[] = [];
        for (let page = start; page <= end; page++) group.push(page);
        groups.push(group);
      }
      parts = await splitIntoGroups(source, groups);
    } else if (step.params.sizeMB) {
      parts = await splitBySize(source, step.params.sizeMB * 1024 * 1024);
    } else {
      throw new Error("A split step needs groups, every or sizeMB.");
    }
    // Register every part so later steps can reference them by name, then
    // package the parts into the ZIP that this step outputs.
    parts.forEach((part, index) => {
      workspace.set(`${prefix}_${index + 1}.pdf`, part);
    });
    return zipBlobs(parts.map((part, index) => ({ name: `${prefix}_${index + 1}.pdf`, blob: part })));
  }
  if (step.tool === "organize-pdf") {
    const names = step.params.files ?? [];
    const sources = names.map(resolve);
    const order = (step.params.order ?? []).map((entry) => {
      const fileIndex = names.indexOf(entry.file);
      if (fileIndex < 0) {
        throw new Error(`An organize step references unknown file "${entry.file}".`);
      }
      return { fileIndex, pageNumber: entry.page };
    });
    return mergeSelectedPages(sources, order);
  }

  // Conversion tools. Backend conversions take a File; wrap the workspace
  // blob so the multipart upload keeps the input file name AND its content
  // type (Stirling rejects PDF conversions whose upload is not
  // application/pdf).
  const toFile = (blob: Blob, name: string): File =>
    new File([blob], name, { type: blob.type || "application/pdf" });
  const inputFile = (): File => toFile(resolve(step.params.file ?? ""), step.params.file ?? "input");

  if (OFFICE_TO_PDF.has(step.tool)) {
    const converted = step.tool === "html-to-pdf" ? convertHtmlToPdf : convertOfficeToPdf;
    return converted(inputFile());
  }
  if (step.tool === "jpg-to-pdf") {
    return imagesToPdf((step.params.files ?? []).map((name) => toFile(resolve(name), name)));
  }
  if (step.tool === "pdf-to-word") {
    return convertPdfToWord(inputFile(), step.params.outputFormat ?? "docx");
  }
  if (step.tool === "pdf-to-powerpoint") {
    return convertPdfToPowerpoint(inputFile(), step.params.outputFormat ?? "pptx");
  }
  if (step.tool === "pdf-to-excel") {
    return convertPdfToExcel(inputFile());
  }
  if (step.tool === "pdf-to-pdfa") {
    return convertPdfToPdfa(inputFile(), step.params.outputFormat ?? "pdfa2b", false, false);
  }
  if (step.tool === "pdf-to-jpg") {
    const file = inputFile();
    const count = await pdfPageCount(file);
    const pages =
      step.params.pages?.length && step.params.pages.every((p) => p <= count)
        ? step.params.pages
        : Array.from({ length: count }, (_, i) => i + 1);
    const base = (step.params.file ?? "document").replace(/\.[^.]+$/, "");
    const jpgs: Blob[] = [];
    for (const page of pages) {
      jpgs.push(await renderPageToJpeg(file, page));
    }
    return zipBlobs(jpgs.map((blob, index) => ({ name: `${base}_page_${pages[index]}.jpg`, blob })));
  }
  throw new Error(`Unknown tool "${step.tool}".`);
}
