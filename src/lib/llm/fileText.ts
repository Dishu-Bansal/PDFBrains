/* Extracts readable text from attached files so it can be sent to the LLM as
 * context. PDFs go through pdf.js; plain text files are read directly. */

export type FileIndexStatus = "reading" | "indexed" | "unsupported" | "error";

export interface IndexedFile {
  name: string;
  size: number;
  /** Extracted text ("" when unsupported or empty). */
  text: string;
  status: FileIndexStatus;
}

const MAX_TEXT_CHARS = 60000;

const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|json|log|text)$/i;

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  if (pdfjs.GlobalWorkerOptions.workerSrc !== workerUrl) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const parts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item && item.str ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) parts.push(text);
      if (parts.join("\n").length > MAX_TEXT_CHARS) break;
    }
    return parts.join("\n").slice(0, MAX_TEXT_CHARS);
  } finally {
    await doc.destroy();
  }
}

/** Extracts text from one attached file. Returns "" for unsupported types. */
export async function extractFileText(file: File): Promise<IndexedFile> {
  const base: IndexedFile = { name: file.name, size: file.size, text: "", status: "reading" };
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".pdf")) {
      const text = await extractPdfText(file);
      return { ...base, text, status: "indexed" };
    }
    if (TEXT_EXTENSIONS.test(name)) {
      const text = (await file.text()).slice(0, MAX_TEXT_CHARS);
      return { ...base, text, status: "indexed" };
    }
    return { ...base, status: "unsupported" };
  } catch {
    return { ...base, status: "error" };
  }
}

/** Formats a file's text for inclusion in a message to the model. */
export function fileTextBlock(file: IndexedFile): string {
  if (!file.text) return "";
  return `[File: ${file.name}]\n${file.text}`;
}
