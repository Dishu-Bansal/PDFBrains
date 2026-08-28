import { ArrowLeft, ArrowRight, Plus, X } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";

import { PdfPageThumb } from "./PdfPageThumb";
import { usePdfDocument } from "../lib/pdf";
import { resolvePageDimensions } from "../lib/process";
import type { PageOrientation, PageSize } from "../lib/process";

export type StripSize = "compact" | "large";

/** Layout settings applied to image thumbnails (e.g. jpg-to-pdf options). */
export interface ImagePageLayout {
  pageSize: PageSize;
  orientation: PageOrientation;
  margin: number;
}

interface FileStripProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** Drag cards/chips to reorder (merge, jpg-to-pdf, converters). */
  reorderable?: boolean;
  /** Cards act as file tabs (page tools). */
  selectable?: boolean;
  activeIndex?: number;
  onActiveChange?: (index: number) => void;
  accept?: string;
  /** large = big thumbnail cards; compact = small chips (page tools). */
  size?: StripSize;
  /** When set, image thumbnails preview the output page layout. */
  pageLayout?: ImagePageLayout;
}

/**
 * Image thumbnail rendered as a mock output page: the image fitted onto a
 * page sheet that reflects page size, orientation and margins, redrawn in
 * real time when the options change.
 */
function ImagePageThumb({
  file,
  pageSize,
  orientation,
  margin,
}: {
  file: File;
  pageSize: PageSize;
  orientation: PageOrientation;
  margin: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const image = new Image();
    let active = true;

    const draw = (imageWidth: number, imageHeight: number) => {
      if (!active) return;
      const [pageWidth, pageHeight] = resolvePageDimensions(
        pageSize,
        orientation,
        imageWidth,
        imageHeight
      );
      const boxW = 360;
      const boxH = 480;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(boxW * dpr);
      canvas.height = Math.round(boxH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Backdrop behind the sheet.
      ctx.fillStyle = "rgba(128,128,128,0.18)";
      ctx.fillRect(0, 0, boxW, boxH);

      // Page sheet, letterboxed.
      const pageScale = Math.min(boxW / pageWidth, boxH / pageHeight);
      const pageW = pageWidth * pageScale;
      const pageH = pageHeight * pageScale;
      const ox = (boxW - pageW) / 2;
      const oy = (boxH - pageH) / 2;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(ox, oy, pageW, pageH);
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + 0.5, oy + 0.5, pageW - 1, pageH - 1);

      if (pageSize === "fit") {
        ctx.drawImage(image, ox, oy, pageW, pageH);
        return;
      }

      const m = Math.max(0, margin) * pageScale;
      const availW = Math.max(1, pageW - m * 2);
      const availH = Math.max(1, pageH - m * 2);
      const imgScale = Math.min(availW / imageWidth, availH / imageHeight);
      const drawW = imageWidth * imgScale;
      const drawH = imageHeight * imgScale;
      ctx.drawImage(image, ox + (pageW - drawW) / 2, oy + (pageH - drawH) / 2, drawW, drawH);
    };

    image.onload = () => draw(image.naturalWidth, image.naturalHeight);
    image.onerror = () => draw(400, 560);
    if (url) image.src = url;
    else draw(400, 560);

    return () => {
      active = false;
    };
  }, [url, pageSize, orientation, margin]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

/** Thumbnail for a strip item: PDFs render page 1 via pdf.js, images natively. */
function StripThumb({
  file,
  large,
  pageLayout,
}: {
  file: File;
  large: boolean;
  pageLayout?: ImagePageLayout | null;
}) {
  const isImage = file.type.startsWith("image/");
  const { doc, pageCount, loading } = usePdfDocument(isImage ? null : file);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, isImage]);

  const pagesLabel = doc ? `${pageCount} page${pageCount === 1 ? "" : "s"}` : null;

  return (
    <div
      className={[
        "relative overflow-hidden rounded-xl border border-line bg-raised",
        large ? "aspect-[3/4] w-full" : "h-14 w-10 shrink-0 rounded-md",
      ].join(" ")}
    >
      {isImage && url ? (
        pageLayout && large ? (
          <ImagePageThumb
            file={file}
            pageSize={pageLayout.pageSize}
            orientation={pageLayout.orientation}
            margin={pageLayout.margin}
          />
        ) : (
          <img src={url} alt="" className="h-full w-full object-cover" />
        )
      ) : doc ? (
        <PdfPageThumb
          doc={doc}
          pageNumber={1}
          fill
          objectPosition={large ? "top" : "center"}
          className="h-full w-full"
        />
      ) : (
        <div
          className={[
            "h-full w-full",
            loading ? "animate-pulse bg-raised" : "flex items-center justify-center",
          ].join(" ")}
        >
          {!loading && (
            <span className="px-0.5 text-center text-[9px] leading-tight text-muted">No preview</span>
          )}
        </div>
      )}
      {!isImage && pagesLabel && (
        <span
          className={[
            "pointer-events-none absolute bg-ink/70 font-mono text-paper",
            large
              ? "bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[10px]"
              : "inset-x-0 bottom-0 py-0.5 text-center text-[9px]",
          ].join(" ")}
        >
          {pagesLabel}
        </span>
      )}
    </div>
  );
}

/**
 * The file strip: one large thumbnail card (or small chip) per file in a
 * wrapping row/grid, with a "+" add item and drop-to-add support. Replaces
 * the big dropzone once files exist. On page tools chips double as tabs.
 */
export function FileStrip({
  files,
  onFilesChange,
  reorderable = false,
  selectable = false,
  activeIndex = 0,
  onActiveChange,
  accept,
  size = "large",
  pageLayout,
}: FileStripProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [addHover, setAddHover] = useState(false);

  if (files.length === 0) return null;

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...files];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onFilesChange(next);
  };

  const moveBy = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= files.length) return;
    move(index, to);
  };

  const remove = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFilesChange([...files, ...Array.from(list)]);
  };

  const onDrop = (event: DragEvent<HTMLLIElement>, to: number) => {
    event.preventDefault();
    if (dragIndex !== null) move(dragIndex, to);
    setDragIndex(null);
    setOverIndex(null);
  };

  const hint = reorderable && files.length > 1
    ? `Drag ${size === "large" ? "cards" : "chips"} to reorder, or use the arrows`
    : selectable
      ? "Click a file to work on it"
      : "";

  /** Touch-friendly and keyboard-accessible reorder control: left = earlier, right = later. */
  const moveButton = (file: File, index: number, delta: number, label: string, IconCmp: Icon) => (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        moveBy(index, delta);
      }}
      disabled={(index === 0 && delta < 0) || (index === files.length - 1 && delta > 0)}
      aria-label={`Move ${file.name} ${label}`}
      title={`Move ${label}`}
      className="flex size-7 items-center justify-center rounded-full border border-line bg-paper text-muted shadow-sm transition hover:border-linestrong hover:text-ink active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-30"
    >
      <IconCmp size={13} weight="bold" />
    </button>
  );

  const itemClass = (index: number) => {
    const active = selectable && index === activeIndex;
    return [
      "relative border bg-surface transition",
      size === "large"
        ? "rounded-2xl p-2.5"
        : "flex items-center gap-2.5 rounded-xl p-2",
      reorderable ? "cursor-grab active:cursor-grabbing" : "",
      selectable ? "cursor-pointer" : "",
      active ? "border-accent ring-2 ring-accentsoft" : "border-line hover:border-linestrong",
      dragIndex === index ? "opacity-40" : "",
      overIndex === index && dragIndex !== null && dragIndex !== index ? "border-accent" : "",
    ].join(" ");
  };

  const dragHandlers = (index: number) => ({
    draggable: reorderable,
    onDragStart: (event: DragEvent<HTMLLIElement>) => {
      setDragIndex(index);
      event.dataTransfer.effectAllowed = "move";
      // Mark this as an internal reorder so the container's drop-to-add
      // handler never treats a card drop as a new file upload (browsers can
      // put an <img> thumbnail's file into dataTransfer.files).
      event.dataTransfer.setData("application/x-foglio-reorder", String(index));
    },
    onDragOver: (event: DragEvent<HTMLLIElement>) => {
      if (!reorderable) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (overIndex !== index) setOverIndex(index);
    },
    onDrop: (event: DragEvent<HTMLLIElement>) => {
      if (reorderable) onDrop(event, index);
    },
    onDragEnd: () => {
      setDragIndex(null);
      setOverIndex(null);
    },
  });

  const removeButton = (file: File, index: number) => (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        remove(index);
      }}
      aria-label={`Remove ${file.name}`}
      className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm transition hover:text-ink"
    >
      <X size={11} weight="bold" />
    </button>
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-semibold">
          {files.length} file{files.length === 1 ? "" : "s"}
        </h2>
        {hint && <p className="text-[13px] text-muted">{hint}</p>}
      </div>

      <div
        className={[
          "mt-3 rounded-2xl transition",
          addHover ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : "",
        ].join(" ")}
        onDragOver={(event) => {
          event.preventDefault();
          if (dragIndex === null && Array.from(event.dataTransfer.types).includes("Files")) {
            setAddHover(true);
          }
        }}
        onDragLeave={() => setAddHover(false)}
        onDrop={(event) => {
          event.preventDefault();
          setAddHover(false);
          if (dragIndex === null && event.dataTransfer.files.length > 0) {
            addFiles(event.dataTransfer.files);
          }
        }}
      >
        {size === "large" ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {files.map((file, index) => {
              const key = `${file.name}-${file.size}-${file.lastModified}`;
              return (
                <li
                  key={key}
                  {...dragHandlers(index)}
                  onClick={selectable ? () => onActiveChange?.(index) : undefined}
                  className={itemClass(index)}
                >
                  <div className="relative">
                    <StripThumb file={file} large pageLayout={pageLayout} />
                    <span className="pointer-events-none absolute left-2 top-2 flex size-6 items-center justify-center rounded-md bg-ink/75 font-mono text-[11px] text-paper">
                      {index + 1}
                    </span>
                  </div>
                  <div className="mt-2.5 px-1">
                    <p className="truncate text-[13px] font-medium leading-tight">{file.name}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  {reorderable && files.length > 1 && (
                    <div className="mt-2.5 flex w-full items-center justify-between px-1">
                      {moveButton(file, index, -1, "earlier", ArrowLeft)}
                      {moveButton(file, index, 1, "later", ArrowRight)}
                    </div>
                  )}
                  {removeButton(file, index)}
                </li>
              );
            })}

            <li>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-linestrong bg-raised text-muted transition hover:border-accent hover:text-accent"
              >
                <Plus size={28} weight="bold" />
                <span className="text-[12px] font-medium">Add files</span>
              </button>
            </li>
          </ul>
        ) : (
          <ul className="flex flex-wrap items-stretch gap-2.5">
            {files.map((file, index) => {
              const key = `${file.name}-${file.size}-${file.lastModified}`;
              return (
                <li
                  key={key}
                  {...dragHandlers(index)}
                  onClick={selectable ? () => onActiveChange?.(index) : undefined}
                  className={itemClass(index)}
                >
                  <StripThumb file={file} large={false} pageLayout={pageLayout} />
                  <div className="min-w-0 pr-1">
                    <p className="max-w-[9.5rem] truncate text-[13px] font-medium leading-tight">
                      {file.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  {reorderable && files.length > 1 && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      {moveButton(file, index, -1, "earlier", ArrowLeft)}
                      {moveButton(file, index, 1, "later", ArrowRight)}
                    </div>
                  )}
                  {removeButton(file, index)}
                </li>
              );
            })}

            <li>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex h-full min-h-[76px] w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-linestrong bg-raised text-muted transition hover:border-accent hover:text-accent"
              >
                <Plus size={20} weight="bold" />
                <span className="text-[11px] font-medium">Add files</span>
              </button>
            </li>
          </ul>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="sr-only"
          onChange={(event) => addFiles(event.target.files)}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
