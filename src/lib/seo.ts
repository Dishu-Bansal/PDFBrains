import { getTool } from "../data/tools";
import type { Tool } from "../data/tools";

/** Canonical production origin. Keep in sync with robots.txt + sitemap.xml. */
export const SITE_URL = "https://pdfbrains.com";
export const SITE_NAME = "PDFBrains";

export const DEFAULT_TITLE = "PDFBrains - PDF tools, plain and simple";
export const DEFAULT_DESCRIPTION =
  "Merge, split, compress and convert PDFs in seconds. No installs, no sign-up, no waiting. PDFBrains is the PDF toolbox for people who want the job done.";

export interface SeoMeta {
  title: string;
  description: string;
  canonical: string;
  /** e.g. "noindex, nofollow". Omit for indexable pages. */
  robots?: string;
}

export function canonicalFor(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${clean === "/" ? "/" : clean}`;
}

export const HOME_SEO: SeoMeta = {
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  canonical: canonicalFor("/"),
};

export const AI_ASSIST_SEO: SeoMeta = {
  title: "AI Assist - Plan PDF jobs in plain words | PDFBrains",
  description:
    "Tell AI Assist what to do with a PDF - split, merge, compress, convert - and it plans the steps you approve and run. It never reads your file contents.",
  canonical: canonicalFor("/ai-assist"),
};

export const NOT_FOUND_SEO: SeoMeta = {
  title: "Page not found | PDFBrains",
  description: "This page does not exist. Browse the free PDF tools instead.",
  canonical: canonicalFor("/"),
  robots: "noindex, nofollow",
};

/**
 * Keyword-rich but honest per-tool metadata. Title leads with the task
 * ("Merge PDF") since that is what people search for; description reuses
 * the tool tagline so it never drifts from what the page actually does.
 */
export function toolSeo(tool: Tool): SeoMeta {
  return {
    title: `${tool.name} - Free online, no sign-up | ${SITE_NAME}`,
    description: `${tool.tagline} Free online ${tool.name.toLowerCase()} tool. No installs, no sign-up - files stay in your browser.`,
    canonical: canonicalFor(`/tools/${tool.slug}`),
  };
}

/** Upcoming placeholders stay reachable but out of the index. */
export function upcomingToolSeo(tool: Tool): SeoMeta {
  const meta = toolSeo(tool);
  return { ...meta, robots: "noindex, nofollow" };
}

/**
 * The document title a path will end up with, derived from the same metadata
 * <Seo/> renders. Analytics reports this instead of reading document.title,
 * which lags a route change by one navigation (Seo's effect runs after the
 * analytics effect).
 */
export function titleForPath(pathname: string): string {
  if (pathname === "/") return HOME_SEO.title;
  if (pathname === "/ai-assist") return AI_ASSIST_SEO.title;
  const toolMatch = pathname.match(/^\/tools\/([a-z0-9-]+)/);
  if (toolMatch) {
    const tool = getTool(toolMatch[1]);
    if (tool) return toolSeo(tool).title;
  }
  return NOT_FOUND_SEO.title;
}
