import { SpinnerGap } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { usePdfDocument } from "../../lib/pdf";
import { baseName, downloadBlob } from "../../lib/process";
import { exportEditedPdf } from "../../lib/editorExport";
import { EditorCenter } from "./EditorCenter";
import { EditorLeftPanel } from "./EditorLeftPanel";
import { EditorRightPanel } from "./EditorRightPanel";
import type {
  EditorAnnotation,
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

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `ed-${idCounter}`;
}

/**
 * The common editing workspace used by PDF tools: pages render centered in a
 * fixed-height scroll container (only that container scrolls), the left panel
 * shows page thumbnails and bookmarks, and the right panel holds the editing
 * tools. Annotations are drawn in page-surface pixels and exported through
 * pdf-lib.
 */
export function EditorWorkspace({ file }: EditorWorkspaceProps) {
  const { doc, pageCount, loading, error: pdfError } = usePdfDocument(file);

  const [annotations, setAnnotations] = useState<EditorAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<EditorToolId>("select");
  const [leftTab, setLeftTab] = useState<"pages" | "bookmarks">("pages");
  const [activePage, setActivePage] = useState(0);
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const [textDefaults, setTextDefaults] = useState<EditorTextDefaults>(DEFAULT_TEXT_STYLE);
  const [shapeDefaults, setShapeDefaults] = useState<EditorShapeDefaults>(DEFAULT_SHAPE_STYLE);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);

  // Page surfaces render at a width that fits the center column once; it is
  // measured on mount and kept stable so annotation coordinates stay valid.
  const [pageWidth, setPageWidth] = useState(560);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setPageWidth(Math.min(MAX_PAGE_WIDTH, Math.max(320, Math.floor(el.clientWidth - 56))));
  }, []);

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

  // Delete key removes the selection (but never while typing in a field).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key !== "Delete" && event.key !== "Backspace") || !selectedId) return;
      const active = document.activeElement;
      if (active && active !== document.body && active.tagName !== "BODY") return;
      event.preventDefault();
      removeAnnotation(selectedId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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

  const jumpToPage = (pageIndex: number) => {
    const container = containerRef.current;
    const el = pageEls.current[pageIndex];
    if (container && el) {
      const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16;
      container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
    setActivePage(pageIndex);
  };

  const exportPdf = async () => {
    if (!doc || exporting) return;
    setExporting(true);
    setResult(null);
    try {
      const blob = await exportEditedPdf(file, annotations, pageWidth);
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
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
        <p className="truncate text-[13px] font-medium">{file.name}</p>
        <p className="shrink-0 font-mono text-[11px] text-muted">
          {pageCount} page{pageCount === 1 ? "" : "s"}
          {annotations.length > 0 && ` · ${annotations.length} item${annotations.length === 1 ? "" : "s"}`}
        </p>
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
          pageWidth={pageWidth}
          containerRef={containerRef}
          pageEls={pageEls}
          annotations={annotations}
          activeTool={activeTool}
          selectedId={selectedId}
          textDefaults={textDefaults}
          shapeDefaults={shapeDefaults}
          onAdd={addAnnotation}
          onUpdate={updateAnnotation}
          onRemove={removeAnnotation}
          onSelect={setSelectedId}
          onActivePageChange={setActivePage}
        />

        <EditorRightPanel
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
          result={result}
        />
      </div>
    </div>
  );
}
