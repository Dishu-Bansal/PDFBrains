import { CheckCircle, DownloadSimple, SpinnerGap } from "@phosphor-icons/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

import { usePdfDocument } from "../lib/pdf";
import {
  applyTextEdits,
  cacheTextEditorPdf,
  clearTextEditorCache,
  extractTextEditorJson,
} from "../lib/api";
import type { TextEditorDocument, TextEditorPage } from "../lib/api";
import { baseName, downloadBlob } from "../lib/process";

/** Fixed render width of each page, in CSS pixels. */
const PAGE_WIDTH = 640;

interface EditPdfWorkspaceProps {
  file: File;
}

/** Renders one PDF page to a canvas at a fixed width. */
function PageCanvas({
  doc,
  pageNumber,
  width,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;

    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const vp1 = page.getViewport({ scale: 1 });
        const scale = width / vp1.width;
        const sized = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(sized.width * dpr);
        canvas.height = Math.floor(sized.height * dpr);
        canvas.style.width = `${sized.width}px`;
        canvas.style.height = `${sized.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        task = page.render({ canvasContext: ctx, viewport: sized });
        await task.promise;
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
  }, [doc, pageNumber, width]);

  return <div ref={boxRef} className="w-full" />;
}

/**
 * Edit PDF workspace: every page rendered vertically with its extracted
 * text overlaid as click-to-edit spans. Edits update the extracted JSON
 * document; "Download" applies them via the job id and clears the cache.
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
        const [json, cachedJobId] = await Promise.all([
          extractTextEditorJson(file),
          cacheTextEditorPdf(file),
        ]);
        if (cancelled) {
          clearTextEditorCache(cachedJobId).catch(() => {});
          return;
        }
        jobRef.current = cachedJobId;
        originalRef.current = json;
        setDocument(json);
        setJobId(cachedJobId);
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
    if (!document || !jobId || busy) return;
    setBusy(true);
    setApplied(null);
    try {
      const blob = await applyTextEdits(jobId, document, file.name);
      downloadBlob(blob, `${baseName(file)}-edited.pdf`);
      setApplied("Edited PDF downloaded. The server cache was cleared.");
      await clearTextEditorCache(jobId).catch(() => {});
      jobRef.current = null;
      setJobId(null);
    } catch (err) {
      setApplied(
        err instanceof Error ? err.message : "Could not apply the edits."
      );
    } finally {
      setBusy(false);
    }
  };

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
            <div key={i} className="aspect-[3/4] w-[640px] max-w-full animate-pulse rounded-lg bg-raised" />
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
            {loading ? "Reading..." : document && jobId
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
            disabled={!document || !jobId || busy}
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

      {!document || !jobId ? (
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

/** One page: the rendered canvas with editable text overlays. */
function EditPageCard({
  doc,
  pageNumber,
  page,
  pageIndex,
  onUpdate,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  page: TextEditorPage;
  pageIndex: number;
  onUpdate: (pageIndex: number, elementIndex: number, text: string) => void;
}) {
  const pageWidth = page.width ?? 595.28;
  const pageHeight = page.height ?? 841.89;
  const scale = PAGE_WIDTH / pageWidth;
  const elements = page.textElements ?? [];

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
        <div className="absolute inset-0">
          <PageCanvas doc={doc} pageNumber={pageNumber} width={PAGE_WIDTH} />
        </div>
        {elements.map((el, elementIndex) => {
          const matrix = el.textMatrix ?? [1, 0, 0, 1, 0, 0];
          const x = matrix[4] ?? 0;
          const y = matrix[5] ?? 0;
          const fontSizePt = el.fontSize ?? el.fontMatrixSize ?? 12;
          const left = x * scale;
          const top = (pageHeight - y - fontSizePt) * scale;
          const fontSize = Math.max(6, fontSizePt * scale);

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
              className="absolute cursor-text whitespace-pre rounded px-0.5 text-ink outline-none transition-colors hover:bg-accent/10 focus:bg-accent/15 focus:ring-1 focus:ring-accent"
              style={{
                left,
                top,
                fontSize,
                lineHeight: 1.15,
                maxWidth: PAGE_WIDTH - left,
                fontFamily: "Outfit Variable, sans-serif",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
