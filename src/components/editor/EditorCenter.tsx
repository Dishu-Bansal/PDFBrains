import { TrashSimple } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import type {
  EditorAnnotation,
  EditorShapeAnnotation,
  EditorShapeDefaults,
  EditorTextAnnotation,
  EditorTextDefaults,
  EditorToolId,
} from "./types";
import { fontCss, isShapeTool } from "./types";

type AnnotationInput = Omit<EditorTextAnnotation, "id"> | Omit<EditorShapeAnnotation, "id">;

interface EditorCenterProps {
  doc: PDFDocumentProxy;
  pageCount: number;
  pageWidth: number;
  containerRef: RefObject<HTMLDivElement>;
  pageEls: MutableRefObject<(HTMLDivElement | null)[]>;
  annotations: EditorAnnotation[];
  activeTool: EditorToolId;
  selectedId: string | null;
  textDefaults: EditorTextDefaults;
  shapeDefaults: EditorShapeDefaults;
  onAdd: (partial: AnnotationInput) => string;
  onUpdate: (id: string, patch: Partial<EditorAnnotation>) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string | null) => void;
  onActivePageChange: (pageIndex: number) => void;
}

/**
 * The center column of the editor workspace: a fixed-height scroll container
 * (only this scrolls) holding one page surface per page, each rendered at the
 * same width and centered.
 */
export function EditorCenter({
  doc,
  pageCount,
  pageWidth,
  containerRef,
  pageEls,
  annotations,
  activeTool,
  selectedId,
  textDefaults,
  shapeDefaults,
  onAdd,
  onUpdate,
  onRemove,
  onSelect,
  onActivePageChange,
}: EditorCenterProps) {
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    let current = 0;
    for (let i = 0; i < pageEls.current.length; i++) {
      const el = pageEls.current[i];
      if (!el) break;
      if (el.getBoundingClientRect().top <= containerTop + 48) current = i;
    }
    onActivePageChange(current);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="min-w-0 flex-1 overflow-y-auto bg-raised/50"
    >
      <div className="mx-auto w-full max-w-[720px] space-y-8 px-6 py-6">
        {Array.from({ length: pageCount }, (_, pageIndex) => (
          <div
            key={pageIndex}
            ref={(el) => {
              pageEls.current[pageIndex] = el;
            }}
          >
            <EditorPageSurface
              doc={doc}
              pageNumber={pageIndex + 1}
              pageIndex={pageIndex}
              pageWidth={pageWidth}
              annotations={annotations.filter((a) => a.pageIndex === pageIndex)}
              activeTool={activeTool}
              selectedId={selectedId}
              textDefaults={textDefaults}
              shapeDefaults={shapeDefaults}
              onAdd={onAdd}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface DragState {
  id: string;
  mode: "move" | "resize";
  px: number;
  py: number;
  ox: number;
  oy: number;
  ow: number;
  oh: number;
}

interface DraftState {
  id: string;
  tool: Exclude<EditorToolId, "select" | "textbox">;
  startX: number;
  startY: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Focuses a contentEditable and selects all of its text. */
function focusAndSelectAll(element: HTMLElement | null | undefined) {
  if (!element) return;
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * One page: the rendered canvas plus the interactive annotation layer. The
 * hot layer creates new items for the active tool; existing annotations
 * select, move, resize and edit on top of it.
 */
function EditorPageSurface({
  doc,
  pageNumber,
  pageIndex,
  pageWidth,
  annotations,
  activeTool,
  selectedId,
  textDefaults,
  shapeDefaults,
  onAdd,
  onUpdate,
  onRemove,
  onSelect,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  pageIndex: number;
  pageWidth: number;
  annotations: EditorAnnotation[];
  activeTool: EditorToolId;
  selectedId: string | null;
  textDefaults: EditorTextDefaults;
  shapeDefaults: EditorShapeDefaults;
  onAdd: (partial: AnnotationInput) => string;
  onUpdate: (id: string, patch: Partial<EditorAnnotation>) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string | null) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const editableRefs = useRef(new Map<string, HTMLElement>());
  const dragRef = useRef<DragState | null>(null);
  const draftRef = useRef<DraftState | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  // Render the page at the given surface width.
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const vp1 = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: pageWidth / vp1.width });
        const canvas = document.createElement("canvas");
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        task = page.render({ canvasContext: ctx, viewport });
        await task.promise;
        if (!cancelled) {
          boxRef.current?.replaceChildren(canvas);
          setDims({ w: viewport.width, h: viewport.height });
        }
      } catch {
        /* keep the placeholder */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      boxRef.current?.replaceChildren();
    };
  }, [doc, pageNumber, pageWidth]);

  const texts = annotations.filter(
    (a): a is EditorTextAnnotation => a.kind === "text"
  );
  const shapes = annotations.filter(
    (a): a is EditorShapeAnnotation => a.kind === "shape"
  );
  const selectedShape = shapes.find((a) => a.id === selectedId) ?? null;

  const pointFromEvent = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, dims?.w ?? pageWidth);
    const y = clamp(event.clientY - rect.top, 0, dims?.h ?? pageWidth);
    return { x, y };
  };

  // ---- hot layer: create new annotations for the active tool ----
  const handleHotPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = pointFromEvent(event);
    if (activeTool === "textbox") {
      const id = onAdd({
        kind: "text",
        pageIndex,
        x,
        y,
        w: 220,
        h: Math.round(textDefaults.fontSize * 1.6),
        text: "Text",
        fontFamily: textDefaults.fontFamily,
        fontSize: textDefaults.fontSize,
        bold: textDefaults.bold,
        italic: textDefaults.italic,
        color: textDefaults.color,
        align: textDefaults.align,
      });
      requestAnimationFrame(() => focusAndSelectAll(editableRefs.current.get(id)));
      return;
    }
    if (isShapeTool(activeTool)) {
      const id = onAdd({
        kind: "shape",
        pageIndex,
        shape: activeTool,
        x,
        y,
        w: 0,
        h: 0,
        points:
          activeTool === "line" || activeTool === "arrow" ? [x, y, x, y] : undefined,
        strokeWidth: shapeDefaults.strokeWidth,
        color: shapeDefaults.color,
        fill: shapeDefaults.fill,
      });
      draftRef.current = { id, tool: activeTool, startX: x, startY: y };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handleHotPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const draft = draftRef.current;
    if (!draft) return;
    const { x, y } = pointFromEvent(event);
    if (draft.tool === "line" || draft.tool === "arrow") {
      onUpdate(draft.id, {
        points: [draft.startX, draft.startY, x, y],
        x: Math.min(draft.startX, x),
        y: Math.min(draft.startY, y),
        w: Math.abs(x - draft.startX),
        h: Math.abs(y - draft.startY),
      });
    } else {
      onUpdate(draft.id, {
        x: Math.min(draft.startX, x),
        y: Math.min(draft.startY, y),
        w: Math.abs(x - draft.startX),
        h: Math.abs(y - draft.startY),
      });
    }
  };

  const handleHotPointerUp = () => {
    const draft = draftRef.current;
    draftRef.current = null;
    if (!draft) return;
    const created = annotations.find((a) => a.id === draft.id);
    if (created && created.kind === "shape" && created.w < 3 && created.h < 3) {
      onRemove(draft.id);
    }
  };

  // ---- dragging handles (move / resize) and shapes ----
  const startDrag = (
    event: React.PointerEvent,
    annotation: EditorAnnotation,
    mode: "move" | "resize"
  ) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: annotation.id,
      mode,
      px: event.clientX,
      py: event.clientY,
      ox: annotation.x,
      oy: annotation.y,
      ow: annotation.w,
      oh: annotation.h,
    };
  };

  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.px;
    const dy = event.clientY - drag.py;
    if (drag.mode === "move") {
      onUpdate(drag.id, { x: Math.max(0, drag.ox + dx), y: Math.max(0, drag.oy + dy) });
    } else {
      onUpdate(drag.id, {
        w: Math.max(24, drag.ow + dx),
        h: Math.max(16, drag.oh + dy),
      });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div
      className="relative mx-auto overflow-hidden rounded-lg border border-line bg-white shadow-sm"
      style={{
        width: dims?.w ?? pageWidth,
        height: dims?.h ?? pageWidth * 1.4,
        maxWidth: "100%",
      }}
    >
      <div ref={boxRef} className="absolute inset-0" />

      {activeTool !== "select" && (
        <div
          className="absolute inset-0"
          style={{ cursor: activeTool === "textbox" ? "text" : "crosshair" }}
          onPointerDown={handleHotPointerDown}
          onPointerMove={handleHotPointerMove}
          onPointerUp={handleHotPointerUp}
          onPointerCancel={handleHotPointerUp}
        />
      )}

      {/* Annotation layer (above the hot layer). */}
      <div className="pointer-events-none absolute inset-0">
        {texts.map((annotation) => {
          const isSelected = annotation.id === selectedId;
          return (
            <div
              key={annotation.id}
              className="absolute"
              style={{ left: annotation.x, top: annotation.y, width: annotation.w, height: annotation.h }}
            >
              <div
                contentEditable
                suppressContentEditableWarning
                ref={(node) => {
                  if (node) editableRefs.current.set(annotation.id, node);
                  else editableRefs.current.delete(annotation.id);
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelect(annotation.id);
                }}
                onInput={(event) =>
                  onUpdate(annotation.id, { text: event.currentTarget.textContent ?? "" })
                }
                className={[
                  "h-full w-full cursor-text overflow-hidden whitespace-pre-wrap break-words outline-none",
                  isSelected ? "ring-1 ring-accent ring-inset" : "",
                ].join(" ")}
                style={{
                  fontSize: annotation.fontSize,
                  fontFamily: fontCss(annotation.fontFamily),
                  fontWeight: annotation.bold ? 700 : 400,
                  fontStyle: annotation.italic ? "italic" : "normal",
                  color: annotation.color,
                  textAlign: annotation.align,
                  lineHeight: 1.2,
                }}
              />
              {isSelected && (
                <>
                  <div
                    className="absolute -left-1 -top-1 size-3 cursor-move rounded-[3px] bg-accent shadow ring-1 ring-paper"
                    aria-hidden="true"
                    onPointerDown={(event) => startDrag(event, annotation, "move")}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                  <div
                    className="absolute -bottom-1 -right-1 size-3 cursor-nwse-resize rounded-[3px] bg-accent shadow ring-1 ring-paper"
                    aria-hidden="true"
                    onPointerDown={(event) => startDrag(event, annotation, "resize")}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(annotation.id)}
                    aria-label="Delete text box"
                    className="absolute -right-2 -top-2.5 flex size-5 items-center justify-center rounded-full bg-ink text-paper shadow transition hover:bg-accent"
                  >
                    <TrashSimple size={11} weight="bold" />
                  </button>
                </>
              )}
            </div>
          );
        })}

        <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
          {shapes.map((annotation) => {
            const hitStyle = {
              pointerEvents: "all" as const,
              cursor: activeTool === "select" ? "move" : "crosshair",
            };
            if (annotation.shape === "rect") {
              return (
                <rect
                  key={annotation.id}
                  x={annotation.x}
                  y={annotation.y}
                  width={annotation.w}
                  height={annotation.h}
                  fill={annotation.fill || "none"}
                  stroke={annotation.color}
                  strokeWidth={annotation.strokeWidth}
                  vectorEffect="non-scaling-stroke"
                  style={hitStyle}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelect(annotation.id);
                    startDrag(event, annotation, "move");
                  }}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
              );
            }
            if (annotation.shape === "ellipse") {
              return (
                <ellipse
                  key={annotation.id}
                  cx={annotation.x + annotation.w / 2}
                  cy={annotation.y + annotation.h / 2}
                  rx={annotation.w / 2}
                  ry={annotation.h / 2}
                  fill={annotation.fill || "none"}
                  stroke={annotation.color}
                  strokeWidth={annotation.strokeWidth}
                  vectorEffect="non-scaling-stroke"
                  style={hitStyle}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelect(annotation.id);
                    startDrag(event, annotation, "move");
                  }}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
              );
            }
            const [x1, y1, x2, y2] = annotation.points ?? [
              annotation.x,
              annotation.y,
              annotation.x + annotation.w,
              annotation.y + annotation.h,
            ];
            return (
              <g key={annotation.id}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={annotation.color}
                  strokeWidth={annotation.strokeWidth}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  style={hitStyle}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelect(annotation.id);
                    startDrag(event, annotation, "move");
                  }}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
                {annotation.shape === "arrow" && (
                  <polygon
                    points={arrowPoints(x1, y1, x2, y2)}
                    fill={annotation.color}
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </g>
            );
          })}

          {selectedShape && (
            <rect
              x={selectedShape.x - 2}
              y={selectedShape.y - 2}
              width={selectedShape.w + 4}
              height={selectedShape.h + 4}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="4 3"
              style={{ pointerEvents: "none" }}
            />
          )}
        </svg>

        {selectedShape && (
          <button
            type="button"
            onClick={() => onRemove(selectedShape.id)}
            aria-label="Delete shape"
            className="absolute flex size-5 items-center justify-center rounded-full bg-ink text-paper shadow transition hover:bg-accent"
            style={{ left: selectedShape.x + selectedShape.w - 6, top: selectedShape.y - 10 }}
          >
            <TrashSimple size={11} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Arrowhead polygon points for a line from (x1,y1) to (x2,y2). */
function arrowPoints(x1: number, y1: number, x2: number, y2: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 12;
  const b1x = x2 - head * Math.cos(angle - 0.42);
  const b1y = y2 - head * Math.sin(angle - 0.42);
  const b2x = x2 - head * Math.cos(angle + 0.42);
  const b2y = y2 - head * Math.sin(angle + 0.42);
  return `${x2},${y2} ${b1x},${b1y} ${b2x},${b2y}`;
}
