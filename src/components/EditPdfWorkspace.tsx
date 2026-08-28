import { CheckCircle, DownloadSimple, SpinnerGap } from "@phosphor-icons/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useMemo, useRef, useState } from "react";

import { usePdfDocument } from "../lib/pdf";
import {
  applyTextEdits,
  cacheTextEditorPdf,
  clearTextEditorCache,
  extractTextEditorJson,
  renderTextEditorPdf,
} from "../lib/api";
import type { TextEditorDocument, TextEditorPage, TextEditorTextElement } from "../lib/api";
import { baseName, downloadBlob } from "../lib/process";

/** Fixed render width of each page, in CSS pixels. */
const PAGE_WIDTH = 640;

interface EditPdfWorkspaceProps {
  file: File;
}

interface TextGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FontStyle {
  bold: boolean;
  italic: boolean;
}

/**
 * Edit PDF workspace: every page rendered vertically with its extracted
 * text overlaid as click-to-edit spans. The original canvas text is blanked
 * out (using the page's background color) so the editable text replaces it
 * instead of duplicating it. Edits update the extracted JSON document;
 * "Download" applies them through the job id and clears the server cache.
 */
export function EditPdfWorkspace({ file }: EditPdfWorkspaceProps) {
  const { doc, pageCount, loading, error: pdfError } = usePdfDocument(file);
  const [document, setDocument] = useState<TextEditorDocument | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const jobRef = useRef<string | null>(null);
  const originalRef = useRef<TextEditorDocument | null>(null);

  // Extract the editable JSON and cache the PDF for the job on file change.
  useEffect(() => {
    let cancelled = false;
    setDocument(null);
    setJobId(null);
    setLoadError(null);
    setApplied(null);
    originalRef.current = null;

    (async () => {
      try {
        const json = await extractTextEditorJson(file);
        let cachedJob: string | null = null;
        try {
          cachedJob = await cacheTextEditorPdf(file);
        } catch {
          cachedJob = null; // fall back to the job-less render
        }
        if (cancelled) {
          if (cachedJob) clearTextEditorCache(cachedJob).catch(() => {});
          return;
        }
        jobRef.current = cachedJob;
        originalRef.current = json;
        setDocument(json);
        setJobId(cachedJob);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Could not load the text editor."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (jobRef.current) {
        clearTextEditorCache(jobRef.current).catch(() => {});
        jobRef.current = null;
      }
    };
  }, [file]);

  const updateElement = (pageIndex: number, elementIndex: number, text: string) => {
    setDocument((prev) => {
      if (!prev || !prev.pages) return prev;
      const pages = prev.pages.map((page, pi) => {
        if (pi !== pageIndex || !page.textElements) return page;
        return {
          ...page,
          textElements: page.textElements.map((el, ei) =>
            ei === elementIndex ? { ...el, text } : el
          ),
        };
      });
      return { ...prev, pages };
    });
  };

  const done = async () => {
    if (!document || busy) return;
    setBusy(true);
    setApplied(null);
    try {
      const blob = jobId
        ? await applyTextEdits(jobId, document, file.name)
        : await renderTextEditorPdf(document, file.name);
      downloadBlob(blob, `${baseName(file)}-edited.pdf`);
      if (jobId) {
        await clearTextEditorCache(jobId).catch(() => {});
        jobRef.current = null;
        setJobId(null);
      }
      setApplied("Edited PDF downloaded.");
    } catch (err) {
      setApplied(err instanceof Error ? err.message : "Could not apply the edits.");
    } finally {
      setBusy(false);
    }
  };

  // Map font ids to their visual style so bold/italic runs render as such.
  // (Hook kept above the early returns so the hook order never changes.)
  const fontMap = useMemo(() => {
    const map: Record<string, FontStyle> = {};
    for (const font of (document?.fonts ?? []) as Array<{
      id?: string;
      baseName?: string;
    }>) {
      if (!font.id) continue;
      map[font.id] = {
        bold: /bold/i.test(font.baseName ?? ""),
        italic: /italic|oblique/i.test(font.baseName ?? ""),
      };
    }
    return map;
  }, [document]);

  if (pdfError) {
    return (
      <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <p className="text-[15px] font-medium">Could not open this file</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{pdfError}</p>
      </div>
    );
  }

  if (loading || !doc) {
    return (
      <div className="mt-8" aria-busy="true">
        <p className="text-[14px] text-muted">Reading pages...</p>
        <div className="mt-4 space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="aspect-[3/4] w-[640px] max-w-full animate-pulse rounded-lg bg-raised"
            />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <p className="text-[15px] font-medium">Could not load the text editor</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{loadError}</p>
      </div>
    );
  }

  const pages: TextEditorPage[] = document?.pages ?? [];
  const changedCount = countChanges(document, originalRef.current);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">{file.name}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {loading ? "Reading..." : document
              ? `${pageCount} page${pageCount === 1 ? "" : "s"} · click any text to edit`
              : "Extracting editable text..."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {changedCount > 0 && (
            <p className="font-mono text-[12px] text-accentstrong">
              {changedCount} change{changedCount === 1 ? "" : "s"}
            </p>
          )}
          <button
            type="button"
            onClick={done}
            disabled={!document || busy}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-medium text-paper transition hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <SpinnerGap size={17} className="animate-spin" />
            ) : (
              <DownloadSimple size={17} />
            )}
            {busy ? "Applying..." : "Download edited PDF"}
          </button>
        </div>
      </div>

      {!document ? (
        <p className="mt-6 text-[14px] text-muted" aria-busy="true">
          Extracting editable text from the pages...
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {pages.map((page, pageIndex) => (
            <EditPageCard
              key={page.pageNumber ?? pageIndex}
              doc={doc}
              pageNumber={pageIndex + 1}
              page={page}
              pageIndex={pageIndex}
              fontMap={fontMap}
              onUpdate={updateElement}
            />
          ))}
        </div>
      )}

      {applied && (
        <p
          role="status"
          className={[
            "mt-6 flex items-center gap-2 text-[14px]",
            applied.startsWith("Edited") ? "text-accentstrong" : "text-danger",
          ].join(" ")}
        >
          <CheckCircle size={17} weight="bold" />
          {applied}
        </p>
      )}
    </div>
  );
}

function countChanges(
  current: TextEditorDocument | null,
  original: TextEditorDocument | null
): number {
  if (!current || !original) return 0;
  let count = 0;
  (current.pages ?? []).forEach((page, pageIndex) => {
    (page.textElements ?? []).forEach((el, elementIndex) => {
      const before = original.pages?.[pageIndex]?.textElements?.[elementIndex]?.text;
      if (before !== undefined && el.text !== before) count++;
    });
  });
  return count;
}

/** One page: the rendered canvas (text blanked) with editable overlays. */
function EditPageCard({
  doc,
  pageNumber,
  page,
  pageIndex,
  fontMap,
  onUpdate,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  page: TextEditorPage;
  pageIndex: number;
  fontMap: Record<string, FontStyle>;
  onUpdate: (pageIndex: number, elementIndex: number, text: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pageWidth = page.width ?? 595.28;
  const pageHeight = page.height ?? 841.89;
  const scale = PAGE_WIDTH / pageWidth;
  const elements: TextEditorTextElement[] = page.textElements ?? [];

  // Snapshot the original geometry once; text edits do not move the boxes.
  // The box height approximates the visible glyph extent (cap height) so the
  // blanked area and overlays land where the text actually is.
  const geometryRef = useRef<TextGeometry[]>([]);
  if (geometryRef.current.length === 0 && elements.length > 0) {
    geometryRef.current = elements
      .filter((el) => el.textMatrix && el.textMatrix.length >= 6)
      .map((el) => {
        const matrix = el.textMatrix as number[];
        const fontSize = el.fontSize ?? el.fontMatrixSize ?? 12;
        return {
          x: matrix[4],
          y: matrix[5],
          w: el.width ?? 0,
          h: fontSize * 0.8,
        };
      });
  }

  // Render the page once, then blank out the original text areas using the
  // page's background color so the editable overlays replace the text.
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;

    (async () => {
      try {
        const pdfPage = await doc.getPage(pageNumber);
        if (cancelled) return;
        const vp1 = pdfPage.getViewport({ scale: 1 });
        const scale2 = PAGE_WIDTH / vp1.width;
        const viewport = pdfPage.getViewport({ scale: scale2 });
        const canvas = document.createElement("canvas");
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        task = pdfPage.render({ canvasContext: ctx, viewport });
        await task.promise;
        if (cancelled) return;

        // Blank out each original text run with the background it sits on.
        // The sample point is taken just above the text box, outside the
        // glyphs, so it is never a dark text pixel.
        for (const geo of geometryRef.current) {
          if (geo.w <= 0 || geo.h <= 0) continue;
          const left = geo.x * scale2;
          const top = (pageHeight - geo.y - geo.h) * scale2;
          let fill = "rgba(255,255,255,1)";
          try {
            const sx = Math.min(
              Math.floor((geo.x + geo.w / 2) * scale2 * dpr),
              canvas.width - 1
            );
            const sy = Math.min(
              Math.max(Math.floor((top - 2) * dpr), 0),
              canvas.height - 1
            );
            const px = ctx.getImageData(sx, sy, 1, 1).data;
            if (px[3] > 10) fill = `rgba(${px[0]}, ${px[1]}, ${px[2]}, ${px[3] / 255})`;
          } catch {
            /* keep white fallback */
          }
          ctx.fillStyle = fill;
          ctx.fillRect(left, top - 1, geo.w * scale2 + 1, geo.h * scale2 + 3);
        }

        if (!cancelled) boxRef.current?.replaceChildren(canvas);
      } catch {
        /* render failed, leave placeholder */
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
      boxRef.current?.replaceChildren();
    };
  }, [doc, pageNumber, pageWidth, pageHeight]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-ink/75 px-2 py-0.5 font-mono text-[11px] text-paper">
          {pageNumber}
        </span>
        <p className="text-[12px] text-muted">
          {elements.length} text block{elements.length === 1 ? "" : "s"} · click to edit
        </p>
      </div>
      <div
        className="relative overflow-hidden rounded-lg border border-line bg-raised"
        style={{ width: PAGE_WIDTH, height: pageHeight * scale, maxWidth: "100%" }}
      >
        <div ref={boxRef} className="absolute inset-0" />
        {elements.map((el, elementIndex) => {
          if (!el.textMatrix || el.textMatrix.length < 6) return null;
          const matrix = el.textMatrix as number[];
          const x = matrix[4];
          const y = matrix[5];
          const fontSizePt = el.fontSize ?? el.fontMatrixSize ?? 12;
          const boxHeightPt = fontSizePt * 0.8;
          const left = x * scale;
          const top = (pageHeight - y - boxHeightPt) * scale;
          const fontSize = Math.max(6, fontSizePt * scale);
          const style = fontMap[el.fontId ?? ""];

          return (
            <span
              key={elementIndex}
              contentEditable
              suppressContentEditableWarning
              ref={(node) => {
                if (node && node.textContent !== el.text) node.textContent = el.text;
              }}
              onInput={(event) =>
                onUpdate(pageIndex, elementIndex, event.currentTarget.textContent ?? "")
              }
              className="absolute cursor-text whitespace-pre rounded text-ink outline-none transition-colors hover:bg-accent/10 focus:bg-accent/15 focus:ring-1 focus:ring-accent"
              style={{
                left,
                top,
                fontSize,
                lineHeight: 1,
                minHeight: boxHeightPt * scale,
                maxWidth: PAGE_WIDTH - left,
                fontFamily: "Outfit Variable, sans-serif",
                fontWeight: style?.bold ? 700 : 400,
                fontStyle: style?.italic ? "italic" : "normal",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
