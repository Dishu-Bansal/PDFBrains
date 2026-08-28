/* Shared text-overlay machinery for the editor workspace's Edit Text mode.
 * Overlay geometry comes from pdf.js getTextContent() using the same
 * transform math pdf.js applies in its own text layer, so every editable run
 * sits exactly where the original text is. */

import type { PDFPageProxy } from "pdfjs-dist";

import type { TextEditorTextElement } from "../../lib/api";

/** A pdf.js text item, as returned by getTextContent(). */
export interface PdfTextItem {
  str?: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL?: boolean;
}

/** Text style entry from getTextContent().styles. */
export interface PdfTextStyle {
  ascent?: number;
  descent?: number;
  vertical?: boolean;
  fontFamily?: string;
}

/** One editable run: exact viewport-space geometry plus the PDF matrix. */
export interface TextOverlayItem {
  text: string;
  left: number;
  top: number;
  /** CSS px advance width of the original run. */
  width: number;
  /** CSS px font size. */
  fontHeight: number;
  /** PDF points font size. */
  fontSizePt: number;
  /** Original PDF-space text matrix (for the JSON). */
  transform: number[];
  fontFamily: string;
  fontId?: string;
  bold: boolean;
  italic: boolean;
  /** Degrees, 0 = horizontal. */
  angle: number;
}

export interface StirlingFont {
  id?: string;
  baseName?: string;
}

/** Short stable hash used to scope registered fonts to one document. */
export function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

const familyCache = new Map<string, string>();
const ascentCache = new Map<string, number>();

/** Quotes a non-generic family for use in CSS font shorthand. */
export function cssFontFamily(family: string): string {
  if (/^(sans-serif|serif|monospace|inherit|initial)$/i.test(family)) return family;
  return `"${family.replace(/"/g, "")}", sans-serif`;
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
    if (Math.abs(matrix[5] - itemY) > tolerance) continue;
    const elText = norm(el.text ?? "");
    let score = -1;
    if (elText && elText === itemText) score = 3;
    else if (elText && (elText.includes(itemText) || itemText.includes(elText))) score = 2;
    else if (!elText || !itemText) score = 1;
    if (score < 0) continue;
    score = score * 1000 - Math.abs(matrix[4] - itemX);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

/** Converts an overlay item into the Stirling JSON element shape. */
export function overlayElement(item: TextOverlayItem): TextEditorTextElement {
  return {
    text: item.text,
    textMatrix: item.transform,
    fontSize: item.fontSizePt,
    ...(item.fontId ? { fontId: item.fontId } : {}),
  };
}

/**
 * Builds the editable runs for one page from pdf.js text content, positioned
 * in the coordinates of the given (already scaled) viewport. Whitespace-only
 * runs are kept for spacing but flagged by their text; callers skip them for
 * overlays and blanking.
 */
export async function buildTextOverlayItems(
  page: PDFPageProxy,
  viewport: { transform: number[]; scale: number },
  textContent: { items: PdfTextItem[]; styles?: Record<string, PdfTextStyle> },
  stirlingElements: TextEditorTextElement[],
  fonts: StirlingFont[],
  docKey: string
): Promise<TextOverlayItem[]> {
  const { Util } = await import("pdfjs-dist");
  const fontMap: Record<string, { bold: boolean; italic: boolean }> = {};
  for (const font of fonts) {
    if (!font.id) continue;
    fontMap[font.id] = {
      bold: /bold/i.test(font.baseName ?? ""),
      italic: /italic|oblique/i.test(font.baseName ?? ""),
    };
  }

  const built: TextOverlayItem[] = [];
  for (const raw of textContent.items) {
    const item = raw as PdfTextItem;
    if (typeof item.str !== "string" || item.str === "") continue;
    const tx = Util.transform(viewport.transform, item.transform);
    const angle = Math.atan2(tx[1], tx[0]);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    if (fontHeight <= 0) continue;
    const style = textContent.styles?.[item.fontName];
    const fontFamily = await resolveFontFamily(item.fontName, style, page, docKey);
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
      width: item.width * viewport.scale,
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
        : /italic|oblique/i.test(item.fontName) || /italic|oblique/i.test(style?.fontFamily ?? ""),
      angle: angle * (180 / Math.PI),
    });
  }
  return built;
}

/**
 * Samples a strip just above a text run and averages the non-dark pixels
 * into the fill color used for blanking, so the original background (paper,
 * colored block, graphic) is restored instead of a single sampled pixel.
 */
export function sampleFill(
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

/** Blanks each original run on the canvas so the overlays replace the text. */
export function blankOriginalText(
  ctx: CanvasRenderingContext2D,
  items: TextOverlayItem[],
  dpr: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  for (const it of items) {
    if (it.width <= 0 || !it.text.trim()) continue;
    ctx.save();
    if (it.angle !== 0) {
      ctx.translate(it.left, it.top);
      ctx.rotate((it.angle * Math.PI) / 180);
      ctx.fillStyle = sampleFill(ctx, it.left, it.top, it.width, dpr, canvasWidth, canvasHeight);
      ctx.fillRect(-1, -1, it.width + 2, it.fontHeight + 2);
    } else {
      ctx.fillStyle = sampleFill(ctx, it.left, it.top, it.width, dpr, canvasWidth, canvasHeight);
      ctx.fillRect(it.left - 1, it.top - 1, it.width + 2, it.fontHeight + 2);
    }
    ctx.restore();
  }
}
