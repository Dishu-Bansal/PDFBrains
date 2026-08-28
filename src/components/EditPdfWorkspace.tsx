import { CheckCircle, DownloadSimple, SpinnerGap } from "@phosphor-icons/react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
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

interface FontStyle {
  bold: boolean;
  italic: boolean;
}

interface StirlingFont {
  id?: string;
  baseName?: string;
}

/** A pdf.js text item, as returned by getTextContent(). */
interface PdfTextItem {
  str?: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL?: boolean;
}

/** Text style entry from getTextContent().styles. */
interface PdfTextStyle {
  ascent?: number;
  descent?: number;
  vertical?: boolean;
  fontFamily?: string;
}

/** One editable run: exact viewport-space geometry plus the PDF matrix. */
interface OverlayItem {
  text: string;
  left: number;
  top: number;
  width: number; // CSS px advance width of the original run
  fontHeight: number; // CSS px
  fontSizePt: number; // PDF points
  transform: number[]; // original PDF-space text matrix (for the JSON)
  fontFamily: string;
  fontId?: string;
  bold: boolean;
  italic: boolean;
  angle: number; // degrees, 0 = horizontal
}

/**
 * Edit PDF workspace: every page rendered vertically with its extracted
 * text overlaid as click-to-edit spans. Overlay geometry comes from pdf.js
 * getTextContent() (the same transform math pdf.js uses for its own text
 * layer), so every editable run sits exactly where the original text is.
 * The original canvas text is blanked out with the background it sits on so
 * the editable text replaces it instead of duplicating it. Edits update the
 * extracted JSON document; "Download" applies them through the job id and
 * clears the server cache.
 */
export function EditPdfWorkspace({ file }: EditPdfWorkspaceProps) {
  const { doc, pageCount, loading, error: pdfError } = usePdfDocument(file);
  const [document, setDocument] = useState<TextEditorDocument | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const [readyCount, setReadyCount] = useState(0);
  const jobRef = useRef<string | null>(null);
  const originalRef = useRef<TextEditorDocument | null>(null);
  const readyRef = useRef<Set<number>>(new Set());

  // Extract the editable JSON and cache the PDF for the job on file change.
  useEffect(() => {
    let cancelled = false;
    setDocument(null);
    setJobId(null);
    setLoadError(null);
    setApplied(null);
    setReadyCount(0);
    readyRef.current = new Set();
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

  // Once a page's pdf.js items are extracted, replace that page's text
  // elements with the rebuilt (per-run) ones. The pristine rebuild is kept
  // as the diff baseline so the change counter only counts real edits.
  const handlePageReady = (pageIndex: number, elements: TextEditorTextElement[]) => {
    if (readyRef.current.has(pageIndex)) return;
    readyRef.current.add(pageIndex);
    setReadyCount((count) => count + 1);
    if (originalRef.current?.pages?.[pageIndex]) {
      originalRef.current.pages[pageIndex].textElements = elements;
    }
    setDocument((prev) => {
      if (!prev || !prev.pages?.[pageIndex]) return prev;
      const pages = prev.pages.map((page, pi) =>
        pi === pageIndex ? { ...page, textElements: elements } : page
      );
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
    for (const font of (document?.fonts ?? []) as StirlingFont[]) {
      if (!font.id) continue;
      map[font.id] = {
        bold: /bold/i.test(font.baseName ?? ""),
        italic: /italic|oblique/i.test(font.baseName ?? ""),
      };
    }
    return map;
  }, [document]);

  // Scopes registered fonts (and their metrics) to this exact file so two
  // different documents with the same internal font names never collide.
  const docKey = useMemo(
    () => shortHash(`${file.name}-${file.size}-${file.lastModified}`),
    [file]
  );

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
  const allReady = readyCount >= pageCount;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">{file.name}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {loading
              ? "Reading..."
              : document
                ? allReady
                  ? `${pageCount} page${pageCount === 1 ? "" : "s"} · click any text to edit`
                  : "Preparing pages..."
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
            disabled={!document || busy || !allReady}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-medium text-paper transition hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy || !allReady ? (
              <SpinnerGap size={17} className="animate-spin" />
            ) : (
              <DownloadSimple size={17} />
            )}
            {busy ? "Applying..." : allReady ? "Download edited PDF" : "Preparing pages..."}
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
              docKey={docKey}
              fontMap={fontMap}
              onUpdate={updateElement}
              onPageReady={handlePageReady}
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

/* ------------------------------------------------------------------ */
/* Font helpers (module-level caches)                                  */
/* ------------------------------------------------------------------ */

const familyCache = new Map<string, string>();
const ascentCache = new Map<string, number>();

/** Short stable hash used to scope registered fonts to one document. */
function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Resolves the CSS font family for one text run. Embedded fonts are
 * registered from the page's object store so the overlay matches the canvas
 * rendering; otherwise the generic family pdf.js itself uses is kept.
 */
async function resolveFontFamily(
  fontName: string,
  style: PdfTextStyle | undefined,
  page: PDFPageProxy,
  docKey: string
): Promise<string> {
  const cacheKey = `${docKey}:${fontName}`;
  const cached = familyCache.get(cacheKey);
  if (cached) return cached;

  // 1) Embedded font data: register the real font under a stable name.
  try {
    let font: { data?: unknown; loadedName?: string } | null = null;
    try {
      font = await page.commonObjs?.get(fontName);
    } catch {
      font = null;
    }
    if (!font?.data) {
      try {
        font = await page.objs?.get(fontName);
      } catch {
        font = null;
      }
    }
    if (font?.data) {
      const name = `pdfbrains-${shortHash(docKey)}-${String(font.loadedName || fontName).replace(/[^a-zA-Z0-9_-]/g, "")}`;
      if (!document.fonts.check(`12px "${name}"`)) {
        const face = new FontFace(name, font.data as ArrayBuffer);
        document.fonts.add(face);
        await face.loaded.catch(() => {});
      }
      familyCache.set(cacheKey, name);
      return name;
    }
  } catch {
    /* not in the page object store */
  }

  // 2) Generic family (sans-serif/serif/monospace), like pdf.js's text layer.
  const family = style?.fontFamily || "sans-serif";
  familyCache.set(cacheKey, family);
  return family;
}

/**
 * Ascent ratio (fraction of the font height above the baseline) for the font
 * actually used by the browser. Mirrors pdf.js: measure via canvas text
 * metrics, fall back to the PDF font's ascent, then 0.8.
 */
async function getAscentRatio(family: string, style: PdfTextStyle | undefined): Promise<number> {
  const cached = ascentCache.get(family);
  if (cached !== undefined) return cached;
  let ratio = 0.8;
  try {
    await document.fonts.load(`30px ${cssFontFamily(family)}`).catch(() => {});
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.font = `30px ${cssFontFamily(family)}`;
      const metrics = ctx.measureText("");
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = Math.abs(metrics.fontBoundingBoxDescent);
      if (ascent > 0) ratio = ascent / (ascent + descent);
    }
  } catch {
    /* keep defaults */
  }
  if (ratio === 0.8 && style?.ascent) ratio = style.ascent;
  ascentCache.set(family, ratio);
  return ratio;
}

/** Quotes a non-generic family for use in CSS font shorthand. */
function cssFontFamily(family: string): string {
  if (/^(sans-serif|serif|monospace|inherit|initial)$/i.test(family)) return family;
  return `"${family.replace(/"/g, "")}", sans-serif`;
}

/** Finds the Stirling element this pdf.js run corresponds to, for fontId. */
function matchStirlingElement(
  item: PdfTextItem,
  elements: TextEditorTextElement[],
  tolerance = 0.5
): TextEditorTextElement | null {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const itemText = norm(item.str ?? "");
  const itemY = item.transform[5] ?? 0;
  const itemX = item.transform[4] ?? 0;
  let best: TextEditorTextElement | null = null;
  let bestScore = -1;
  for (const el of elements) {
    const matrix = el.textMatrix;
    if (!matrix || matrix.length < 6) continue;
    if (Math.abs(matrix[5] - itemY) > tolerance) continue; // same baseline
    const elText = norm(el.text ?? "");
    let score = -1;
    if (elText && elText === itemText) score = 3;
    else if (elText && (elText.includes(itemText) || itemText.includes(elText))) score = 2;
    else if (!elText || !itemText) score = 1; // weak positional match
    if (score < 0) continue;
    score = score * 1000 - Math.abs(matrix[4] - itemX);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

/** One page: the rendered canvas (text blanked) with editable overlays. */
function EditPageCard({
  doc,
  pageNumber,
  page,
  pageIndex,
  docKey,
  fontMap,
  onUpdate,
  onPageReady,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  page: TextEditorPage;
  pageIndex: number;
  docKey: string;
  fontMap: Record<string, FontStyle>;
  onUpdate: (pageIndex: number, elementIndex: number, text: string) => void;
  onPageReady: (pageIndex: number, elements: TextEditorTextElement[]) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pageWidth = page.width ?? 595.28;
  const pageHeight = page.height ?? 841.89;
  const fallbackScale = PAGE_WIDTH / pageWidth;
  const [items, setItems] = useState<OverlayItem[]>([]);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const editableCount = items.filter((it) => it.text.trim() !== "").length;

  // Render the page, read its text content, then blank the original runs and
  // overlay editable spans at the exact positions pdf.js computes for them.
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;

    (async () => {
      try {
        const pdfPage = await doc.getPage(pageNumber);
        if (cancelled) return;
        const vp1 = pdfPage.getViewport({ scale: 1 });
        const scale = PAGE_WIDTH / vp1.width;
        const viewport = pdfPage.getViewport({ scale });

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

        const { Util } = await import("pdfjs-dist");
        const textContent = await pdfPage.getTextContent();
        if (cancelled) return;

        const stirlingElements = page.textElements ?? [];
        const built: OverlayItem[] = [];
        for (const entry of textContent.items) {
          const item = entry as PdfTextItem;
          if (typeof item.str !== "string" || item.str === "") continue;
          const tx = Util.transform(viewport.transform, item.transform);
          const angle = Math.atan2(tx[1], tx[0]);
          const fontHeight = Math.hypot(tx[2], tx[3]);
          if (fontHeight <= 0) continue;
          const style = (textContent.styles ?? {})[item.fontName] as PdfTextStyle | undefined;
          const fontFamily = await resolveFontFamily(item.fontName, style, pdfPage, docKey);
          if (cancelled) return;
          const ascentRatio = await getAscentRatio(fontFamily, style);
          const fontAscent = fontHeight * ascentRatio;
          let left: number;
          let top: number;
          if (angle === 0) {
            left = tx[4];
            top = tx[5] - fontAscent;
          } else {
            left = tx[4] + fontAscent * Math.sin(angle);
            top = tx[5] - fontAscent * Math.cos(angle);
          }
          const matched = matchStirlingElement(item, stirlingElements);
          const fontId = matched?.fontId;
          built.push({
            text: item.str,
            left,
            top,
            width: item.width * scale,
            fontHeight,
            fontSizePt: Math.hypot(item.transform[2], item.transform[3]),
            transform: item.transform.slice(),
            fontFamily,
            fontId,
            bold: fontId
              ? fontMap[fontId]?.bold ?? false
              : /bold/i.test(item.fontName) || /bold/i.test(style?.fontFamily ?? ""),
            italic: fontId
              ? fontMap[fontId]?.italic ?? false
              : /italic|oblique/i.test(item.fontName) ||
                /italic|oblique/i.test(style?.fontFamily ?? ""),
            angle: angle * (180 / Math.PI),
          });
        }
        if (cancelled) return;

        // Blank out each original run with the background it sits on. The
        // fill is sampled from a strip above the run (never from a glyph),
        // and whitespace-only runs are left alone so they cannot paint over
        // graphics or colors sitting between words.
        for (const it of built) {
          if (it.width <= 0 || !it.text.trim()) continue;
          ctx.save();
          if (it.angle !== 0) {
            ctx.translate(it.left, it.top);
            ctx.rotate((it.angle * Math.PI) / 180);
            ctx.fillStyle = sampleFill(ctx, it.left, it.top, it.width, dpr, canvas.width, canvas.height);
            ctx.fillRect(-1, -1, it.width + 2, it.fontHeight + 2);
          } else {
            ctx.fillStyle = sampleFill(ctx, it.left, it.top, it.width, dpr, canvas.width, canvas.height);
            ctx.fillRect(it.left - 1, it.top - 1, it.width + 2, it.fontHeight + 2);
          }
          ctx.restore();
        }

        if (!cancelled) {
          boxRef.current?.replaceChildren(canvas);
          setDims({ w: viewport.width, h: viewport.height });
          setItems(built);
          onPageReady(
            pageIndex,
            built.map((it) => ({
              text: it.text,
              textMatrix: it.transform,
              fontSize: it.fontSizePt,
              ...(it.fontId ? { fontId: it.fontId } : {}),
            }))
          );
        }
      } catch {
        // Render or extraction failed. Keep the placeholder but mark the
        // page ready so the download button is not blocked forever.
        if (!cancelled) onPageReady(pageIndex, page.textElements ?? []);
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
        {dims ? (
          editableCount > 0 ? (
            <p className="text-[12px] text-muted">
              {editableCount} text block{editableCount === 1 ? "" : "s"} · click to edit
            </p>
          ) : (
            <p className="text-[12px] text-muted">No editable text found on this page</p>
          )
        ) : (
          <p className="text-[12px] text-muted" aria-busy="true">
            Reading text...
          </p>
        )}
      </div>
      <div
        className="relative overflow-hidden rounded-lg border border-line bg-raised"
        style={{
          width: dims?.w ?? PAGE_WIDTH,
          height: dims?.h ?? pageHeight * fallbackScale,
          maxWidth: "100%",
        }}
      >
        <div ref={boxRef} className="absolute inset-0" />
        {items.map((it, index) => {
          // Whitespace-only runs (inter-word spaces) stay in the download
          // JSON for spacing, but get no editable box and no hover state so
          // they cannot disrupt the line or the graphics behind them.
          if (!it.text.trim()) return null;
          return (
            <span
              key={index}
              contentEditable
              suppressContentEditableWarning
              ref={(node) => {
                if (node && node.textContent !== it.text) node.textContent = it.text;
              }}
              onInput={(event) => {
                const text = event.currentTarget.textContent ?? "";
                setItems((prev) => prev.map((p, pi) => (pi === index ? { ...p, text } : p)));
                onUpdate(pageIndex, index, text);
              }}
              className="absolute cursor-text whitespace-pre rounded text-ink outline-none transition-colors hover:bg-accent/10 focus:bg-accent/15 focus:ring-1 focus:ring-accent"
              style={{
                left: it.left,
                top: it.top,
                fontSize: it.fontHeight,
                lineHeight: 1,
                fontFamily: cssFontFamily(it.fontFamily),
                fontWeight: it.bold ? 700 : 400,
                fontStyle: it.italic ? "italic" : "normal",
                transform: it.angle !== 0 ? `rotate(${it.angle}deg)` : undefined,
                transformOrigin: "0 0",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Samples a strip just above a text run and averages the non-dark pixels
 * into the fill color used for blanking, so the original background (paper,
 * colored block, graphic) is restored instead of a single sampled pixel.
 * Falls back to white.
 */
function sampleFill(
  ctx: CanvasRenderingContext2D,
  leftPx: number,
  boxTopPx: number,
  widthPx: number,
  dpr: number,
  canvasWidth: number,
  canvasHeight: number
): string {
  for (let dy = 1; dy <= 16; dy += 3) {
    const y = Math.floor((boxTopPx - dy) * dpr);
    if (y < 0 || y >= canvasHeight) continue;
    const x0 = Math.max(0, Math.floor(leftPx * dpr));
    const x1 = Math.min(canvasWidth - 1, Math.floor((leftPx + widthPx) * dpr));
    if (x1 < x0) continue;
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(x0, y, x1 - x0 + 1, 1).data;
    } catch {
      continue;
    }
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha <= 10) continue;
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luminance <= 80) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      a += alpha;
      n++;
    }
    if (n >= 2) {
      const alpha = Math.round(a / n);
      return `rgba(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)}, ${alpha / 255})`;
    }
  }
  return "rgba(255,255,255,1)";
}
