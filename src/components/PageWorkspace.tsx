import { ArrowClockwise, Check, Scissors, X } from "@phosphor-icons/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Fragment, useState } from "react";

import { PdfPageThumb } from "./PdfPageThumb";
import type { RotationDeg } from "../lib/process";

export type PageMode = "select" | "rotate" | "preview" | "split";

interface PageWorkspaceProps {
  file: File;
  doc: PDFDocumentProxy | null;
  pageCount: number;
  loading: boolean;
  error: string | null;
  mode: PageMode;
  selected: Set<number>;
  onSelectedChange: (selected: Set<number>) => void;
  rotations: Record<number, RotationDeg>;
  onRotationsChange: (rotations: Record<number, RotationDeg>) => void;
  /** Maps each page to its output file index (0-based) or null if excluded. */
  groupOf?: (pageNumber: number) => number | null;
  /** Split mode: pages after which a cut is active. */
  cuts?: Set<number>;
  /** Called with the next cut set (toggle or clear). */
  onToggleCut?: (next: Set<number>) => void;
  /** "delete" shows a translucent veil + red cross over selected pages. */
  selectStyle?: "normal" | "delete";
}

const MODE_HINTS: Record<PageMode, string> = {
  select: "Click a page to select it",
  rotate: "Rotate pages a quarter turn each",
  preview: "Preview only",
  split: "Tap the scissors to mark where a new file starts",
};

/** Functional marker palette for output-file grouping (split/range preview). */
const GROUP_COLORS = [
  "#c13e1a", // vermilion
  "#0f6b7c", // teal
  "#4a56c9", // indigo
  "#7a3fb5", // violet
  "#2f7d4f", // green
  "#a06a10", // amber
];

/**
 * Page-level workspace: every page of one PDF as a thumbnail with its page
 * number, plus the PDF name in the header. Modes: select, rotate (per-page
 * rotation), split (scissors cut points), preview.
 */
export function PageWorkspace({
  file,
  doc,
  pageCount,
  loading,
  error,
  mode,
  selected,
  onSelectedChange,
  rotations,
  onRotationsChange,
  groupOf,
  cuts,
  onToggleCut,
  selectStyle = "normal",
}: PageWorkspaceProps) {
  const [cutHover, setCutHover] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="mt-8" aria-busy="true">
        <p className="text-[14px] text-muted">Reading pages...</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-raised" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <p className="text-[15px] font-medium">Could not open this file</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
          {error ?? "The file is not readable as a PDF."} Remove it and drop a valid PDF instead.
        </p>
      </div>
    );
  }

  const toggle = (page: number) => {
    const next = new Set(selected);
    if (next.has(page)) next.delete(page);
    else next.add(page);
    onSelectedChange(next);
  };

  const toggleCut = (page: number) => {
    if (!cuts || !onToggleCut) return;
    const next = new Set(cuts);
    if (next.has(page)) next.delete(page);
    else next.add(page);
    onToggleCut(next);
  };

  const cycleRotation = (page: number) => {
    const current = rotations[page] ?? 0;
    const nextDeg = ((current + 90) % 360) as RotationDeg;
    const next = { ...rotations };
    if (nextDeg === 0) delete next[page];
    else next[page] = nextDeg;
    onRotationsChange(next);
  };

  const selectedCount = selected.size;
  const rotatedCount = Object.keys(rotations).length;

  const meta = (() => {
    const base = `${pageCount} page${pageCount === 1 ? "" : "s"}`;
    if (mode === "select") return `${base} · ${selectedCount} selected`;
    if (mode === "rotate") return `${base} · ${rotatedCount} rotated`;
    if (mode === "split") return `${base} · ${(cuts?.size ?? 0) + 1} file${(cuts?.size ?? 0) + 1 === 1 ? "" : "s"}`;
    return base;
  })();

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{file.name}</h2>
          <p className="mt-0.5 font-mono text-[11px] text-muted">{meta}</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[13px] text-muted">{MODE_HINTS[mode]}</p>
          {mode === "split" && (cuts?.size ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => onToggleCut?.(new Set())}
              className="text-[13px] font-medium text-accentstrong transition hover:opacity-80"
            >
              Clear splits
            </button>
          )}
        </div>
      </div>

      <div
        className={
          mode === "split"
            ? "mt-5 flex flex-wrap items-start gap-x-3 gap-y-6"
            : "mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        }
      >
        {pages.map((pageNumber) => {
          const isSelected = selected.has(pageNumber);

          const group = groupOf?.(pageNumber) ?? null;
          const groupColor = group !== null && mode !== "select"
            ? GROUP_COLORS[group % GROUP_COLORS.length]
            : null;
          const dimmed = !!groupOf && group === null;
          const isCut = cuts?.has(pageNumber) ?? false;
          const isDelete = mode === "select" && selectStyle === "delete";

          return (
            <Fragment key={pageNumber}>
            <div className={mode === "split" ? "flex shrink-0 items-center gap-1.5" : "contents"}>
            <div
              role={mode === "select" ? "checkbox" : undefined}
              aria-checked={mode === "select" ? isSelected : undefined}
              aria-label={mode === "select" ? `Select page ${pageNumber}` : undefined}
              tabIndex={mode === "select" ? 0 : undefined}
              onKeyDown={
                mode === "select"
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggle(pageNumber);
                      }
                    }
                  : undefined
              }
              className={[
                "relative rounded-lg",
                mode === "split" ? "w-32 shrink-0 sm:w-36" : "",
                mode === "select" ? "cursor-pointer" : "",
                isSelected
                  ? isDelete
                    ? "ring-2 ring-danger ring-offset-2 ring-offset-paper"
                    : "ring-2 ring-accent ring-offset-2 ring-offset-paper"
                  : "",
                dimmed ? "opacity-55" : "",
              ].join(" ")}
              style={groupColor ? { outline: `2px solid ${groupColor}`, outlineOffset: "2px" } : undefined}
              onClick={mode === "select" ? () => toggle(pageNumber) : undefined}
            >
              <PdfPageThumb
                doc={doc}
                pageNumber={pageNumber}
                rotation={rotations[pageNumber] ?? 0}
                className="w-full"
              />

              <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-ink/80 px-1.5 py-0.5 font-mono text-[11px] text-paper">
                {pageNumber}
              </span>

              {groupColor && (
                <span
                  className="pointer-events-none absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10px] text-paper"
                  style={{ backgroundColor: groupColor }}
                >
                  {group! + 1}
                </span>
              )}

              {mode === "select" && (isDelete ? (
                <span
                  className={[
                    "absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full transition",
                    isSelected
                      ? "bg-danger text-paper"
                      : "border border-linestrong bg-paper/90 text-transparent",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  <X size={13} weight="bold" />
                </span>
              ) : (
                <span
                  className={[
                    "absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md border transition",
                    isSelected
                      ? "border-accent bg-accent text-paper"
                      : "border-linestrong bg-paper/90 text-transparent",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  <Check size={13} weight="bold" />
                </span>
              ))}

              {mode === "rotate" && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    cycleRotation(pageNumber);
                  }}
                  aria-label={`Rotate page ${pageNumber}`}
                  className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md border border-linestrong bg-paper/90 text-muted transition hover:border-accent hover:text-accent"
                >
                  <ArrowClockwise size={14} weight="bold" />
                </button>
              )}

              {mode === "rotate" && (rotations[pageNumber] ?? 0) !== 0 && (
                <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-accent px-1.5 py-0.5 font-mono text-[11px] text-paper">
                  {rotations[pageNumber]}°
                </span>
              )}

              {isDelete && isSelected && (
                <>
                  <span
                    className="pointer-events-none absolute inset-0 bg-paper/65"
                    aria-hidden="true"
                  />
                  <span
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    aria-hidden="true"
                  >
                    <span className="flex size-9 items-center justify-center rounded-full bg-danger text-paper shadow-lg">
                      <X size={20} weight="bold" />
                    </span>
                  </span>
                </>
              )}
            </div>

            {mode === "split" && pageNumber < pageCount && (
              <button
                type="button"
                onClick={() => toggleCut(pageNumber)}
                onMouseEnter={() => setCutHover(pageNumber)}
                onMouseLeave={() => setCutHover(null)}
                aria-pressed={isCut}
                aria-label={
                  isCut ? `Remove split after page ${pageNumber}` : `Split after page ${pageNumber}`
                }
                title="Split point"
                className="flex w-5 shrink-0 flex-col items-center gap-2 py-2 transition active:scale-95"
              >
                <span
                  className={[
                    "h-12 w-0 border-l-2 border-dotted transition",
                    isCut || cutHover === pageNumber
                      ? "border-accent"
                      : "border-linestrong",
                  ].join(" ")}
                />
                <Scissors
                  size={16}
                  weight="bold"
                  className={isCut || cutHover === pageNumber ? "text-accent" : "text-muted"}
                />
                <span
                  className={[
                    "h-12 w-0 border-l-2 border-dotted transition",
                    isCut || cutHover === pageNumber
                      ? "border-accent"
                      : "border-linestrong",
                  ].join(" ")}
                />
              </button>
            )}
            </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
