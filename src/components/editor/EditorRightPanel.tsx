import {
  ArrowUpRight,
  Circle,
  Cursor,
  DownloadSimple,
  Eraser,
  LineSegment,
  SpinnerGap,
  Square,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextItalic,
  TextT,
  TrashSimple,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

import type {
  EditorAlign,
  EditorAnnotation,
  EditorFontFamily,
  EditorMode,
  EditorShapeDefaults,
  EditorTextDefaults,
  EditorToolId,
} from "./types";
import { FONT_FAMILIES, TEXT_COLORS, isTextAnnotation } from "./types";

interface EditorRightPanelProps {
  mode: EditorMode;
  activeTool: EditorToolId;
  onToolChange: (tool: EditorToolId) => void;
  selected: EditorAnnotation | null;
  textDefaults: EditorTextDefaults;
  onTextDefaultsChange: (defaults: EditorTextDefaults) => void;
  shapeDefaults: EditorShapeDefaults;
  onShapeDefaultsChange: (defaults: EditorShapeDefaults) => void;
  onUpdateAnnotation: (id: string, patch: Partial<EditorAnnotation>) => void;
  onRemoveSelected: () => void;
  onClearAll: () => void;
  onExport: () => void;
  exporting: boolean;
  exportDisabled: boolean;
  textChangedCount: number;
  textLoading: boolean;
  textError: string | null;
  result: string | null;
}

const TOOLS: { id: EditorToolId; label: string; icon: Icon }[] = [
  { id: "select", label: "Select", icon: Cursor },
  { id: "textbox", label: "Text", icon: TextT },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "line", label: "Line", icon: LineSegment },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
];

const ALIGNS: { id: EditorAlign; label: string; icon: Icon }[] = [
  { id: "left", label: "Align left", icon: TextAlignLeft },
  { id: "center", label: "Align center", icon: TextAlignCenter },
  { id: "right", label: "Align right", icon: TextAlignRight },
];

/**
 * Right panel of the editor workspace: the drawing tools, font and shape
 * controls (which apply to the selection, or become defaults for the next
 * item), and the export actions.
 */
export function EditorRightPanel({
  mode,
  activeTool,
  onToolChange,
  selected,
  textDefaults,
  onTextDefaultsChange,
  shapeDefaults,
  onShapeDefaultsChange,
  onUpdateAnnotation,
  onRemoveSelected,
  onClearAll,
  onExport,
  exporting,
  exportDisabled,
  textChangedCount,
  textLoading,
  textError,
  result,
}: EditorRightPanelProps) {
  const selectedText = selected && isTextAnnotation(selected) ? selected : null;
  const selectedShape = selected && !isTextAnnotation(selected) ? selected : null;

  const textValues: EditorTextDefaults = selectedText
    ? {
        fontFamily: selectedText.fontFamily,
        fontSize: selectedText.fontSize,
        bold: selectedText.bold,
        italic: selectedText.italic,
        color: selectedText.color,
        align: selectedText.align,
      }
    : textDefaults;

  const changeText = (patch: Partial<EditorTextDefaults>) => {
    onTextDefaultsChange({ ...textDefaults, ...patch });
    if (selectedText) {
      onUpdateAnnotation(selectedText.id, patch);
    }
  };

  const changeShape = (patch: Partial<EditorShapeDefaults>) => {
    onShapeDefaultsChange({ ...shapeDefaults, ...patch });
    if (selectedShape) {
      onUpdateAnnotation(selectedShape.id, patch);
    }
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-paper">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {mode === "annotation" ? (
        <>
        <h2 className="text-[13px] font-semibold">Tools</h2>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {TOOLS.map((tool) => {
            const IconComponent = tool.icon;
            const active = tool.id === activeTool;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onToolChange(tool.id)}
                className={[
                  "flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[11px] transition",
                  active
                    ? "border-accent bg-accentsoft text-accentstrong"
                    : "border-line bg-surface text-muted hover:border-accent/60 hover:text-ink",
                ].join(" ")}
              >
                <IconComponent size={18} weight={active ? "bold" : "regular"} />
                {tool.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold">Text</h3>
            <span className="text-[11px] text-muted">
              {selectedText ? "selected box" : "new boxes"}
            </span>
          </div>

          <div className="mt-2.5 space-y-3">
            <label className="block">
              <span className="text-[12px] text-muted">Font family</span>
              <select
                value={textValues.fontFamily}
                onChange={(event) =>
                  changeText({ fontFamily: event.target.value as EditorFontFamily })
                }
                className="mt-1 h-9 w-full rounded-lg border border-line bg-paper px-2.5 text-[13px] text-ink transition focus:border-accent"
              >
                {FONT_FAMILIES.map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-2">
              <label className="block flex-1">
                <span className="text-[12px] text-muted">Size</span>
                <input
                  type="number"
                  min={8}
                  max={144}
                  value={textValues.fontSize}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    if (value > 0) changeText({ fontSize: Math.min(144, value) });
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-paper px-2.5 text-[13px] text-ink transition focus:border-accent"
                />
              </label>
              <button
                type="button"
                onClick={() => changeText({ bold: !textValues.bold })}
                aria-pressed={textValues.bold}
                aria-label="Bold"
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-lg border transition",
                  textValues.bold
                    ? "border-accent bg-accentsoft text-accentstrong"
                    : "border-line bg-surface text-muted hover:text-ink",
                ].join(" ")}
              >
                <TextB size={17} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => changeText({ italic: !textValues.italic })}
                aria-pressed={textValues.italic}
                aria-label="Italic"
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-lg border transition",
                  textValues.italic
                    ? "border-accent bg-accentsoft text-accentstrong"
                    : "border-line bg-surface text-muted hover:text-ink",
                ].join(" ")}
              >
                <TextItalic size={17} />
              </button>
            </div>

            <div>
              <span className="text-[12px] text-muted">Alignment</span>
              <div className="mt-1 flex gap-2">
                {ALIGNS.map((align) => {
                  const IconComponent = align.icon;
                  const activeAlign = textValues.align === align.id;
                  return (
                    <button
                      key={align.id}
                      type="button"
                      onClick={() => changeText({ align: align.id })}
                      aria-label={align.label}
                      aria-pressed={activeAlign}
                      className={[
                        "flex h-9 flex-1 items-center justify-center rounded-lg border transition",
                        activeAlign
                          ? "border-accent bg-accentsoft text-accentstrong"
                          : "border-line bg-surface text-muted hover:text-ink",
                      ].join(" ")}
                    >
                      <IconComponent size={16} weight={activeAlign ? "bold" : "regular"} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="text-[12px] text-muted">Color</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => changeText({ color })}
                    aria-label={`Color ${color}`}
                    aria-pressed={textValues.color.toLowerCase() === color.toLowerCase()}
                    className={[
                      "size-6 rounded-full border transition",
                      textValues.color.toLowerCase() === color.toLowerCase()
                        ? "ring-2 ring-accent ring-offset-1"
                        : "hover:scale-110",
                    ].join(" ")}
                    style={{ backgroundColor: color, borderColor: color === "#ffffff" ? "#d8dbe0" : color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {selectedShape && (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold">Shape</h3>
              <span className="text-[11px] text-muted">selected</span>
            </div>
            <div className="mt-2.5 space-y-3">
              <div className="flex items-end gap-2">
                <label className="block flex-1">
                  <span className="text-[12px] text-muted">Stroke width</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={shapeDefaults.strokeWidth}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      if (value > 0) changeShape({ strokeWidth: Math.min(12, value) });
                    }}
                    className="mt-1 h-9 w-full rounded-lg border border-line bg-paper px-2.5 text-[13px] text-ink transition focus:border-accent"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    changeShape({ fill: shapeDefaults.fill ? "" : shapeDefaults.color })
                  }
                  aria-pressed={!!shapeDefaults.fill}
                  className={[
                    "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-[12px] transition",
                    shapeDefaults.fill
                      ? "border-accent bg-accentsoft text-accentstrong"
                      : "border-line bg-surface text-muted hover:text-ink",
                  ].join(" ")}
                >
                  <span
                    className="size-3.5 rounded-full border border-line"
                    style={{ backgroundColor: shapeDefaults.fill || "transparent" }}
                  />
                  {shapeDefaults.fill ? "Filled" : "Outline"}
                </button>
              </div>
              <div>
                <span className="text-[12px] text-muted">Color</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        changeShape({ color });
                        if (shapeDefaults.fill) changeShape({ fill: color });
                      }}
                      aria-label={`Color ${color}`}
                      aria-pressed={shapeDefaults.color.toLowerCase() === color.toLowerCase()}
                      className={[
                        "size-6 rounded-full border transition",
                        shapeDefaults.color.toLowerCase() === color.toLowerCase()
                          ? "ring-2 ring-accent ring-offset-1"
                          : "hover:scale-110",
                      ].join(" ")}
                      style={{ backgroundColor: color, borderColor: color === "#ffffff" ? "#d8dbe0" : color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        </>
      ) : (
        <div className="space-y-4 pt-1">
          <div>
            <h2 className="text-[13px] font-semibold">Edit Text</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Click any text on the pages to edit it. Your changes are applied
              to the original text when you download.
            </p>
          </div>
          {textLoading && !textError && (
            <p className="flex items-center gap-2 text-[12px] text-muted" aria-busy="true">
              <SpinnerGap size={14} className="animate-spin" />
              Extracting editable text...
            </p>
          )}
          {textError && (
            <p className="rounded-xl border border-line bg-surface px-3 py-2.5 text-[12px] leading-relaxed text-danger">
              {textError}
            </p>
          )}
          {textChangedCount > 0 && (
            <p className="font-mono text-[12px] text-accentstrong">
              {textChangedCount} change{textChangedCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-line p-4">
        <button
          type="button"
          onClick={onExport}
          disabled={exporting || exportDisabled}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-paper transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {exporting ? "Exporting..." : "Download edited PDF"}
          {!exporting && <DownloadSimple size={16} />}
        </button>

        {mode === "annotation" && selected && (
          <button
            type="button"
            onClick={onRemoveSelected}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[12px] text-muted transition hover:border-danger/40 hover:text-danger"
          >
            <TrashSimple size={14} />
            Remove selected
          </button>
        )}

        {mode === "annotation" && (
        <button
          type="button"
          onClick={onClearAll}
          disabled={exporting}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full px-4 text-[12px] text-muted transition hover:text-ink disabled:opacity-40"
        >
          <Eraser size={14} />
          Clear all edits
        </button>
        )}

        {result && (
          <p
            role="status"
            className={[
              "pt-1 text-[12px] leading-relaxed",
              result.startsWith("Edited") ? "text-accentstrong" : "text-danger",
            ].join(" ")}
          >
            {result}
          </p>
        )}
      </div>
    </aside>
  );
}
