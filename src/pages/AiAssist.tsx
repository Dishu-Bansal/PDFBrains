import {
  ArrowUp,
  FilePdf,
  Paperclip,
  Sparkle,
  SpinnerGap,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";

import { Nav } from "../components/Nav";
import { isLlmConfigured } from "../lib/llm";
import { runLlmChat } from "../lib/llm/chat";
import { extractFileText, fileTextBlock } from "../lib/llm/fileText";
import type { IndexedFile } from "../lib/llm/fileText";
import type { LlmMessage } from "../lib/llm/types";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  files: IndexedFile[];
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
  "documents and ask questions about them. Answer clearly and concisely, and when " +
  "a tool is available for the request, call it instead of guessing.";

let messageCounter = 0;
const nextMessageId = () => {
  messageCounter += 1;
  return messageCounter;
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function unconfiguredReply(text: string, files: IndexedFile[]): string {
  if (files.length > 0) {
    const names = files.map((file) => file.name).join(", ");
    return `I can see ${files.length} file${files.length === 1 ? "" : "s"} attached (${names}), but I'm not connected to the AI backend yet. Add your DeepSeek API key as VITE_DEEPSEEK_API_KEY in .env.local and restart the dev server, then I'll answer for real.`;
  }
  return `You asked: "${text}". I'm not connected to the AI backend yet. Add your DeepSeek API key as VITE_DEEPSEEK_API_KEY in .env.local and restart the dev server, then I'll answer for real.`;
}

/**
 * AI Assist: a chat interface for asking questions about documents. Files are
 * dropped or attached in the composer, their text is extracted client-side,
 * and the conversation runs against the active LLM provider (DeepSeek by
 * default; swap via VITE_LLM_PROVIDER). Tool calls resolve through the LLM
 * tool registry, so the ~20 PDF tools can plug in later.
 */
export function AiAssist() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<IndexedFile[]>([]);
  const [typing, setTyping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const configured = isLlmConfigured();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const entries = Array.from(list);
    const pending: IndexedFile[] = entries.map((file) => ({
      name: file.name,
      size: file.size,
      text: "",
      status: "reading",
    }));
    setFiles((prev) => [...prev, ...pending]);
    pending.forEach(async (entry, index) => {
      const indexed = await extractFileText(entries[index]);
      setFiles((prev) => prev.map((f) => (f === entry ? indexed : f)));
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // When a message references files with @mentions, only those files are sent
  // as context; otherwise all attached files travel with the message.
  const toLlmHistory = (history: ChatMessage[]): LlmMessage[] =>
    history
      .filter((message) => !message.error)
      .map((message) => {
        if (message.role === "assistant") return { role: "assistant", content: message.text };
        const mentioned = message.files.filter((file) =>
          message.text.toLowerCase().includes(`@${file.name.toLowerCase()}`)
        );
        const contextFiles = mentioned.length > 0 ? mentioned : message.files;
        const blocks = contextFiles.filter((file) => file.text).map(fileTextBlock);
        const content = [message.text, ...blocks].filter(Boolean).join("\n\n");
        return { role: "user", content };
      });

  const send = async (text?: string, attached?: IndexedFile[]) => {
    const content = (text ?? draft).trim();
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
    setDraft("");
    setFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
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

  const updateMention = (text: string, caret: number) => {
    if (files.length === 0) {
      setMentionQuery(null);
      return;
    }
    const match = text.slice(0, caret).match(/@([^@\n]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const selectMention = (file: IndexedFile) => {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? draft.length;
    const before = draft.slice(0, caret);
    const after = draft.slice(caret);
    const match = before.match(/@([^@\n]*)$/);
    const next = (match ? before.slice(0, match.index ?? 0) + `@${file.name}` : before) + after;
    setDraft(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = match ? (match.index ?? 0) + 1 + file.name.length : caret;
      el.setSelectionRange(pos, pos);
      resizeTextarea();
    });
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
        selectMention(mentionResults[safeMentionIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  };

  const clearChat = () => {
    setMessages([]);
    setTyping(false);
  };

  const pickSuggestion = (text: string) => {
    setDraft(text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const filesReading = files.some((file) => file.status === "reading");

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
                Ask questions about your documents. Attached files are read and sent along with your message.
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
                      onClick={() => selectMention(file)}
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
                  <FileStatusIcon file={file} />
                  <span className="max-w-[160px] truncate text-[12px]">{file.name}</span>
                  <span className="font-mono text-[10px] text-muted">{formatSize(file.size)}</span>
                  <FileStatusHint file={file} />
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
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(event) => {
                const value = event.target.value;
                setDraft(value);
                updateMention(value, event.target.selectionStart ?? value.length);
                resizeTextarea();
              }}
              onKeyDown={onTextareaKeyDown}
              onKeyUp={(event) =>
                updateMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)
              }
              onClick={(event) =>
                updateMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)
              }
              onBlur={() => setMentionQuery(null)}
              placeholder="Ask about your documents..."
              className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1.5 py-2 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={(!draft.trim() && files.length === 0) || typing || filesReading}
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

function FileStatusIcon({ file }: { file: IndexedFile }) {
  if (file.status === "reading") {
    return <SpinnerGap size={14} className="animate-spin text-accent" />;
  }
  if (file.status === "unsupported" || file.status === "error") {
    return <WarningCircle size={14} className="shrink-0 text-danger" />;
  }
  return <FilePdf size={14} className="shrink-0 text-accent" weight="regular" />;
}

function FileStatusHint({ file }: { file: IndexedFile }) {
  if (file.status === "unsupported") return <span className="text-[10px] text-muted">unsupported type</span>;
  if (file.status === "error") return <span className="text-[10px] text-danger">failed to read</span>;
  if (file.status === "indexed" && !file.text) {
    return <span className="text-[10px] text-muted">no extractable text</span>;
  }
  return null;
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
        Drop PDFs, Word files or text into the chat below, then ask questions about them. Text is
        extracted from PDFs right in your browser.
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
            {message.files.map((file) => (
              <li
                key={`${file.name}-${file.size}`}
                className="flex items-center gap-2 rounded-lg bg-paper/15 px-2.5 py-1.5"
              >
                <FileStatusIcon file={file} />
                <span className="min-w-0 truncate text-[13px]">{file.name}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px] opacity-60">
                  {formatSize(file.size)}
                </span>
              </li>
            ))}
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
