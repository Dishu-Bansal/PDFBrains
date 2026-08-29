// Tests whether the text-editor renderer accepts text elements rebuilt from
// pdf.js data: minimal fields (text + textMatrix + fontSize, no fontId).
// Run: node scripts/test-edit-min.mjs
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const key = (env.match(/VITE_PDFBRAINS_API_KEY=(.*)/)?.[1] ?? "").trim();
const url = (env.match(/VITE_PDFBRAINS_API_URL=(.*)/)?.[1] ?? "https://pdfbrains.codewithdishu.com").trim();
const pdf = readFileSync("public/sample.pdf");
const headers = { "X-API-Key": key };

const form1 = new FormData();
form1.append("fileInput", new Blob([pdf], { type: "application/pdf" }), "sample.pdf");
form1.append("lightweight", "false");
const r1 = await fetch(url + "/api/v1/convert/pdf/text-editor", { method: "POST", headers, body: form1 });
const doc = JSON.parse(await r1.text());
console.log("extract:", r1.status, "pages:", doc.pages?.length);

// Strip fontId and non-essential fields from every text element.
for (const page of doc.pages ?? []) {
  for (const el of page.textElements ?? []) {
    delete el.fontId;
    delete el.width;
    delete el.height;
    delete el.fontMatrixSize;
    delete el.spaceWidth;
    delete el.zOrder;
  }
}

const form2 = new FormData();
form2.append("fileInput", new Blob([JSON.stringify(doc)], { type: "application/json" }), "sample.json");
const r2 = await fetch(url + "/api/v1/convert/text-editor/pdf", { method: "POST", headers, body: form2 });
const b2 = Buffer.from(await r2.arrayBuffer());
console.log(
  "render (minimal):", r2.status, r2.headers.get("content-type"), b2.length, "bytes, pdf:",
  b2.subarray(0, 5).toString() === "%PDF-"
);
if (!r2.ok) console.log("  body:", b2.toString().slice(0, 250));
