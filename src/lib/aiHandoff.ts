/**
 * One-shot handoff for files dropped on the home hero: the hero stashes
 * them here and navigates to /ai-assist, which drains them on mount.
 * In-memory only (File objects cannot travel in URLs); a reload simply
 * means the user drops or attaches files again.
 */
let pending: File[] = [];

export function stashAiFiles(files: File[]): void {
  pending = files;
}

export function takeAiFiles(): File[] {
  const files = pending;
  pending = [];
  return files;
}
