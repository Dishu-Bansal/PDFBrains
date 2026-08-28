# Action Plan: ChainPDF (iLovePDF Competitor)

> This document is the living specification for building a PDF tools web product. It is structured so each section can be handed to an AI coding agent + harness for implementation, one feature/module at a time.

## 1. Product Overview

- Free product — **no premium/paid tier**.
- **No login/signup required** — all tools usable anonymously.
- Home page acts as a landing page:
  - Hero section with a clear CTA ("Browse Tools" or similar) that scrolls/links to the full tool list.
  - Below the hero, a list of all tools **categorized by function** (see Section 2).
- Top navigation bar:
  - Direct quick-access buttons: **Merge**, **Split**, **Compress**.
  - A **Convert** button that expands to show all available conversion tools (to/from PDF).
  - An **All Tools** button that expands to show every tool across every category.

## 2. Tool List (by category)

### Organize PDF
- Merge PDF
- Split PDF
- Remove pages
- Extract pages
- Organize PDF (reorder/manage pages)
- Scan to PDF

### Optimize PDF
- Compress PDF
- Repair PDF
- OCR PDF

### Convert to PDF
- JPG to PDF
- WORD to PDF
- POWERPOINT to PDF
- EXCEL to PDF
- HTML to PDF

### Convert from PDF
- PDF to JPG
- PDF to WORD
- PDF to POWERPOINT
- PDF to EXCEL
- PDF to PDF/A

### Edit PDF
- Rotate PDF
- Add page numbers
- Add watermark
- Crop PDF
- Edit PDF (text/annotations)
- PDF Forms

### PDF Security
- Unlock PDF
- Protect PDF
- Sign PDF
- Redact PDF
- Compare PDF

## 3. Navigation & Layout Spec

| Element | Behavior |
|---|---|
| Top bar — Merge | Direct link to Merge PDF tool page |
| Top bar — Split | Direct link to Split PDF tool page |
| Top bar — Compress | Direct link to Compress PDF tool page |
| Top bar — Convert | Expandable dropdown listing all Convert to/from PDF tools |
| Top bar — All Tools | Expandable dropdown/mega-menu listing every tool, grouped by category |
| Home hero | Headline + subtext + primary CTA button ("Browse Tools") |
| Home tool list | Full categorized grid/list of all tools (mirrors Section 2), each item links to its tool page |

## 4. Individual Tool Page Spec

When a user selects any tool (e.g. Merge, Compress, PDF to Word):

**Before upload:**
- Header text: tool name (e.g. "Merge PDF")
- Sub text: short description of what the tool does
- Primary CTA: drop zone / button to upload document(s)

**After upload — workspace layout:**
- **Left 70% — Workspace panel**
  - Displays document thumbnails and relevant details (page thumbnails for page-level tools, file cards for whole-PDF tools like Merge), sized large enough for clear visibility.
- **Right 30% — Options panel**
  - Tool-specific options/controls (e.g. rotation angle, page ranges, compression level).
  - CTA button to complete the process and generate the output file.

This layout (upload → 70/30 workspace/options split → generate) is the standard pattern for every tool page.

## 5. Constraints

- No authentication system needed (v1) — simplifies architecture (no user DB, sessions, or billing).
- No premium tier — no paywalls, usage limits tied to accounts, or plan-gating logic needed.

## 6. Open Items (to be filled in as specs are provided)

- [x] **File upload/processing architecture**: client-side per tool where the
  browser can do it (pdf.js + pdf-lib): merge, split, remove/extract pages,
  organize (reorder), scan to PDF, compress (repack), repair, JPG<->PDF,
  PDF to JPG, rotate, add page numbers, watermark, crop. The remaining tools
  (WORD/POWERPOINT/EXCEL/HTML conversion, PDF to WORD/POWERPOINT/EXCEL/PDF/A,
  OCR, edit, forms, sign, redact, compare, unlock, protect) are stubbed with
  a working workspace and a note, ready to be wired to a server-side
  processor one at a time. (pdf-lib cannot encrypt or decrypt, so the
  security tools need a backend.)
- [x] **File size limits**: none enforced in v1; files are processed entirely
  in the browser, so nothing is uploaded until a server-side tool needs it.
- [x] **Branding/visual design direction**: "PDFBrains". Paper-and-ink palette
  (cool paper white + near-black ink) with a single vermilion rubber-stamp
  accent; Outfit + JetBrains Mono; light and dark modes; pill buttons,
  16-24px cards, 12px inputs.
- [x] **Tech stack decision**: Vite + React 18 + TypeScript, Tailwind CSS v4
  (design tokens in `src/index.css`), Motion for reveals, Phosphor icons,
  `pdfjs-dist` (thumbnails/JPG export) and `pdf-lib` (processing), Fontsource
  self-hosted fonts.
- [ ] Hosting/infra plan

---
*This file will be updated incrementally as more specifications are provided.*
