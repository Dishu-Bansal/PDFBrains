import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { PDFImage } from "pdf-lib";

export type RotationDeg = 0 | 90 | 180 | 270;

export function baseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, "") || "document";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function load(file: File | Blob): Promise<PDFDocument> {
  return PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
}

async function save(doc: PDFDocument): Promise<Blob> {
  const bytes = await doc.save({ useObjectStreams: true });
  return new Blob([bytes], { type: "application/pdf" });
}

/** Merge: copies every page of every file into one document, in order. */
export async function mergePdfs(files: File[]): Promise<Blob> {
  if (files.length === 0) throw new Error("no files");
  const out = await PDFDocument.create();
  for (const file of files) {
    const src = await load(file);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((page) => out.addPage(page));
  }
  return save(out);
}

/** Merge already-generated PDF blobs into a single PDF, in order. */
export async function mergePdfBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error("no results");
  const out = await PDFDocument.create();
  for (const blob of blobs) {
    const src = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((page) => out.addPage(page));
  }
  return save(out);
}

/** Delete pages: removes the given 1-based page numbers. */
export async function deletePages(file: File | Blob, pageNumbers: number[]): Promise<Blob> {
  const doc = await load(file);
  const drop = new Set(pageNumbers);
  for (let i = doc.getPageCount() - 1; i >= 0; i--) {
    if (drop.has(i + 1)) doc.removePage(i);
  }
  return save(doc);
}

/** Organize: merge a plan of pages (fileIndex + 1-based pageNumber) in order. */
export interface OrganizePlanEntry {
  fileIndex: number;
  pageNumber: number;
}

export async function mergeSelectedPages(
  files: (File | Blob)[],
  plan: OrganizePlanEntry[]
): Promise<Blob> {
  if (files.length === 0 || plan.length === 0) throw new Error("nothing to build");
  const sources = await Promise.all(files.map((file) => load(file)));
  const out = await PDFDocument.create();
  for (const entry of plan) {
    const [page] = await out.copyPages(sources[entry.fileIndex], [entry.pageNumber - 1]);
    out.addPage(page);
  }
  return save(out);
}

/** Page count of a PDF blob. */
export async function pdfPageCount(file: File | Blob): Promise<number> {
  const doc = await load(file);
  return doc.getPageCount();
}

/** Split into groups: each group is an array of 1-based page numbers that
 * becomes its own PDF. Empty groups are skipped. */
export async function splitIntoGroups(file: File | Blob, groups: number[][]): Promise<Blob[]> {
  const src = await load(file);
  const blobs: Blob[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, group.map((p) => p - 1));
    pages.forEach((page) => out.addPage(page));
    blobs.push(await save(out));
  }
  return blobs;
}

/**
 * Split by size: greedy chunks, each measured against targetBytes. Page
 * size is estimated linearly from the source file, then every boundary
 * candidate is actually built and measured so the real output stays under
 * the limit. A single oversized page becomes its own file.
 */
export async function splitBySize(file: File | Blob, targetBytes: number): Promise<Blob[]> {
  const src = await load(file);
  const n = src.getPageCount();
  const avg = file.size / n;

  const build = async (pages: number[]): Promise<Blob> => {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, pages.map((p) => p - 1));
    copied.forEach((page) => out.addPage(page));
    return save(out);
  };

  const chunks: number[][] = [];
  let current: number[] = [];
  let estimate = 0;

  for (let p = 1; p <= n; p++) {
    current.push(p);
    estimate += avg;
    if (estimate > targetBytes && current.length > 1) {
      const actual = (await build(current)).size;
      if (actual > targetBytes) {
        chunks.push(current.slice(0, -1));
        current = [p];
        estimate = avg;
      }
    }
  }
  if (current.length) chunks.push(current);

  const blobs: Blob[] = [];
  for (const chunk of chunks) blobs.push(await build(chunk));
  return blobs;
}

/** Package named blobs into a ZIP archive. */
export async function zipBlobs(entries: { name: string; blob: Blob }[]): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.name, entry.blob);
  return zip.generateAsync({ type: "blob" });
}

/** Rotate pages: rotations keyed by 1-based page number, clockwise degrees. */
export async function rotatePdf(file: File, rotations: Record<number, RotationDeg>): Promise<Blob> {
  const doc = await load(file);
  for (const [pageStr, deg] of Object.entries(rotations)) {
    const page = doc.getPage(Number(pageStr) - 1);
    page.setRotation(degrees(deg));
  }
  return save(doc);
}

export type PageSize = "fit" | "a4" | "letter";
export type PageOrientation = "portrait" | "landscape";

const PAGE_DIMS: Record<Exclude<PageSize, "fit">, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

export interface ImageToPdfOptions {
  pageSize?: PageSize;
  orientation?: PageOrientation;
  /** Margin in points, applied with fixed page sizes. */
  margin?: number;
}

/** Resolves the output page dimensions for the given settings and image. */
export function resolvePageDimensions(
  pageSize: PageSize,
  orientation: PageOrientation,
  imageWidth: number,
  imageHeight: number
): [number, number] {
  if (pageSize === "fit") return [imageWidth, imageHeight];
  const [width, height] = PAGE_DIMS[pageSize];
  return orientation === "landscape" ? [height, width] : [width, height];
}

/** Browser-decodes the file and re-encodes it as PNG via canvas. */
async function canvasEncode(file: File): Promise<{ bytes: Uint8Array; isPng: true }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not process the image."));
        return;
      }
      ctx.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not process the image."));
          return;
        }
        blob
          .arrayBuffer()
          .then((buffer) => resolve({ bytes: new Uint8Array(buffer), isPng: true }));
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read "${file.name}" as an image.`));
    };
    image.src = url;
  });
}

/**
 * Returns bytes pdf-lib can embed. Magic bytes decide PNG vs JPEG, so the
 * file extension and MIME type are never trusted (a ".jpeg" can hold WebP
 * or anything else). Any other content goes through the canvas PNG
 * re-encode.
 */
async function normalizeImage(file: File): Promise<{ bytes: Uint8Array; isPng: boolean }> {
  const raw = new Uint8Array(await file.arrayBuffer());
  const isPng =
    raw.length > 8 && raw[0] === 0x89 && raw[1] === 0x50 && raw[2] === 0x4e && raw[3] === 0x47;
  const isJpeg = raw.length > 3 && raw[0] === 0xff && raw[1] === 0xd8 && raw[2] === 0xff;
  if (isPng) return { bytes: raw, isPng: true };
  if (isJpeg) return { bytes: raw, isPng: false };
  return canvasEncode(file);
}

/** JPG/PNG to PDF: one page per image, fitted or on a fixed page size. */
export async function imagesToPdf(files: File[], options: ImageToPdfOptions = {}): Promise<Blob> {
  if (files.length === 0) throw new Error("no files");
  const { pageSize = "fit", orientation = "portrait", margin = 40 } = options;
  const doc = await PDFDocument.create();
  for (const file of files) {
    try {
      const { bytes, isPng } = await normalizeImage(file);
      let img: PDFImage;
      try {
        img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      } catch {
        // Exotic JPEG variants (progressive, CMYK) can defeat pdf-lib's
        // parser; re-encode through the browser instead.
        const encoded = await canvasEncode(file);
        img = await doc.embedPng(encoded.bytes);
      }

      const [pageWidth, pageHeight] = resolvePageDimensions(
        pageSize,
        orientation,
        img.width,
        img.height
      );

      if (pageSize === "fit") {
        const page = doc.addPage([pageWidth, pageHeight]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        continue;
      }

      const m = Math.max(0, margin);
      const scale = Math.min(
        (pageWidth - m * 2) / img.width,
        (pageHeight - m * 2) / img.height
      );
      const width = img.width * scale;
      const height = img.height * scale;
      const page = doc.addPage([pageWidth, pageHeight]);
      page.drawImage(img, {
        x: (pageWidth - width) / 2,
        y: (pageHeight - height) / 2,
        width,
        height,
      });
    } catch (error) {
      throw new Error(
        `Could not process "${file.name}". It may be corrupted or in an unsupported format.`
      );
    }
  }
  return save(doc);
}

/** Extract pages: save only the selected 1-based pages as a new PDF. */
export async function extractPages(file: File | Blob, selected: number[]): Promise<Blob> {
  const src = await load(file);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, selected.map((p) => p - 1));
  pages.forEach((page) => out.addPage(page));
  return save(out);
}

export type PageNumberPosition = "bottom-center" | "bottom-right" | "top-right";

/** Add page numbers to every page, starting from `start`. */
export async function addPageNumbers(
  file: File,
  position: PageNumberPosition = "bottom-center",
  start = 1
): Promise<Blob> {
  const doc = await load(file);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 12;
  const margin = 40;

  for (let i = 0; i < doc.getPageCount(); i++) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    const label = `${start + i}`;
    const textWidth = font.widthOfTextAtSize(label, size);

    let x = (width - textWidth) / 2;
    let y = margin;
    if (position === "bottom-right") x = width - margin - textWidth;
    if (position === "top-right") {
      x = width - margin - textWidth;
      y = height - margin - size;
    }

    page.drawText(label, { x, y, size, font, color: rgb(0.35, 0.4, 0.45) });
  }
  return save(doc);
}

/** Add a rotated text watermark across every page. */
export async function addWatermark(file: File, text: string, size = 48): Promise<Blob> {
  const doc = await load(file);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const label = text || "CONFIDENTIAL";

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: (width - textWidth) / 2,
      y: height / 2 - size / 2,
      size,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.18,
      rotate: degrees(-35),
    });
  }
  return save(doc);
}

export interface CropMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Crop every page by percentage margins (0-50 each). */
export async function cropPdf(file: File, margins: CropMargins): Promise<Blob> {
  const doc = await load(file);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const x = (width * margins.left) / 100;
    const y = (height * margins.bottom) / 100;
    const w = width - (width * (margins.left + margins.right)) / 100;
    const h = height - (height * (margins.top + margins.bottom)) / 100;
    page.setCropBox(x, y, Math.max(1, w), Math.max(1, h));
  }
  return save(doc);
}
