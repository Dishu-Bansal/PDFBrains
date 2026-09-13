import { ChatCircleText } from "@phosphor-icons/react";

import { isFeedbackEnabled, requestFeedback } from "../lib/feedback";

/** Floating entry point, visible on every page once configured. */
export function FeedbackButton() {
  if (!isFeedbackEnabled()) return null;
  return (
    <button
      type="button"
      onClick={() => requestFeedback("feature")}
      aria-label="Share feedback"
      className="fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-paper shadow-lg shadow-ink/20 transition hover:opacity-90 active:scale-[0.97]"
    >
      <ChatCircleText size={19} weight="regular" />
      Feedback
    </button>
  );
}
