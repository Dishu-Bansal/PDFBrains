// End-to-end HTML-to-PDF test against the deployed Stirling instance:
// URL mode (/api/v1/convert/url/pdf) and file mode (/api/v1/convert/html/pdf).
// Run: node scripts/test-html.mjs
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const key = (env.match(/VITE_PDFBRAINS_API_KEY=(.*)/)?.[1] ?? "").trim();
const url = (env.match(/VITE_PDFBRAINS_API_URL=(.*)/)?.[1] ?? "https://pdfbrains.codewithdishu.com").trim();

const headers = { "X-API-Key": key };

async function probe(label, endpoint, form) {
  try {
    const res = await fetch(`${url}${endpoint}`, { method: "POST", headers, body: form });
    const buf = Buffer.from(await res.arrayBuffer());
    const isPdf = buf.subarray(0, 5).toString() === "%PDF-";
    console.log(`${label}: status ${res.status}, ${buf.length} bytes, valid pdf: ${isPdf}`);
    if (!res.ok && buf.length < 500) console.log(`   body: ${buf.toString().slice(0, 220)}`);
  } catch (error) {
    console.log(`${label}: network error ${error.message}`);
  }
}

// 1. URL mode via the dedicated endpoint.
const urlForm = new FormData();
urlForm.append("urlInput", "https://example.com");
await probe("urlInput", "/api/v1/convert/url/pdf", urlForm);

// 2. Direct HTML file mode.
const html = "<html><head><style>h1{color:#c13e1a}</style></head><body><h1>PDFBrains html test</h1></body></html>";
const fileForm = new FormData();
fileForm.append("fileInput", new Blob([html], { type: "text/html" }), "test.html");
await probe("fileInput .html", "/api/v1/convert/html/pdf", fileForm);
