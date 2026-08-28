import { ArrowLeft, ArrowRight, FilePdf } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { CameraScanner } from "../components/CameraScanner";
import { Dropzone } from "../components/Dropzone";
import { EditPdfWorkspace } from "../components/EditPdfWorkspace";
import { FileStrip } from "../components/FileStrip";
import { Footer } from "../components/Footer";
import { Nav } from "../components/Nav";
import { OrganizeWorkspace } from "../components/OrganizeWorkspace";
import { PageWorkspace } from "../components/PageWorkspace";
import type { PageMode } from "../components/PageWorkspace";
import { getTool, relatedTools } from "../data/tools";
import type { Tool } from "../data/tools";
import {
  compressPdfViaApi,
  convertHtmlToPdf,
  convertOfficeToPdf,
  convertPdfToExcel,
  convertPdfToPdfa,
  convertPdfToPowerpoint,
  convertPdfToWord,
  hasApiKey,
  ocrPdfViaApi,
  protectPdfViaApi,
  repairPdfViaApi,
  unlockPdfViaApi,
} from "../lib/api";
import { renderPageToJpeg, usePdfDocument } from "../lib/pdf";
import {
  addPageNumbers,
  addWatermark,
  baseName,
  cropPdf,
  deletePages,
  downloadBlob,
  extractPages,
  imagesToPdf,
  mergePdfs,
  mergePdfBlobs,
  mergeSelectedPages,
  rotatePdf,
  splitBySize,
  splitIntoGroups,
  zipBlobs,
} from "../lib/process";
import type {
  CropMargins,
  OrganizePlanEntry,
  PageNumberPosition,
  PageOrientation,
  PageSize,
  RotationDeg,
} from "../lib/process";

/** Tools whose processing already works client-side. */
const PROCESSED_SLUGS = new Set([
  "merge-pdf",
  "split-pdf",
  "remove-pages",
  "extract-pages",
  "organize-pdf",
  "scan-to-pdf",
  "compress-pdf",
  "repair-pdf",
  "word-to-pdf",
  "powerpoint-to-pdf",
  "excel-to-pdf",
  "html-to-pdf",
  "ocr-pdf",
  "jpg-to-pdf",
  "pdf-to-jpg",
  "pdf-to-word",
  "pdf-to-powerpoint",
  "pdf-to-excel",
  "pdf-to-pdfa",
  "unlock-pdf",
  "protect-pdf",
  "rotate-pdf",
  "add-page-numbers",
  "add-watermark",
  "crop-pdf",
]);

const PAGE_MODES: Record<string, PageMode> = {
  "remove-pages": "select",
  "extract-pages": "select",
  "pdf-to-jpg": "select",
  "rotate-pdf": "rotate",
  "add-page-numbers": "preview",
  "crop-pdf": "preview",
  "pdf-forms": "preview",
};

const COMPRESS_LEVELS = ["Low", "Medium", "High"] as const;
const WORD_FORMATS = [
  { value: "docx", label: "Word (.docx)" },
  { value: "doc", label: "Word 97 (.doc)" },
  { value: "odt", label: "OpenDocument (.odt)" },
];
const PPT_FORMATS = [
  { value: "pptx", label: "PowerPoint (.pptx)" },
  { value: "ppt", label: "PowerPoint 97 (.ppt)" },
  { value: "odp", label: "OpenDocument (.odp)" },
];
const PDFA_FORMATS = [
  { value: "pdfa1b", label: "PDF/A-1b" },
  { value: "pdfa1a", label: "PDF/A-1a" },
  { value: "pdfa2b", label: "PDF/A-2b" },
  { value: "pdfa2a", label: "PDF/A-2a" },
  { value: "pdfa2u", label: "PDF/A-2u" },
  { value: "pdfa3b", label: "PDF/A-3b" },
  { value: "pdfa3a", label: "PDF/A-3a" },
  { value: "pdfa3u", label: "PDF/A-3u" },
];
const WATERMARK_SIZES = [
  { label: "Small", value: 28 },
  { label: "Medium", value: 48 },
  { label: "Large", value: 72 },
] as const;
const PAGE_SIZES: { value: PageSize; label: string }[] = [
  { value: "fit", label: "Fit image" },
  { value: "a4", label: "A4" },
  { value: "letter", label: "Letter" },
];
const NUMBER_POSITIONS: { value: PageNumberPosition; label: string }[] = [
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "top-right", label: "Top right" },
];
const ORIENTATIONS: { value: PageOrientation; label: string }[] = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];
const HTML_SOURCES: { value: "url" | "file" | "zip"; label: string; disabled?: boolean }[] = [
  { value: "url", label: "URL (upcoming)", disabled: true },
  { value: "file", label: "HTML file" },
  { value: "zip", label: "ZIP file" },
];
const MARGIN_PRESETS: { label: string; value: number }[] = [
  { label: "None", value: 0 },
  { label: "Small", value: 20 },
  { label: "Medium", value: 40 },
  { label: "Large", value: 60 },
];

/** Office files converted to PDF via the Stirling backend. */
const OFFICE_CONVERT_SLUGS = new Set(["word-to-pdf", "powerpoint-to-pdf", "excel-to-pdf"]);

/** Tools that deliver per-file results as a ZIP, or combine into one PDF. */
const OUTPUT_MODE_SLUGS = new Set([
  "compress-pdf",
  "repair-pdf",
  "ocr-pdf",
  "word-to-pdf",
  "powerpoint-to-pdf",
  "excel-to-pdf",
  "html-to-pdf",
  "pdf-to-word",
  "pdf-to-powerpoint",
  "pdf-to-excel",
  "pdf-to-pdfa",
]);

/** Output format label per tool, used in the merge option wording. */
const OUTPUT_FORMATS: Record<string, string> = {
  "compress-pdf": "PDF",
  "repair-pdf": "PDF",
  "ocr-pdf": "PDF",
  "word-to-pdf": "PDF",
  "powerpoint-to-pdf": "PDF",
  "excel-to-pdf": "PDF",
  "html-to-pdf": "PDF",
  "pdf-to-word": "Word file",
  "pdf-to-powerpoint": "PowerPoint file",
  "pdf-to-excel": "Excel file",
  "pdf-to-pdfa": "PDF",
};

type SplitMode = "visual" | "range" | "every" | "extract" | "size";

const SPLIT_MODES: { value: SplitMode; label: string }[] = [
  { value: "visual", label: "Mark split points" },
  { value: "range", label: "By range" },
  { value: "every", label: "Every N pages" },
  { value: "extract", label: "Extract pages" },
  { value: "size", label: "By size" },
];

/** Parses "1-3, 4-7, 8" into page-number groups, or null if invalid. */
function parseRanges(text: string, max: number): number[][] | null {  const tokens = text.split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return [];
  const groups: number[][] = [];
  for (const token of tokens) {
    const m = token.match(/^(\d+)\s*-\s*(\d+)$/) ?? token.match(/^(\d+)$/);
    if (!m) return null;
    const a = Number.parseInt(m[1], 10);
    const b = m[2] !== undefined ? Number.parseInt(m[2], 10) : a;
    if (a < 1 || b > max || a > b) return null;
    groups.push(Array.from({ length: b - a + 1 }, (_, i) => a + i));
  }
  return groups;
}

/** Converts files via the backend, delivering per tool output mode. */
async function runBackendConversion(
  files: File[],
  outputMode: "zip" | "merge",
  prefix: string,
  convert: (file: File) => Promise<Blob>
): Promise<{ kind: "ok"; message: string }> {
  const blobs: Blob[] = [];
  for (const file of files) blobs.push(await convert(file));
  if (blobs.length === 1) {
    downloadBlob(blobs[0], `${baseName(files[0])}.pdf`);
    return { kind: "ok", message: "Converted to PDF. Check your downloads." };
  }
  if (outputMode === "merge") {
    const merged = await mergePdfBlobs(blobs);
    downloadBlob(merged, `pdfbrains-${prefix}.pdf`);
    return { kind: "ok", message: "Converted and combined into one PDF." };
  }
  const zip = await zipBlobs(
    blobs.map((blob, i) => ({ name: `${baseName(files[i])}.pdf`, blob }))
  );
  downloadBlob(zip, `pdfbrains-${prefix}.zip`);
  return { kind: "ok", message: `Converted ${files.length} files into a ZIP.` };
}

/** Converts PDFs to another format, delivering per tool output mode. In merge
 * mode the source PDFs are combined first, then converted once. */
async function runPdfToFormatConversion(
  files: File[],
  outputMode: "zip" | "merge",
  convert: (file: File) => Promise<Blob>,
  extension: string,
  prefix: string,
  label: string,
  prepare?: (file: File) => Promise<File>
): Promise<{ kind: "ok"; message: string }> {
  const prepared = async (file: File): Promise<File> => (prepare ? prepare(file) : file);
  if (outputMode === "merge" && files.length > 1) {
    const merged = await mergePdfs(files);
    const blob = await convert(
      await prepared(new File([merged], "merged.pdf", { type: "application/pdf" }))
    );
    downloadBlob(blob, `pdfbrains-${prefix}.${extension}`);
    return { kind: "ok", message: `Converted and combined into one ${label} file.` };
  }
  const blobs: Blob[] = [];
  for (const file of files) blobs.push(await convert(await prepared(file)));
  if (blobs.length === 1) {
    downloadBlob(blobs[0], `${baseName(files[0])}.${extension}`);
    return { kind: "ok", message: `Converted to ${label}. Check your downloads.` };
  }
  const zip = await zipBlobs(
    blobs.map((blob, i) => ({ name: `${baseName(files[i])}.${extension}`, blob }))
  );
  downloadBlob(zip, `pdfbrains-${prefix}.zip`);
  return { kind: "ok", message: `Converted ${files.length} files into a ZIP.` };
}

function ToolWorkspace({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const isPages = tool.workspace === "pages";
  const isScan = tool.slug === "scan-to-pdf";
  const activeFile = isPages ? files[Math.min(activeIndex, files.length - 1)] ?? null : null;
  const pdfState = usePdfDocument(activeFile);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rotations, setRotations] = useState<Record<number, RotationDeg>>({});
  const [organizePlan, setOrganizePlan] = useState<OrganizePlanEntry[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>("fit");
  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [watermarkSize, setWatermarkSize] = useState(48);
  const [numPosition, setNumPosition] = useState<PageNumberPosition>("bottom-center");
  const [numStart, setNumStart] = useState(1);
  const [cropMargins, setCropMargins] = useState<CropMargins>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [splitMode, setSplitMode] = useState<SplitMode>("visual");
  const [cuts, setCuts] = useState<Set<number>>(new Set());
  const [rangeText, setRangeText] = useState("");
  const [mergeRanges, setMergeRanges] = useState(false);
  const [mergeRemaining, setMergeRemaining] = useState(true);
  const [everyN, setEveryN] = useState(2);
  const [sizeMB, setSizeMB] = useState(5);
  const [jpgOrientation, setJpgOrientation] = useState<PageOrientation>("portrait");
  const [jpgMargin, setJpgMargin] = useState(40);
  const [outputMode, setOutputMode] = useState<"zip" | "merge">("zip");
  const [htmlSource, setHtmlSource] = useState<"url" | "file" | "zip">("file");
  const [compressLevel, setCompressLevel] = useState<(typeof COMPRESS_LEVELS)[number]>("Medium");
  const [ocrFirst, setOcrFirst] = useState(false);
  const [wordFormat, setWordFormat] = useState("docx");
  const [pptFormat, setPptFormat] = useState("pptx");
  const [pdfaFormat, setPdfaFormat] = useState("pdfa1b");
  const [pdfaPdfUa, setPdfaPdfUa] = useState(false);
  const [pdfaStrict, setPdfaStrict] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  const [pdfOwnerPassword, setPdfOwnerPassword] = useState("");
  const [pdfKeyLength, setPdfKeyLength] = useState(256);
  const [pdfPrevent, setPdfPrevent] = useState({
    assembly: false,
    extractContent: false,
    extractAccessibility: false,
    fillInForm: false,
    modify: false,
    modifyAnnotations: false,
    printing: false,
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const processed = PROCESSED_SLUGS.has(tool.slug);
  const pageMode =
    tool.slug === "split-pdf"
      ? splitMode === "visual"
        ? "split"
        : splitMode === "extract"
          ? "select"
          : "preview"
      : PAGE_MODES[tool.slug];
  const pageCount = pdfState.pageCount;

  // Split tool: compute the output page groups from the active mode.
  const splitGroups: number[][] | null = (() => {
    if (!pageCount) return null;
    switch (splitMode) {
      case "visual": {
        const result: number[][] = [];
        let current: number[] = [];
        for (let p = 1; p <= pageCount; p++) {
          current.push(p);
          if (cuts.has(p)) {
            result.push(current);
            current = [];
          }
        }
        if (current.length) result.push(current);
        return result;
      }
      case "every": {
        const n = Math.max(1, everyN);
        const result: number[][] = [];
        for (let start = 1; start <= pageCount; start += n) {
          result.push(
            Array.from({ length: Math.min(n, pageCount - start + 1) }, (_, i) => start + i)
          );
        }
        return result;
      }
      case "range": {
        if (!rangeText.trim()) return [];
        const parsed = parseRanges(rangeText, pageCount);
        if (parsed === null) return null;
        const result = mergeRanges
          ? [...new Set(parsed.flat())].sort((a, b) => a - b).length
            ? [[...new Set(parsed.flat())].sort((a, b) => a - b)]
            : []
          : parsed.map((pages) => [...pages]);
        if (mergeRemaining) {
          const used = new Set(parsed.flat());
          const rest = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
            (p) => !used.has(p)
          );
          if (rest.length) result.push(rest);
        }
        return result;
      }
      case "size": {
        const target = sizeMB * 1024 * 1024;
        if (!activeFile || target <= 0) return null;
        const avg = activeFile.size / pageCount;
        const result: number[][] = [];
        let current: number[] = [];
        let estimate = 0;
        for (let p = 1; p <= pageCount; p++) {
          current.push(p);
          estimate += avg;
          if (estimate > target && current.length > 1) {
            result.push(current.slice(0, -1));
            current = [p];
            estimate = avg;
          }
        }
        if (current.length) result.push(current);
        return result;
      }
      case "extract": {
        const pages = [...selected].sort((a, b) => a - b);
        return pages.length ? [pages] : [];
      }
    }
  })();

  const groupOf = (page: number): number | null => {
    if (!splitGroups) return null;
    for (let i = 0; i < splitGroups.length; i++) {
      if (splitGroups[i].includes(page)) return i;
    }
    return null;
  };

  const splitBase = activeFile ? baseName(activeFile) : "document";
  const groupNames = splitGroups ? splitGroups.map((_, i) => `${splitBase}_${i + 1}.pdf`) : [];

  // Reset page-level state when the active file changes.
  useEffect(() => {
    setSelected(new Set());
    setRotations({});
    setCuts(new Set());
  }, [activeFile]);

  useEffect(() => {
    if (files.length > 0 && activeIndex >= files.length) setActiveIndex(0);
  }, [files.length, activeIndex]);

  const addFiles = (next: File[]) => {
    setFiles(next);
    setResult(null);
    setBusy(false);
  };

  // HTML to PDF: pick the source automatically from what was uploaded.
  const setHtmlFiles = (next: File[]) => {
    addFiles(next);
    if (next.length > 0) {
      if (next.some((file) => file.name.toLowerCase().endsWith(".zip"))) setHtmlSource("zip");
      else if (next.some((file) => /\.html?$/i.test(file.name))) setHtmlSource("file");
    }
  };

  const clearAll = () => {
    setFiles([]);
    setSelected(new Set());
    setRotations({});
    setResult(null);
  };

  const loadSample = async () => {
    try {
      const response = await fetch("/sample.pdf");
      if (!response.ok) return;
      const blob = await response.blob();
      const sample = new File([blob], "sample.pdf", { type: "application/pdf" });
      setFiles((prev) => [...prev, sample]);
    } catch {
      /* sample unavailable, ignore */
    }
  };

  const selectAll = () => {
    if (pageCount > 0) {
      setSelected(new Set(Array.from({ length: pageCount }, (_, i) => i + 1)));
    }
  };

  const clearSelection = () => setSelected(new Set());

  /** When "OCR first" is on, run OCR (skip-text) so scanned pages gain a
   * text layer before conversion. */
  const ocrPrepare = async (file: File): Promise<File> => {
    const blob = await ocrPdfViaApi(file, {
      languages: ["eng"],
      ocrType: "skip-text",
      ocrRenderType: "hocr",
    });
    return new File([blob], file.name, { type: "application/pdf" });
  };

  const rotateAll = () => {    // Cycle all pages through 90 -> 180 -> 270 -> 0 based on their current
    // uniform rotation. Mixed per-page rotations start from a fresh 90.
    const values = new Set<number>();
    for (let i = 1; i <= pageCount; i++) values.add(rotations[i] ?? 0);
    const current = values.size === 1 ? ([...values][0] ?? 0) : 0;
    const nextDeg = ((current + 90) % 360) as RotationDeg;
    const next: Record<number, RotationDeg> = {};
    if (nextDeg !== 0) {
      for (let i = 1; i <= pageCount; i++) next[i] = nextDeg;
    }
    setRotations(next);
  };

  const anyCrop = Object.values(cropMargins).some((value) => value > 0);

  const canRun = (() => {
    switch (tool.slug) {
      case "merge-pdf":
        return files.length >= 2;
      case "split-pdf":
      case "extract-pages":
        return selected.size > 0 && !!pdfState.doc;
      case "split-pdf":
        return (
          !!pdfState.doc &&
          splitGroups !== null &&
          splitGroups.length > 0 &&
          splitGroups.some((group) => group.length > 0)
        );
      case "remove-pages":
        return selected.size > 0 && selected.size < pageCount && !!pdfState.doc;
      case "organize-pdf":
        return files.length > 0 && organizePlan.length > 0;
      case "scan-to-pdf":
        return files.length >= 1;
      case "compress-pdf":
      case "repair-pdf":
      case "ocr-pdf":
        return files.length >= 1 && hasApiKey();
      case "jpg-to-pdf":
        return files.length >= 1;
      case "word-to-pdf":
      case "powerpoint-to-pdf":
      case "excel-to-pdf":
        return files.length >= 1 && hasApiKey();
      case "html-to-pdf":
        return files.length >= 1 && hasApiKey();
      case "pdf-to-word":
      case "pdf-to-powerpoint":
      case "pdf-to-excel":
      case "pdf-to-pdfa":
        return files.length >= 1 && hasApiKey();
      case "unlock-pdf":
      case "protect-pdf":
        return files.length >= 1 && hasApiKey() && pdfPassword.length > 0;
      case "pdf-to-jpg":
        return selected.size > 0 && !!pdfState.doc;
      case "rotate-pdf":
        return !!pdfState.doc && Object.keys(rotations).length > 0;
      case "add-page-numbers":
      case "crop-pdf":
        return !!pdfState.doc && (tool.slug === "add-page-numbers" || anyCrop);
      case "add-watermark":
        return files.length >= 1;
      default:
        return false;
    }
  })();

  const actionLabel = (() => {
    const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
    switch (tool.slug) {
      case "merge-pdf":
        return `Merge ${files.length} file${files.length === 1 ? "" : "s"}`;
      case "split-pdf": {
        const count = splitGroups?.length ?? 0;
        if (splitMode === "extract") {
          return `Extract ${plural(selected.size, "page")}`;
        }
        return `Split into ${count} file${count === 1 ? "" : "s"}`;
      }
      case "remove-pages":
        return `Remove ${plural(selected.size, "page")}`;
      case "extract-pages":
        return `Extract ${plural(selected.size, "page")}`;
      case "organize-pdf":
        return `Create PDF from ${plural(organizePlan.length, "page")}`;
      case "scan-to-pdf":
        return `Create PDF from ${plural(files.length, "image")}`;
      case "compress-pdf":
        return files.length === 1 ? "Compress file" : `Compress ${files.length} files`;
      case "repair-pdf":
        return files.length === 1 ? "Repair file" : `Repair ${files.length} files`;
      case "ocr-pdf":
        return files.length === 1 ? "Run OCR" : `Run OCR on ${files.length} files`;
      case "jpg-to-pdf":
        return `Create PDF from ${plural(files.length, "image")}`;
      case "word-to-pdf":
      case "powerpoint-to-pdf":
      case "excel-to-pdf":
        return files.length === 1 ? "Convert to PDF" : `Convert ${files.length} files to PDF`;
      case "html-to-pdf":
        return files.length === 1 ? "Convert to PDF" : `Convert ${files.length} files to PDF`;
      case "pdf-to-word":
        return files.length === 1 ? "Convert to Word" : `Convert ${files.length} files to Word`;
      case "pdf-to-powerpoint":
        return files.length === 1 ? "Convert to PowerPoint" : `Convert ${files.length} files to PowerPoint`;
      case "pdf-to-excel":
        return files.length === 1 ? "Convert to Excel" : `Convert ${files.length} files to Excel`;
      case "pdf-to-pdfa":
        return files.length === 1 ? "Convert to PDF/A" : `Convert ${files.length} files to PDF/A`;
      case "unlock-pdf":
        return files.length === 1 ? "Remove password" : `Remove passwords from ${files.length} files`;
      case "protect-pdf":
        return files.length === 1 ? "Protect PDF" : `Protect ${files.length} files`;
      case "pdf-to-jpg":
        return `Export ${plural(selected.size, "page")} as JPG`;
      case "rotate-pdf":
        return `Rotate ${plural(Object.keys(rotations).length, "page")}`;
      case "add-page-numbers":
        return "Add page numbers";
      case "add-watermark":
        return "Add watermark";
      case "crop-pdf":
        return "Crop pages";
      default:
        return "Run";
    }
  })();

  const run = async () => {
    if (busy || !canRun) return;
    setBusy(true);
    setResult(null);
    try {
      switch (tool.slug) {
        case "merge-pdf": {
          const blob = await mergePdfs(files);
          downloadBlob(blob, "pdfbrains-merged.pdf");
          setResult({ kind: "ok", message: `Merged ${files.length} files into pdfbrains-merged.pdf.` });
          break;
        }
        case "split-pdf": {
          if (!activeFile || !splitGroups || splitGroups.length === 0) break;
          const blobs =
            splitMode === "size"
              ? await splitBySize(activeFile, sizeMB * 1024 * 1024)
              : await splitIntoGroups(activeFile, splitGroups);
          if (blobs.length === 1) {
            downloadBlob(blobs[0], `${splitBase}_1.pdf`);
            setResult({ kind: "ok", message: "Created one PDF. Check your downloads." });
          } else {
            const zip = await zipBlobs(
              blobs.map((blob, i) => ({ name: `${splitBase}_${i + 1}.pdf`, blob }))
            );
            downloadBlob(zip, `${splitBase}-split.zip`);
            setResult({
              kind: "ok",
              message: `Split into ${blobs.length} PDFs and downloaded them as a ZIP.`,
            });
          }
          break;
        }
        case "remove-pages": {
          if (!activeFile) break;
          const pages = [...selected].sort((a, b) => a - b);
          const blob = await deletePages(activeFile, pages);
          downloadBlob(blob, `${baseName(activeFile)}-pages-removed.pdf`);
          setResult({ kind: "ok", message: `Removed ${pages.length} page${pages.length === 1 ? "" : "s"}. Check your downloads.` });
          break;
        }
        case "extract-pages": {
          if (!activeFile) break;
          const pages = [...selected].sort((a, b) => a - b);
          const blob = await extractPages(activeFile, pages);
          downloadBlob(blob, `${baseName(activeFile)}-extracted.pdf`);
          setResult({ kind: "ok", message: `Extracted ${pages.length} page${pages.length === 1 ? "" : "s"} into a new PDF.` });
          break;
        }
        case "organize-pdf": {
          if (organizePlan.length === 0) break;
          const blob = await mergeSelectedPages(files, organizePlan);
          downloadBlob(blob, "pdfbrains-organized.pdf");
          setResult({
            kind: "ok",
            message: `Created pdfbrains-organized.pdf from ${organizePlan.length} page${organizePlan.length === 1 ? "" : "s"}.`,
          });
          break;
        }
        case "scan-to-pdf": {
          const blob = await imagesToPdf(files, { pageSize });
          downloadBlob(blob, "pdfbrains-scan.pdf");
          setResult({ kind: "ok", message: `Created pdfbrains-scan.pdf from ${files.length} image${files.length === 1 ? "" : "s"}.` });
          break;
        }
        case "compress-pdf": {
          const optimizeLevel = compressLevel === "Low" ? 2 : compressLevel === "High" ? 9 : 5;
          const blobs: Blob[] = [];
          for (const file of files) blobs.push(await compressPdfViaApi(file, { optimizeLevel }));
          if (blobs.length === 1) {
            downloadBlob(blobs[0], `${baseName(files[0])}-compressed.pdf`);
            setResult({ kind: "ok", message: "Compressed the file. Check your downloads." });
          } else if (outputMode === "merge") {
            const merged = await mergePdfBlobs(blobs);
            downloadBlob(merged, "pdfbrains-compressed.pdf");
            setResult({ kind: "ok", message: "Compressed and combined into pdfbrains-compressed.pdf." });
          } else {
            const zip = await zipBlobs(
              blobs.map((blob, i) => ({ name: `${baseName(files[i])}-compressed.pdf`, blob }))
            );
            downloadBlob(zip, "pdfbrains-compressed.zip");
            setResult({ kind: "ok", message: `Compressed ${files.length} files into a ZIP.` });
          }
          break;
        }
        case "repair-pdf": {
          const blobs: Blob[] = [];
          for (const file of files) blobs.push(await repairPdfViaApi(file));
          if (blobs.length === 1) {
            downloadBlob(blobs[0], `${baseName(files[0])}-repaired.pdf`);
            setResult({ kind: "ok", message: "Repaired the file. Check your downloads." });
          } else if (outputMode === "merge") {
            const merged = await mergePdfBlobs(blobs);
            downloadBlob(merged, "pdfbrains-repaired.pdf");
            setResult({ kind: "ok", message: "Repaired and combined into pdfbrains-repaired.pdf." });
          } else {
            const zip = await zipBlobs(
              blobs.map((blob, i) => ({ name: `${baseName(files[i])}-repaired.pdf`, blob }))
            );
            downloadBlob(zip, "pdfbrains-repaired.zip");
            setResult({ kind: "ok", message: `Repaired ${files.length} files into a ZIP.` });
          }
          break;
        }
        case "ocr-pdf": {
          const blobs: Blob[] = [];
          for (const file of files) {
            blobs.push(
              await ocrPdfViaApi(file, {
                languages: ["eng"],
                ocrType: "skip-text",
                ocrRenderType: "hocr",
              })
            );
          }
          if (blobs.length === 1) {
            downloadBlob(blobs[0], `${baseName(files[0])}-ocr.pdf`);
            setResult({ kind: "ok", message: "OCR complete. Check your downloads." });
          } else if (outputMode === "merge") {
            const merged = await mergePdfBlobs(blobs);
            downloadBlob(merged, "pdfbrains-ocr.pdf");
            setResult({ kind: "ok", message: "OCR complete and combined into one PDF." });
          } else {
            const zip = await zipBlobs(
              blobs.map((blob, i) => ({ name: `${baseName(files[i])}-ocr.pdf`, blob }))
            );
            downloadBlob(zip, "pdfbrains-ocr.zip");
            setResult({ kind: "ok", message: `OCR complete. ${blobs.length} files in a ZIP.` });
          }
          break;
        }
        case "jpg-to-pdf": {
          const blob = await imagesToPdf(files, {
            pageSize,
            orientation: jpgOrientation,
            margin: jpgMargin,
          });
          downloadBlob(blob, "pdfbrains-images.pdf");
          setResult({ kind: "ok", message: `Created pdfbrains-images.pdf from ${files.length} image${files.length === 1 ? "" : "s"}.` });
          break;
        }
        case "word-to-pdf":
        case "powerpoint-to-pdf":
        case "excel-to-pdf": {
          const result = await runBackendConversion(files, outputMode, tool.slug, convertOfficeToPdf);
          setResult(result);
          break;
        }
        case "html-to-pdf": {
          const result = await runBackendConversion(files, outputMode, "html-to-pdf", convertHtmlToPdf);
          setResult(result);
          break;
        }
        case "pdf-to-word": {
          const result = await runPdfToFormatConversion(
            files,
            outputMode,
            (file) => convertPdfToWord(file, wordFormat),
            wordFormat,
            "pdf-to-word",
            "Word",
            ocrFirst ? ocrPrepare : undefined
          );
          setResult(result);
          break;
        }
        case "pdf-to-powerpoint": {
          const result = await runPdfToFormatConversion(
            files,
            outputMode,
            (file) => convertPdfToPowerpoint(file, pptFormat),
            pptFormat,
            "pdf-to-powerpoint",
            "PowerPoint",
            ocrFirst ? ocrPrepare : undefined
          );
          setResult(result);
          break;
        }
        case "pdf-to-excel": {
          const result = await runPdfToFormatConversion(
            files,
            outputMode,
            convertPdfToExcel,
            "xlsx",
            "pdf-to-excel",
            "Excel",
            ocrFirst ? ocrPrepare : undefined
          );
          setResult(result);
          break;
        }
        case "pdf-to-pdfa": {
          const result = await runPdfToFormatConversion(
            files,
            outputMode,
            (file) => convertPdfToPdfa(file, pdfaFormat, pdfaPdfUa, pdfaStrict),
            "pdf",
            "pdf-to-pdfa",
            "PDF/A"
          );
          setResult(result);
          break;
        }
        case "unlock-pdf": {
          for (const file of files) {
            const blob = await unlockPdfViaApi(file, pdfPassword);
            downloadBlob(blob, `${baseName(file)}-unlocked.pdf`);
          }
          setResult({
            kind: "ok",
            message: `Password removed from ${files.length} file${files.length === 1 ? "" : "s"}. Check your downloads.`,
          });
          break;
        }
        case "protect-pdf": {
          const options = {
            password: pdfPassword,
            ownerPassword: pdfOwnerPassword || undefined,
            keyLength: pdfKeyLength,
            preventAssembly: pdfPrevent.assembly,
            preventExtractContent: pdfPrevent.extractContent,
            preventExtractForAccessibility: pdfPrevent.extractAccessibility,
            preventFillInForm: pdfPrevent.fillInForm,
            preventModify: pdfPrevent.modify,
            preventModifyAnnotations: pdfPrevent.modifyAnnotations,
            preventPrinting: pdfPrevent.printing,
          };
          for (const file of files) {
            const blob = await protectPdfViaApi(file, options);
            downloadBlob(blob, `${baseName(file)}-protected.pdf`);
          }
          setResult({
            kind: "ok",
            message: `Protected ${files.length} file${files.length === 1 ? "" : "s"} with a password. Check your downloads.`,
          });
          break;
        }
        case "pdf-to-jpg": {
          if (!activeFile) break;
          const pages = [...selected].sort((a, b) => a - b);
          for (const page of pages) {
            const blob = await renderPageToJpeg(activeFile, page);
            downloadBlob(blob, `${baseName(activeFile)}-page-${page}.jpg`);
          }
          setResult({ kind: "ok", message: `Exported ${pages.length} page${pages.length === 1 ? "" : "s"} as JPG. Check your downloads.` });
          break;
        }
        case "rotate-pdf": {
          if (!activeFile) break;
          const blob = await rotatePdf(activeFile, rotations);
          downloadBlob(blob, `${baseName(activeFile)}-rotated.pdf`);
          setResult({ kind: "ok", message: `Rotated ${Object.keys(rotations).length} page${Object.keys(rotations).length === 1 ? "" : "s"}. Check your downloads.` });
          break;
        }
        case "add-page-numbers": {
          if (!activeFile) break;
          const blob = await addPageNumbers(activeFile, numPosition, numStart);
          downloadBlob(blob, `${baseName(activeFile)}-numbered.pdf`);
          setResult({ kind: "ok", message: `Added page numbers starting at ${numStart}.` });
          break;
        }
        case "add-watermark": {
          for (const file of files) {
            const blob = await addWatermark(file, watermarkText, watermarkSize);
            downloadBlob(blob, `${baseName(file)}-watermarked.pdf`);
          }
          setResult({ kind: "ok", message: `Watermarked ${files.length} file${files.length === 1 ? "" : "s"}.` });
          break;
        }
        case "crop-pdf": {
          if (!activeFile) break;
          const blob = await cropPdf(activeFile, cropMargins);
          downloadBlob(blob, `${baseName(activeFile)}-cropped.pdf`);
          setResult({ kind: "ok", message: "Cropped every page. Check your downloads." });
          break;
        }
        default:
          break;
      }
    } catch (error) {
      setResult({
        kind: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Something went wrong while processing. Try a different file.",
      });
    } finally {
      setBusy(false);
    }
  };

  const similar = relatedTools(tool);
  const pdfTool = tool.workspace === "pages" || tool.accept === "application/pdf";
  const hasFiles = files.length > 0;
  const htmlDropAccept =
    tool.slug === "html-to-pdf" ? ".html,.htm,.zip" : tool.accept;
  const showSelectionTools =
    tool.slug === "remove-pages" || tool.slug === "extract-pages" || tool.slug === "pdf-to-jpg";
  const allSelected = pageCount > 0 && selected.size === pageCount;

  const setMargin = (side: keyof CropMargins, raw: string) => {
    const value = Math.min(50, Math.max(0, Number.parseInt(raw, 10) || 0));
    setCropMargins((prev) => ({ ...prev, [side]: value }));
  };

  const optionsPanel = (
    <aside className="rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-24">
      <h2 className="text-[15px] font-semibold">Options</h2>

      <div className="mt-4 space-y-5">
        {OFFICE_CONVERT_SLUGS.has(tool.slug) && !hasApiKey() && (
          <div className="rounded-xl border border-line bg-paper px-3.5 py-3">
            <p className="text-[12px] font-medium text-ink">Backend not configured</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              This tool converts on the Stirling PDF backend. Add your API key to{" "}
              <span className="font-mono">.env.local</span> (VITE_PDFBRAINS_API_KEY) and restart the
              dev server.
            </p>
          </div>
        )}

        {tool.slug === "merge-pdf" && (
          <p className="text-[13px] leading-relaxed text-muted">
            Order matters: the first chip becomes the first pages. Drag chips to rearrange.
          </p>
        )}

        {tool.slug === "compress-pdf" && (
          <fieldset>
            <legend className="text-[13px] font-medium">Compression level</legend>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-paper p-1">
              {COMPRESS_LEVELS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={compressLevel === option}
                  onClick={() => setCompressLevel(option)}
                  className={[
                    "rounded-lg px-2 py-1.5 text-[12px] font-medium transition",
                    compressLevel === option
                      ? "bg-surface text-ink shadow-sm"
                      : "text-muted hover:text-ink",
                  ].join(" ")}
                >
                  {option}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Higher levels shrink image-heavy files more. Text-only PDFs have little to compress.
            </p>
          </fieldset>
        )}

        {tool.slug === "scan-to-pdf" && (
          <fieldset>
            <label htmlFor="page-size" className="block text-[13px] font-medium">
              Page size
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(event) => setPageSize(event.target.value as PageSize)}
              className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
            >
              {PAGE_SIZES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Fit image sizes the page to each capture. A4 and Letter center the image with margins.
            </p>
          </fieldset>
        )}

        {tool.slug === "jpg-to-pdf" && (
          <div className="space-y-4">
            <fieldset>
              <label htmlFor="jpg-page-size" className="block text-[13px] font-medium">
                Page size
              </label>
              <select
                id="jpg-page-size"
                value={pageSize}
                onChange={(event) => setPageSize(event.target.value as PageSize)}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
              >
                {PAGE_SIZES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </fieldset>

            <fieldset>
              <legend className="text-[13px] font-medium">Orientation</legend>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-paper p-1">
                {ORIENTATIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={jpgOrientation === option.value}
                    onClick={() => setJpgOrientation(option.value)}
                    disabled={pageSize === "fit"}
                    className={[
                      "rounded-lg px-2 py-1.5 text-[12px] font-medium transition",
                      jpgOrientation === option.value
                        ? "bg-surface text-ink shadow-sm"
                        : "text-muted hover:text-ink",
                      pageSize === "fit" ? "cursor-not-allowed opacity-40" : "",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-[13px] font-medium">Margins</legend>
              <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-paper p-1">
                {MARGIN_PRESETS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={jpgMargin === option.value}
                    onClick={() => setJpgMargin(option.value)}
                    disabled={pageSize === "fit"}
                    className={[
                      "rounded-lg px-1 py-1.5 text-[12px] font-medium transition",
                      jpgMargin === option.value
                        ? "bg-surface text-ink shadow-sm"
                        : "text-muted hover:text-ink",
                      pageSize === "fit" ? "cursor-not-allowed opacity-40" : "",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {pageSize === "fit" && (
              <p className="text-[12px] leading-relaxed text-muted">
                Orientation and margins apply to A4 and Letter sizes.
              </p>
            )}
          </div>
        )}

        {tool.slug === "html-to-pdf" && (
          <div className="space-y-3">
            <fieldset>
              <legend className="text-[13px] font-medium">Source</legend>
              <div className="mt-2 grid grid-cols-1 gap-1 rounded-xl bg-paper p-1">
                {HTML_SOURCES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={htmlSource === option.value}
                    onClick={() => {
                      if (!option.disabled) setHtmlSource(option.value);
                    }}
                    disabled={option.disabled}
                    className={[
                      "rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium transition",
                      htmlSource === option.value
                        ? "bg-surface text-ink shadow-sm"
                        : "text-muted hover:text-ink",
                      option.disabled ? "cursor-not-allowed opacity-45" : "",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                URL conversion is an upcoming feature.
              </p>
            </fieldset>

            {htmlSource === "file" && (
              <p className="text-[13px] leading-relaxed text-muted">
                Drop HTML files in the workspace, one PDF per file.
              </p>
            )}
            {htmlSource === "zip" && (
              <p className="text-[13px] leading-relaxed text-muted">
                Drop ZIP files containing the HTML and its CSS.
              </p>
            )}
          </div>
        )}

        {OUTPUT_MODE_SLUGS.has(tool.slug) && !(tool.slug === "html-to-pdf" && htmlSource === "url") && (
          <div className="space-y-3">
            <fieldset>
              <legend className="text-[13px] font-medium">Output</legend>
              <div className="mt-2 grid grid-cols-1 gap-1 rounded-xl bg-paper p-1">
                <button
                  type="button"
                  aria-pressed={outputMode === "zip"}
                  onClick={() => setOutputMode("zip")}
                  disabled={files.length < 2}
                  className={[
                    "rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium transition",
                    outputMode === "zip"
                      ? "bg-surface text-ink shadow-sm"
                      : "text-muted hover:text-ink",
                    files.length < 2 ? "cursor-not-allowed opacity-40" : "",
                  ].join(" ")}
                >
                  Separate files (ZIP)
                </button>
                <button
                  type="button"
                  aria-pressed={outputMode === "merge"}
                  onClick={() => setOutputMode("merge")}
                  disabled={files.length < 2}
                  className={[
                    "rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium transition",
                    outputMode === "merge"
                      ? "bg-surface text-ink shadow-sm"
                      : "text-muted hover:text-ink",
                    files.length < 2 ? "cursor-not-allowed opacity-40" : "",
                  ].join(" ")}
                >
                  Merge into one {OUTPUT_FORMATS[tool.slug] ?? "PDF"}
                </button>
              </div>
              {files.length < 2 && (
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  Add more than one file to choose how the results are delivered.
                </p>
              )}
            </fieldset>
            {outputMode === "merge" && (
              <p className="text-[13px] leading-relaxed text-muted">
                Order matters when merging: the first chip comes first. Drag the chips to set the
                order.
              </p>
            )}
          </div>
        )}

        {tool.slug === "split-pdf" && (
          <div className="space-y-4">
            <fieldset>
              <legend className="text-[13px] font-medium">Split mode</legend>
              <div className="mt-2 grid grid-cols-1 gap-1 rounded-xl bg-paper p-1">
                {SPLIT_MODES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={splitMode === option.value}
                    onClick={() => setSplitMode(option.value)}
                    className={[
                      "rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium transition",
                      splitMode === option.value
                        ? "bg-surface text-ink shadow-sm"
                        : "text-muted hover:text-ink",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {splitMode === "visual" && (
              <p className="text-[13px] leading-relaxed text-muted">
                Tap the scissors on a page edge to start a new file there. Colors show which file
                each page lands in.
              </p>
            )}

            {splitMode === "range" && (
              <div className="space-y-3">
                <fieldset>
                  <label htmlFor="split-ranges" className="block text-[13px] font-medium">
                    Page ranges
                  </label>
                  <input
                    id="split-ranges"
                    type="text"
                    value={rangeText}
                    onChange={(event) => setRangeText(event.target.value)}
                    placeholder="1-3, 4-7, 8-10"
                    className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 font-mono text-[13px] text-ink transition focus:border-accent"
                  />
                  {splitGroups === null && (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-danger">
                      Ranges must look like &quot;1-3, 4-7, 8-10&quot; and stay within 1-{pageCount}.
                    </p>
                  )}
                </fieldset>
                <label className="flex items-start gap-2.5 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={mergeRanges}
                    onChange={(event) => setMergeRanges(event.target.checked)}
                    className="mt-0.5 size-4 accent-(--accent)"
                  />
                  <span className="leading-relaxed">
                    <span className="font-medium">Merge ranges into one PDF</span>
                    <span className="block text-muted">
                      All listed pages become a single file instead of one per range.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={mergeRemaining}
                    onChange={(event) => setMergeRemaining(event.target.checked)}
                    className="mt-0.5 size-4 accent-(--accent)"
                  />
                  <span className="leading-relaxed">
                    <span className="font-medium">Include remaining pages</span>
                    <span className="block text-muted">
                      Pages outside the ranges go into their own file.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {splitMode === "size" && (
              <fieldset>
                <label htmlFor="split-size" className="block text-[13px] font-medium">
                  Target size per file (MB)
                </label>
                <input
                  id="split-size"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={sizeMB}
                  onChange={(event) =>
                    setSizeMB(Math.max(0.1, Number.parseFloat(event.target.value) || 0.1))
                  }
                  className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
                />
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  Pages are grouped so every output file stays under this size. A single page
                  larger than the target becomes its own file.
                </p>
              </fieldset>
            )}

            {splitMode === "every" && (
              <fieldset>
                <label htmlFor="split-n" className="block text-[13px] font-medium">
                  Pages per file
                </label>
                <input
                  id="split-n"
                  type="number"
                  min={1}
                  max={pageCount || 1}
                  value={everyN}
                  onChange={(event) =>
                    setEveryN(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
                  }
                  className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
                />
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  The file is split into chunks of this size. The last chunk may be shorter.
                </p>
              </fieldset>
            )}

            {splitMode === "extract" && (
              <div>
                <p className="text-[13px] leading-relaxed text-muted">
                  Click pages to include them in one combined PDF.
                </p>
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={pageCount === 0}
                    className="text-[13px] font-medium text-accentstrong transition hover:opacity-80 disabled:opacity-40"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={selected.size === 0}
                    className="text-[13px] font-medium text-accentstrong transition hover:opacity-80 disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-line bg-paper px-3.5 py-3">
              <p className="text-[12px] font-medium text-muted">
                Will create{splitMode === "size" ? " (estimated)" : ""}
              </p>
              {splitGroups === null ? (
                <p className="mt-1 text-[12px] leading-relaxed text-danger">
                  Fix the input to see a preview.
                </p>
              ) : splitGroups.length === 0 ? (
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  {splitMode === "extract"
                    ? "Select at least one page."
                    : "Nothing to split yet."}
                </p>
              ) : (
                <>
                  <p className="mt-1 text-[13px] font-medium text-ink">
                    {splitGroups.length} file{splitGroups.length === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {groupNames.slice(0, 4).map((name, i) => (
                      <li
                        key={name}
                        className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted"
                      >
                        <span className="truncate">{name}</span>
                        <span className="shrink-0">
                          {splitGroups[i].length} pg{splitGroups[i].length === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                    {groupNames.length > 4 && (
                      <li className="font-mono text-[11px] text-muted">
                        +{groupNames.length - 4} more
                      </li>
                    )}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}

        {showSelectionTools && (
          <div>
            <p className="text-[13px] leading-relaxed text-muted">
              Click pages in the grid to select them.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={selectAll}
                disabled={pageCount === 0}
                className="text-[13px] font-medium text-accentstrong transition hover:opacity-80 disabled:opacity-40"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selected.size === 0}
                className="text-[13px] font-medium text-accentstrong transition hover:opacity-80 disabled:opacity-40"
              >
                Clear
              </button>
            </div>
            {tool.slug === "remove-pages" && allSelected && (
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                You need to keep at least one page. Deselect some.
              </p>
            )}
          </div>
        )}

        {tool.slug === "organize-pdf" && (
          <p className="text-[13px] leading-relaxed text-muted">
            Every page starts selected. Click a page to drop it from the final PDF, drag to
            reorder. Pages keep their source color and label.
          </p>
        )}

        {tool.slug === "rotate-pdf" && (
          <div>
            <p className="text-[13px] leading-relaxed text-muted">
              Rotate individual pages in the grid, or turn every page a quarter turn here.
            </p>
            <button
              type="button"
              onClick={rotateAll}
              disabled={pageCount === 0}
              className="mt-3 inline-flex h-10 items-center rounded-full border border-line bg-paper px-5 text-[13px] font-medium text-ink transition hover:border-linestrong active:scale-[0.97] disabled:opacity-40"
            >
              Rotate all pages
            </button>
          </div>
        )}

        {tool.slug === "add-page-numbers" && (
          <div className="space-y-4">
            <fieldset>
              <label htmlFor="num-position" className="block text-[13px] font-medium">
                Position
              </label>
              <select
                id="num-position"
                value={numPosition}
                onChange={(event) => setNumPosition(event.target.value as PageNumberPosition)}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
              >
                {NUMBER_POSITIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </fieldset>
            <fieldset>
              <label htmlFor="num-start" className="block text-[13px] font-medium">
                Start at
              </label>
              <input
                id="num-start"
                type="number"
                min={1}
                value={numStart}
                onChange={(event) => setNumStart(Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
              />
            </fieldset>
          </div>
        )}

        {tool.slug === "add-watermark" && (
          <div className="space-y-4">
            <fieldset>
              <label htmlFor="wm-text" className="block text-[13px] font-medium">
                Watermark text
              </label>
              <input
                id="wm-text"
                type="text"
                value={watermarkText}
                onChange={(event) => setWatermarkText(event.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
              />
            </fieldset>
            <fieldset>
              <legend className="text-[13px] font-medium">Size</legend>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-paper p-1">
                {WATERMARK_SIZES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={watermarkSize === option.value}
                    onClick={() => setWatermarkSize(option.value)}
                    className={[
                      "rounded-lg px-2 py-1.5 text-[12px] font-medium transition",
                      watermarkSize === option.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {tool.slug === "crop-pdf" && (
          <fieldset>
            <legend className="text-[13px] font-medium">Trim margins (%)</legend>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <label key={side} className="block">
                  <span className="text-[12px] capitalize text-muted">{side}</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={cropMargins[side]}
                    onChange={(event) => setMargin(side, event.target.value)}
                    className="mt-1 h-9 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {tool.slug === "repair-pdf" && (
          <p className="text-[13px] leading-relaxed text-muted">
            Repaired on the backend with Ghostscript and qpdf. Fixes broken structure and minor
            corruption.
          </p>
        )}

        {tool.slug === "ocr-pdf" && (
          <p className="text-[13px] leading-relaxed text-muted">
            Scanned pages are made searchable with OCR (English) on the backend.
          </p>
        )}

        {tool.slug === "pdf-to-word" && (
          <fieldset>
            <label htmlFor="word-format" className="block text-[13px] font-medium">
              Output format
            </label>
            <select
              id="word-format"
              value={wordFormat}
              onChange={(event) => setWordFormat(event.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
            >
              {WORD_FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </fieldset>
        )}

        {tool.slug === "pdf-to-powerpoint" && (
          <fieldset>
            <label htmlFor="ppt-format" className="block text-[13px] font-medium">
              Output format
            </label>
            <select
              id="ppt-format"
              value={pptFormat}
              onChange={(event) => setPptFormat(event.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
            >
              {PPT_FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </fieldset>
        )}

        {tool.slug === "pdf-to-excel" && (
          <p className="text-[13px] leading-relaxed text-muted">
            Tables are extracted into a single .xlsx spreadsheet.
          </p>
        )}

        {(tool.slug === "pdf-to-word" ||
          tool.slug === "pdf-to-powerpoint" ||
          tool.slug === "pdf-to-excel") && (
          <label className="flex items-start gap-2.5 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={ocrFirst}
              onChange={(event) => setOcrFirst(event.target.checked)}
              className="mt-0.5 size-4 accent-(--accent)"
            />
            <span className="leading-relaxed">
              <span className="font-medium">Run OCR first</span>
              <span className="block text-muted">
                If the PDF is scanned or image-based, OCR makes the conversion more accurate.
              </span>
            </span>
          </label>
        )}

        {tool.slug === "unlock-pdf" && (
          <fieldset>
            <label htmlFor="unlock-password" className="block text-[13px] font-medium">
              Password
            </label>
            <input
              id="unlock-password"
              type="password"
              value={pdfPassword}
              onChange={(event) => setPdfPassword(event.target.value)}
              autoComplete="off"
              className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
            />
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Enter the password the file was protected with.
            </p>
          </fieldset>
        )}

        {tool.slug === "protect-pdf" && (
          <div className="space-y-4">
            <fieldset>
              <label htmlFor="protect-password" className="block text-[13px] font-medium">
                Password
              </label>
              <input
                id="protect-password"
                type="password"
                value={pdfPassword}
                onChange={(event) => setPdfPassword(event.target.value)}
                autoComplete="new-password"
                className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
              />
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Anyone with this password can open the file.
              </p>
            </fieldset>

            <fieldset>
              <label htmlFor="owner-password" className="block text-[13px] font-medium">
                Owner password (optional)
              </label>
              <input
                id="owner-password"
                type="password"
                value={pdfOwnerPassword}
                onChange={(event) => setPdfOwnerPassword(event.target.value)}
                autoComplete="new-password"
                className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
              />
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Restricts what can be done with the file. Leave empty to use the same password.
              </p>
            </fieldset>

            <fieldset>
              <label htmlFor="key-length" className="block text-[13px] font-medium">
                Key length
              </label>
              <select
                id="key-length"
                value={pdfKeyLength}
                onChange={(event) => setPdfKeyLength(Number.parseInt(event.target.value, 10))}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
              >
                <option value={40}>40 bit (legacy)</option>
                <option value={128}>128 bit</option>
                <option value={256}>256 bit (AES)</option>
              </select>
            </fieldset>

            <fieldset>
              <legend className="text-[13px] font-medium">Restrict</legend>
              <div className="mt-2 space-y-2.5">
                {[
                  { key: "printing", label: "Printing" },
                  { key: "modify", label: "Modifying the document" },
                  { key: "modifyAnnotations", label: "Modifying annotations" },
                  { key: "extractContent", label: "Copying and extracting content" },
                  { key: "extractAccessibility", label: "Extraction for accessibility" },
                  { key: "fillInForm", label: "Filling in form fields" },
                  { key: "assembly", label: "Document assembly" },
                ].map((option) => (
                  <label
                    key={option.key}
                    className="flex items-center justify-between gap-2 text-[13px]"
                  >
                    <span>{option.label}</span>
                    <input
                      type="checkbox"
                      checked={pdfPrevent[option.key as keyof typeof pdfPrevent]}
                      onChange={(event) =>
                        setPdfPrevent((prev) => ({
                          ...prev,
                          [option.key]: event.target.checked,
                        }))
                      }
                      className="size-4 accent-(--accent)"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </div>

        {tool.slug === "pdf-to-pdfa" && (
          <div className="space-y-4">
            <fieldset>
              <label htmlFor="pdfa-format" className="block text-[13px] font-medium">
                Output format
              </label>
              <select
                id="pdfa-format"
                value={pdfaFormat}
                onChange={(event) => setPdfaFormat(event.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink transition focus:border-accent"
              >
                {PDFA_FORMATS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </fieldset>
            <div className="space-y-2.5">
              <label className="flex items-center justify-between gap-2 text-[13px]">
                <span>PDF/UA (universal accessibility)</span>
                <input
                  type="checkbox"
                  checked={pdfaPdfUa}
                  onChange={(event) => setPdfaPdfUa(event.target.checked)}
                  className="size-4 accent-(--accent)"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-[13px]">
                <span>Strict conversion</span>
                <input
                  type="checkbox"
                  checked={pdfaStrict}
                  onChange={(event) => setPdfaStrict(event.target.checked)}
                  className="size-4 accent-(--accent)"
                />
              </label>
            </div>
          </div>
        )}

      {processed ? (
        <button
          type="button"
          onClick={run}
          disabled={!canRun || busy}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-ink px-6 text-[15px] font-medium text-paper transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
        >
          {busy ? "Working..." : actionLabel}
        </button>
      ) : (
        <p className="mt-6 rounded-xl border border-line bg-paper px-4 py-3 text-[13px] leading-relaxed text-muted">
          The workspace for this tool is ready. Processing is wired to the backend next.
        </p>
      )}

      {result && (
        <p
          role="status"
          className={
            result.kind === "ok"
              ? "mt-4 text-[13px] font-medium leading-relaxed text-accentstrong"
              : "mt-4 text-[13px] font-medium leading-relaxed text-danger"
          }
        >
          {result.message}
        </p>
      )}

      <button
        type="button"
        onClick={clearAll}
        disabled={!hasFiles}
        className="mt-5 text-[13px] text-muted transition hover:text-ink disabled:opacity-40"
      >
        Clear all files
      </button>
    </aside>
  );

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-14 sm:px-6 lg:px-8">
        <Link
          to="/#tools"
          className="inline-flex items-center gap-2 text-[14px] text-muted transition hover:text-ink"
        >
          <ArrowLeft size={15} weight="bold" />
          All tools
        </Link>

        <div className="mt-10 flex items-start gap-5">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accentsoft text-accent">
            <tool.Icon size={28} weight="regular" />
          </span>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tool.name}</h1>
            <p className="mt-2 max-w-[52ch] text-[16px] leading-relaxed text-muted">
              {tool.tagline}
            </p>
          </div>
        </div>

        {isScan ? (
          <div className="mt-10 grid gap-6 lg:grid-cols-[7fr_3fr] lg:items-start">
            <div className="min-w-0">
              <CameraScanner onCapture={(file) => setFiles((prev) => [...prev, file])} />
              {files.length === 0 ? (
                <button
                  type="button"
                  onClick={() => scanInputRef.current?.click()}
                  className="mt-4 inline-flex items-center gap-2 text-[14px] text-muted transition hover:text-ink"
                >
                  <FilePdf size={16} className="text-accent" weight="regular" />
                  Or add images from your device
                </button>
              ) : (
                <div className="mt-6">
                  <FileStrip files={files} onFilesChange={setFiles} accept={tool.accept} />
                </div>
              )}
              <input
                ref={scanInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  if (event.target.files?.length) {
                    setFiles((prev) => [...prev, ...Array.from(event.target.files!)]);
                  }
                  event.target.value = "";
                }}
              />
            </div>
            {optionsPanel}
          </div>
        ) : tool.slug === "html-to-pdf" ? (
          <div className="mt-10 grid gap-6 lg:grid-cols-[7fr_3fr] lg:items-start">
            <div className="min-w-0">
              {hasFiles ? (
                <FileStrip
                  files={files}
                  onFilesChange={setHtmlFiles}
                  reorderable={OUTPUT_MODE_SLUGS.has(tool.slug)}
                  accept={htmlDropAccept}
                />
              ) : (
                <Dropzone files={files} onFiles={setHtmlFiles} accept={htmlDropAccept} />
              )}
            </div>
            {optionsPanel}
          </div>
        ) : tool.slug === "edit-pdf" ? (
          <div className="mt-10">
            {hasFiles ? (
              <>
                <FileStrip files={files} onFilesChange={setFiles} accept={tool.accept} size="compact" />
                <EditPdfWorkspace file={activeFile!} />
              </>
            ) : (
              <div className="mt-12">
                <Dropzone files={files} onFiles={addFiles} accept={tool.accept} />
                {pdfTool && (
                  <button
                    type="button"
                    onClick={loadSample}
                    className="mt-4 inline-flex items-center gap-2 text-[14px] text-muted transition hover:text-ink"
                  >
                    <FilePdf size={16} className="text-accent" weight="regular" />
                    Need a file to try? Load the sample PDF.
                  </button>
                )}
              </div>
            )}
          </div>
        ) : !hasFiles ? (
          <div className="mt-12">
            <Dropzone files={files} onFiles={addFiles} accept={tool.accept} />
            {pdfTool && (
              <button
                type="button"
                onClick={loadSample}
                className="mt-4 inline-flex items-center gap-2 text-[14px] text-muted transition hover:text-ink"
              >
                <FilePdf size={16} className="text-accent" weight="regular" />
                Need a file to try? Load the sample PDF.
              </button>
            )}
          </div>
        ) : (
          <div className="mt-10 grid gap-6 lg:grid-cols-[7fr_3fr] lg:items-start">
            <div className="min-w-0">
              <FileStrip
                files={files}
                onFilesChange={setFiles}
                reorderable={
                  tool.slug === "merge-pdf" ||
                  tool.slug === "jpg-to-pdf" ||
                  OUTPUT_MODE_SLUGS.has(tool.slug)
                }
                selectable={isPages}
                activeIndex={activeIndex}
                onActiveChange={setActiveIndex}
                accept={htmlDropAccept}
                size={isPages ? "compact" : "large"}
                pageLayout={
                  tool.slug === "jpg-to-pdf"
                    ? { pageSize, orientation: jpgOrientation, margin: jpgMargin }
                    : undefined
                }
              />
              {tool.slug === "organize-pdf" ? (
                <div className="mt-8">
                  <OrganizeWorkspace files={files} onPlanChange={setOrganizePlan} />
                </div>
              ) : isPages ? (
                <div className="mt-8">
                  <PageWorkspace
                    file={activeFile!}
                    doc={pdfState.doc}
                    pageCount={pageCount}
                    loading={pdfState.loading}
                    error={pdfState.error}
                    mode={pageMode}
                    selected={selected}
                    onSelectedChange={setSelected}
                    rotations={rotations}
                    onRotationsChange={setRotations}
                    groupOf={tool.slug === "split-pdf" ? groupOf : undefined}
                    cuts={tool.slug === "split-pdf" ? cuts : undefined}
                    onToggleCut={tool.slug === "split-pdf" ? (next) => setCuts(next) : undefined}
                    selectStyle={tool.slug === "remove-pages" ? "delete" : "normal"}
                  />
                </div>
              ) : null}
            </div>

            {optionsPanel}
          </div>
        )}

        {similar.length > 0 && (
          <section className="mt-20" aria-label={`More ${tool.category} tools`}>
            <h2 className="text-xl font-semibold tracking-tight">
              More {tool.category.toLowerCase()} tools
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {similar.map((item) => (
                <Link
                  key={item.slug}
                  to={`/tools/${item.slug}`}
                  className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-linestrong active:scale-[0.99]"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accentsoft text-accent">
                    <item.Icon size={18} weight="regular" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium leading-tight">
                      {item.name}
                    </span>
                  </span>
                  <ArrowRight
                    size={15}
                    weight="bold"
                    className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}

export function ToolPage() {
  const { slug } = useParams<{ slug: string }>();
  const tool = slug ? getTool(slug) : undefined;

  if (!tool) {
    return <Navigate to="/" replace />;
  }

  return <ToolWorkspace key={tool.slug} tool={tool} />;
}
