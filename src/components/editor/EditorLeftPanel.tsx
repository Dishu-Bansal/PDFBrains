import { BookmarkSimple, Files } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import type { OutlineEntry } from "./types";

interface EditorLeftPanelProps {
  doc: PDFDocumentProxy;
  pageCount: number;
  outline: OutlineEntry[];
  tab: "pages" | "bookmarks";
  onTabChange: (tab: "pages" | "bookmarks") => void;
  activePage: number;
  onJumpToPage: (pageIndex: number) => void;
}

/**
 * Left panel of the editor workspace: page thumbnails for quick scrolling and
 * the document outline (bookmarks/sections/chapters) when present.
 */
export function EditorLeftPanel({
  doc,
  pageCount,
  outline,
  tab,
  onTabChange,
  activePage,
  onJumpToPage,
}: EditorLeftPanelProps) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-paper">
      <div className="flex shrink-0 border-b border-line">
        <TabButton
          active={tab === "pages"}
          onClick={() => onTabChange("pages")}
          icon={<Files size={15} weight="regular" />}
          label="Pages"
        />
        <TabButton
          active={tab === "bookmarks"}
          onClick={() => onTabChange("bookmarks")}
          icon={<BookmarkSimple size={15} weight="regular" />}
          label="Bookmarks"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "pages" ? (
          <div className="space-y-3">
            {Array.from({ length: pageCount }, (_, pageIndex) => (
              <button
                key={pageIndex}
                type="button"
                onClick={() => onJumpToPage(pageIndex)}
                className={[
                  "group w-full rounded-xl border p-2 text-left transition",
                  pageIndex === activePage
                    ? "border-accent bg-accentsoft/60"
                    : "border-line bg-surface hover:border-accent/60",
                ].join(" ")}
              >
                <MiniPage doc={doc} pageNumber={pageIndex + 1} width={208} />
                <span className="mt-1.5 block px-0.5 font-mono text-[11px] text-muted group-hover:text-ink">
                  Page {pageIndex + 1}
                </span>
              </button>
            ))}
          </div>
        ) : outline.length > 0 ? (
          <nav aria-label="Bookmarks">
            <ul className="space-y-0.5">
              {outline.map((entry, index) => (
                <li key={`${entry.title}-${index}`}>
                  <button
                    type="button"
                    onClick={() => onJumpToPage(entry.pageIndex)}
                    className={[
                      "w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[13px] transition hover:bg-raised",
                      entry.pageIndex === activePage ? "text-accentstrong" : "text-ink",
                    ].join(" ")}
                    style={{ paddingLeft: `${10 + entry.depth * 14}px` }}
                    title={entry.title}
                  >
                    {entry.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : (
          <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-muted">
            No bookmarks in this PDF.
          </p>
        )}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-[12px] font-medium transition",
        active
          ? "border-accent text-ink"
          : "border-transparent text-muted hover:text-ink",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

/** Renders one page at a small width for the thumbnail list. */
function MiniPage({
  doc,
  pageNumber,
  width,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const vp1 = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / vp1.width });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        task = page.render({ canvasContext: ctx, viewport });
        await task.promise;
      } catch {
        /* leave the thumbnail blank */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, width]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-md border border-line/70 bg-white"
      aria-hidden="true"
    />
  );
}
