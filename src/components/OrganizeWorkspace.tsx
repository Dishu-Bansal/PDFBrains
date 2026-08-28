import { Check } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";

import { PdfPageThumb } from "./PdfPageThumb";
import { usePdfDocuments } from "../lib/pdf";
import type { OrganizePlanEntry } from "../lib/process";

interface PageEntry {
  id: string;
  fileIndex: number;
  pageNumber: number;
}

/** Functional palette marking which source PDF each page belongs to. */
const FILE_COLORS = ["#c13e1a", "#0f6b7c", "#4a56c9", "#7a3fb5", "#2f7d4f", "#a06a10"];

interface OrganizeWorkspaceProps {
  files: File[];
  onPlanChange: (plan: OrganizePlanEntry[]) => void;
}

/**
 * Multi-file page organizer: every page of every PDF appears in one pool.
 * All pages start selected; click to drop a page from the final PDF, drag to
 * reorder. Each page is color-coded by its source file, with a legend above.
 */
export function OrganizeWorkspace({ files, onPlanChange }: OrganizeWorkspaceProps) {
  const docs = usePdfDocuments(files);
  const [pool, setPool] = useState<PageEntry[]>([]);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const readError = docs.some((d) => d.error);

  // Pages for files whose document is loaded. New/loading files are skipped
  // here and their pages get appended once the document arrives.
  const basePool = useMemo(() => {
    const entries: PageEntry[] = [];
    docs.forEach((state, fileIndex) => {
      if (!state.doc) return;
      const file = files[fileIndex];
      if (!file) return;
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      for (let page = 1; page <= state.pageCount; page++) {
        entries.push({ id: `${key}:${page}`, fileIndex, pageNumber: page });
      }
    });
    return entries;
  }, [docs, files]);

  // Merge-preserving rebuild: when files are added or removed, keep the
  // user's page order and selection for pages that still exist, and append
  // newly added pages at the end (all selected by default).
  useEffect(() => {
    if (files.length === 0) {
      setPool([]);
      setDeselected(new Set());
      return;
    }

    const byId = new Map(basePool.map((entry) => [entry.id, entry]));
    const validIds = new Set(basePool.map((entry) => entry.id));

    setPool((prevPool) => {
      const kept = prevPool
        .map((entry) => byId.get(entry.id))
        .filter((entry): entry is PageEntry => !!entry);
      const seen = new Set(kept.map((entry) => entry.id));
      const appended = basePool.filter((entry) => !seen.has(entry.id));
      if (kept.length === prevPool.length && appended.length === 0) return prevPool;
      return [...kept, ...appended];
    });

    setDeselected((prev) => {
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [basePool, files.length]);

  // Report the final page plan upward whenever the pool changes.
  useEffect(() => {
    onPlanChange(
      pool
        .filter((entry) => !deselected.has(entry.id))
        .map((entry) => ({ fileIndex: entry.fileIndex, pageNumber: entry.pageNumber }))
    );
  }, [pool, deselected, onPlanChange]);

  // Resolve pool entries against the current file set (handles index shifts
  // when files are removed, without ever rendering a stale page).
  const baseById = useMemo(
    () => new Map(basePool.map((entry) => [entry.id, entry])),
    [basePool]
  );

  if (files.length === 0) return null;

  const toggle = (id: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const move = (from: number, to: number) => {
    if (from === to) return;
    setPool((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>, to: number) => {
    event.preventDefault();
    if (dragIndex !== null) move(dragIndex, to);
    setDragIndex(null);
    setOverIndex(null);
  };

  const selectedCount = pool.length - deselected.size;

  // Final page numbers in the output PDF: 1-based rank among selected pages,
  // in pool order. Deselected pages get no number.
  const finalRanks = new Map<string, number>();
  {
    let rank = 0;
    for (const entry of pool) {
      if (!deselected.has(entry.id)) {
        rank += 1;
        finalRanks.set(entry.id, rank);
      }
    }
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">
          {pool.length} page{pool.length === 1 ? "" : "s"} across {files.length} file
          {files.length === 1 ? "" : "s"}
        </h2>
        <p className="text-[13px] text-muted">
          Drag to reorder · {selectedCount} of {pool.length} selected
        </p>
      </div>

      {readError && (
        <p className="mt-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] text-muted">
          One or more files could not be read as a PDF and was skipped.
        </p>
      )}

      {files.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Source files">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="inline-flex items-center gap-1.5 text-[12px] text-muted"
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: FILE_COLORS[index % FILE_COLORS.length] }}
                aria-hidden="true"
              />
              <span className="max-w-44 truncate">{file.name}</span>
            </span>
          ))}
        </div>
      )}

      {pool.length === 0 ? (
        docs.some((state) => state.loading) ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-raised" />
            ))}
          </div>
        ) : (
          <p className="mt-5 text-[14px] text-muted">No readable pages yet.</p>
        )
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {pool.map((entry, index) => {
            // Resolve the entry against the current file set; pages of a
            // removed file (or one still loading) are skipped safely.
            const current = baseById.get(entry.id);
            const doc = current ? docs[current.fileIndex]?.doc : undefined;
            if (!current || !doc) return null;

            const color = FILE_COLORS[current.fileIndex % FILE_COLORS.length];
            const sourceName = files[current.fileIndex]?.name ?? "";
            const isSelected = !deselected.has(entry.id);
            const isDragging = dragIndex === index;
            const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;

            return (
              <div
                key={entry.id}
                draggable
                onDragStart={(event) => {
                  setDragIndex(index);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (overIndex !== index) setOverIndex(index);
                }}
                onDrop={(event) => onDrop(event, index)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onClick={() => toggle(entry.id)}
                role="checkbox"
                aria-checked={isSelected}
                aria-label={`${entry.pageNumber} from ${sourceName}`}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle(entry.id);
                  }
                }}
                className={[
                  "relative cursor-pointer rounded-lg transition",
                  isSelected ? "" : "opacity-50",
                  isDragging ? "opacity-30" : "",
                  isOver ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : "",
                ].join(" ")}
              >
                <div
                  className="h-1.5 rounded-t-lg"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <PdfPageThumb
                  doc={doc}
                  pageNumber={current.pageNumber}
                  className="w-full rounded-t-none"
                />

                <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-ink/80 px-1.5 py-0.5 font-mono text-[11px] text-paper">
                  {entry.pageNumber}
                </span>

                {finalRanks.get(entry.id) !== undefined && (
                  <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-md bg-ink/75 px-1.5 py-0.5 font-mono text-[10px] text-paper">
                    #{finalRanks.get(entry.id)}
                  </span>
                )}

                <span
                  className={[
                    "pointer-events-none absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border transition",
                    isSelected
                      ? "border-accent bg-accent text-paper"
                      : "border-linestrong bg-paper/90 text-transparent",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  <Check size={13} weight="bold" />
                </span>

                <span
                  className="pointer-events-none absolute bottom-1.5 right-1.5 max-w-[70%] truncate rounded-md px-1.5 py-0.5 font-mono text-[10px] text-paper"
                  style={{ backgroundColor: color }}
                >
                  {sourceName.replace(/\.pdf$/i, "")}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
