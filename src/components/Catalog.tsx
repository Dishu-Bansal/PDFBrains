import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Reveal } from "./Reveal";
import { UpcomingTag } from "./UpcomingTag";
import { CATEGORIES, CATEGORY_NOTES, toolsByCategory, TOOLS } from "../data/tools";
import { trackEvent } from "../lib/analytics";

/**
 * The toolbox: one panel, six drawers. A live filter narrows the rows,
 * so the catalog doubles as the first step of finding a tool.
 */
export function Catalog() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const searchTimer = useRef<number | null>(null);

  // Drop a pending report if the page unmounts mid-typing.
  useEffect(
    () => () => {
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    },
    []
  );

  const matches = (name: string, tagline: string, term: string) =>
    !term || name.toLowerCase().includes(term) || tagline.toLowerCase().includes(term);

  // Report a search once the user pauses, so one search is one event instead
  // of one event per keystroke. Only the term's length leaves the browser.
  const onQueryChange = (value: string) => {
    setQuery(value);
    const term = value.trim().toLowerCase();
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    if (!term) {
      trackEvent("catalog_clear", { surface: "catalog" });
      return;
    }
    searchTimer.current = window.setTimeout(() => {
      trackEvent("catalog_search", {
        term_length: value.trim().length,
        results: TOOLS.filter((tool) => matches(tool.name, tool.tagline, term)).length,
      });
    }, 600);
  };

  return (
    <section id="tools" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="max-w-[52ch]">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              All the tools, in one place.
            </h2>
            <p className="mt-3 text-[16px] leading-relaxed text-muted">
              Thirty tools across six categories. Pick one, drop a file, done.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="mt-10">
          <div className="overflow-hidden rounded-3xl border border-line bg-surface">
            <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">
                <span className="font-mono text-[13px] text-ink">{TOOLS.length}</span> tools
              </p>
              <label className="relative block sm:w-72">
                <span className="sr-only">Filter tools</span>
                <MagnifyingGlass
                  size={17}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="Filter tools..."
                  className="h-10 w-full rounded-xl border border-line bg-paper pl-10 pr-4 text-[14px] text-ink placeholder:text-muted transition focus:border-accent"
                />
              </label>
            </div>

            <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x lg:grid-cols-3">
              {CATEGORIES.map((category, index) => {
                const tools = toolsByCategory(category).filter((tool) =>
                  matches(tool.name, tool.tagline, q)
                );
                const empty = tools.length === 0;

                return (
                  <div
                    key={category}
                    className={`px-4 py-6 sm:px-5 ${index === 0 ? "bg-raised/60" : ""}`}
                  >
                    <div className="px-2">
                      <h3 className="text-[16px] font-semibold">{category}</h3>
                      <p className="mt-1 text-[13px] leading-snug text-muted">
                        {CATEGORY_NOTES[category]}
                      </p>
                    </div>

                    {empty ? (
                      <p className="px-2 pt-5 text-[14px] text-muted">
                        No tools match &quot;{query}&quot;.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-0.5">
                        {tools.map((tool) => (
                          <li key={tool.slug}>
                            {tool.upcoming ? (
                              <div
                                aria-disabled="true"
                                // Still not navigable: the click only measures demand for the tool.
                                onClick={() =>
                                  trackEvent("tool_blocked", {
                                    tool: tool.slug,
                                    reason: "upcoming",
                                    source: "catalog",
                                  })
                                }
                                className="flex cursor-not-allowed items-center gap-3 rounded-2xl border border-line/70 bg-raised/90 p-2.5 select-none"
                              >
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-paper text-muted/70">
                                  <tool.Icon size={19} weight="regular" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[15px] font-medium leading-tight text-muted/80">
                                    {tool.name}
                                  </span>
                                  <span className="block truncate text-[13px] leading-snug text-muted/60">
                                    {tool.tagline}
                                  </span>
                                </span>
                                <UpcomingTag />
                              </div>
                            ) : (
                              <Link
                                to={`/tools/${tool.slug}`}
                                onClick={() =>
                                  trackEvent("tool_open", { tool: tool.slug, source: "catalog" })
                                }
                                className="group flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-paper active:scale-[0.99]"
                              >
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accentsoft text-accent">
                                  <tool.Icon size={19} weight="regular" />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-[15px] font-medium leading-tight">
                                    {tool.name}
                                  </span>
                                  <span className="block truncate text-[13px] leading-snug text-muted">
                                    {tool.tagline}
                                  </span>
                                </span>
                                <ArrowRight
                                  size={16}
                                  weight="bold"
                                  className="ml-auto shrink-0 -translate-x-1 text-muted opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                                />
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
