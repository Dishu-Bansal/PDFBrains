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
}
