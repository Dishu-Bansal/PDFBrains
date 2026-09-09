import { renderToString } from "react-dom/server";
import { Route, Routes, StaticRouter } from "react-router-dom";

import { getTool } from "./data/tools";
import { AI_ASSIST_SEO, HOME_SEO, NOT_FOUND_SEO, toolSeo, upcomingToolSeo } from "./lib/seo";
import type { SeoMeta } from "./lib/seo";
import { AiAssist } from "./pages/AiAssist";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { ToolPage } from "./pages/ToolPage";

/**
 * Server entry for build-time prerendering (see scripts/prerender.mjs).
 *
 * Mirrors src/App.tsx but with direct (non-lazy) page imports wrapped in a
 * StaticRouter: renderToString cannot resolve React.lazy, so the lazy
 * boundaries from the client router are not reused here. Keep the route
 * list in sync with App.tsx.
 *
 * Only this module's exports run in Node. Page components must stay
 * SSR-safe: browser APIs (document, window, navigator, localStorage) only
 * inside event handlers and useEffect, never during render. The single
 * exception so far (ThemeToggle's useState initializer) is guarded.
 */
export function getRouteMeta(url: string): SeoMeta {
  if (url === "/") return HOME_SEO;
  if (url === "/ai-assist") return AI_ASSIST_SEO;
  const toolMatch = url.match(/^\/tools\/([a-z0-9-]+)$/);
  if (toolMatch) {
    const tool = getTool(toolMatch[1]);
    if (tool) return tool.upcoming ? upcomingToolSeo(tool) : toolSeo(tool);
  }
  return NOT_FOUND_SEO;
}

export function renderRoute(url: string): string {
  return renderToString(
    <StaticRouter location={url}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ai-assist" element={<AiAssist />} />
        <Route path="/tools/:slug" element={<ToolPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </StaticRouter>
  );
}
