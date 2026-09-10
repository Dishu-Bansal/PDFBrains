import { Link } from "react-router-dom";

/**
 * PDFBrains wordmark: logo mark plus text. The mark is a lightweight PNG
 * exported from pdfbrains-logo.ico (the .ico stays on as favicon only, it
 * is too heavy at 270KB for a 30px header image).
 */
export function Logo() {
  return (
    <Link to="/" className="group inline-flex items-center gap-2.5" aria-label="PDFBrains home">
      <img
        src="/pdfbrains-logo-96.png"
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
