import { ArrowUp, FilePdf, Paperclip, Sparkle, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";

import { Nav } from "../components/Nav";

interface ChatFile {
  name: string;
  size: number;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  files: ChatFile[];
}

const SUGGESTIONS = [
  "Summarize this PDF",
  "Extract the key points",
  "Rewrite this for clarity",
  "What is this document about?",
];

let messageCounter = 0;
const nextMessageId = () => {
  messageCounter += 1;
  return messageCounter;
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildReply(text: string, files: ChatFile[]): string {
  if (files.length > 0) {
    const names = files.map((file) => file.name).join(", ");
    return `I can see ${files.length} file${files.length === 1 ? "" : "s"} attached (${names}). The AI backend is coming next, so this is just the interface for now. Once it lands, I will read your files and answer right here.`;
  }
  return `You asked: "${text}". The AI backend is coming next, so this is just the interface for now. Once it lands, I will answer your questions right here.`;
}

/**
 * AI Assist: a chat interface for asking questions about documents. Files are
 * dropped or attached in the composer and travel with each message. Frontend
 * only for now; the AI backend hooks in here later.
 */
export function AiAssist() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<ChatFile[]>([]);
  const [typing, setTyping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

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

  const send = (text?: string, attached?: ChatFile[]) => {
    const content = (text ?? draft).trim();
    const attach = attached ?? files;
    if (!content && attach.length === 0) return;
    setMessages((prev) => [
      ...prev,
      { id: nextMessageId(), role: "user", text: content, files: attach },
    ]);
    setDraft("");
    setFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setTyping(true);
    const reply = buildReply(content, attach);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: nextMessageId(), role: "assistant", text: reply, files: [] },
      ]);
    }, 750);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
                Ask questions about your documents. Files and messages are staged; the AI backend lands next.
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

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <WelcomePanel onSuggestion={pickSuggestion} />
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
            "mt-4 shrink-0 rounded-2xl border bg-surface p-3 transition",
            dragging ? "border-accent bg-accentsoft" : "border-line",
          ].join(" ")}
        >
          {files.length > 0 && (
            <ul className="mb-2.5 flex flex-wrap gap-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}`}
                  className="flex items-center gap-2 rounded-full border border-line bg-paper py-1 pl-2.5 pr-1.5"
                >
                  <FilePdf size={14} className="shrink-0 text-accent" weight="regular" />
                  <span className="max-w-[180px] truncate text-[12px]">{file.name}</span>
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
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                resizeTextarea();
              }}
              onKeyDown={onTextareaKeyDown}
              placeholder="Ask about your documents..."
              className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1.5 py-2 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={!draft.trim() && files.length === 0}
              aria-label="Send message"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowUp size={18} weight="bold" />
            </button>
          </div>

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

function WelcomePanel({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accentsoft text-accent">
        <Sparkle size={28} weight="regular" />
      </span>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">Ask anything about your documents</h2>
      <p className="mt-1.5 max-w-[46ch] text-[14px] leading-relaxed text-muted">
        Drop PDFs, Word files or text into the chat below, then ask questions about them. The AI
        backend is coming next; for now everything is staged in the conversation.
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
          user ? "rounded-br-md bg-ink text-paper" : "rounded-bl-md border border-line bg-surface",
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
                <FilePdf size={14} className="shrink-0 text-accent" weight="regular" />
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
