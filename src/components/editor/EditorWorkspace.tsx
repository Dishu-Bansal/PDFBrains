import { MagnifyingGlassMinus, MagnifyingGlassPlus, SpinnerGap } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { usePdfDocument } from "../../lib/pdf";
import { baseName, downloadBlob } from "../../lib/process";
import {
  applyTextEdits,
  clearTextEditorCache,
  renderTextEditorPdf,
} from "../../lib/api";
import type { TextEditorDocument, TextEditorTextElement } from "../../lib/api";
import { exportAnnotationsToPdf, exportEditedPdf } from "../../lib/editorExport";
import { EditorCenter } from "./EditorCenter";
import { EditorLeftPanel } from "./EditorLeftPanel";
import { EditorRightPanel } from "./EditorRightPanel";
import { useTextEditor } from "./useTextEditor";
import { shortHash } from "./textOverlay";
import type {
  EditorAnnotation,
  EditorMode,
  EditorShapeAnnotation,
  EditorShapeDefaults,
  EditorTextAnnotation,
  EditorTextDefaults,
  EditorToolId,
  OutlineEntry,
} from "./types";
import { DEFAULT_SHAPE_STYLE, DEFAULT_TEXT_STYLE, MAX_PAGE_WIDTH } from "./types";

interface EditorWorkspaceProps {
  file: File;
}

interface OutlineNode {
  title: string;
  bold?: boolean;
  italic?: boolean;
  color?: Uint8ClampedArray | number[];
  dest?: unknown;
  url?: string | null;
  items?: OutlineNode[];
}

type AnnotationInput = Omit<EditorTextAnnotation, "id"> | Omit<EditorShapeAnnotation, "id">;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `ed-${idCounter}`;
}

/**
 * The common editing workspace used by PDF tools: pages render centered in a
 * fixed-height scroll container (only that container scrolls), the left panel
 * shows page thumbnails and bookmarks, and the right panel holds the editing
 * tools. Two modes: Edit Text (click any text on the pages to edit it, applied
 * through the text-editor flow) and Annotation (text boxes and shapes,
 * exported with pdf-lib).
 */
export function EditorWorkspace({ file }: EditorWorkspaceProps) {
  const { doc, pageCount, loading, error: pdfError } = usePdfDocument(file);
  const textEditor = useTextEditor(file);

  const [mode, setMode] = useState<EditorMode>("text");
  const [zoom, setZoom] = useState(1);
  const [annotations, setAnnotations] = useState<EditorAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<EditorToolId>("select");
  const [leftTab, setLeftTab] = useState<"pages" | "bookmarks">("pages");
  const [activePage, setActivePage] = useState(0);
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const [textDefaults, setTextDefaults] = useState<EditorTextDefaults>(DEFAULT_TEXT_STYLE);
  const [shapeDefaults, setShapeDefaults] = useState<EditorShapeDefaults>(DEFAULT_SHAPE_STYLE);
  const [textItems, setTextItems] = useState<Record<number, TextEditorTextElement[]>>({});
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const textPristineRef = useRef<Record<number, TextEditorTextElement[]>>({});

  const docKey = useMemo(
    () => shortHash(`${file.name}-${file.size}-${file.lastModified}`),
    [file]
  );

  // Page surfaces render at a base width that fits the center column once;
  // it is measured on mount and kept stable so annotation coordinates stay
  // valid. Zoom scales the render width from that base.
  const [pageWidth, setPageWidth] = useState(560);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setPageWidth(Math.min(MAX_PAGE_WIDTH, Math.max(320, Math.floor(el.clientWidth - 56))));
  }, []);

  const renderWidth = pageWidth * zoom;

  // Flatten the document outline (bookmarks) into jump targets.
  useEffect(() => {
    let cancelled = false;
    if (!doc) {
      setOutline([]);
      return;
    }
    (async () => {
      try {
        const nodes = await doc.getOutline();
        if (cancelled) return;
        const flat: OutlineEntry[] = [];
        const walk = async (items: OutlineNode[], depth: number) => {
          for (const node of items) {
            let pageIndex = -1;
            try {
              let dest = node.dest;
              if (typeof dest === "string") dest = await doc.getDestination(dest);
              if (Array.isArray(dest) && dest[0]) pageIndex = await doc.getPageIndex(dest[0]);
            } catch {
              pageIndex = -1;
            }
            if (pageIndex >= 0) flat.push({ title: node.title, depth, pageIndex });
            if (node.items?.length) await walk(node.items, depth + 1);
          }
        };
        await walk(nodes ?? [], 0);
        if (!cancelled) setOutline(flat);
      } catch {
        if (!cancelled) setOutline([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  // Delete key removes the selection in Annotation mode, but never while
  // typing in a field or in an editable text span.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (mode !== "annotation" || (event.key !== "Delete" && event.key !== "Backspace") || !selectedId) {
        return;
      }
      const active = document.activeElement;
      if (active && active !== document.body && active.tagName !== "BODY") return;
      event.preventDefault();
      removeAnnotation(selectedId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedId]);

  const addAnnotation = (partial: AnnotationInput): string => {
    const id = nextId();
    const annotation = { ...partial, id } as EditorAnnotation;
    setAnnotations((prev) => [...prev, annotation]);
    setSelectedId(id);
    return id;
  };

  const updateAnnotation = (id: string, patch: Partial<EditorAnnotation>) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? ({ ...a, ...patch } as EditorAnnotation) : a)));
  };

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setSelectedId((sel) => (sel === id ? null : sel));
  };

  const selected = useMemo(
    () => annotations.find((a) => a.id === selectedId) ?? null,
    [annotations, selectedId]
  );

  // ---- Edit Text mode bookkeeping ----
  const handleTextReady = (pageIndex: number, elements: TextEditorTextElement[]) => {
    setTextItems((prev) => {
      if (prev[pageIndex]) return prev; // keep the user's edits
      textPristineRef.current[pageIndex] = elements;
      return { ...prev, [pageIndex]: elements };
    });
  };

  const handleTextEdit = (pageIndex: number, itemIndex: number, text: string) => {
    setTextItems((prev) => {
      const page = prev[pageIndex];
      if (!page) return prev;
      const next = page.map((el, i) => (i === itemIndex ? { ...el, text } : el));
      return { ...prev, [pageIndex]: next };
    });
  };

  const textChangedCount = useMemo(() => {
    let count = 0;
    for (const [pageIndex, elements] of Object.entries(textItems)) {
      const pristine = textPristineRef.current[Number(pageIndex)] ?? [];
      elements.forEach((el, i) => {
        if (pristine[i] && pristine[i].text !== el.text) count++;
      });
    }
    return count;
  }, [textItems]);

  const textReady = Object.keys(textItems).length >= pageCount;
  const textExportDisabled =
    mode === "text" && (!!textEditor.error || !textEditor.doc || !textReady);

  const jumpToPage = (pageIndex: number) => {
    const container = containerRef.current;
    const el = pageEls.current[pageIndex];
    if (container && el) {
      const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16;
      container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
    setActivePage(pageIndex);
  };

  const buildTextDocument = (): TextEditorDocument | null => {
    if (!textEditor.doc) return null;
    return {
      ...textEditor.doc,
      pages: (textEditor.doc.pages ?? []).map((page, pageIndex) => ({
        ...page,
        textElements: textItems[pageIndex] ?? page.textElements,
      })),
    };
  };

  const exportPdf = async () => {
    if (exporting || (mode === "text" && textExportDisabled)) return;
    setExporting(true);
    setResult(null);
    try {
      let blob: Blob;
      if (mode === "text") {
        const built = buildTextDocument();
        if (!built) throw new Error("The text editor data is not ready yet.");
        const applied = textEditor.jobId
          ? await applyTextEdits(textEditor.jobId, built, file.name)
          : await renderTextEditorPdf(built, file.name);
        if (annotations.length > 0) {
          blob = await exportAnnotationsToPdf(
            new Uint8Array(await applied.arrayBuffer()),
            annotations,
            pageWidth
          );
        } else {
          blob = applied;
        }
        if (textEditor.jobId) {
          await clearTextEditorCache(textEditor.jobId).catch(() => {});
        }
      } else {
        blob = await exportEditedPdf(file, annotations, pageWidth);
      }
      downloadBlob(blob, `${baseName(file)}-edited.pdf`);
      setResult("Edited PDF downloaded.");
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Could not export the edited PDF.");
    } finally {
      setExporting(false);
    }
  };

  const clearAll = () => {
    setAnnotations([]);
    setSelectedId(null);
  };

  const changeZoom = (delta: number) => {
    setZoom((prev) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((prev + delta) * 10) / 10)));
  };

  if (pdfError) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-line bg-surface p-6">
        <div className="max-w-md text-center">
          <p className="text-[15px] font-medium">Could not open this file</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{pdfError}</p>
        </div>
      </div>
    );
  }

  if (loading || !doc) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-line bg-surface" aria-busy="true">
        <div className="flex items-center gap-2.5 text-[14px] text-muted">
          <SpinnerGap size={17} className="animate-spin" />
          Reading pages...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-paper">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <p className="min-w-0 truncate text-[13px] font-medium">{file.name}</p>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="inline-flex rounded-full border border-line bg-raised p-1">
            {(["text", "annotation"] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={[
                    "rounded-full px-3 py-1 text-[12px] font-medium transition",
                    active ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink",
                  ].join(" ")}
                >
                  {m === "text" ? "Edit Text" : "Annotation"}
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-center gap-0.5 rounded-full border border-line bg-raised px-1 py-1">
            <button
              type="button"
              onClick={() => changeZoom(-ZOOM_STEP)}
              aria-label="Zoom out"
              className="flex size-6 items-center justify-center rounded-full text-muted transition hover:bg-paper hover:text-ink"
            >
              <MagnifyingGlassMinus size={14} />
            </button>
            <span className="w-11 text-center font-mono text-[11px] text-muted">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => changeZoom(ZOOM_STEP)}
              aria-label="Zoom in"
              className="flex size-6 items-center justify-center rounded-full text-muted transition hover:bg-paper hover:text-ink"
            >
              <MagnifyingGlassPlus size={14} />
            </button>
          </div>

          <p className="hidden font-mono text-[11px] text-muted sm:block">
            {pageCount} page{pageCount === 1 ? "" : "s"}
            {annotations.length > 0 && ` · ${annotations.length} item${annotations.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <EditorLeftPanel
          doc={doc}
          pageCount={pageCount}
          outline={outline}
          tab={leftTab}
          onTabChange={setLeftTab}
          activePage={activePage}
          onJumpToPage={jumpToPage}
        />

        <EditorCenter
          doc={doc}
          pageCount={pageCount}
          baseWidth={pageWidth}
          renderWidth={renderWidth}
          mode={mode}
          containerRef={containerRef}
          pageEls={pageEls}
          annotations={annotations}
          activeTool={activeTool}
          selectedId={selectedId}
          textDefaults={textDefaults}
          shapeDefaults={shapeDefaults}
          textDoc={textEditor.doc}
          textItems={textItems}
          textLoading={textEditor.loading}
          docKey={docKey}
          onAdd={addAnnotation}
          onUpdate={updateAnnotation}
          onRemove={removeAnnotation}
          onSelect={setSelectedId}
          onActivePageChange={setActivePage}
          onTextReady={handleTextReady}
          onTextEdit={handleTextEdit}
        />

        <EditorRightPanel
          mode={mode}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          selected={selected}
          textDefaults={textDefaults}
          onTextDefaultsChange={setTextDefaults}
          shapeDefaults={shapeDefaults}
          onShapeDefaultsChange={setShapeDefaults}
          onUpdateAnnotation={updateAnnotation}
          onRemoveSelected={() => selected && removeAnnotation(selected.id)}
          onClearAll={clearAll}
          onExport={exportPdf}
          exporting={exporting}
          exportDisabled={textExportDisabled}
          textChangedCount={textChangedCount}
          textLoading={textEditor.loading}
          textError={textEditor.error}
          result={result}
        />
      </div>
    </div>
  );
}
