// Tests the Edit PDF text-editor flow against the deployed instance:
// extract JSON -> modify -> render PDF from the JSON file.
// Run: node scripts/test-edit.mjs
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const key = (env.match(/VITE_PDFBRAINS_API_KEY=(.*)/)?.[1] ?? "").trim();
const url = (env.match(/VITE_PDFBRAINS_API_URL=(.*)/)?.[1] ?? "https://pdfbrains.codewithdishu.com").trim();
const pdf = readFileSync("public/sample.pdf");
const headers = { "X-API-Key": key };

// 1. Extract the editable JSON.
const f1 = new FormData();
f1.append("fileInput", new Blob([pdf], { type: "application/pdf" }), "sample.pdf");
f1.append("lightweight", "false");
const r1 = await fetch(url + "/api/v1/convert/pdf/text-editor", { method: "POST", headers, body: f1 });
const doc = JSON.parse(await r1.text());
console.log(`1. text-editor: ${r1.status}, pages: ${doc.pages?.length}`);

// 2. Modify a text element.
let changed = false;
for (const page of doc.pages ?? []) {
  for (const el of page.textElements ?? []) {
    if (el.text && el.text.includes("PDFBrains")) {
      el.text = el.text.replace("PDFBrains", "PDFBrainsX");
      changed = true;
      break;
    }
  }
  if (changed) break;
}
console.log(`2. changed element: ${changed}`);

// 3. Render the edited document to a PDF via the JSON-file endpoint.
const f3 = new FormData();
f3.append("fileInput", new Blob([JSON.stringify(doc)], { type: "application/json" }), "sample.json");
const r3 = await fetch(url + "/api/v1/convert/text-editor/pdf", { method: "POST", headers, body: f3 });
const b3 = Buffer.from(await r3.arrayBuffer());
console.log(
  `3. render: ${r3.status}, ${b3.length} bytes, valid pdf: ${b3.subarray(0, 5).toString() === "%PDF-"}`
);
if (!r3.ok) console.log(`   body: ${b3.toString().slice(0, 200)}`);
