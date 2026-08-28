import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

/**
 * Lazy pdf.js loader. pdfjs-dist is heavy, so it is code-split into its own
 * chunk and only pulled in the first time a PDF actually needs rendering.
 * The worker is loaded as a Vite asset URL.
 */
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  if (pdfjs.GlobalWorkerOptions.workerSrc !== workerUrl) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return pdfjs;
}

export interface PdfDocumentState {
  doc: PDFDocumentProxy | null;
  pageCount: number;
  loading: boolean;
  error: string | null;
}

/**
 * Loads one PDF document and keeps it alive for thumbnail rendering.
 * The doc is destroyed when the file changes or the caller unmounts.
 */
export function usePdfDocument(file: File | null): PdfDocumentState {
  const [state, setState] = useState<PdfDocumentState>({
    doc: null,
    pageCount: 0,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!file) {
      setState({ doc: null, pageCount: 0, loading: false, error: null });
      return;
    }

    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;

    setState({ doc: null, pageCount: 0, loading: true, error: null });

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        if (!cancelled) {
          setState({ doc, pageCount: doc.numPages, loading: false, error: null });
        }
      } catch {
        if (!cancelled) {
          setState({ doc: null, pageCount: 0, loading: false, error: "Could not read this file as a PDF." });
        }
      }
    })();

    return () => {
      cancelled = true;
      doc?.destroy().catch(() => {});
    };
  }, [file]);

  return state;
}

/**
 * Loads one PDF document per file and keeps them alive for thumbnail
 * rendering. Documents are cached by file identity, so adding or removing a
 * file only loads/loads the affected documents instead of reloading
 * everything (no flash of the loading state for unchanged files).
 */
export function usePdfDocuments(files: File[]): PdfDocumentState[] {
  const cacheRef = useRef<Map<string, PdfDocumentState>>(new Map());
  const [states, setStates] = useState<PdfDocumentState[]>([]);

  useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;
    const fileKey = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;

    // Drop cached documents for files that were removed.
    const currentKeys = new Set(files.map(fileKey));
    for (const key of [...cache.keys()]) {
      if (!currentKeys.has(key)) {
        cache.get(key)?.doc?.destroy().catch(() => {});
        cache.delete(key);
      }
    }

    // Instant state: cached docs immediately, placeholders for new files.
    setStates(
      files.map((file) => cache.get(fileKey(file)) ?? { doc: null, pageCount: 0, loading: true, error: null })
    );

    const missing = files.filter((file) => !cache.has(fileKey(file)));

    (async () => {
      const pdfjs = await loadPdfjs();
      for (const file of missing) {
        if (cancelled) return;
        const key = fileKey(file);
        try {
          const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
          if (cancelled) {
            doc.destroy().catch(() => {});
            return;
          }
          const state: PdfDocumentState = {
            doc,
            pageCount: doc.numPages,
            loading: false,
            error: null,
          };
          cache.set(key, state);
          setStates((prev) => prev.map((s, i) => (fileKey(files[i]) === key ? state : s)));
        } catch {
          const state: PdfDocumentState = {
            doc: null,
            pageCount: 0,
            loading: false,
            error: "Could not read this file as a PDF.",
          };
          cache.set(key, state);
          setStates((prev) => prev.map((s, i) => (fileKey(files[i]) === key ? state : s)));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [files]);

  // Destroy all cached documents when the hook unmounts.
  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      cache.forEach((state) => state.doc?.destroy().catch(() => {}));
      cache.clear();
    };
  }, []);

  return states;
}

/** Renders one page of a loaded PDF to a JPEG/PNG blob (used by pdf-to-jpg). */
export async function renderPageToJpeg(file: File, pageNumber: number, scale = 2): Promise<Blob> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), "image/jpeg", 0.92);
    });
    return blob;
  } finally {
    await doc.destroy();
  }
}
