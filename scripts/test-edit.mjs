// Tests the full text-editor flow against the deployed instance:
// extract JSON -> metadata (jobId) -> modify -> partial/{jobId} -> clear-cache.
// Run: node scripts/test-edit.mjs
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const key = (env.match(/VITE_PDFBRAINS_API_KEY=(.*)/)?.[1] ?? "").trim();
const url = (env.match(/VITE_PDFBRAINS_API_URL=(.*)/)?.[1] ?? "https://pdfbrains.codewithdishu.com").trim();
const pdf = readFileSync("public/sample.pdf");
const headers = { "X-API-Key": key };
const base = `${url}/api/v1/convert`;

async function postMultipart(path, fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(base + path, { method: "POST", headers, body: form });
  const buf = Buffer.from(await res.arrayBuffer());
  return { res, buf, text: buf.toString("utf8") };
}

// 1. Extract the editable JSON.
const extract = await postMultipart("/pdf/text-editor", {
  fileInput: new Blob([pdf], { type: "application/pdf" }),
  lightweight: "false",
});
console.log(`1. text-editor: ${extract.res.status}, type: ${extract.res.headers.get("content-type")}`);
let doc;
try {
  doc = JSON.parse(extract.text);
  console.log(`   pages: ${doc.pages?.length}, fonts: ${doc.fonts?.length}`);
} catch {
  console.log(`   NOT JSON: ${extract.text.slice(0, 200)}`);
  process.exit(1);
}

// 2. Cache the PDF and get the jobId from the metadata endpoint's X-Job-Id header.
const meta = await postMultipart("/pdf/text-editor/metadata", {
  fileInput: new Blob([pdf], { type: "application/pdf" }),
});
const jobId = meta.res.headers.get("x-job-id");
console.log(`2. metadata: ${meta.res.status}, x-job-id: ${jobId}, body length: ${meta.buf.length}`);

// 3. Modify the first page's first text element containing "PDFBrains".
let changed = false;
for (const page of doc.pages ?? []) {
  for (const el of page.textElements ?? []) {
    if (el.text && el.text.includes("PDFBrains")) {
      el.text = el.text.replace("PDFBrains", "PDFBrainsX");
      changed = true;
      console.log(`3. changed element: "${el.text.slice(0, 40)}"`);
      break;
    }
  }
  if (changed) break;
}
if (!changed) console.log("3. no PDFBrains text found to change");

// 4. Apply the partial edit - raw JSON body.
const partial = await fetch(`${base}/pdf/text-editor/partial/${jobId}?filename=sample-edited.pdf`, {
  method: "POST",
  headers: { "X-API-Key": key, "Content-Type": "application/json" },
  body: JSON.stringify(doc),
});
const pbuf = Buffer.from(await partial.arrayBuffer());
console.log(`4. partial: ${partial.status}, type: ${partial.headers.get("content-type")}, bytes: ${pbuf.length}, pdf: ${pbuf.subarray(0, 5).toString() === "%PDF-"}`);
if (!partial.ok) console.log(`   body: ${pbuf.toString().slice(0, 250)}`);

// 5. Clear the cache.
const clear = await fetch(`${base}/pdf/text-editor/clear-cache/${jobId}`, {
  method: "POST",
  headers: { "X-API-Key": key },
});
console.log(`5. clear-cache: ${clear.status}`);
