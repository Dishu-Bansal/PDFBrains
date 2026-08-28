import { FilePdf, UploadSimple, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";

const FORMAT_PILLS = ["PDF", "DOCX", "JPG", "PNG", "XLSX"];

interface DropzoneProps {
  files: File[];
  onFiles: (files: File[]) => void;
  variant?: "hero" | "full";
  accept?: string;
}

/**
 * The upload surface. Controlled: the parent owns the file list so the
 * workspace can reorder and process it. Frontend-only for now, the backend
 * hooks in here later, one tool at a time.
 */
export function Dropzone({ files, onFiles, variant = "full", accept }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const hero = variant === "hero";

  const acceptList = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptList(event.dataTransfer.files);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const remove = (index: number) => {
    onFiles(files.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        onClick={() => inputRef.current?.click()}
        onKeyDown={onKeyDown}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          "group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-raised text-center transition",
          hero ? "gap-3 px-6 py-12 sm:py-16" : "gap-3 px-6 py-16",
          dragging ? "border-accent bg-accentsoft" : "border-linestrong hover:border-accent",
        ].join(" ")}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-accentsoft text-accent transition group-hover:scale-105">
          <UploadSimple size={24} weight="regular" />
        </span>
        <span className="text-lg font-semibold tracking-tight">
          {dragging ? "Release to drop" : hero ? "Drop a file to start" : "Drop files here"}
        </span>
        <span className="max-w-[34ch] text-sm text-muted">
          {hero
            ? "or click to browse. Then pick a tool below."
            : "or click to browse from your device. Multiple files welcome."}
        </span>
        <span className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
          {FORMAT_PILLS.map((format) => (
            <span
              key={format}
              className="rounded-full border border-line bg-paper px-2.5 py-0.5 font-mono text-[11px] tracking-wide text-muted"
            >
              {format}
            </span>
          ))}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="sr-only"
          onChange={(event) => acceptList(event.target.files)}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Selected files">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
            >
              <FilePdf size={18} className="shrink-0 text-accent" weight="regular" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove ${file.name}`}
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-paper hover:text-ink"
              >
                <X size={14} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
