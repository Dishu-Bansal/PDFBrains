import { BugBeetle, CheckCircle, Lightbulb, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { getTool } from "../data/tools";
import { errorReason, trackEvent } from "../lib/analytics";
import { submitFeedback, subscribeFeedback } from "../lib/feedback";
import type { FeedbackContext, FeedbackType } from "../lib/feedback";

type Status = "idle" | "sending" | "sent" | "error";

function contextFor(pathname: string): FeedbackContext {
  const match = pathname.match(/^\/tools\/([a-z0-9-]+)/);
  const tool = match ? getTool(match[1]) : undefined;
  return {
    route: pathname,
    tool: tool ? tool.name : null,
    userAgent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
    viewport:
      typeof window === "undefined" ? "unknown" : `${window.innerWidth}x${window.innerHeight}`,
  };
}

/**
 * Mounted once in App. Opens the feedback dialog whenever any entry point
 * (floating button, nav, footer) calls requestFeedback(). Renders nothing
 * until opened, so SSR prerendering is unaffected.
 */
export function FeedbackRoot() {
  const { pathname } = useLocation();
  const [request, setRequest] = useState<{ type: FeedbackType; nonce: number } | null>(null);

  useEffect(
    () => subscribeFeedback((type) => setRequest((prev) => ({ type, nonce: (prev?.nonce ?? 0) + 1 }))),
    []
  );

  if (!request) return null;
  return (
    <FeedbackDialog
      key={request.nonce}
      initialType={request.type}
      route={pathname}
      onClose={() => setRequest(null)}
    />
  );
}

const PLACEHOLDERS: Record<FeedbackType, { title: string; details: string }> = {
  feature: {
    title: "e.g. Batch-convert a whole folder at once",
    details: "What should it do? Who is it for? Any examples of how it should work?",
  },
  bug: {
    title: "e.g. Merge fails on files over 50 MB",
    details: "What happened? What did you expect instead? Steps to reproduce, if any.",
  },
};

function FeedbackDialog({
  initialType,
  route,
  onClose,
}: {
  initialType: FeedbackType;
  route: string;
  onClose: () => void;
}) {
  const [type, setType] = useState<FeedbackType>(initialType);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    // "surface" is which form was opened (feature request vs bug report).
    trackEvent("feedback_open", { surface: initialType });
  }, [initialType]);

  const canSend = title.trim().length > 0 && details.trim().length > 0 && status !== "sending";

  const send = async () => {
    if (!canSend) return;
    setStatus("sending");
    setError("");
    // The form collects no rating, so the parameter stays empty.
    trackEvent("feedback_submit", { surface: type, rating: "" });
    try {
      await submitFeedback({
        type,
        title: title.trim(),
        details: details.trim(),
        email: email.trim(),
        context: contextFor(route),
      });
      setStatus("sent");
      trackEvent("feedback_success", { surface: type });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sending failed. Please try again.");
      setStatus("error");
      trackEvent("feedback_error", { surface: type, reason: errorReason(err) });
    }
  };

  const tab = (value: FeedbackType, label: string, Icon: typeof Lightbulb) => (
    <button
      key={value}
      type="button"
      onClick={() => setType(value)}
      aria-pressed={type === value}
      className={[
        "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[14px] font-medium transition",
        type === value ? "bg-ink text-paper" : "text-muted hover:bg-raised hover:text-ink",
      ].join(" ")}
    >
      <Icon size={15} weight="regular" />
      {label}
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={type === "bug" ? "Report a bug" : "Request a feature"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-line bg-paper p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {status === "sent" ? (
          <div className="flex flex-col items-center py-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accentsoft text-accent">
              <CheckCircle size={24} weight="regular" />
            </span>
            <h2 className="mt-4 text-xl font-semibold tracking-tight">Thanks — received.</h2>
            <p className="mt-1.5 max-w-[38ch] text-[14px] leading-relaxed text-muted">
              {type === "bug"
                ? "Your bug report is on its way. We reply if you left an email."
                : "Your feature request is on its way. We reply if you left an email."}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-7 text-[14px] font-medium text-paper transition hover:opacity-90 active:scale-[0.98]"
            >
              Back to the site
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Share feedback</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {contextFor(route).tool
                    ? `About ${contextFor(route).tool} — page and browser details are attached automatically.`
                    : "Page and browser details are attached automatically."}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close feedback dialog"
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 flex gap-1.5 rounded-full border border-line bg-surface p-1">
              {tab("feature", "Request a feature", Lightbulb)}
              {tab("bug", "Report a bug", BugBeetle)}
            </div>

            <label className="mt-4 block">
              <span className="text-[13px] font-medium">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                autoFocus
                placeholder={PLACEHOLDERS[type].title}
                className="mt-1.5 h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[14px] outline-none transition placeholder:text-muted/70 focus:border-accent"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-[13px] font-medium">Details</span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={5}
                placeholder={PLACEHOLDERS[type].details}
                className="mt-1.5 w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] leading-relaxed outline-none transition placeholder:text-muted/70 focus:border-accent"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-[13px] font-medium">
                Email <span className="font-normal text-muted">(optional, for follow-up)</span>
              </span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="mt-1.5 h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[14px] outline-none transition placeholder:text-muted/70 focus:border-accent"
              />
            </label>

            {status === "error" && (
              <p role="alert" className="mt-3 text-[13px] leading-relaxed text-danger">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-medium text-paper transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PaperPlaneTilt size={17} weight="regular" />
              {status === "sending" ? "Sending…" : type === "bug" ? "Send bug report" : "Send request"}
            </button>
            <p className="mt-3 text-center text-[12px] leading-relaxed text-muted">
              Sent via Web3Forms. Please don&apos;t include sensitive file contents —
              attachments aren&apos;t supported.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
