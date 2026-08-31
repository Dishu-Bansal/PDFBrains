/* LLM tool definitions for the PDF operations the AI can plan. The handlers
 * here only serve the mid-chat dispatch path; the planner flow executes steps
 * through the plan runner after the user confirms. */

import { registerTool } from "./tools";
import type { LlmToolHandler } from "./tools";

const mergeParams = {
  type: "object",
  properties: {
    files: {
      type: "array",
      items: { type: "string" },
      description:
        "Input PDF file names in merge order: attached files or files produced by earlier plan steps.",
    },
  },
  required: ["files"],
};

const pageSelectionParams = {
  type: "object",
  properties: {
    file: {
      type: "string",
      description:
        "Input PDF file name: an attached file or a file produced by an earlier plan step.",
    },
    pages: {
      type: "array",
      items: { type: "integer" },
      description: "1-based page numbers to select.",
    },
  },
  required: ["file", "pages"],
};

const splitParams = {
  type: "object",
  properties: {
    file: {
      type: "string",
      description:
        "Input PDF file name: an attached file or a file produced by an earlier plan step.",
    },
    groups: {
      type: "array",
      items: { type: "array", items: { type: "integer" } },
      description:
        "Explicit 1-based page groups; each group becomes one output part. Provide exactly one of groups, every or sizeMB.",
    },
    every: {
      type: "integer",
      description: "Split into parts of this many pages each. Provide exactly one of groups, every or sizeMB.",
    },
    sizeMB: {
      type: "number",
      description: "Split by target part size in megabytes. Provide exactly one of groups, every or sizeMB.",
    },
    outputPrefix: {
      type: "string",
      description:
        "Base name for the parts (parts are named <outputPrefix>_1.pdf, <outputPrefix>_2.pdf, ...). Defaults to the output file name without its .zip extension.",
    },
  },
  required: ["file"],
};

const organizeParams = {
  type: "object",
  properties: {
    files: {
      type: "array",
      items: { type: "string" },
      description:
        "Input PDF file names in order: attached files or files produced by earlier steps.",
    },
    order: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string", description: "One of the input file names." },
          page: { type: "integer", description: "1-based page number to take from that file." },
        },
        required: ["file", "page"],
      },
      description:
        "The output pages in order; the resulting PDF is built by taking each listed page from its file.",
    },
  },
  required: ["files", "order"],
};

const singleFileParams = {
  type: "object",
  properties: {
    file: {
      type: "string",
      description:
        "Input file name: an attached file or a file produced by an earlier plan step.",
    },
    outputFormat: {
      type: "string",
      description:
        "Optional output format for pdf-to-word (doc|docx|odt), pdf-to-powerpoint (ppt|pptx|odp) and pdf-to-pdfa (pdfa1b|pdfa2b|pdfa2u|pdfa3b|pdfa3u). Ignored by other tools.",
    },
    pages: {
      type: "array",
      items: { type: "integer" },
      description: "Optional 1-based pages for pdf-to-jpg; defaults to all pages.",
    },
  },
  required: ["file"],
};

const imageListParams = {
  type: "object",
  properties: {
    files: {
      type: "array",
      items: { type: "string" },
      description:
        "Image file names (attached files or files produced by earlier steps), one page per image.",
    },
  },
  required: ["files"],
};

let registered = false;

/** Registers the PDF operation tools once. Safe to call repeatedly. */
export function registerPdfTools(): void {
  if (registered) return;
  registered = true;

  const handler: LlmToolHandler = () =>
    "This tool runs through the PDFBrains plan runner after the user confirms the plan.";

  registerTool(
    "merge-pdf",
    {
      description: "Merge multiple PDF files into one document, in the given order.",
      parameters: mergeParams,
    },
    handler
  );
  registerTool(
    "extract-pages",
    {
      description: "Extract the given 1-based page numbers from a PDF into a single new PDF.",
      parameters: pageSelectionParams,
    },
    handler
  );
  registerTool(
    "remove-pages",
    {
      description: "Remove the given 1-based page numbers from a PDF, keeping all other pages.",
      parameters: pageSelectionParams,
    },
    handler
  );
  registerTool(
    "split-pdf",
    {
      description:
        "Split a PDF into parts (by explicit page groups, every N pages, or target size) and package them as a ZIP.",
      parameters: splitParams,
    },
    handler
  );
  registerTool(
    "organize-pdf",
    {
      description:
        "Build a new PDF from pages selected across multiple input files, in the given order.",
      parameters: organizeParams,
    },
    handler
  );

  // Conversion tools.
  const officeToPdf = (name: string, description: string) =>
    registerTool(
      name,
      { description: `${description} (backend conversion; output ends in .pdf).`, parameters: singleFileParams },
      handler
    );
  officeToPdf("word-to-pdf", "Convert a Word document (.doc/.docx) to PDF.");
  officeToPdf("powerpoint-to-pdf", "Convert a PowerPoint file (.ppt/.pptx) to PDF.");
  officeToPdf("excel-to-pdf", "Convert an Excel file (.xls/.xlsx) to PDF.");
  officeToPdf("html-to-pdf", "Convert an HTML file to PDF.");
  registerTool(
    "jpg-to-pdf",
    {
      description:
        "Convert images to a PDF, one page per image (params: files: string[]; output ends in .pdf).",
      parameters: imageListParams,
    },
    handler
  );

  const pdfToFormat = (name: string, description: string) =>
    registerTool(
      name,
      { description, parameters: singleFileParams },
      handler
    );
  pdfToFormat(
    "pdf-to-word",
    "Convert a PDF to a Word document (outputFormat doc|docx|odt, default docx; output ends in .docx)."
  );
  pdfToFormat(
    "pdf-to-powerpoint",
    "Convert a PDF to a PowerPoint presentation (outputFormat ppt|pptx|odp, default pptx; output ends in .pptx)."
  );
  pdfToFormat(
    "pdf-to-excel",
    "Convert a PDF to an Excel workbook (output ends in .xlsx)."
  );
  pdfToFormat(
    "pdf-to-pdfa",
    "Convert a PDF to PDF/A (outputFormat pdfa1b|pdfa2b|pdfa2u|pdfa3b|pdfa3u, default pdfa2b; output ends in .pdf)."
  );
  pdfToFormat(
    "pdf-to-jpg",
    "Convert PDF pages to JPG images packaged as a ZIP (pages optional, 1-based; default all pages; output ends in .zip)."
  );
}
