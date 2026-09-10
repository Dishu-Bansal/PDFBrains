import { Link } from "react-router-dom";

/**
 * PDFBrains wordmark: logo mark plus text. The mark is the shared
 * pdfbrains-logo.ico asset (also the favicon) so the brand stays in sync.
 */
export function Logo() {
  return (
    <Link to="/" className="group inline-flex items-center gap-2.5" aria-label="PDFBrains home">
      <img
        src="/pdfbrains-logo.ico"
        width={30}
        height={30}
        alt=""
        aria-hidden="true"
        className="shrink-0"
      />
      <span className="text-[19px] tracking-tight">
        <span className="font-bold">PDF</span>
        <span className="font-semibold">Brains</span>
      </span>
    </Link>
  );
}
