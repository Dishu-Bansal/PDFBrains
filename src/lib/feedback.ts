/**
 * In-app feedback (Request a feature / Report a bug) backed by Web3Forms.
 *
 * Any entry point (floating button, nav, footer) calls requestFeedback(type);
 * <FeedbackRoot/> is mounted once in App and renders the dialog. Page, tool,
 * browser and viewport context is attached automatically; file contents are
 * never included — the form does not accept attachments by design.
 */

export type FeedbackType = "feature" | "bug";

type FeedbackListener = (type: FeedbackType) => void;

const listeners = new Set<FeedbackListener>();

export function requestFeedback(type: FeedbackType = "feature"): void {
  listeners.forEach((listener) => listener(type));
}

export function subscribeFeedback(listener: FeedbackListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const WEB3FORMS_KEY = import.meta.env.VITE_WEB3FORMS_KEY as string | undefined;
const ENDPOINT = "https://api.web3forms.com/submit";

/** Entry points hide themselves when no key is configured. */
export function isFeedbackEnabled(): boolean {
  return !!WEB3FORMS_KEY;
}

export interface FeedbackContext {
  route: string;
  tool: string | null;
  userAgent: string;
  viewport: string;
}

export async function submitFeedback(input: {
  type: FeedbackType;
  title: string;
  details: string;
  email: string;
  context: FeedbackContext;
}): Promise<void> {
  if (!WEB3FORMS_KEY) {
    throw new Error("Feedback is not configured yet. Please try again later.");
  }
  const tag = input.type === "bug" ? "Bug" : "Feature";
  const scope = input.context.tool ? `[${input.context.tool}] ` : "";
  let data: { success?: boolean; message?: string };
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject: `[${tag}] ${scope}${input.title}`.trim(),
        email: input.email || undefined,
        from_name: "PDFBrains feedback form",
        message: [
          input.details,
          "",
          "---",
          `Page: ${input.context.route}`,
          ...(input.context.tool ? [`Tool: ${input.context.tool}`] : []),
          `Browser: ${input.context.userAgent}`,
          `Viewport: ${input.context.viewport}`,
        ].join("\n"),
        // Web3Forms honeypot: must be present and empty.
        botcheck: "",
      }),
    });
    data = (await response.json()) as typeof data;
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Sending failed. Please try again.");
    }
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Could not reach the feedback service. Check your connection and retry.");
  }
}
