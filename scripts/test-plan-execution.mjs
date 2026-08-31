// Validates the plan execution core (the for loop that runs without the
// LLM): remove pages 2,5 from a.pdf, extract pages 1,3,5 from b.pdf, then
// merge the two results in order. Mirrors executePlan in src/lib/llm/plan.ts.
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { deletePages, extractPages, mergePdfBlobs } from "../src/lib/process.ts";

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
