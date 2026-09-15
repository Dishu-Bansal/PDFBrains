/**
 * One-shot handoff for files dropped on the home hero: the hero stashes
 * them here and navigates to /ai-assist, which drains them on mount.
 * In-memory only (File objects cannot travel in URLs); a reload simply
 * means the user drops or attaches files again.
 */
import type { FileInputMethod } from "./analytics";

export interface AiHandoff {
  files: File[];
  /** How the files arrived on the hero (drop vs browse), for analytics. */
  via: FileInputMethod;
}

let pending: AiHandoff | null = null;

export function stashAiFiles(files: File[], via: FileInputMethod = "unknown"): void {
  pending = files.length > 0 ? { files, via } : null;
}

/** Returns the stashed files and how they arrived, clearing the stash. */
export function takeAiFiles(): AiHandoff | null {
  const handoff = pending;
  pending = null;
  return handoff;
}
