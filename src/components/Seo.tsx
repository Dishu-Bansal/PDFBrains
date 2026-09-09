import { useEffect } from "react";

import { SITE_NAME } from "../lib/seo";
import type { SeoMeta } from "../lib/seo";

function upsertMetaByName(name: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Client-side SEO for the SPA. Updates title, description, canonical and
 * OG/Twitter tags on every route render so JS-capable crawlers (Google)
 * see per-page metadata. Non-JS crawlers still get index.html, which is
 * why the static shell also carries default + canonical tags.
 *
 * Important: removes a stale robots meta when moving from a noindex page
 * (upcoming tools, 404) to an indexable one.
 */
export function Seo({ title, description, canonical, robots }: SeoMeta) {
  useEffect(() => {
    document.title = title;
    upsertMetaByName("description", description);
    upsertCanonical(canonical);

    if (robots) {
      upsertMetaByName("robots", robots);
    } else {
      document.head.querySelector('meta[name="robots"]')?.remove();
    }

    upsertMetaByProperty("og:title", title);
    upsertMetaByProperty("og:description", description);
    upsertMetaByProperty("og:url", canonical);
    upsertMetaByProperty("og:site_name", SITE_NAME);
    upsertMetaByProperty("og:type", "website");
    upsertMetaByName("twitter:card", "summary");
    upsertMetaByName("twitter:title", title);
    upsertMetaByName("twitter:description", description);
  }, [title, description, canonical, robots]);

  return null;
}
