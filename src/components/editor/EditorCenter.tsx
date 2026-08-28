import { TrashSimple } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import type { TextEditorDocument, TextEditorTextElement } from "../../lib/api";
import type {
  EditorAnnotation,
  EditorMode,
  EditorShapeAnnotation,
  EditorShapeDefaults,
  EditorTextAnnotation,
  EditorTextDefaults,
  EditorToolId,
} from "./types";
import { fontCss, isShapeTool } from "./types";
import {
  blankOriginalText,
  buildTextOverlayItems,
  cssFontFamily,
  overlayElement,
} from "./textOverlay";
import type { PdfTextItem, PdfTextStyle, StirlingFont, TextOverlayItem } from "./textOverlay";

type AnnotationInput = Omit<EditorTextAnnotation, "id"> | Omit<EditorShapeAnnotation, "id">;

/** Stable empty arrays so memoized props never churn effect dependencies. */
const EMPTY_ELEMENTS: TextEditorTextElement[] = [];
const EMPTY_FONTS: StirlingFont[] = [];

interface EditorCenterProps {
  doc: PDFDocumentProxy;
  pageCount: number;
  baseWidth: number;
  renderWidth: number;
  mode: EditorMode;
  containerRef: RefObject<HTMLDivElement>;
  pageEls: MutableRefObject<(HTMLDivElement | null)[]>;
  annotations: EditorAnnotation[];
  activeTool: EditorToolId;
  selectedId: string | null;
  textDefaults: EditorTextDefaults;
  shapeDefaults: EditorShapeDefaults;
  textDoc: TextEditorDocument | null;
  textItems: Record<number, TextEditorTextElement[]>;
  textLoading: boolean;
  docKey: string;
  onAdd: (partial: AnnotationInput) => string;
  onUpdate: (id: string, patch: Partial<EditorAnnotation>) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string | null) => void;
  onActivePageChange: (pageIndex: number) => void;
  onTextReady: (pageIndex: number, elements: TextEditorTextElement[]) => void;
  onTextEdit: (pageIndex: number, itemIndex: number, text: string) => void;
}

/**
 * The center column of the editor workspace: a fixed-height scroll container
 * (only this scrolls) holding one page surface per page, each rendered at the
 * same width and centered. Zoom scales the rendered width; annotations are
 * stored in the base-width coordinate space and displayed scaled.
 */
export function EditorCenter({
  doc,
  pageCount,
  baseWidth,
  renderWidth,
  mode,
  containerRef,
  pageEls,
  annotations,
  activeTool,
  selectedId,
  textDefaults,
  shapeDefaults,
  textDoc,
  textItems,
  textLoading,
  docKey,
  onAdd,
  onUpdate,
  onRemove,
  onSelect,
  onActivePageChange,
  onTextReady,
  onTextEdit,
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

  const fonts = useMemo(() => (textDoc?.fonts ?? EMPTY_FONTS) as StirlingFont[], [textDoc]);
  const allElements = useMemo(
    () =>
      Array.from({ length: pageCount }, (_, pageIndex) =>
        (textDoc?.pages?.[pageIndex]?.textElements ?? EMPTY_ELEMENTS) as TextEditorTextElement[]
      ),
    [textDoc, pageCount]
  );

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="min-w-0 flex-1 overflow-auto bg-raised/50"
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
              baseWidth={baseWidth}
              renderWidth={renderWidth}
              mode={mode}
              annotations={annotations.filter((a) => a.pageIndex === pageIndex)}
              activeTool={activeTool}
              selectedId={selectedId}
              textDefaults={textDefaults}
              shapeDefaults={shapeDefaults}
              stirlingElements={allElements[pageIndex]}
              fonts={fonts}
              docKey={docKey}
              textLoading={textLoading}
              initialTexts={textItems[pageIndex]?.map((e) => e.text) ?? null}
              onAdd={onAdd}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onSelect={onSelect}
              onTextReady={onTextReady}
              onTextEdit={onTextEdit}
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
 * One page: the rendered canvas plus the interactive layers. In Annotation
 * mode the hot layer creates items for the active tool and existing items
 * select, move, resize and edit. In Edit Text mode the original text runs are
 * blanked and replaced by click-to-edit spans, and annotations are shown
 * read-only.
 */
function EditorPageSurface({
  doc,
  pageNumber,
  pageIndex,
  baseWidth,
  renderWidth,
  mode,
  annotations,
  activeTool,
  selectedId,
  textDefaults,
  shapeDefaults,
  stirlingElements,
  fonts,
  docKey,
  textLoading,
  initialTexts,
  onAdd,
  onUpdate,
  onRemove,
  onSelect,
  onTextReady,
  onTextEdit,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  pageIndex: number;
  baseWidth: number;
  renderWidth: number;
  mode: EditorMode;
  annotations: EditorAnnotation[];
  activeTool: EditorToolId;
  selectedId: string | null;
  textDefaults: EditorTextDefaults;
  shapeDefaults: EditorShapeDefaults;
  stirlingElements: TextEditorTextElement[];
  fonts: StirlingFont[];
  docKey: string;
  textLoading: boolean;
  initialTexts: string[] | null;
  onAdd: (partial: AnnotationInput) => string;
  onUpdate: (id: string, patch: Partial<EditorAnnotation>) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string | null) => void;
  onTextReady: (pageIndex: number, elements: TextEditorTextElement[]) => void;
  onTextEdit: (pageIndex: number, itemIndex: number, text: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const editableRefs = useRef(new Map<string, HTMLElement>());
  const dragRef = useRef<DragState | null>(null);
  const draftRef = useRef<DraftState | null>(null);
  const textRef = useRef<string[] | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextOverlayItem[] | null>(null);
  const [textLoadError, setTextLoadError] = useState<string | null>(null);

  const displayScale = renderWidth / baseWidth;

  // Render the page at the current render width, then (in Edit Text mode)
  // extract the runs, blank the originals and build the editable spans. One
  // sequential effect so blanking always lands on the freshly rendered
  // canvas. Re-runs when the mode changes, restoring the unblanked page on
  // the way out; text content persists across zooms and mode switches.
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const vp1 = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: renderWidth / vp1.width });
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
        if (cancelled) return;

        let overlays: TextOverlayItem[] | null = null;
        if (mode === "text") {
          if (!textLoading) {
            try {
              const textContent = await page.getTextContent();
              if (cancelled) return;
              const items = await buildTextOverlayItems(
                page,
                viewport,
                textContent as unknown as { items: PdfTextItem[]; styles?: Record<string, PdfTextStyle> },
                stirlingElements,
                fonts,
                docKey
              );
              if (cancelled) return;
              if (textRef.current === null) {
                textRef.current = initialTexts
                  ? items.map((item, index) => initialTexts[index] ?? item.text)
                  : items.map((item) => item.text);
                if (!initialTexts) {
                  onTextReady(pageIndex, items.map(overlayElement));
                }
              }
              blankOriginalText(ctx, items, dpr, canvas.width, canvas.height);
              overlays = items.map((item, index) => ({
                ...item,
                text: textRef.current?.[index] ?? item.text,
              }));
              setTextLoadError(null);
            } catch (err) {
              setTextLoadError(
                err instanceof Error ? err.message : "Could not read the text on this page."
              );
            }
          }
        }

        if (!cancelled) {
          boxRef.current?.replaceChildren(canvas);
          setDims({ w: viewport.width, h: viewport.height });
          setTextOverlays(overlays);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNumber, renderWidth, mode, docKey, stirlingElements, fonts, textLoading]);

  const handleTextInput = (index: number, text: string) => {
    if (textRef.current) textRef.current[index] = text;
    setTextOverlays((prev) => prev?.map((item, i) => (i === index ? { ...item, text } : item)) ?? prev);
    onTextEdit(pageIndex, index, text);
  };

  const texts = annotations.filter(
    (a): a is EditorTextAnnotation => a.kind === "text"
  );
  const shapes = annotations.filter(
    (a): a is EditorShapeAnnotation => a.kind === "shape"
  );
  const selectedShape = shapes.find((a) => a.id === selectedId) ?? null;
  const annotationMode = mode === "annotation";

  const pointFromEvent = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / displayScale, 0, baseWidth);
    const y = clamp((event.clientY - rect.top) / displayScale, 0, (dims?.h ?? baseWidth * 1.4) / displayScale);
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
    dragMode: "move" | "resize"
  ) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: annotation.id,
      mode: dragMode,
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
    const dx = (event.clientX - drag.px) / displayScale;
    const dy = (event.clientY - drag.py) / displayScale;
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

  const editableTextCount = textOverlays?.filter((t) => t.text.trim() !== "").length ?? 0;

  return (
    <div>
      {mode === "text" && (
        <div className="mb-1.5 flex items-center justify-between px-0.5">
          <span className="font-mono text-[11px] text-muted">Page {pageNumber}</span>
          {textOverlays ? (
            editableTextCount > 0 ? (
              <span className="text-[11px] text-muted">
                {editableTextCount} text block{editableTextCount === 1 ? "" : "s"} · click to edit
              </span>
            ) : (
              <span className="text-[11px] text-muted">No editable text found on this page</span>
            )
          ) : textLoadError ? (
            <span className="text-[11px] text-danger">Could not read text on this page</span>
          ) : (
            <span className="text-[11px] text-muted" aria-busy="true">
              Reading text...
            </span>
          )}
        </div>
      )}

      <div
        className="relative mx-auto overflow-hidden rounded-lg border border-line bg-white shadow-sm"
        style={{
          width: dims?.w ?? renderWidth,
          height: dims?.h ?? renderWidth * 1.4,
          maxWidth: "100%",
        }}
      >
        <div ref={boxRef} className="absolute inset-0" />

        {annotationMode && activeTool !== "select" && (
          <div
            className="absolute inset-0"
            style={{ cursor: activeTool === "textbox" ? "text" : "crosshair" }}
            onPointerDown={handleHotPointerDown}
            onPointerMove={handleHotPointerMove}
            onPointerUp={handleHotPointerUp}
            onPointerCancel={handleHotPointerUp}
          />
        )}

        {/* Annotation layer. */}
        <div className="pointer-events-none absolute inset-0">
          {texts.map((annotation) => {
            const isSelected = annotationMode && annotation.id === selectedId;
            const x = annotation.x * displayScale;
            const y = annotation.y * displayScale;
            const w = annotation.w * displayScale;
            const h = annotation.h * displayScale;
            return (
              <div
                key={annotation.id}
                className="absolute"
                style={{ left: x, top: y, width: w, height: h }}
              >
                <div
                  contentEditable={annotationMode}
                  suppressContentEditableWarning
                  ref={(node) => {
                    if (node) editableRefs.current.set(annotation.id, node);
                    else editableRefs.current.delete(annotation.id);
                  }}
                  onPointerDown={
                    annotationMode
                      ? (event) => {
                          event.stopPropagation();
                          onSelect(annotation.id);
                        }
                      : undefined
                  }
                  onInput={(event) =>
                    onUpdate(annotation.id, { text: event.currentTarget.textContent ?? "" })
                  }
                  className={[
                    "h-full w-full cursor-text overflow-hidden whitespace-pre-wrap break-words outline-none",
                    isSelected ? "ring-1 ring-accent ring-inset" : "",
                  ].join(" ")}
                  style={{
                    fontSize: annotation.fontSize * displayScale,
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
              const hitStyle = annotationMode
                ? {
                    pointerEvents: "all" as const,
                    cursor: activeTool === "select" ? "move" : "crosshair",
                  }
                : { pointerEvents: "none" as const };
              if (annotation.shape === "rect") {
                return (
                  <rect
                    key={annotation.id}
                    x={annotation.x * displayScale}
                    y={annotation.y * displayScale}
                    width={annotation.w * displayScale}
                    height={annotation.h * displayScale}
                    fill={annotation.fill || "none"}
                    stroke={annotation.color}
                    strokeWidth={annotation.strokeWidth}
                    vectorEffect="non-scaling-stroke"
                    style={hitStyle}
                    onPointerDown={
                      annotationMode
                        ? (event) => {
                            event.stopPropagation();
                            onSelect(annotation.id);
                            startDrag(event, annotation, "move");
                          }
                        : undefined
                    }
                    onPointerMove={annotationMode ? moveDrag : undefined}
                    onPointerUp={annotationMode ? endDrag : undefined}
                    onPointerCancel={annotationMode ? endDrag : undefined}
                  />
                );
              }
              if (annotation.shape === "ellipse") {
                return (
                  <ellipse
                    key={annotation.id}
                    cx={(annotation.x + annotation.w / 2) * displayScale}
                    cy={(annotation.y + annotation.h / 2) * displayScale}
                    rx={(annotation.w / 2) * displayScale}
                    ry={(annotation.h / 2) * displayScale}
                    fill={annotation.fill || "none"}
                    stroke={annotation.color}
                    strokeWidth={annotation.strokeWidth}
                    vectorEffect="non-scaling-stroke"
                    style={hitStyle}
                    onPointerDown={
                      annotationMode
                        ? (event) => {
                            event.stopPropagation();
                            onSelect(annotation.id);
                            startDrag(event, annotation, "move");
                          }
                        : undefined
                    }
                    onPointerMove={annotationMode ? moveDrag : undefined}
                    onPointerUp={annotationMode ? endDrag : undefined}
                    onPointerCancel={annotationMode ? endDrag : undefined}
                  />
                );
              }
              const [x1, y1, x2, y2] = (annotation.points ?? [
                annotation.x,
                annotation.y,
                annotation.x + annotation.w,
                annotation.y + annotation.h,
              ]).map((v) => v * displayScale);
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
                    onPointerDown={
                      annotationMode
                        ? (event) => {
                            event.stopPropagation();
                            onSelect(annotation.id);
                            startDrag(event, annotation, "move");
                          }
                        : undefined
                    }
                    onPointerMove={annotationMode ? moveDrag : undefined}
                    onPointerUp={annotationMode ? endDrag : undefined}
                    onPointerCancel={annotationMode ? endDrag : undefined}
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

            {annotationMode && selectedShape && (
              <rect
                x={(selectedShape.x - 2) * displayScale}
                y={(selectedShape.y - 2) * displayScale}
                width={(selectedShape.w + 4) * displayScale}
                height={(selectedShape.h + 4) * displayScale}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1}
                strokeDasharray="4 3"
                style={{ pointerEvents: "none" }}
              />
            )}
          </svg>

          {annotationMode && selectedShape && (
            <button
              type="button"
              onClick={() => onRemove(selectedShape.id)}
              aria-label="Delete shape"
              className="absolute flex size-5 items-center justify-center rounded-full bg-ink text-paper shadow transition hover:bg-accent"
              style={{
                left: (selectedShape.x + selectedShape.w) * displayScale - 6,
                top: selectedShape.y * displayScale - 10,
              }}
            >
              <TrashSimple size={11} weight="bold" />
            </button>
          )}
        </div>

        {/* Edit Text overlay layer (above the annotations). */}
        {mode === "text" && textOverlays && (
          <div className="pointer-events-none absolute inset-0">
            {textOverlays.map((item, index) => {
              if (!item.text.trim()) return null;
              return (
                <span
                  key={index}
                  contentEditable
                  suppressContentEditableWarning
                  ref={(node) => {
                    if (node && node.textContent !== item.text) node.textContent = item.text;
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onInput={(event) => handleTextInput(index, event.currentTarget.textContent ?? "")}
                  className="absolute cursor-text whitespace-pre rounded text-ink outline-none transition-colors hover:bg-accent/10 focus:bg-accent/15 focus:ring-1 focus:ring-accent"
                  style={{
                    left: item.left,
                    top: item.top,
                    fontSize: item.fontHeight,
                    lineHeight: 1,
                    fontFamily: cssFontFamily(item.fontFamily),
                    fontWeight: item.bold ? 700 : 400,
                    fontStyle: item.italic ? "italic" : "normal",
                    transform: item.angle !== 0 ? `rotate(${item.angle}deg)` : undefined,
                    transformOrigin: "0 0",
                  }}
                />
              );
            })}
          </div>
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
