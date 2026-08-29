// Validates the pdf-lib drawing calls used by editorExport.ts: text (with
// wrap, alignment, bold/italic/serif fonts), rect, ellipse, line and arrow,
// then re-reads the result with pdf.js to confirm the text landed.
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDocument } from "pdfjs-dist";

const pdfBytes = new Uint8Array(readFileSync("public/sample.pdf"));
const pdf = await PDFDocument.load(pdfBytes);

const helv = await pdf.embedFont(StandardFonts.Helvetica);
const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
const times = await pdf.embedFont(StandardFonts.TimesRoman);
const cour = await pdf.embedFont(StandardFonts.CourierBold);

const page = pdf.getPage(0);
const pageW = page.getWidth(); // 595.28
const pageH = page.getHeight();
const surfaceWidth = 560;
const scale = pageW / surfaceWidth;

// Text box: centered, wrapped, Helvetica Bold.
const text = "Edited on PDFBrains";
const size = 18 * scale;
const boxW = 220 * scale;
const x = 60 * scale;
const yTop = 700 * scale;
const color = rgb(0.88, 0.19, 0.13);
let baseline = pageH - yTop - size * 0.8;
for (const line of text.split("\n")) {
  const lineW = helvB.widthOfTextAtSize(line, size);
  page.drawText(line, { x: x + (boxW - lineW) / 2, y: baseline, size, font: helvB, color });
  baseline -= size * 1.2;
}

// Serif italic line via Times + Courier line.
page.drawText("Serif check", { x: 60 * scale, y: 660 * scale, size: 14 * scale, font: times, color: rgb(0, 0, 0) });
page.drawText("Mono bold", { x: 60 * scale, y: 640 * scale, size: 14 * scale, font: cour, color: rgb(0, 0, 0) });

// Shapes.
const stroke = rgb(0.09, 0.1, 0.13);
page.drawRectangle({
  x: 60 * scale,
  y: pageH - 560 * scale - 40 * scale,
  width: 80 * scale,
  height: 40 * scale,
  borderColor: stroke,
  borderWidth: 2 * scale,
  color: rgb(0.95, 0.9, 0.85),
});
page.drawEllipse({
  x: 160 * scale,
  y: pageH - 580 * scale,
  xScale: 30 * scale,
  yScale: 20 * scale,
  borderColor: stroke,
  borderWidth: 2 * scale,
});
page.drawLine({
  start: { x: 60 * scale, y: pageH - 500 * scale },
  end: { x: 200 * scale, y: pageH - 520 * scale },
  thickness: 2 * scale,
  color: stroke,
});
// Arrow.
const p1 = { x: 60 * scale, y: pageH - 460 * scale };
const p2 = { x: 200 * scale, y: pageH - 440 * scale };
page.drawLine({ start: p1, end: p2, thickness: 2 * scale, color: stroke });
const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
const head = 10 * scale;
const b1 = { x: p2.x - head * Math.cos(angle - 0.42), y: p2.y - head * Math.sin(angle - 0.42) };
const b2 = { x: p2.x - head * Math.cos(angle + 0.42), y: p2.y - head * Math.sin(angle + 0.42) };
page.drawSvgPath(`M ${p2.x} ${p2.y} L ${b1.x} ${b1.y} L ${b2.x} ${b2.y} Z`, { color: stroke });

const out = await pdf.save();
console.log("export bytes:", out.length, "valid:", out.slice(0, 5).toString() === "%PDF-");

// Re-read with pdf.js and confirm the edited text is present on page 1.
const doc = await getDocument({ data: new Uint8Array(out) }).promise;
const outPage = await doc.getPage(1);
const { items } = await outPage.getTextContent();
const texts = items.filter((i) => i.str && i.str.trim()).map((i) => i.str);
console.log("extracted text:", JSON.stringify(texts));
console.log("text check:", texts.includes("Edited on PDFBrains") ? "PASS" : "FAIL");
await doc.destroy();
