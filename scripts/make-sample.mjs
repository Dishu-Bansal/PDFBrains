// Generates public/sample.pdf: a 6-page A4 document with distinct pages,
// used to try merge, split, reorder, rotate and delete without hunting for a
// test file. Run with: npm run sample
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_COUNT = 6;
const INK = rgb(0.09, 0.1, 0.13);
const MUTED = rgb(0.36, 0.4, 0.45);

const doc = await PDFDocument.create();

for (let i = 1; i <= PAGE_COUNT; i++) {
  const page = doc.addPage([595.28, 841.89]); // A4 portrait
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  page.drawText(`Sample page ${i}`, {
    x: 60,
    y: 720,
    size: 40,
    font: bold,
    color: INK,
  });
  page.drawText(
    "PDFBrains sample document. Use it to try merge, split, reorder, rotate and delete.",
    { x: 60, y: 668, size: 12, font, color: MUTED }
  );
  page.drawLine({
    start: { x: 60, y: 648 },
    end: { x: 535, y: 648 },
    thickness: 1,
    color: rgb(0.89, 0.9, 0.92),
  });
  page.drawText(`This is page ${i} of ${PAGE_COUNT}.`, {
    x: 60,
    y: 612,
    size: 12,
    font,
    color: MUTED,
  });

  // A distinct color block per page so thumbnails and order are easy to read.
  const hue = (i - 1) / PAGE_COUNT;
  page.drawRectangle({
    x: 60,
    y: 140,
    width: 475,
    height: 300,
    color: rgb(hue, 0.55, 0.85),
  });
  page.drawText(`${i}`, {
    x: 270,
    y: 270,
    size: 120,
    font: bold,
    color: rgb(1, 1, 1),
  });
}

const bytes = await doc.save();
mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(join(root, "public", "sample.pdf"), bytes);
console.log(`wrote public/sample.pdf (${bytes.length} bytes, ${PAGE_COUNT} pages)`);
