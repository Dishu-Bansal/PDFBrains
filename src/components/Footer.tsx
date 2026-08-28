import { Link } from "react-router-dom";

import { Logo } from "./Logo";
import { getTool } from "../data/tools";

const POPULAR_SLUGS = [
  "merge-pdf",
  "split-pdf",
  "compress-pdf",
  "pdf-to-word",
  "word-to-pdf",
  "jpg-to-pdf",
  "pdf-to-jpg",
  "remove-pages",
];

export function Footer() {
  const popular = POPULAR_SLUGS.map((slug) => getTool(slug)!).filter(Boolean);

  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-[30ch] text-[15px] leading-relaxed text-muted">
              PDF tools for people who want the job done. Nothing to install, nothing to sign up
              for, nothing to pay.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Popular tools</h3>
            <ul className="mt-3.5 space-y-2">
              {popular.map((tool) => (
                <li key={tool.slug}>
                  <Link
                    to={`/tools/${tool.slug}`}
                    className="text-[14px] text-muted transition hover:text-ink"
                  >
                    {tool.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Company</h3>
            <ul className="mt-3.5 space-y-2">
              <li>
                <Link to="/#tools" className="text-[14px] text-muted transition hover:text-ink">
                  All tools
                </Link>
              </li>
              <li>
                <a
                  href="mailto:hello@pdfbrains.app"
                  className="text-[14px] text-muted transition hover:text-ink"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted">© 2025 PDFBrains. All rights reserved.</p>
          <p className="text-[13px] text-muted">
            Files are handled only for the job at hand and are never stored longer than they need
            to be.
          </p>
        </div>
      </div>
    </footer>
  );
}
