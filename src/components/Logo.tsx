import { Link } from "react-router-dom";

/**
 * PDFBrains wordmark. The mark is a page with a folded corner - the accent
 * triangle doubles as a "stamp". It inverts with the theme via tokens.
 */
export function Logo() {
  return (
    <Link to="/" className="group inline-flex items-center gap-2.5" aria-label="PDFBrains home">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <rect x="2" y="2" width="28" height="28" rx="8" className="fill-(--ink)" />
        <path d="M10.5 8.5h8.2l4.8 4.8V23.5h-13z" className="fill-(--paper)" />
        <path d="M18.7 8.5l4.8 4.8h-4.8z" className="fill-(--accent)" />
      </svg>
      <span className="text-[19px] tracking-tight">
        <span className="font-bold">PDF</span>
        <span className="font-semibold">Brains</span>
      </span>
    </Link>
  );
}
