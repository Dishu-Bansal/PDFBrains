/**
 * Google Analytics (gtag.js) wiring for the SPA.
 *
 * Pasting the Google tag into index.html only measures the first page load:
 * client-side route changes never reload the page, so every /tools/:slug
 * visit would otherwise be invisible. Instead this module loads gtag once at
 * boot (only when VITE_GA_MEASUREMENT_ID is set) and the <Analytics/>
 * component reports every route change as a page_view.
 *
 * Nothing is requested or sent when the ID is missing (e.g. local dev), and
 * tracking only ever reports page paths — never file contents.
 */

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

/**
 * Injects gtag.js and prepares tracking. Safe to call repeatedly and safe
 * to import during SSR (Node): it no-ops without a window.
 */
export function initAnalytics(): void {
  if (typeof window === "undefined") return;
  if (!GA_ID) {
    // Visible in devtools (Verbose level): the common reason for "tag never
    // fires" is a production build without VITE_GA_MEASUREMENT_ID set.
    console.debug("[analytics] disabled: VITE_GA_MEASUREMENT_ID is not set.");
    return;
  }
  if (initialized) return;
  initialized = true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => {
    window.dataLayer!.push(args);
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  // Page views are sent explicitly per route (see trackPageView) so the
  // initial load is not double-counted.
  window.gtag("config", GA_ID, { send_page_view: false });
}

/** Reports an SPA route change as a page_view. No-op when disabled. */
export function trackPageView(path: string): void {
  if (!initialized || typeof window === "undefined" || !GA_ID || !window.gtag) return;
  window.gtag("config", GA_ID, { page_path: path });
}

/** Whether an ID is configured (tracking boots on top of it). */
export function isAnalyticsEnabled(): boolean {
  return typeof window !== "undefined" && !!GA_ID;
}
