import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { initAnalytics, trackPageView } from "../lib/analytics";
import { titleForPath } from "../lib/seo";

/**
 * Boots Google Analytics once and reports every SPA navigation as a
 * page_view. Renders nothing. Effects never run during SSR prerendering,
 * so crawlers never trigger tracking calls.
 *
 * The initial load is reported by initAnalytics' own config call; this
 * component only reports subsequent route changes (first run skipped).
 * The title comes from titleForPath rather than document.title: <Seo/>
 * updates the title in its own effect, which runs after this one, so reading
 * document.title here would report the previous page's title.
 */
export function Analytics() {
  const { pathname, search } = useLocation();
  const firstRun = useRef(true);
  const lastReported = useRef<string | null>(null);

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    const path = pathname + search;
    if (firstRun.current) {
      // The initial page_view comes from gtag's own config call.
      firstRun.current = false;
      lastReported.current = path;
      return;
    }
    // React StrictMode re-runs effects in development; never report the same
    // route twice in a row.
    if (lastReported.current === path) return;
    lastReported.current = path;
    trackPageView(path, titleForPath(pathname));
  }, [pathname, search]);

  return null;
}
