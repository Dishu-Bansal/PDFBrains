// Verifies the whitespace-run handling: a PDF with separate space runs is
// extracted, rebuilt like EditPageCard does (whitespace items kept in the
// JSON, filtered from overlays), and renders on Stirling.
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDocument } from "pdfjs-dist";

const env = readFileSync(".env.local", "utf8");
const key = (env.match(/VITE_PDFBRAINS_API_KEY=(.*)/)?.[1] ?? "").trim();
const url = (env.match(/VITE_PDFBRAINS_API_URL=(.*)/)?.[1] ?? "https://pdfbrains.codewithdishu.com").trim();

// 1. Build a PDF with "Hello", a space run, and "World" as separate draws.
const pdfDoc = await PDFDocument.create();
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
const page = pdfDoc.addPage([300, 200]);
page.drawRectangle({ x: 40, y: 140, width: 220, height: 40, color: rgb(0.88, 0.31, 0.13) });
page.drawText("Hello", { x: 60, y: 150, size: 24, font });
page.drawText(" ", { x: 60 + 24 * 2.9, y: 150, size: 24, font });
page.drawText("World", { x: 60 + 24 * 3.7, y: 150, size: 24, font });
const pdf = new Uint8Array(await pdfDoc.save());
writeFileSync("scripts/tmp-space.pdf", pdf);

// 2. Stirling extraction.
const f1 = new FormData();
f1.append("fileInput", new Blob([pdf], { type: "application/pdf" }), "tmp-space.pdf");
f1.append("lightweight", "false");
const r1 = await fetch(url + "/api/v1/convert/pdf/text-editor", { method: "POST", headers: { "X-API-Key": key }, body: f1 });
const stirling = JSON.parse(await r1.text());
console.log("stirling page0 elements:", (stirling.pages?.[0]?.textElements ?? []).map((e) => JSON.stringify(e.text)));

// 3. Rebuild from pdf.js items (EditPageCard logic).
const doc = await getDocument({ data: pdf }).promise;
const page1 = await doc.getPage(1);
const { items } = await page1.getTextContent();
console.log("pdf.js items:", items.map((it) => JSON.stringify({ str: it.str, w: Math.round(it.width * 10) / 10, x: it.transform[4] })));
const elements = [];
for (const raw of items) {
  if (typeof raw.str !== "string" || raw.str === "") continue;
  const trm = raw.transform;
  elements.push({
    text: raw.str,
    textMatrix: trm.slice(),
    fontSize: Math.hypot(trm[2] ?? 0, trm[3] ?? 0),
  });
}
await doc.destroy();
const rebuilt = { ...stirling, pages: [{ ...(stirling.pages?.[0] ?? {}), textElements: elements }] };
console.log("rebuilt elements:", elements.map((e) => JSON.stringify(e.text)));

// 4. Render the rebuilt document (whitespace elements included).
const f3 = new FormData();
f3.append("fileInput", new Blob([JSON.stringify(rebuilt)], { type: "application/json" }), "tmp-space.json");
const r3 = await fetch(url + "/api/v1/convert/text-editor/pdf", { method: "POST", headers: { "X-API-Key": key }, body: f3 });
const b3 = Buffer.from(await r3.arrayBuffer());
console.log("render:", r3.status, b3.length, "bytes, valid pdf:", b3.subarray(0, 5).toString() === "%PDF-");
if (!r3.ok) console.log("body:", b3.toString().slice(0, 300));
