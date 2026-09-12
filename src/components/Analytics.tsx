import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { initAnalytics, trackPageView } from "../lib/analytics";

/**
 * Boots Google Analytics once and reports every SPA navigation as a
 * page_view. Renders nothing. Effects never run during SSR prerendering,
 * so crawlers never trigger tracking calls.
 *
 * The initial load is reported by initAnalytics' own config call; this
 * component only reports subsequent route changes (first run skipped).
 */
export function Analytics() {
  const { pathname, search } = useLocation();
  const firstRun = useRef(true);

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    trackPageView(pathname + search);
  }, [pathname, search]);

  return null;
}
