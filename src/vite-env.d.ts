/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PDFBRAINS_API_URL?: string;
  readonly VITE_PDFBRAINS_API_KEY?: string;
  readonly VITE_HTML_FETCH_PROXY?: string;
  /** Active LLM provider id, e.g. "deepseek". */
  readonly VITE_LLM_PROVIDER?: string;
  readonly VITE_DEEPSEEK_API_KEY?: string;
  readonly VITE_DEEPSEEK_BASE_URL?: string;
  readonly VITE_DEEPSEEK_MODEL?: string;
  /** GA4 measurement ID (G-XXXXXXXXXX). Unset disables analytics entirely. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
  /** "true" forces reporting from dev/local hosts, flagged with debug_mode. */
  readonly VITE_GA_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
