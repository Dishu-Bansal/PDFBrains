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
}
