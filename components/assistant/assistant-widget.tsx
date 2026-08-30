"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import { AssistantMessageBody } from "@/components/assistant/assistant-message";
import {
  ASSISTANT_NAME,
  DAVID_GREETING,
  DAVID_GREETING_HINT,
} from "@/lib/assistant/persona";
import { messageText } from "@/lib/assistant/validate";
import { publicActionMessage } from "@/lib/safe-action-message";

const TRANSPORT = new DefaultChatTransport({ api: "/api/assistant/chat" });

const SUGGESTIONS = [
  "How do I pay my fees?",
  "When do year exams unlock?",
  "How do I contact Support?",
] as const;

const ASSISTANT_UNAVAILABLE =
  "David is temporarily unavailable. Please try again or visit Support.";

function DavidAvatar({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-pine shadow-sm ring-1 ring-pine/20 ${className}`}
      aria-hidden
    >
      <Image
        src="/davi.png"
        alt=""
        width={72}
        height={72}
        className="h-full w-full object-cover object-[center_18%]"
      />
    </span>
  );
}

function DavidBubble({
  text,
  animate,
}: {
  text: string;
  animate?: boolean;
}) {
  return (
    <div
      className={`flex max-w-[92%] items-end gap-2 ${animate ? "animate-fade-rise" : ""}`}
    >
      <DavidAvatar />
      <div className="min-w-0">
        <p className="mb-1 pl-0.5 text-[0.68rem] font-medium tracking-wide text-pine/70">
          {ASSISTANT_NAME}
        </p>
        <div className="border border-stone/80 bg-white/90 px-3 py-2.5 text-ink shadow-[0_6px_18px_-12px_rgba(20,53,44,0.35)]">
          <AssistantMessageBody text={text} />
        </div>
      </div>
    </div>
  );
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, setMessages, clearError } =
    useChat({
      transport: TRANSPORT,
      throttle: 50,
    });

  const busy = status === "submitted" || status === "streaming";
  const transcriptSignature = messages.map((message) => message.id).join("|");
  const showGreeting = messages.length === 0;

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [open, transcriptSignature, status, showGreeting]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const submitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      clearError();
      sendMessage({ text: trimmed });
      setInput("");
    },
    [busy, clearError, sendMessage],
  );

  const onSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      submitText(input);
    },
    [input, submitText],
  );

  const onNewChat = useCallback(() => {
    setMessages([]);
    clearError();
    setInput("");
  }, [clearError, setMessages]);

  const errorCopy = useMemo(
    () =>
      error
        ? publicActionMessage(error.message, ASSISTANT_UNAVAILABLE)
        : null,
    [error],
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-end p-4 sm:p-5">
      <div
        ref={panelRef}
        className={`pointer-events-auto flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 ${open ? "w-[min(100%,22rem)] sm:w-[24rem]" : "w-auto"}`}
      >
        {open ? (
          <div
            id="assistant-panel"
            role="dialog"
            aria-label={`Chat with ${ASSISTANT_NAME}`}
            className="flex w-full flex-col overflow-hidden border border-stone/80 bg-mist shadow-[0_18px_50px_-12px_rgba(20,53,44,0.28)]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-stone/80 bg-pine px-4 py-3 text-mist">
              <div className="flex min-w-0 items-start gap-2.5">
                <DavidAvatar className="mt-0.5 h-9 w-9 ring-2 ring-mist/25" />
                <div className="min-w-0">
                  <p className="font-display text-[1.1rem] leading-tight">
                    {ASSISTANT_NAME}
                  </p>
                  <p className="mt-0.5 text-[0.75rem] leading-snug text-mist/75">
                    Your guide on the School of Disciples portal
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={onNewChat}
                  className="px-2 py-1 text-[0.72rem] font-medium tracking-wide text-mist/80 transition-colors hover:text-mist"
                >
                  New chat
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={`Close chat with ${ASSISTANT_NAME}`}
                  className="inline-flex h-8 w-8 items-center justify-center text-mist/85 transition-colors hover:bg-mist/10 hover:text-mist"
                >
                  <span aria-hidden className="text-lg leading-none">
                    ×
                  </span>
                </button>
              </div>
            </header>

            <div className="support-chat-wallpaper max-h-[min(52vh,24rem)] min-h-[14rem] overflow-y-auto overscroll-y-contain px-3 py-4 sm:max-h-[min(58vh,28rem)]">
              <ul className="space-y-3">
                {showGreeting ? (
                  <li className="flex justify-start">
                    <div className="w-full">
                      <DavidBubble text={DAVID_GREETING} animate />
                      <p className="mt-2.5 pl-9 text-[0.72rem] leading-snug text-ink/45">
                        {DAVID_GREETING_HINT}
                      </p>
                      <div className="mt-3 flex flex-col gap-2 pl-9">
                        {SUGGESTIONS.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            disabled={busy}
                            onClick={() => submitText(suggestion)}
                            className="border border-stone/90 bg-white/75 px-3 py-2 text-left text-[0.78rem] leading-snug text-ink/80 transition-colors hover:border-celadon/50 hover:bg-white disabled:opacity-60"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                ) : null}

                {messages.map((message) => {
                  const text = messageText(message);
                  if (!text) return null;
                  const isUser = message.role === "user";

                  return (
                    <li
                      key={message.id}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      {isUser ? (
                        <div className="max-w-[92%] bg-pine px-3 py-2.5 text-mist">
                          <p className="whitespace-pre-wrap text-[0.875rem] leading-relaxed">
                            {text}
                          </p>
                        </div>
                      ) : (
                        <DavidBubble text={text} />
                      )}
                    </li>
                  );
                })}

                {busy ? (
                  <li className="flex justify-start">
                    <div className="flex items-end gap-2">
                      <DavidAvatar />
                      <div className="border border-stone/80 bg-white/90 px-3 py-2 text-[0.8rem] text-ink/55">
                        David is typing…
                      </div>
                    </div>
                  </li>
                ) : null}
              </ul>
              <div aria-hidden ref={endRef} />
            </div>

            {errorCopy ? (
              <p className="border-t border-stone/70 bg-red-50/80 px-4 py-2 text-[0.78rem] leading-snug text-red-900/85">
                {errorCopy}
              </p>
            ) : null}

            <form
              onSubmit={onSubmit}
              className="border-t border-stone/80 bg-mist/95 p-3 backdrop-blur-sm"
            >
              <label className="sr-only" htmlFor="assistant-input">
                Message {ASSISTANT_NAME}
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  id="assistant-input"
                  rows={2}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submitText(input);
                    }
                  }}
                  disabled={busy}
                  maxLength={2000}
                  placeholder={`Message ${ASSISTANT_NAME}…`}
                  className="min-h-[2.75rem] flex-1 resize-none border border-stone/90 bg-white px-3 py-2 text-[0.875rem] text-ink outline-none transition-[border-color] placeholder:text-ink/40 focus:border-celadon disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="inline-flex h-[2.75rem] shrink-0 items-center justify-center bg-pine px-4 text-[0.8rem] font-medium tracking-wide text-mist transition-colors hover:bg-celadon disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <AssistantLauncher
          open={open}
          onToggle={() => setOpen((value) => !value)}
        />
      </div>
    </div>
  );
}
