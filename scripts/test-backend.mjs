// Backend smoke test: converts a generated .docx to PDF via the Stirling
// PDF instance configured in .env.local. Run with: node scripts/test-backend.mjs
import { readFileSync } from "node:fs";

import JSZip from "jszip";

const env = readFileSync(".env.local", "utf8");
const key = (env.match(/VITE_PDFBRAINS_API_KEY=(.*)/)?.[1] ?? "").trim();
const url = (env.match(/VITE_PDFBRAINS_API_URL=(.*)/)?.[1] ?? "https://pdfbrains.codewithdishu.com").trim();

if (!key) {
  console.log("no VITE_PDFBRAINS_API_KEY set in .env.local");
  process.exit(1);
}

// Minimal but valid .docx.
const zip = new JSZip();
zip.file(
  "[Content_Types].xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
);
zip.file(
  "_rels/.rels",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
);
zip.file(
  "word/document.xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>PDFBrains backend test</w:t></w:r></w:p></w:body></w:document>`
);
const docx = await zip.generateAsync({ type: "nodebuffer" });

const form = new FormData();
form.append(
  "fileInput",
  new Blob([docx], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }),
  "test.docx"
);

const headers = { "X-API-Key": key };
let path = "/api/v1/convert/file/pdf";
let res = await fetch(`${url}${path}`, { method: "POST", headers, body: form });
if (res.status === 404) {
  path = "/api/v1/convert/docx/pdf";
  res = await fetch(`${url}${path}`, { method: "POST", headers, body: form });
}

console.log(`endpoint: ${path}  status: ${res.status}`);
if (res.ok) {
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`pdf bytes: ${buf.length}`);
  console.log(`valid pdf header: ${buf.subarray(0, 5).toString() === "%PDF-"}`);
} else {
  console.log(`error body: ${(await res.text()).slice(0, 300)}`);
}
