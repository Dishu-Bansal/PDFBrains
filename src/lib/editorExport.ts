import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFFont } from "pdf-lib";

import type {
  EditorAnnotation,
  EditorFontFamily,
  EditorTextAnnotation,
} from "../components/editor/types";
import { hexToRgb } from "../components/editor/types";

/**
 * Draws the workspace annotations onto the original PDF and returns the
 * result as a Blob. Annotations live in page-surface pixels (top-left
 * origin); the per-page scale converts them to PDF points.
 */
export async function exportEditedPdf(
  file: File,
  annotations: EditorAnnotation[],
  surfaceWidth: number
): Promise<Blob> {
  const pdf = await PDFDocument.load(await file.arrayBuffer());

  // Embed the six standard fonts so bold/italic/serif/mono all survive.
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const helvO = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const helvBO = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesB = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const timesO = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const timesBO = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  const cour = await pdf.embedFont(StandardFonts.Courier);
  const courB = await pdf.embedFont(StandardFonts.CourierBold);
  const courO = await pdf.embedFont(StandardFonts.CourierOblique);
  const courBO = await pdf.embedFont(StandardFonts.CourierBoldOblique);

  interface FontSet {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
    boldItalic: PDFFont;
  }
  const table: Record<EditorFontFamily, FontSet> = {
    Helvetica: { regular: helv, bold: helvB, italic: helvO, boldItalic: helvBO },
    Times: { regular: times, bold: timesB, italic: timesO, boldItalic: timesBO },
    Courier: { regular: cour, bold: courB, italic: courO, boldItalic: courBO },
  };
  const pickFont = (a: EditorTextAnnotation): PDFFont => {
    const set = table[a.fontFamily];
    return a.bold && a.italic ? set.boldItalic : a.bold ? set.bold : a.italic ? set.italic : set.regular;
  };

  pdf.getPages().forEach((page, pageIndex) => {
    const anns = annotations.filter((a) => a.pageIndex === pageIndex);
    if (anns.length === 0) return;
    const pageW = page.getWidth();
    const pageH = page.getHeight();
    const scale = pageW / surfaceWidth;

    for (const a of anns) {
      const x = a.x * scale;
      const yTop = a.y * scale;

      if (a.kind === "text") {
        const font = pickFont(a);
        const size = a.fontSize * scale;
        const color = rgb(hexToRgb(a.color).r, hexToRgb(a.color).g, hexToRgb(a.color).b);
        const boxW = a.w * scale;
        const lines = wrapText(a.text, font, size, boxW);
        let baseline = pageH - yTop - size * 0.8;
        for (const line of lines) {
          const lineW = font.widthOfTextAtSize(line, size);
          const lx =
            a.align === "center" ? x + (boxW - lineW) / 2 : a.align === "right" ? x + boxW - lineW : x;
          page.drawText(line, { x: lx, y: baseline, size, font, color });
          baseline -= size * 1.2;
        }
        continue;
      }

      const stroke = rgb(hexToRgb(a.color).r, hexToRgb(a.color).g, hexToRgb(a.color).b);
      const thickness = a.strokeWidth * scale;
      const fill = a.fill
        ? rgb(hexToRgb(a.fill).r, hexToRgb(a.fill).g, hexToRgb(a.fill).b)
        : undefined;

      if (a.shape === "rect") {
        page.drawRectangle({
          x,
          y: pageH - yTop - a.h * scale,
          width: a.w * scale,
          height: a.h * scale,
          borderColor: stroke,
          borderWidth: thickness,
          color: fill,
        });
      } else if (a.shape === "ellipse") {
        page.drawEllipse({
          x: x + (a.w * scale) / 2,
          y: pageH - yTop - (a.h * scale) / 2,
          xScale: (a.w * scale) / 2,
          yScale: (a.h * scale) / 2,
          borderColor: stroke,
          borderWidth: thickness,
          color: fill,
        });
      } else if (a.shape === "line" || a.shape === "arrow") {
        const [x1, y1, x2, y2] = a.points ?? [a.x, a.y, a.x + a.w, a.y + a.h];
        const p1 = { x: x1 * scale, y: pageH - y1 * scale };
        const p2 = { x: x2 * scale, y: pageH - y2 * scale };
        page.drawLine({ start: p1, end: p2, thickness, color: stroke });
        if (a.shape === "arrow") {
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const head = 10 * scale;
          const b1 = { x: p2.x - head * Math.cos(angle - 0.42), y: p2.y - head * Math.sin(angle - 0.42) };
          const b2 = { x: p2.x - head * Math.cos(angle + 0.42), y: p2.y - head * Math.sin(angle + 0.42) };
          page.drawSvgPath(
            `M ${p2.x} ${p2.y} L ${b1.x} ${b1.y} L ${b2.x} ${b2.y} Z`,
            { color: stroke }
          );
        }
      }
    }
  });

  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}

/** Wraps text to the box width, honouring explicit newlines. */
function wrapText(
  text: string,
  font: { widthOfTextAtSize(text: string, size: number): number },
  size: number,
  maxWidth: number
): string[] {
  const out: string[] = [];
  for (const hardLine of text.split("\n")) {
    if (font.widthOfTextAtSize(hardLine, size) <= maxWidth) {
      out.push(hardLine);
      continue;
    }
    let line = "";
    for (const word of hardLine.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}
