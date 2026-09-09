/**
 * Build-time prerender (static SSG) for the SPA.
 *
 * For every indexable route (/, /ai-assist, each non-upcoming /tools/:slug)
 * this script renders full HTML with the server bundle built by
 * `vite build --ssr src/entry-server.tsx` and writes it to dist:
 *
 *   dist/index.html, dist/ai-assist/index.html, dist/tools/<slug>/index.html
 *
 * Crawlers without JS (and link unfurlers) now get route-specific <head>
 * metadata AND page content. The client boots on top via hydrateRoot
 * (see src/main.tsx) for direct visits; client-side navigation is unchanged.
 *
 * Resilience: each route renders in its own try/catch. If a route's body
 * fails to render, we still write the file with correct <head> metadata
 * (strictly better than the plain SPA shell) and continue. The script only
 * exits non-zero when the client template or server bundle is missing,
 * which means the build itself broke upstream.
 *
 * Route list intentionally mirrors scripts/generate-sitemap.mjs: upcoming
 * tools are excluded from both (they carry noindex).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = join(root, "dist", "index.html");
const toolsPath = join(root, "src", "data", "tools.ts");

function loadServerBundle() {
  for (const name of ["entry-server.js", "entry-server.mjs"]) {
    const p = join(root, "dist-ssr", name);
    if (existsSync(p)) return import(pathToFileURL(p).href);
  }
  return null;
}

/** Non-upcoming tool slugs, parsed from the source of truth (tools.ts). */
function loadToolSlugs() {
  const source = readFileSync(toolsPath, "utf8");
  const blocks = source.match(/\{[^{}]*slug:\s*"[^"]+"[^{}]*\}/g) ?? [];
  const slugs = [];
  for (const block of blocks) {
    const slug = block.match(/slug:\s*"([^"]+)"/)?.[1];
    if (!slug) continue;
    if (/upcoming:\s*true/.test(block)) continue;
    slugs.push(slug);
  }
  return slugs.sort();
}

function escapeAttr(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** String-replace that warns instead of silently no-opping on drift. */
function replaceOrWarn(html, pattern, replacement, label, url) {
  if (!pattern.test(html)) {
    console.warn(`prerender: [${url}] pattern not found, skipped: ${label}`);
    return html;
  }
  return html.replace(pattern, replacement);
}

function injectHead(html, meta, url) {
  const title = escapeAttr(meta.title);
  const description = escapeAttr(meta.description);
  const canonical = escapeAttr(meta.canonical);
  let out = html;
  out = replaceOrWarn(out, /<title>.*?<\/title>/s, `<title>${title}</title>`, "title", url);
  out = replaceOrWarn(
    out,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/s,
    `<meta name="description" content="${description}" />`,
    "meta description",
    url
  );
  out = replaceOrWarn(
    out,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonical}" />`,
    "canonical",
    url
  );
  if (meta.robots) {
    out = replaceOrWarn(
      out,
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/,
      `<meta name="robots" content="${escapeAttr(meta.robots)}" />`,
      "meta robots",
      url
    );
  }
  out = replaceOrWarn(
    out,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${title}" />`,
    "og:title",
    url
  );
  out = replaceOrWarn(
    out,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/s,
    `<meta property="og:description" content="${description}" />`,
    "og:description",
    url
  );
  out = replaceOrWarn(
    out,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${canonical}" />`,
    "og:url",
    url
  );
  out = replaceOrWarn(
    out,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${title}" />`,
    "twitter:title",
    url
  );
  out = replaceOrWarn(
    out,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/s,
    `<meta name="twitter:description" content="${description}" />`,
    "twitter:description",
    url
  );
  return out;
}

function routeToFile(url) {
  if (url === "/") return join(root, "dist", "index.html");
  return join(root, "dist", url.slice(1), "index.html");
}

export { escapeAttr, injectHead, loadToolSlugs, replaceOrWarn, routeToFile };

async function main() {
  const bundle = await loadServerBundle();
  if (!bundle) {
    console.error("prerender: dist-ssr/entry-server.js not found. Run `vite build --ssr src/entry-server.tsx --outDir dist-ssr` first.");
    process.exit(1);
  }
  if (!existsSync(templatePath)) {
    console.error(`prerender: template ${templatePath} not found. Run the client build first.`);
    process.exit(1);
  }
  const { getRouteMeta, renderRoute } = bundle;
  if (typeof getRouteMeta !== "function" || typeof renderRoute !== "function") {
    console.error("prerender: server bundle must export getRouteMeta(url) and renderRoute(url).");
    process.exit(1);
  }

  const template = readFileSync(templatePath, "utf8");
  if (!template.includes('<div id="root"></div>')) {
    console.error('prerender: template is missing <div id="root"></div>; refusing to guess the mount point.');
    process.exit(1);
  }

  const routes = ["/", "/ai-assist", ...loadToolSlugs().map((slug) => `/tools/${slug}`)];
  let full = 0;
  let headOnly = 0;

  for (const url of routes) {
    const meta = getRouteMeta(url);
    let html = injectHead(template, meta, url);
    try {
      const body = renderRoute(url);
      html = html.replace(
        '<div id="root"></div>',
        `<!-- Prerendered for ${url} by scripts/prerender.mjs -->\n    <div id="root">${body}</div>`
      );
      full += 1;
    } catch (error) {
      console.warn(`prerender: [${url}] body render failed, writing head-only fallback: ${error?.message ?? error}`);
      headOnly += 1;
    }
    const outPath = routeToFile(url);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, "utf8");
  }

  console.log(`prerender: wrote ${routes.length} files (${full} full HTML, ${headOnly} head-only fallback)`);
}

const invokedAsScript =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  await main();
}
