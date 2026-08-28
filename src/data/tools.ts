import type { Icon } from "@phosphor-icons/react";
import {
  Archive,
  ArrowClockwise,
  ArrowSquareOut,
  ArrowsDownUp,
  ArrowsIn,
  Camera,
  Code,
  Crop,
  EyeSlash,
  FileDoc,
  FileImage,
  FileXls,
  Files,
  Hash,
  ImageSquare,
  LockSimple,
  LockSimpleOpen,
  PencilSimple,
  Presentation,
  Scales,
  Signature,
  SplitHorizontal,
  Stamp,
  Table,
  TextT,
  Textbox,
  Trash,
  Wrench,
} from "@phosphor-icons/react";

export type Category =
  | "Organize"
  | "Optimize"
  | "Convert to PDF"
  | "Convert from PDF"
  | "Edit"
  | "PDF Security";

/** How a tool presents its workspace: whole files, or the pages of one PDF. */
export type WorkspaceKind = "document" | "pages";

export interface Tool {
  slug: string;
  name: string;
  tagline: string;
  category: Category;
  Icon: Icon;
  workspace: WorkspaceKind;
  /** Whether the tool accepts more than one file. */
  multiFile: boolean;
  /** File input accept hint. */
  accept?: string;
}

/**
 * Tool registry, mirroring the action plan's categorized tool list.
 * This is the frontend contract the backend will hook into tool by tool:
 * every entry maps a route (/tools/:slug) to a tool that will eventually
 * get a real processor behind it.
 */
export const TOOLS: Tool[] = [
  // Organize PDF
  { slug: "merge-pdf", name: "Merge PDF", tagline: "Combine several PDFs into one file.", category: "Organize", Icon: Files, workspace: "document", multiFile: true, accept: "application/pdf" },
  { slug: "split-pdf", name: "Split PDF", tagline: "Split one PDF into several files by marks, ranges or page count.", category: "Organize", Icon: SplitHorizontal, workspace: "pages", multiFile: false, accept: "application/pdf" },
  { slug: "remove-pages", name: "Remove pages", tagline: "Delete pages you do not need.", category: "Organize", Icon: Trash, workspace: "pages", multiFile: false, accept: "application/pdf" },
  { slug: "extract-pages", name: "Extract pages", tagline: "Save selected pages as their own PDF.", category: "Organize", Icon: ArrowSquareOut, workspace: "pages", multiFile: false, accept: "application/pdf" },
  { slug: "organize-pdf", name: "Organize PDF", tagline: "Combine and reorder pages from several PDFs.", category: "Organize", Icon: ArrowsDownUp, workspace: "document", multiFile: true, accept: "application/pdf" },
  { slug: "scan-to-pdf", name: "Scan to PDF", tagline: "Capture pages with your camera.", category: "Organize", Icon: Camera, workspace: "document", multiFile: true, accept: "image/jpeg,image/png" },

  // Optimize PDF
  { slug: "compress-pdf", name: "Compress PDF", tagline: "Shrink file size without wrecking quality.", category: "Optimize", Icon: ArrowsIn, workspace: "document", multiFile: true, accept: "application/pdf" },
  { slug: "repair-pdf", name: "Repair PDF", tagline: "Rebuild broken or damaged documents.", category: "Optimize", Icon: Wrench, workspace: "document", multiFile: false, accept: "application/pdf" },
  { slug: "ocr-pdf", name: "OCR PDF", tagline: "Make scanned pages searchable.", category: "Optimize", Icon: TextT, workspace: "document", multiFile: true, accept: "application/pdf" },

  // Convert to PDF
  { slug: "jpg-to-pdf", name: "JPG to PDF", tagline: "Bundle images into a single PDF.", category: "Convert to PDF", Icon: FileImage, workspace: "document", multiFile: true, accept: "image/jpeg,image/png" },
  { slug: "word-to-pdf", name: "WORD to PDF", tagline: "Turn Word files into clean PDFs.", category: "Convert to PDF", Icon: FileDoc, workspace: "document", multiFile: true, accept: ".doc,.docx" },
  { slug: "powerpoint-to-pdf", name: "POWERPOINT to PDF", tagline: "Turn slides into portable PDFs.", category: "Convert to PDF", Icon: Presentation, workspace: "document", multiFile: true, accept: ".ppt,.pptx" },
  { slug: "excel-to-pdf", name: "EXCEL to PDF", tagline: "Turn spreadsheets into PDFs.", category: "Convert to PDF", Icon: Table, workspace: "document", multiFile: true, accept: ".xls,.xlsx" },
  { slug: "html-to-pdf", name: "HTML to PDF", tagline: "Turn web pages and HTML files into PDFs.", category: "Convert to PDF", Icon: Code, workspace: "document", multiFile: true, accept: ".html,.htm" },

  // Convert from PDF
  { slug: "pdf-to-jpg", name: "PDF to JPG", tagline: "Export each page as a JPG image.", category: "Convert from PDF", Icon: ImageSquare, workspace: "pages", multiFile: false, accept: "application/pdf" },
  { slug: "pdf-to-word", name: "PDF to WORD", tagline: "Export PDFs as editable Word docs.", category: "Convert from PDF", Icon: FileDoc, workspace: "document", multiFile: true, accept: "application/pdf" },
  { slug: "pdf-to-powerpoint", name: "PDF to POWERPOINT", tagline: "Turn PDFs into editable slides.", category: "Convert from PDF", Icon: Presentation, workspace: "document", multiFile: true, accept: "application/pdf" },
  { slug: "pdf-to-excel", name: "PDF to EXCEL", tagline: "Pull tables into a single spreadsheet.", category: "Convert from PDF", Icon: FileXls, workspace: "document", multiFile: true, accept: "application/pdf" },
  { slug: "pdf-to-pdfa", name: "PDF to PDF/A", tagline: "Archive documents in the PDF/A standard.", category: "Convert from PDF", Icon: Archive, workspace: "document", multiFile: true, accept: "application/pdf" },

  // Edit PDF
  { slug: "rotate-pdf", name: "Rotate PDF", tagline: "Turn pages the right way up.", category: "Edit", Icon: ArrowClockwise, workspace: "pages", multiFile: false, accept: "application/pdf" },
  { slug: "add-page-numbers", name: "Add page numbers", tagline: "Number pages at a corner or center.", category: "Edit", Icon: Hash, workspace: "pages", multiFile: false, accept: "application/pdf" },
  { slug: "add-watermark", name: "Add watermark", tagline: "Stamp text onto every page.", category: "Edit", Icon: Stamp, workspace: "document", multiFile: false, accept: "application/pdf" },
  { slug: "crop-pdf", name: "Crop PDF", tagline: "Trim the margins of every page.", category: "Edit", Icon: Crop, workspace: "pages", multiFile: false, accept: "application/pdf" },
  { slug: "edit-pdf", name: "Edit PDF", tagline: "Change text and annotations in place.", category: "Edit", Icon: PencilSimple, workspace: "pages", multiFile: false, accept: "application/pdf" },
  { slug: "pdf-forms", name: "PDF Forms", tagline: "Fill in and sign form fields.", category: "Edit", Icon: Textbox, workspace: "pages", multiFile: false, accept: "application/pdf" },

  // PDF Security
  { slug: "unlock-pdf", name: "Unlock PDF", tagline: "Remove a password you know.", category: "PDF Security", Icon: LockSimpleOpen, workspace: "document", multiFile: false, accept: "application/pdf" },
  { slug: "protect-pdf", name: "Protect PDF", tagline: "Lock a file with a password.", category: "PDF Security", Icon: LockSimple, workspace: "document", multiFile: false, accept: "application/pdf" },
  { slug: "sign-pdf", name: "Sign PDF", tagline: "Add a signature and send it on.", category: "PDF Security", Icon: Signature, workspace: "document", multiFile: false, accept: "application/pdf" },
  { slug: "redact-pdf", name: "Redact PDF", tagline: "Black out sensitive text permanently.", category: "PDF Security", Icon: EyeSlash, workspace: "document", multiFile: false, accept: "application/pdf" },
  { slug: "compare-pdf", name: "Compare PDF", tagline: "Spot the differences between two files.", category: "PDF Security", Icon: Scales, workspace: "document", multiFile: true, accept: "application/pdf" },
];

export const CATEGORIES: Category[] = [
  "Organize",
  "Optimize",
  "Convert to PDF",
  "Convert from PDF",
  "Edit",
  "PDF Security",
];

export const CATEGORY_NOTES: Record<Category, string> = {
  Organize: "Put pages in order, or pull them apart.",
  Optimize: "Smaller, cleaner, searchable files.",
  "Convert to PDF": "Turn documents and images into PDFs.",
  "Convert from PDF": "Turn PDFs back into editable files.",
  Edit: "Number, rotate, crop and mark up pages.",
  "PDF Security": "Lock, unlock, sign and redact.",
};

export function toolsByCategory(category: Category): Tool[] {
  return TOOLS.filter((tool) => tool.category === category);
}

export function getTool(slug: string): Tool | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

export function relatedTools(tool: Tool, limit = 4): Tool[] {
  return TOOLS.filter((t) => t.category === tool.category && t.slug !== tool.slug).slice(0, limit);
}
