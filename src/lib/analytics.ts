/**
 * Google Analytics 4 event layer for the SPA.
 *
 * Pasting the Google tag into index.html only measures the first page load:
 * client-side route changes never reload the page, so every /tools/:slug
 * visit would otherwise be invisible. This module loads gtag once at boot
 * (only when VITE_GA_MEASUREMENT_ID is set) and exposes a typed event API
 * the whole app reports through.
 *
 * Rules this module enforces:
 * - Nothing is requested or sent without a measurement ID.
 * - Local traffic never reaches the property: dev builds and local/LAN
 *   hostnames are disabled unless VITE_GA_DEBUG=true forces them on (which
 *   also flags hits with debug_mode for GA DebugView).
 * - Only non-identifying data is ever sent: tool slugs, counts, sizes in MB,
 *   durations, error *categories*. Never file names, file contents, prompt
 *   text, or user-entered values (see `errorReason`).
 * - Every call is a no-op during SSR/prerender and when disabled, so
 *   callers need no guards.
 */

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
const GA_DEBUG = import.meta.env.VITE_GA_DEBUG === "true";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Where a tool page was opened from, so traffic sources are attributable. */
export type ToolOpenSource =
  | "nav_quick"
  | "nav_convert"
  | "nav_all"
  | "nav_mobile"
  | "footer"
  | "catalog"
  | "related"
  | "hero"
  | "ai_assist"
  | "direct"
  | "unknown";

/** How files entered a surface. */
export type FileInputMethod = "drop" | "picker" | "camera" | "sample" | "unknown";

/**
 * Every event the app may report. Values are GA4 event parameters; keep them
 * to strings/numbers and never include user data. Adding an event here is the
 * only way to report one — `trackEvent` is typed against this map.
 */
export interface AnalyticsEventMap {
  /* ---- discovery & navigation ---- */
  tool_open: { tool: string; source: ToolOpenSource };
  tool_blocked: { tool: string; reason: "upcoming"; source: ToolOpenSource };
  ai_assist_open: { source: ToolOpenSource };
  catalog_search: { term_length: number; results: number };
  catalog_clear: { surface: string };
  hero_cta: { label: string; destination: string };
  theme_change: { theme: string };
  not_found: { path: string };

  /* ---- files in a workspace ---- */
  files_added: { surface: string; count: number; total_mb: number; via: FileInputMethod };
  file_removed: { surface: string; remaining: number };
  files_cleared: { surface: string };
  sample_loaded: { surface: string };

  /* ---- a tool run on its own page ---- */
  tool_run_start: { tool: string; files: number; total_mb: number };
  tool_run_success: { tool: string; duration_ms: number; outputs: number; output_mb: number };
  tool_run_error: { tool: string; duration_ms: number; reason: string };
  tool_option_change: { tool: string; option: string; value: string };

  /* ---- AI Assist ---- */
  ai_message_sent: { mode: "chat" | "planner"; files: number; prompt_chars: number };
  ai_suggestion_click: { surface: string };
  ai_chat_cleared: { messages: number; files: number };
  ai_plan_created: { steps: number; tools: string; files: number };
  ai_plan_discarded: { steps: number };
  ai_plan_run_start: { steps: number; tools: string };
  ai_plan_step_start: { step: number; total_steps: number; tool: string };
  ai_plan_run_success: { steps: number; duration_ms: number; output_mb: number };
  ai_plan_run_error: {
    steps: number;
    step: number;
    tool: string;
    duration_ms: number;
    reason: string;
  };
  ai_result_downloaded: { steps: number; output_mb: number };
  ai_error: { stage: "plan" | "chat"; reason: string };

  /* ---- feedback ---- */
  feedback_open: { surface: string };
  feedback_submit: { surface: string; rating: string };
  feedback_success: { surface: string };
  feedback_error: { surface: string; reason: string };
}

/** Hosts that must never report into the production property. */
const LOCAL_HOST =
  /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|\[::1\]|::1)$|\.local$|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./;

let initialized = false;
let active = false;

/** Whether this page load is allowed to report. */
function shouldTrack(): boolean {
  if (!GA_ID) return false;
  if (GA_DEBUG) return true;
  if (import.meta.env.DEV) return false;
  if (typeof window !== "undefined" && LOCAL_HOST.test(window.location.hostname)) return false;
  return true;
}

/**
 * Injects gtag.js and prepares tracking. Safe to call repeatedly and safe
 * to import during SSR (Node): it no-ops without a window.
 *
 * Mirrors Google's official snippet exactly (arguments-object stub, plain
 * initial config that sends the first page_view itself): any deviation here
 * risks commands queueing in the data layer without ever becoming hits.
 */
export function initAnalytics(): void {
  if (typeof window === "undefined") return;
  if (initialized) return;

  if (!GA_ID) {
    // Visible in devtools (Verbose level): the common reason for "tag never
    // fires" is a production build without VITE_GA_MEASUREMENT_ID set.
    console.debug("[analytics] disabled: VITE_GA_MEASUREMENT_ID is not set.");
    return;
  }
  if (!shouldTrack()) {
    console.debug(
      `[analytics] disabled on ${window.location.hostname} (dev build or local host). ` +
        "Set VITE_GA_DEBUG=true to force reporting, or leave local traffic out of the property."
    );
    return;
  }

  initialized = true;
  active = true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function () {
    window.dataLayer!.push(arguments);
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  // Plain config: the library sends the initial page_view itself.
  // Route *changes* are reported via trackPageView (page_view events),
  // so nothing is double-counted.
  window.gtag("config", GA_ID, GA_DEBUG ? { debug_mode: true } : {});
}

/**
 * Reports an SPA route change as a page_view. The title is passed in rather
 * than read from document.title: <Seo/> updates the title in its own effect,
 * which runs after the analytics effect and would otherwise report the
 * previous page's title.
 */
export function trackPageView(path: string, title: string): void {
  if (!active || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: title,
  });
}

/** Reports one typed event. No-op when disabled or during SSR. */
export function trackEvent<K extends keyof AnalyticsEventMap>(
  name: K,
  params: AnalyticsEventMap[K]
): void {
  if (!active || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, GA_DEBUG ? { ...params, debug_mode: true } : { ...params });
}

/**
 * Buckets an error into a short, non-identifying category. Raw messages can
 * embed file names or model output, so they never leave the browser.
 */
export function errorReason(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error ?? "")) || "";
  if (/not configured|api key/i.test(message)) return "not_configured";
  if (/could not reach|failed to fetch|network/i.test(message)) return "network";
  if (/too large|413/.test(message)) return "file_too_large";
  if (/password/i.test(message)) return "password";
  if (/rate limit|429/i.test(message)) return "rate_limited";
  if (/timed? out|timeout/i.test(message)) return "timeout";
  if (/plan|could not be read/i.test(message)) return "invalid_plan";
  const status = message.match(/\b([45]\d{2})\b/)?.[1];
  if (status) return `http_${status}`;
  return "unknown";
}

/** Rounds a byte count to MB with two decimals, for event parameters. */
export function megabytes(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

/** Timer helper: call once, then invoke the returned function for milliseconds. */
export function startTimer(): () => number {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  return () => Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - started
  );
}
