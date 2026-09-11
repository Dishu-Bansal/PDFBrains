import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { initAnalytics, trackPageView } from "../lib/analytics";

/**
 * Boots Google Analytics once and reports every SPA navigation as a
 * page_view. Renders nothing. Effects never run during SSR prerendering,
 * so crawlers never trigger tracking calls.
 */
export function Analytics() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    trackPageView(pathname + search);
  }, [pathname, search]);

  return null;
}
