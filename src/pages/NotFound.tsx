import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import { Footer } from "../components/Footer";
import { Nav } from "../components/Nav";
import { Seo } from "../components/Seo";
import { trackEvent } from "../lib/analytics";
import { NOT_FOUND_SEO } from "../lib/seo";

export function NotFound() {
  const { pathname } = useLocation();

  // Reported after hydration, never during render: this page is prerendered.
  useEffect(() => {
    trackEvent("not_found", { path: pathname });
  }, [pathname]);

  return (
    <>
      <Seo {...NOT_FOUND_SEO} />
      <Nav />
      <main className="mx-auto flex min-h-[60dvh] max-w-[1400px] flex-col items-start justify-center px-4 py-24 sm:px-6 lg:px-8">
        <p className="font-mono text-[13px] text-accent">404</p>
        <h1 className="mt-4 max-w-[16ch] text-4xl font-semibold tracking-tight sm:text-5xl">
          This page folded itself away.
        </h1>
        <p className="mt-4 max-w-[44ch] text-[16px] leading-relaxed text-muted">
          The address does not exist, or the page moved. Your tools are still right where you left
          them.
        </p>
        <Link
          to="/#tools"
          className="mt-9 inline-flex h-12 items-center rounded-full bg-ink px-7 text-[16px] font-medium text-paper transition hover:opacity-90 active:scale-[0.97]"
        >
          Back to the tools
        </Link>
      </main>
      <Footer />
    </>
  );
}
