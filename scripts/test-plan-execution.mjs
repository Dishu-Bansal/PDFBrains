// Validates the plan execution core (the for loop that runs without the
// LLM): remove pages 2,5 from a.pdf, extract pages 1,3,5 from b.pdf, then
// merge the two results in order. Mirrors executePlan in src/lib/llm/plan.ts.
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import {
  deletePages,
  extractPages,
  mergePdfBlobs,
  mergeSelectedPages,
  pdfPageCount,
  splitBySize,
  splitIntoGroups,
  zipBlobs,
} from "../src/lib/process.ts";

// Build two 6-page PDFs (a copy of the sample with a distinct marker).
const sample = new Uint8Array(readFileSync("public/sample.pdf"));
const makeMarked = async (marker) => {
  const doc = await PDFDocument.load(sample);
  const page = doc.getPage(0);
  page.drawText(marker, { x: 40, y: 400, size: 20 });
  return new Blob([await doc.save()], { type: "application/pdf" });
};

const a = await makeMarked("FILE A");
const b = await makeMarked("FILE B");

// The plan, as the LLM would return it.
const steps = [
  { tool: "remove-pages", params: { file: "a.pdf", pages: [2, 5] }, outputFile: "a_removed.pdf", description: "Remove pages 2 and 5 from a.pdf" },
  { tool: "extract-pages", params: { file: "b.pdf", pages: [1, 3, 5] }, outputFile: "b_extracted.pdf", description: "Extract pages 1, 3 and 5 from b.pdf" },
  { tool: "merge-pdf", params: { files: ["a_removed.pdf", "b_extracted.pdf"] }, outputFile: "final.pdf", description: "Merge the results in order" },
];

// Execute in a for loop with a workspace, like executePlan.
const workspace = new Map([["a.pdf", a], ["b.pdf", b]]);
for (const step of steps) {
  const resolve = (name) => {
    const blob = workspace.get(name);
    if (!blob) throw new Error(`Missing input "${name}"`);
    return blob;
  };
  let output;
  if (step.tool === "remove-pages") output = await deletePages(resolve(step.params.file), step.params.pages);
  else if (step.tool === "extract-pages") output = await extractPages(resolve(step.params.file), step.params.pages);
  else if (step.tool === "merge-pdf") output = await mergePdfBlobs(step.params.files.map(resolve));
  workspace.set(step.outputFile, output);
}

const finalBlob = workspace.get("final.pdf");
const head = new Uint8Array(await finalBlob.arrayBuffer(), 0, 5);
console.log("final.pdf bytes:", finalBlob.size, "valid:", Buffer.from(head).toString() === "%PDF-");

// Verify page counts per step.
const counts = {};
for (const [name, blob] of workspace) {
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  counts[name] = doc.getPageCount();
}
console.log("page counts:", JSON.stringify(counts));
// a_removed: 4 pages; b_extracted: 3 pages; final: 7 pages.
const ok =
  counts["a_removed.pdf"] === 4 && counts["b_extracted.pdf"] === 3 && counts["final.pdf"] === 7;
console.log("execution check:", ok ? "PASS" : "FAIL");

// ---- Scenario 2: split by every-2, then organize pages across parts ----
const w2 = new Map([["a.pdf", a], ["b.pdf", b]]);
const runStep = async (step, ws) => {
  const resolve = (name) => {
    const blob = ws.get(name);
    if (!blob) throw new Error(`Missing input "${name}"`);
    return blob;
  };
  if (step.tool === "split-pdf") {
    const source = resolve(step.params.file);
    const prefix = step.params.outputPrefix || step.outputFile.replace(/\.zip$/i, "").replace(/\.pdf$/i, "");
    const count = await pdfPageCount(source);
    const groups = [];
    for (let start = 1; start <= count; start += step.params.every) {
      const end = Math.min(start + step.params.every - 1, count);
      const group = [];
      for (let p = start; p <= end; p++) group.push(p);
      groups.push(group);
    }
    const parts = await splitIntoGroups(source, groups);
    parts.forEach((part, i) => ws.set(`${prefix}_${i + 1}.pdf`, part));
    const entries = [];
    for (let i = 0; i < parts.length; i++) {
      entries.push({ name: `${prefix}_${i + 1}.pdf`, blob: new Uint8Array(await parts[i].arrayBuffer()) });
    }
    return zipBlobs(entries);
  }
  if (step.tool === "organize-pdf") {
    const names = step.params.files;
    const sources = names.map(resolve);
    const order = step.params.order.map((entry) => ({
      fileIndex: names.indexOf(entry.file),
      pageNumber: entry.page,
    }));
    return mergeSelectedPages(sources, order);
  }
  throw new Error("unknown tool " + step.tool);
};

const steps2 = [
  { tool: "split-pdf", params: { file: "a.pdf", every: 2, outputPrefix: "a_split" }, outputFile: "a_split.zip", description: "Split a.pdf into 2-page parts" },
  { tool: "organize-pdf", params: { files: ["a_split_2.pdf", "a_split_3.pdf", "b.pdf"], order: [{ file: "a_split_2.pdf", page: 1 }, { file: "a_split_3.pdf", page: 2 }, { file: "b.pdf", page: 1 }] }, outputFile: "organized.pdf", description: "Build a new PDF from selected pages" },
];
for (const step of steps2) {
  const output = await runStep(step, w2);
  w2.set(step.outputFile, output);
}

const zipBytes = new Uint8Array(await w2.get("a_split.zip").arrayBuffer());
console.log("zip magic:", Buffer.from(zipBytes.slice(0, 2)).toString() === "PK" ? "PASS" : "FAIL");
const partsCount = ["a_split_1.pdf", "a_split_2.pdf", "a_split_3.pdf"].map((n) => w2.has(n));
console.log("parts registered:", partsCount.every(Boolean) ? "PASS" : "FAIL");
const organized = await PDFDocument.load(await w2.get("organized.pdf").arrayBuffer());
console.log("organized pages:", organized.getPageCount(), "== 3 ?", organized.getPageCount() === 3 ? "PASS" : "FAIL");
