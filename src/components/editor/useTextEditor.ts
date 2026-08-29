import { useEffect, useRef, useState } from "react";

import {
  cacheTextEditorPdf,
  clearTextEditorCache,
  extractTextEditorJson,
} from "../../lib/api";
import type { TextEditorDocument } from "../../lib/api";

export interface TextEditorState {
  /** The extracted editable JSON document. */
  doc: TextEditorDocument | null;
  /** Server job id for incremental edits (null when the job cache is off). */
  jobId: string | null;
  error: string | null;
  loading: boolean;
}

/**
 * Loads the Stirling text-editor document for a file and keeps the server
 * cache alive for the incremental apply flow. Cleared when the file changes
 * or the caller unmounts.
 */
export function useTextEditor(file: File): TextEditorState {
  const [doc, setDoc] = useState<TextEditorDocument | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const jobRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setJobId(null);
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const json = await extractTextEditorJson(file);
        let cachedJob: string | null = null;
        try {
          cachedJob = await cacheTextEditorPdf(file);
        } catch {
          cachedJob = null; // fall back to the job-less render
        }
        if (cancelled) {
          if (cachedJob) clearTextEditorCache(cachedJob).catch(() => {});
          return;
        }
        jobRef.current = cachedJob;
        setDoc(json);
        setJobId(cachedJob);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the text editor.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (jobRef.current) {
        clearTextEditorCache(jobRef.current).catch(() => {});
        jobRef.current = null;
      }
    };
  }, [file]);

  return { doc, jobId, error, loading };
}
