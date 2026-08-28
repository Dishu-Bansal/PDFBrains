import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

interface PdfPageThumbProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  /** Clockwise rotation in degrees, mirrors what pdf-lib applies on export. */
  rotation?: number;
  /** Fill mode: crop to the wrapper box (row thumbnails). */
  fill?: boolean;
  /** Crop anchor in fill mode ("center" | "top"), keeps titles visible. */
  objectPosition?: string;
  /** Wrapper classes. In natural mode include width (e.g. `w-full`); in fill
      mode include fixed dimensions (e.g. `h-16 w-12`). */
  className?: string;
}

/**
 * Renders one page of a shared PDFDocumentProxy to a canvas thumbnail.
 * A fresh canvas is created per render so re-runs never collide with a
 * previous render on the same canvas (safe under StrictMode double-effects).
 */
export function PdfPageThumb({
  doc,
  pageNumber,
  rotation = 0,
  fill = false,
  objectPosition = "center",
  className = "",
}: PdfPageThumbProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [ratio, setRatio] = useState<string>("3 / 4");

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;

    setState("loading");

    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const vp1 = page.getViewport({ scale: 1, rotation });
        setRatio(`${vp1.width} / ${vp1.height}`);

        const box = boxRef.current;
        if (!box) return;

        const canvas = document.createElement("canvas");
        box.replaceChildren(canvas);

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(vp1.width * dpr));
        canvas.height = Math.max(1, Math.floor(vp1.height * dpr));

        canvas.style.width = "100%";
        canvas.style.height = fill ? "100%" : "auto";
        if (fill) {
          canvas.style.objectFit = "cover";
          canvas.style.objectPosition = objectPosition;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        task = page.render({ canvasContext: ctx, viewport: vp1 });
        await task.promise;
        if (!cancelled) setState("done");
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
      boxRef.current?.replaceChildren();
    };
  }, [doc, pageNumber, rotation, fill, objectPosition]);

  return (
    <div
      className={[
        "overflow-hidden rounded-lg bg-raised",
        // In fill mode the wrapper pins itself to the caller's sized box, so
        // it can never collapse to zero height.
        fill ? "absolute inset-0" : "relative",
        className,
      ].join(" ")}
      style={{ aspectRatio: fill ? undefined : ratio }}
    >
      <div ref={boxRef} className="absolute inset-0" aria-hidden="true" />
      {state === "loading" && <div className="absolute inset-0 animate-pulse bg-raised" />}
      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-1 text-center text-[10px] leading-tight text-muted">
          No preview
        </div>
      )}
    </div>
  );
}
