# PDFBrains

A free, no-login, ilovepdf-style PDF tool site, built to the spec in
`action-plan.md`. Frontend-only for now; the backend gets hooked in tool by
tool later.

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS v4 (design tokens in `src/index.css`)
- Motion for entrance reveals
- Phosphor icons
- Self-hosted fonts via Fontsource (Outfit + JetBrains Mono)
- `pdfjs-dist` for client-side page thumbnails and JPG export
- `pdf-lib` for client-side processing

## Run

```bash
npm install
npm run dev       # dev server on http://localhost:5173
npm run build     # type-check + production build
npm run sample    # regenerate public/sample.pdf (6-page test document)
```

## Product shape (from action-plan.md)

- Free product, no premium tier, no sign-in.
- Nav: Merge / Split / Compress quick links, a Convert dropdown (all
  to/from-PDF tools) and an All Tools mega-menu (30 tools, 6 categories).
- Home: hero with "Browse tools" CTA, then the full categorized tool list.
- Every tool page: header + description, upload, then the standard
  **70/30 workspace/options split**.

## Tool workspaces

Every `/tools/:slug` page follows the ilovepdf pattern: the big dropzone
appears only until the first file lands, then collapses into a **file strip**
with a "+ Add files" item and drop-to-add support. Document tools show
**large thumbnail cards** (real page-1 preview, name, size, page count) in a
wrapping grid; page tools (remove pages, split, pdf-to-jpg, ...) keep
**compact chips** since the action happens on the page grid below. Cards are
draggable to reorder (merge, jpg-to-pdf, converters) and chips double as
file tabs on page tools.

A **right-side options panel** holds the tool-specific helper fields and
the primary action: compression level (compress), page size (jpg-to-pdf,
scan-to-pdf), select all/clear (split, remove, extract, pdf-to-jpg),
rotate all (rotate), page number position/start, watermark text/size, crop
margins, plus clear-all and the result message.

- **Document workspace** (`workspace: "document"`): the strip is the
  workspace. Used by merge, compress and other whole-file tools.
- **Page workspace** (`workspace: "pages"`): below the strip, every page of
  the active PDF as a thumbnail with its page number and the PDF name.
  Modes: select, reorder (drag), rotate (per-page quarter turns), preview.
- **Scan to PDF** has its own camera capture surface.

Tools with real client-side processing work end to end: merge, split,
remove pages, extract pages, organize (reorder), scan to PDF, compress
(repack), repair, JPG to PDF, PDF to JPG, rotate, add page numbers,
watermark, crop. The rest (Office conversions, PDF/A, OCR, edit, forms,
sign, redact, compare, unlock, protect) show the workspace and a note that
processing is wired to the backend next. pdf-lib cannot encrypt/decrypt, so
the security tools need a backend.

## Structure

- `src/data/tools.ts` - the tool registry (30 tools, 6 categories). One
  entry per tool with its workspace kind and accept hint; the backend
  attaches a processor per `slug` later.
- `src/lib/pdf.ts` - lazy pdf.js loader + `usePdfDocument` hook + JPG export.
- `src/lib/process.ts` - pdf-lib processors and download helpers.
- `src/components/Nav.tsx` - quick links + Convert/All-tools dropdowns.
- `src/components/Dropzone.tsx` - the big upload surface (empty state).
- `src/components/FileStrip.tsx` - the compact wrapping chip strip.
- `src/components/PageWorkspace.tsx` - the per-page grid.
- `src/components/CameraScanner.tsx` - scan-to-PDF camera capture.
- `src/pages/ToolPage.tsx` - generic shell every `/tools/:slug` renders
  through, with per-tool options and actions.

## Analytics

Google Analytics 4, wired through `src/lib/analytics.ts`. There is no gtag
snippet in `index.html`: the module injects `gtag.js` once at boot (only when
`VITE_GA_MEASUREMENT_ID` is set) and `<Analytics/>` reports every SPA route
change, because a client-side navigation never reloads the page and would
otherwise be invisible.

| Env var | Effect |
|---|---|
| `VITE_GA_MEASUREMENT_ID` | GA4 measurement ID (`G-XXXXXXXXXX`). Unset = analytics fully off, nothing is requested. |
| `VITE_GA_DEBUG` | `true` forces reporting from dev builds and localhost/LAN hosts and tags hits with `debug_mode` (see GA DebugView). |

Dev builds and local/LAN hostnames never report, so a filled-in ID in
`.env.local` no longer pollutes the production property.

### Events

Only non-identifying data is sent: tool slugs, counts, sizes in MB, durations
and error *categories*. File names, file contents, prompt text and everything
else the user typed never leave the browser. `errorReason()` buckets raw
errors so messages cannot leak user data.

- **Navigation & discovery** - `page_view`, `tool_open` (with `source`:
  nav/catalog/footer/hero/related/ai_assist), `tool_blocked` (an "Upcoming"
  tool was clicked), `ai_assist_open`, `catalog_search` (term *length* only),
  `catalog_clear`, `hero_cta`, `theme_change`, `not_found`.
- **Files** - `files_added` (count, total MB, how they arrived),
  `file_removed`, `files_cleared`, `sample_loaded`.
- **Tool runs** - `tool_run_start`, `tool_run_success` (duration, outputs,
  output MB), `tool_run_error` (duration, reason), `tool_option_change`.
- **AI Assist** - `ai_message_sent` (mode, file count, prompt *length*),
  `ai_suggestion_click`, `ai_chat_cleared`, `ai_plan_created`,
  `ai_plan_discarded`, `ai_plan_run_start`, `ai_plan_step_start`,
  `ai_plan_run_success`, `ai_plan_run_error`, `ai_result_downloaded`,
  `ai_error`.
- **Feedback** - `feedback_open`, `feedback_submit`, `feedback_success`,
  `feedback_error`.

`AnalyticsEventMap` in `src/lib/analytics.ts` is the source of truth: adding an
event there is the only way to report one, so event names and parameters stay
typed across the app.
