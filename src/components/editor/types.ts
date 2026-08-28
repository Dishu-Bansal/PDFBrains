/* Shared types and constants for the common editing workspace. */

export type EditorToolId = "select" | "textbox" | "rect" | "ellipse" | "line" | "arrow";

export type EditorMode = "text" | "annotation";

export type EditorShapeKind = "rect" | "ellipse" | "line" | "arrow";

export type EditorFontFamily = "Helvetica" | "Times" | "Courier";

export type EditorAlign = "left" | "center" | "right";

export interface EditorTextAnnotation {
  id: string;
  kind: "text";
  pageIndex: number;
  /** Top-left corner in page-surface pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontFamily: EditorFontFamily;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: EditorAlign;
}

export interface EditorShapeAnnotation {
  id: string;
  kind: "shape";
  pageIndex: number;
  shape: EditorShapeKind;
  /** Bounding box in page-surface pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Line/arrow endpoints in page-surface pixels. */
  points?: number[];
  strokeWidth: number;
  color: string;
  /** "" means no fill. */
  fill: string;
}

export type EditorAnnotation = EditorTextAnnotation | EditorShapeAnnotation;

export interface EditorTextDefaults {
  fontFamily: EditorFontFamily;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: EditorAlign;
}

export interface EditorShapeDefaults {
  color: string;
  strokeWidth: number;
  fill: string;
}

export interface OutlineEntry {
  title: string;
  depth: number;
  pageIndex: number;
}

/** Widest a page surface can render at, in CSS pixels. */
export const MAX_PAGE_WIDTH = 640;

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;

/** The rendering scale used to turn annotation pixels into PDF points. */
export const SURFACE_SCALE_BASE = MAX_PAGE_WIDTH;

export const FONT_FAMILIES: { id: EditorFontFamily; label: string; css: string }[] = [
  { id: "Helvetica", label: "Helvetica", css: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: "Times", label: "Times", css: '"Times New Roman", Times, serif' },
  { id: "Courier", label: "Courier", css: '"Courier New", Courier, monospace' },
];

export const TEXT_COLORS = [
  "#161a21",
  "#e04f22",
  "#1d4ed8",
  "#0f766e",
  "#7c3aed",
  "#b91c1c",
  "#b45309",
  "#ffffff",
];

export const DEFAULT_TEXT_STYLE: EditorTextDefaults = {
  fontFamily: "Helvetica",
  fontSize: 16,
  bold: false,
  italic: false,
  color: "#161a21",
  align: "left",
};

export const DEFAULT_SHAPE_STYLE: EditorShapeDefaults = {
  color: "#161a21",
  strokeWidth: 2,
  fill: "",
};

export function fontCss(family: EditorFontFamily): string {
  return FONT_FAMILIES.find((f) => f.id === family)?.css ?? "sans-serif";
}

export function isShapeTool(tool: EditorToolId): tool is EditorShapeKind {
  return tool === "rect" || tool === "ellipse" || tool === "line" || tool === "arrow";
}

export function isTextAnnotation(
  annotation: EditorAnnotation
): annotation is EditorTextAnnotation {
  return annotation.kind === "text";
}

/** #rrggbb (or #rgb) to a pdf-lib color. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = Number.parseInt(value, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}
