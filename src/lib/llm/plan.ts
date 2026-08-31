/* Plan mode: the LLM is asked for a JSON-only plan of PDF operations (tool,
 * params, output file name, description). The user confirms the plan in the
 * chat, then every step is executed locally in a for loop, without the LLM. */

import type { LlmMessage, LlmTool } from "./types";
import { getLlmProvider } from "./index";
import { registerPdfTools } from "./pdfTools";
import { deletePages, extractPages, mergePdfBlobs } from "../process";

registerPdfTools();

export type PlanToolName = "merge-pdf" | "extract-pages" | "remove-pages";

/** Thrown when the model replies without calling create_plan. Carries the
 * model's text so the caller can show it as a regular chat reply. */
export class PlanRequestError extends Error {
  content: string;

  constructor(content: string) {
    super(content || "The AI did not return a plan. Try rewording the request.");
    this.name = "PlanRequestError";
    this.content = content;
  }
}

export interface PlanStep {
  tool: PlanToolName;
  params: {
    files?: string[];
    file?: string;
    pages?: number[];
  };
  outputFile: string;
  description: string;
}

const PLAN_TOOLS: PlanToolName[] = ["merge-pdf", "extract-pages", "remove-pages"];

function plannerPrompt(fileNames: string[]): string {
  return [
    "You are the operations planner for PDFBrains, a browser PDF tool suite.",
    "The user wants a sequence of PDF operations that produces a final file.",
    `Attached files (reference them by exact name): ${fileNames.join(", ") || "none"}.`,
    "",
    "Available tools:",
    "- merge-pdf: merge multiple PDFs into one, in order (params: files: string[]).",
    "- extract-pages: extract 1-based pages from a PDF into a new PDF (params: file, pages: number[]).",
    "- remove-pages: remove 1-based pages from a PDF, keeping the rest (params: file, pages: number[]).",
    "",
    "Plan the steps in dependency order. A step may use, as input, an attached",
    "file or a file produced by an earlier step (by its outputFile name).",
    "Every step must set a unique outputFile name (ending in .pdf) and a short",
    "human-readable description shown to the user for confirmation.",
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
                ],
              },
              outputFile: {
                type: "string",
                description: "Output file name, ending in .pdf. Must be unique across the plan.",
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
 */
export async function runLlmPlan(userText: string, fileNames: string[]): Promise<PlanStep[]> {
  const provider = getLlmProvider();
  const messages: LlmMessage[] = [
    { role: "system", content: plannerPrompt(fileNames) },
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
    throw new PlanRequestError(result.content);
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
      params?: { files?: unknown; file?: unknown; pages?: unknown };
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
    } else {
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
  throw new Error(`Unknown tool "${step.tool}".`);
}
