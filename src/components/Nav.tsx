import { CaretDown, List, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { CATEGORIES, getTool, toolsByCategory } from "../data/tools";
import type { Category } from "../data/tools";

const QUICK_SLUGS = ["merge-pdf", "split-pdf", "compress-pdf"];

const CONVERT_GROUPS: Category[] = ["Convert to PDF", "Convert from PDF"];

type OpenMenu = "convert" | "all" | null;

function DropdownLink({ to, onNavigate, children }: { to: string; onNavigate: () => void; children: ReactNode }) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="block rounded-lg px-2.5 py-1.5 text-[13px] text-muted transition hover:bg-paper hover:text-ink"
    >
      {children}
    </Link>
  );
}

export function Nav() {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const location = useLocation();

  const closeMenus = () => {
    setOpenMenu(null);
    setMobileOpen(false);
  };

  // Close dropdowns on outside click, Escape, or navigation.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [location.pathname, location.hash]);

  const quickTools = QUICK_SLUGS.map((slug) => getTool(slug)!).filter(Boolean);

  const dropdownButton = (menu: Exclude<OpenMenu, null>, label: string) => (
    <button
      type="button"
      aria-expanded={openMenu === menu}
      aria-haspopup="menu"
      onClick={() => setOpenMenu(openMenu === menu ? null : menu)}
      className={[
        "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition",
        openMenu === menu ? "bg-raised text-ink" : "text-muted hover:bg-raised hover:text-ink",
      ].join(" ")}
    >
      {label}
      <CaretDown
        size={13}
        weight="bold"
        className={`transition-transform ${openMenu === menu ? "rotate-180" : ""}`}
      />
    </button>
  );

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Logo />
          <div className="hidden items-center gap-1.5 lg:flex">
            {quickTools.map((tool) => (
              <Link
                key={tool.slug}
                to={`/tools/${tool.slug}`}
                className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-4 text-[14px] font-medium text-ink transition hover:border-linestrong active:scale-[0.97]"
              >
                {tool.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="hidden items-center gap-1 lg:flex">
          <div className="relative">
            {dropdownButton("convert", "Convert")}
            {openMenu === "convert" && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 grid w-[480px] grid-cols-2 gap-2 rounded-2xl border border-line bg-surface p-4 shadow-xl shadow-ink/5"
              >
                {CONVERT_GROUPS.map((category) => (
                  <div key={category}>
                    <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wide text-muted">
                      {category}
                    </p>
                    {toolsByCategory(category).map((tool) => (
                      <DropdownLink key={tool.slug} to={`/tools/${tool.slug}`} onNavigate={closeMenus}>
                        {tool.name}
                      </DropdownLink>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            {dropdownButton("all", "All tools")}
            {openMenu === "all" && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 grid w-[720px] grid-cols-3 gap-x-4 gap-y-5 rounded-2xl border border-line bg-surface p-5 shadow-xl shadow-ink/5"
              >
                {CATEGORIES.map((category) => (
                  <div key={category}>
                    <p className="border-b border-line pb-1.5 text-[11px] font-semibold tracking-wide text-muted">
                      {category}
                    </p>
                    <div className="mt-1.5">
                      {toolsByCategory(category).map((tool) => (
                        <DropdownLink key={tool.slug} to={`/tools/${tool.slug}`} onNavigate={closeMenus}>
                          {tool.name}
                        </DropdownLink>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ThemeToggle />
        </div>

        <div className="flex items-center gap-1.5 lg:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X size={22} /> : <List size={22} />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line bg-paper lg:hidden">
          <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
            <div className="flex flex-wrap gap-2">
              {quickTools.map((tool) => (
                <Link
                  key={tool.slug}
                  to={`/tools/${tool.slug}`}
                  onClick={closeMenus}
                  className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-4 text-[14px] font-medium text-ink"
                >
                  {tool.name}
                </Link>
              ))}
            </div>

            {CATEGORIES.map((category) => (
              <div key={category} className="mt-5">
                <p className="text-[11px] font-semibold tracking-wide text-muted">{category}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {toolsByCategory(category).map((tool) => (
                    <Link
                      key={tool.slug}
                      to={`/tools/${tool.slug}`}
                      onClick={closeMenus}
                      className="rounded-full bg-raised px-3 py-1.5 text-[13px] text-ink transition hover:text-accent"
                    >
                      {tool.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
