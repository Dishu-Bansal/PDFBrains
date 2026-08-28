import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { ScrollToTop } from "./components/ScrollToTop";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";

// ToolPage pulls in pdf-lib and the workspace machinery; load it only when
// a tool route is actually visited.
const ToolPage = lazy(() =>
  import("./pages/ToolPage").then((module) => ({ default: module.ToolPage }))
);

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/tools/:slug"
          element={
            <Suspense
              fallback={
                <div className="flex min-h-[60dvh] items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
                </div>
              }
            >
              <ToolPage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
