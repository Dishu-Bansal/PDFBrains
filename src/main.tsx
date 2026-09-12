import "@fontsource-variable/outfit";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";

import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";

const container = document.getElementById("root")!;
const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Production HTML is prerendered per route (scripts/prerender.mjs): hydrate
// onto it so direct visits keep the SSR content. Dev / fallback shells have
// an empty mount point, so mount normally.
//
// Hydration is only attempted for routes whose whole tree is synchronously
// imported. /ai-assist and /tools/:slug are React.lazy() in App.tsx (kept
// out of the main bundle on purpose), so on first render the client would
// show the Suspense fallback instead of the prerendered page — a guaranteed
// hydration mismatch (React #418) that nukes the entire root (#423).
// Those routes render client-side instead; crawlers still get the static
// HTML, and no error is thrown. If you lazy-load another route in App.tsx,
// add its path here too.
function needsAsyncChunk(pathname: string): boolean {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return clean === "/ai-assist" || clean.startsWith("/tools/");
}

if (container.hasChildNodes() && !needsAsyncChunk(window.location.pathname)) {
  hydrateRoot(container, app);
} else {
  createRoot(container).render(app);
}
