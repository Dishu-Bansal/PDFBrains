// Validates the rebuilt textElements shape produced by EditPdfWorkspace:
// { text, textMatrix, fontSize, fontId? } rendered by Stirling's
// text-editor/pdf endpoint (the job-less fallback path).
import { readFileSync } from "node:fs";
import { getDocument, Util } from "pdfjs-dist";

const env = readFileSync(".env.local", "utf8");
const key = (env.match(/VITE_PDFBRAINS_API_KEY=(.*)/)?.[1] ?? "").trim();
const url = (env.match(/VITE_PDFBRAINS_API_URL=(.*)/)?.[1] ?? "https://pdfbrains.codewithdishu.com").trim();

const pdf = new Uint8Array(readFileSync("public/sample.pdf"));

// 1. Extract Stirling JSON for fonts + page size.
const f1 = new FormData();
f1.append("fileInput", new Blob([pdf], { type: "application/pdf" }), "sample.pdf");
f1.append("lightweight", "false");
const r1 = await fetch(url + "/api/v1/convert/pdf/text-editor", { method: "POST", headers: { "X-API-Key": key }, body: f1 });
const stirling = JSON.parse(await r1.text());
const fonts = stirling.fonts ?? [];

// 2. Build a rebuilt document from pdf.js items, mirroring EditPageCard:
//    one element per item with textMatrix = item.transform, fontSize =
//    hypot(transform[2], transform[3]) and fontId inherited from the matched
//    Stirling element (same baseline + text containment).
const doc = await getDocument({ data: pdf }).promise;
const rebuilt = { ...stirling, pages: [] };
for (let p = 0; p < doc.numPages; p++) {
  const page = await doc.getPage(p + 1);
  const { items } = await page.getTextContent();
  const stirlingElements = stirling.pages?.[p]?.textElements ?? [];
  const norm = (s) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const elements = [];
  for (const raw of items) {
    if (typeof raw.str !== "string" || raw.str === "") continue;
    const trm = raw.transform;
    const y = trm[5] ?? 0;
    const x = trm[4] ?? 0;
    const itemText = norm(raw.str);
    let best = null;
    let bestScore = -1;
    for (const el of stirlingElements) {
      const m = el.textMatrix;
      if (!m || m.length < 6) continue;
      if (Math.abs(m[5] - y) > 0.5) continue;
      const elText = norm(el.text);
      let score = -1;
      if (elText && elText === itemText) score = 3;
      else if (elText && (elText.includes(itemText) || itemText.includes(elText))) score = 2;
      else if (!elText || !itemText) score = 1;
      if (score < 0) continue;
      score = score * 1000 - Math.abs(m[4] - x);
      if (score > bestScore) { bestScore = score; best = el; }
    }
    const el = {
      text: raw.str,
      textMatrix: trm.slice(),
      fontSize: Math.hypot(trm[2] ?? 0, trm[3] ?? 0),
    };
    if (best?.fontId) el.fontId = best.fontId;
    elements.push(el);
  }
  rebuilt.pages.push({ ...(stirling.pages?.[p] ?? {}), textElements: elements });
}
await doc.destroy();

// 3. Edit one element and render.
rebuilt.pages[0].textElements[0].text = "Sample page 1 (edited)";
const f3 = new FormData();
f3.append("fileInput", new Blob([JSON.stringify(rebuilt)], { type: "application/json" }), "sample.json");
const r3 = await fetch(url + "/api/v1/convert/text-editor/pdf", { method: "POST", headers: { "X-API-Key": key }, body: f3 });
const b3 = Buffer.from(await r3.arrayBuffer());
console.log("render:", r3.status, b3.length, "bytes, valid pdf:", b3.subarray(0, 5).toString() === "%PDF-");
if (!r3.ok) console.log("body:", b3.toString().slice(0, 300));
console.log("page0 elements:", rebuilt.pages[0].textElements.length);
console.log("sample element:", JSON.stringify(rebuilt.pages[0].textElements[0]));
