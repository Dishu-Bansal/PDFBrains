/**
 * Generates public/sitemap.xml from src/data/tools.ts.
 *
 * - Single source of truth: every non-upcoming tool in TOOLS gets a
 *   /tools/:slug URL, so the sitemap can never drift from the router.
 * - Upcoming placeholders are EXCLUDED (they render a "coming soon" page
 *   and carry noindex via upcomingToolSeo()).
 * - Each URL's freshness date is CONTENT-DERIVED: the commit date of the
 *   newest commit that touched the sources which build that page (shared
 *   shell + page + the tool's own entry in src/data/tools.ts). Rebuilding an
 *   unchanged commit therefore produces a byte-identical file: no dirty
 *   working tree on every build, and no fake "changed today" signal.
 *
 * Date resolution per URL, first match wins:
 *   1. newest commit date among that page's source paths (and, for tools,
 *      the commit that introduced the tool's entry);
 *   2. the HEAD commit date (shallow CI clones report no per-path history);
 *   3. the newest source file mtime (git unavailable, e.g. a tarball deploy);
 *   4. omitted entirely (the element is optional in the sitemap spec).
 * Only committed content counts: uncommitted edits keep the previous
 * commit's date until they are committed.
 *
 * Run manually with `npm run sitemap`, automatically via `prebuild`.
 * Set SITEMAP_DEBUG=1 to print the date chosen for every URL and why.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_URL = "https://pdfbrains.com";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const toolsPath = join(root, "src", "data", "tools.ts");
const outPath = join(root, "public", "sitemap.xml");

/** Markup and head shared by every route: nav, footer, SEO tags, styles. */
const SHARED_SOURCES = [
  "index.html",
  "src/index.css",
  "src/main.tsx",
  "src/App.tsx",
  "src/components/Nav.tsx",
  "src/components/Footer.tsx",
  "src/components/Seo.tsx",
  "src/lib/seo.ts",
];

/** Home page: hero, catalog (reads the tool registry) and workspace preview. */
const HOME_SOURCES = [
  ...SHARED_SOURCES,
  "src/data/tools.ts",
  "src/pages/Home.tsx",
  "src/components/Hero.tsx",
  "src/components/Catalog.tsx",
  "src/components/PrivacyStrip.tsx",
  "src/components/Workspace.tsx",
  "src/components/Reveal.tsx",
  "src/components/Dropzone.tsx",
];

/** AI Assist: the chat page plus the whole LLM layer (planner, tools, chat). */
const AI_ASSIST_SOURCES = [
  ...SHARED_SOURCES,
  "src/pages/AiAssist.tsx",
  "src/lib/llm",
  "src/components/Dropzone.tsx",
];

/** Every /tools/:slug page renders through ToolPage with these workspaces. */
const TOOL_SOURCES = [
  ...SHARED_SOURCES,
  "src/data/tools.ts",
  "src/pages/ToolPage.tsx",
  "src/lib/api.ts",
  "src/lib/pdf.ts",
  "src/lib/process.ts",
  "src/lib/editorExport.ts",
  "src/components/Dropzone.tsx",
  "src/components/FileStrip.tsx",
  "src/components/PageWorkspace.tsx",
  "src/components/PdfPageThumb.tsx",
  "src/components/OrganizeWorkspace.tsx",
  "src/components/CameraScanner.tsx",
  "src/components/editor",
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function git(args) {
  try {
    const out = execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return DATE_PATTERN.test(out) ? out : null;
  } catch {
    // git missing, not a repository, or no matching history.
    return null;
  }
}

/** Commit date of the newest commit touching any of `paths`. */
function gitCommitDate(paths) {
  return git(["log", "-1", "--format=%cs", "--", ...paths]);
}

/** Commit date that introduced this tool's entry in src/data/tools.ts. */
function gitEntryDate(slug) {
  return git([
    "log",
    "-1",
    "--format=%cs",
    "-S",
    `slug: "${slug}"`,
    "--",
    "src/data/tools.ts",
  ]);
}

/** Newest mtime among the given paths (files or directories). */
function newestMtime(paths) {
  let newest = 0;
  const visit = (absolute) => {
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      return;
    }
    if (stats.isDirectory()) {
      let entries = [];
      try {
        entries = readdirSync(absolute);
      } catch {
        return;
      }
      for (const entry of entries) visit(join(absolute, entry));
      return;
    }
    newest = Math.max(newest, stats.mtimeMs);
  };
  for (const relative of paths) visit(join(root, relative));
  return newest ? new Date(newest).toISOString().slice(0, 10) : null;
}

/** Fallback for shallow clones: the deployed revision's own date. */
const HEAD_DATE = git(["log", "-1", "--format=%cs", "HEAD"]);

/**
 * Content-derived freshness date for one page, plus where it came from so
 * SITEMAP_DEBUG can explain the result.
 */
function resolveLastmod({ sources, entryDate = null }) {
  const pathDate = gitCommitDate(sources);
  const known = [pathDate, entryDate].filter(Boolean).sort();
  if (known.length > 0) {
    const date = known[known.length - 1];
    const source = entryDate && date === entryDate ? "entry" : "paths";
    return { date, source: `${source} (paths ${pathDate ?? "none"}, entry ${entryDate ?? "none"})` };
  }
  if (HEAD_DATE) return { date: HEAD_DATE, source: "head commit" };
  const mtime = newestMtime(sources);
  return mtime
    ? { date: mtime, source: "file mtime (no git history)" }
    : { date: null, source: "none (lastmod omitted)" };
}

const source = readFileSync(toolsPath, "utf8");

// Each tool is a single-line object literal containing slug: "...".
// Match each object block, then split upcoming placeholders from live tools.
const blocks = source.match(/\{[^{}]*slug:\s*"[^"]+"[^{}]*\}/g) ?? [];

const slugs = [];
let upcomingCount = 0;
for (const block of blocks) {
  const slug = block.match(/slug:\s*"([^"]+)"/)?.[1];
  if (!slug) continue;
  if (/upcoming:\s*true/.test(block)) {
    upcomingCount += 1;
    continue;
  }
  slugs.push(slug);
}

slugs.sort();

if (slugs.length === 0) {
  console.error(`generate-sitemap: no tool slugs found in ${toolsPath}`);
  process.exit(1);
}

const pages = [
  { loc: `${SITE_URL}/`, changefreq: "weekly", priority: "1.0", resolved: resolveLastmod({ sources: HOME_SOURCES }) },
  { loc: `${SITE_URL}/ai-assist`, changefreq: "monthly", priority: "0.6", resolved: resolveLastmod({ sources: AI_ASSIST_SOURCES }) },
  ...slugs.map((slug) => ({
    loc: `${SITE_URL}/tools/${slug}`,
    changefreq: "monthly",
    priority: "0.8",
    // Global tool sources plus this tool's own registry entry, so a tool
    // added or edited later than the shared shell gets a newer date.
    resolved: resolveLastmod({ sources: TOOL_SOURCES, entryDate: gitEntryDate(slug) }),
  })),
];

function url({ loc, changefreq, priority, resolved }) {
  const lines = ["  <url>", `    <loc>${loc}</loc>`];
  if (resolved.date) lines.push(`    <lastmod>${resolved.date}</lastmod>`);
  lines.push(`    <changefreq>${changefreq}</changefreq>`);
  lines.push(`    <priority>${priority}</priority>`, "  </url>");
  return lines.join("\n");
}

const lines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<!-- Generated by scripts/generate-sitemap.mjs. Do not edit by hand: it is",
  "     rebuilt from src/data/tools.ts on every build (npm run sitemap).",
  "     Freshness dates are the commit dates of the newest commits touching",
  "     the sources that build each page, so rebuilding unchanged code",
  "     leaves this file byte-identical. -->",
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...pages.map(url),
  "</urlset>",
  "",
];

const content = lines.join("\n");
let previous = null;
try {
  previous = readFileSync(outPath, "utf8");
} catch {
  // first run: nothing to compare against
}

if (previous === content) {
  console.log(
    `generate-sitemap: ${pages.length} URLs unchanged (lastmod is content-derived)`
  );
} else {
  writeFileSync(outPath, content, "utf8");
  const dates = [...new Set(pages.map((page) => page.resolved.date))]
    .filter(Boolean)
    .sort();
  console.log(
    `generate-sitemap: wrote ${pages.length} URLs (${slugs.length} tools, ` +
      `${upcomingCount} upcoming excluded) with ${
        dates.length === 0
          ? "no lastmod dates (no git history available)"
          : `${dates.length} distinct date${dates.length === 1 ? "" : "s"} (${dates[0]}..${dates[dates.length - 1]})`
      } to public/sitemap.xml`
  );
}

if (process.env.SITEMAP_DEBUG) {
  console.log("generate-sitemap: date provenance");
  for (const page of pages) {
    console.log(`  ${page.loc} -> ${page.resolved.date ?? "(omitted)"} [${page.resolved.source}]`);
  }
}
