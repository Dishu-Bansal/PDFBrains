import {
  ArrowUp,
  FilePdf,
  Paperclip,
  Sparkle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";

import { Nav } from "../components/Nav";
import { isLlmConfigured } from "../lib/llm";
import { runLlmChat } from "../lib/llm/chat";
import type { LlmMessage } from "../lib/llm/types";

interface ChatFile {
  name: string;
  size: number;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  files: ChatFile[];
  error?: boolean;
}

const SUGGESTIONS = [
  "Summarize this PDF",
  "Extract the key points",
  "Rewrite this for clarity",
  "What is this document about?",
];

const SYSTEM_PROMPT =
  "You are AI Assist inside PDFBrains, a browser PDF tool suite. Users attach " +
  "files and reference them in their message with @mentions. When a request " +
  "needs a file, call the matching tool with the referenced file name; never " +
  "guess file contents. Answer clearly and concisely.";

const ZWSP = "\u200b";

let messageCounter = 0;
const nextMessageId = () => {
  messageCounter += 1;
  return messageCounter;
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function unconfiguredReply(text: string, files: ChatFile[]): string {
  if (files.length > 0) {
    const names = files.map((file) => file.name).join(", ");
    return `I can see ${files.length} file${files.length === 1 ? "" : "s"} attached (${names}), but I'm not connected to the AI backend yet. Add your DeepSeek API key as VITE_DEEPSEEK_API_KEY in .env.local and restart the dev server, then I'll answer for real.`;
  }
  return `You asked: "${text}". I'm not connected to the AI backend yet. Add your DeepSeek API key as VITE_DEEPSEEK_API_KEY in .env.local and restart the dev server, then I'll answer for real.`;
}

function chipForFile(file: ChatFile): string {
  return `@${file.name}`;
}

/**
 * AI Assist: a chat interface for asking questions about documents. Files are
 * dropped or attached in the composer and referenced in the message with
 * @mentions, which render as chips (Backspace removes a whole chip). File
 * contents are not extracted client-side; the LLM works with files through
 * the tool registry instead. Tool calls resolve through the LLM layer, so the
 * ~20 PDF tools can plug in later.
 */
export function AiAssist() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<ChatFile[]>([]);
  const [typing, setTyping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const configured = isLlmConfigured();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const next = Array.from(list).map((file) => ({ name: file.name, size: file.size }));
    setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  /** Reads the composer's current text (chips included) into `draft`. */
  const syncDraft = () => {
    const text = composerRef.current
      ? (composerRef.current.innerText ?? "").replace(/\u200b/g, "").trim()
      : "";
    setDraft(text);
  };

  const toLlmHistory = (history: ChatMessage[]): LlmMessage[] =>
    history
      .filter((message) => !message.error)
      .map((message) =>
        message.role === "assistant"
          ? { role: "assistant", content: message.text }
          : { role: "user", content: message.text }
      );

  const send = async (text?: string, attached?: ChatFile[]) => {
    const content = (text ?? (composerRef.current?.innerText ?? ""))
      .replace(/\u200b/g, "")
      .trim();
    const attach = attached ?? files;
    if ((!content && attach.length === 0) || typing) return;

    const userMessage: ChatMessage = {
      id: nextMessageId(),
      role: "user",
      text: content,
      files: attach,
    };
    const history = [...messages, userMessage];
    setMessages(history);
    if (composerRef.current) composerRef.current.textContent = "";
    setDraft("");
    setFiles([]);
    setTyping(true);

    if (!configured) {
      window.setTimeout(() => {
        setTyping(false);
        setMessages((prev) => [
          ...prev,
          { id: nextMessageId(), role: "assistant", text: unconfiguredReply(content, attach), files: [] },
        ]);
      }, 500);
      return;
    }

    try {
      const result = await runLlmChat(toLlmHistory(history).slice(-20), {
        systemPrompt: SYSTEM_PROMPT,
      });
      setTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: nextMessageId(), role: "assistant", text: result.content, files: [] },
      ]);
    } catch (err) {
      setTyping(false);
      const detail = err instanceof Error ? err.message : "The AI request failed. Please try again.";
      setMessages((prev) => [
        ...prev,
        { id: nextMessageId(), role: "assistant", text: detail, files: [], error: true },
      ]);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  // ---- @-mention autocomplete for attached files ----
  const mentionResults =
    mentionQuery !== null
      ? files.filter((file) => file.name.toLowerCase().includes(mentionQuery.toLowerCase()))
      : [];
  const safeMentionIndex = Math.min(mentionIndex, Math.max(0, mentionResults.length - 1));

  /** Recomputes the mention popup from the caret position in the composer. */
  const updateMention = () => {
    if (files.length === 0) {
      setMentionQuery(null);
      return;
    }
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || !selection.anchorNode) {
      setMentionQuery(null);
      return;
    }
    const node = selection.anchorNode;
    if (node.nodeType !== Node.TEXT_NODE) {
      setMentionQuery(null);
      return;
    }
    const before = (node.textContent ?? "").slice(0, selection.anchorOffset);
    const match = before.match(/@([^@\n]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  /** Replaces the pending "@query" run with a chip followed by a caret anchor. */
  const insertMention = (file: ChatFile) => {
    const div = composerRef.current;
    const selection = window.getSelection();
    if (!div || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      const before = text.slice(0, range.startOffset);
      const match = before.match(/@([^@\n]*)$/);
      if (match && match.index !== undefined) {
        range.setStart(node, match.index);
      }
    }
    range.deleteContents();

    const chip = document.createElement("span");
    chip.className = "mention-chip";
    chip.contentEditable = "false";
    chip.textContent = chipForFile(file);
    const caretAnchor = document.createTextNode(ZWSP);

    range.insertNode(chip);
    range.setStartAfter(chip);
    range.insertNode(caretAnchor);
    range.setStartAfter(caretAnchor);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    setMentionQuery(null);
    syncDraft();
    div.focus();
  };

  /** Deletes the chip immediately before the caret (with its anchor). */
  const deleteChipBeforeCaret = (): boolean => {
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || !selection.anchorNode) return false;
    const node = selection.anchorNode;

    let chip: HTMLElement | null = null;
    let caretText: Node | null = null;

    if (node.nodeType === Node.TEXT_NODE) {
      const before = (node.textContent ?? "").slice(0, selection.anchorOffset);
      if (before.replace(/\u200b/g, "").trim() !== "") return false; // real text before caret
      caretText = node;
      let prev: Node | null = node.previousSibling;
      while (
        prev &&
        prev.nodeType === Node.TEXT_NODE &&
        (prev.textContent ?? "").replace(/\u200b/g, "").trim() === ""
      ) {
        prev = prev.previousSibling;
      }
      if (prev && prev.nodeType === Node.ELEMENT_NODE && prev instanceof HTMLElement && prev.classList.contains("mention-chip")) {
        chip = prev;
      }
    } else {
      const child = node.childNodes[selection.anchorOffset - 1] ?? null;
      if (child instanceof HTMLElement && child.classList.contains("mention-chip")) {
        chip = child;
      }
    }

    if (!chip) return false;
    // Remove trailing whitespace-only anchors between the chip and the caret.
    let next = chip.nextSibling;
    while (
      next &&
      next !== caretText &&
      next.nodeType === Node.TEXT_NODE &&
      (next.textContent ?? "").replace(/\u200b/g, "").trim() === ""
    ) {
      const remove = next;
      next = remove.nextSibling;
      remove.remove();
    }
    chip.remove();
    syncDraft();
    return true;
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionResults.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionResults.length) % mentionResults.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(mentionResults[safeMentionIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (event.key === "Backspace" && deleteChipBeforeCaret()) {
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setTyping(false);
  };

  const pickSuggestion = (text: string) => {
    const div = composerRef.current;
    if (!div) return;
    div.textContent = text;
    setDraft(text);
    requestAnimationFrame(() => {
      div.focus();
      const range = document.createRange();
      range.selectNodeContents(div);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  };

  return (
    <>
      <Nav />
      <main className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-[900px] flex-col px-4 pb-4 pt-6 sm:px-6">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accentsoft text-accent">
              <Sparkle size={24} weight="regular" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">AI Assist</h1>
              <p className="mt-0.5 text-[14px] leading-relaxed text-muted">
                Ask questions about your documents. Reference attached files in your message with @mentions.
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              className="shrink-0 rounded-full px-3 py-1.5 text-[12px] text-muted transition hover:bg-raised hover:text-ink"
            >
              Clear chat
            </button>
          )}
        </div>

        {!configured && (
          <div className="mt-3 flex shrink-0 items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[12px] leading-relaxed text-muted">
            <WarningCircle size={16} className="mt-0.5 shrink-0 text-accent" />
            <span>
              AI replies are off. Add your DeepSeek API key as{" "}
              <span className="font-mono text-ink">VITE_DEEPSEEK_API_KEY</span> in{" "}
              <span className="font-mono text-ink">.env.local</span> and restart the dev server.
            </span>
          </div>
        )}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <WelcomePanel onSuggestion={pickSuggestion} configured={configured} />
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {typing && <TypingBubble />}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={[
            "relative mt-4 shrink-0 rounded-2xl border bg-surface p-3 transition",
            dragging ? "border-accent bg-accentsoft" : "border-line",
          ].join(" ")}
        >
          {mentionQuery !== null && mentionResults.length > 0 && (
            <div className="absolute bottom-full left-3 z-20 mb-2 w-[280px] overflow-hidden rounded-xl border border-line bg-paper shadow-xl shadow-ink/5">
              <p className="border-b border-line px-3 py-2 text-[11px] font-semibold tracking-wide text-muted">
                Reference a file
              </p>
              <ul className="max-h-44 overflow-y-auto p-1" role="listbox" aria-label="Attached files">
                {mentionResults.map((file, index) => (
                  <li key={`${file.name}-${file.size}`} role="option" aria-selected={index === safeMentionIndex}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setMentionIndex(index)}
                      onClick={() => insertMention(file)}
                      className={[
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition",
                        index === safeMentionIndex ? "bg-raised text-ink" : "text-ink hover:bg-raised",
                      ].join(" ")}
                    >
                      <FilePdf size={14} className="shrink-0 text-accent" weight="regular" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted">
                        {formatSize(file.size)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {files.length > 0 && (
            <ul className="mb-2.5 flex flex-wrap gap-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}`}
                  className="flex items-center gap-2 rounded-full border border-line bg-paper py-1 pl-2.5 pr-1.5"
                >
                  <FilePdf size={14} className="shrink-0 text-accent" weight="regular" />
                  <span className="max-w-[160px] truncate text-[12px]">{file.name}</span>
                  <span className="font-mono text-[10px] text-muted">{formatSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label={`Remove ${file.name}`}
                    className="flex size-5 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
                  >
                    <X size={11} weight="bold" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              aria-label="Attach files"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
            >
              <Paperclip size={20} weight="regular" />
            </button>
            <div
              ref={composerRef}
              contentEditable
              role="textbox"
              aria-multiline="true"
              data-placeholder="Ask about your documents..."
              onInput={() => {
                syncDraft();
                updateMention();
              }}
              onKeyDown={onComposerKeyDown}
              onKeyUp={updateMention}
              onClick={updateMention}
              onSelect={updateMention}
              onBlur={() => setMentionQuery(null)}
              className="max-h-36 min-h-10 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-1.5 py-2 text-[14px] leading-relaxed text-ink outline-none"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={(!draft.trim() && files.length === 0) || typing}
              aria-label="Send message"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowUp size={18} weight="bold" />
            </button>
          </div>

          {files.length > 0 && (
            <p className="mt-1.5 px-1.5 text-[11px] text-muted">
              Type <span className="font-mono text-ink">@</span> to reference an attached file in your question.
            </p>
          )}

          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </main>
    </>
  );
}

function WelcomePanel({
  onSuggestion,
  configured,
}: {
  onSuggestion: (text: string) => void;
  configured: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accentsoft text-accent">
        <Sparkle size={28} weight="regular" />
      </span>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">Ask anything about your documents</h2>
      <p className="mt-1.5 max-w-[46ch] text-[14px] leading-relaxed text-muted">
        Drop PDFs, Word files or text into the chat below, then ask questions about them. Use{" "}
        <span className="font-mono text-ink">@</span> to point at a specific file.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-ink transition hover:border-accent hover:text-accentstrong"
          >
            {suggestion}
          </button>
        ))}
      </div>
      {!configured && (
        <p className="mt-5 max-w-[46ch] text-[12px] leading-relaxed text-muted">
          To get real AI replies, add your DeepSeek API key to{" "}
          <span className="font-mono">.env.local</span> as{" "}
          <span className="font-mono">VITE_DEEPSEEK_API_KEY</span>.
        </p>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const user = message.role === "user";
  return (
    <div className={user ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[78%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed",
          user
            ? "rounded-br-md bg-ink text-paper"
            : message.error
              ? "rounded-bl-md border border-danger/40 bg-surface text-danger"
              : "rounded-bl-md border border-line bg-surface",
        ].join(" ")}
      >
        {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
        {message.files.length > 0 && (
          <ul className={message.text ? "mt-2.5 space-y-1.5" : "space-y-1.5"}>
            {message.files.map((file) => {
              const referenced = message.text.toLowerCase().includes(`@${file.name.toLowerCase()}`);
              return (
                <li
                  key={`${file.name}-${file.size}`}
                  className="flex items-center gap-2 rounded-lg bg-paper/15 px-2.5 py-1.5"
                >
                  <FilePdf size={14} className="shrink-0 text-accent" weight="regular" />
                  <span className="min-w-0 truncate text-[13px]">{file.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] opacity-60">
                    {formatSize(file.size)}
                  </span>
                  {referenced && (
                    <span className="shrink-0 rounded-full bg-accent/25 px-1.5 py-0.5 font-mono text-[10px] text-accentstrong">
                      referenced
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start" aria-busy="true" aria-label="AI is typing">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-muted"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
