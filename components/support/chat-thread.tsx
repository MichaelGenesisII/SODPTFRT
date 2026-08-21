"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { EmojiPickerButton } from "@/components/support/emoji-picker";
import {
  formatTicketClock,
  formatTicketDayLabel,
  ticketDayKey,
} from "@/lib/tickets";

export type SupportChatSide = "mine" | "theirs";

export type SupportChatTone = "portal" | "email" | "margin";

export type SupportChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  author: string;
  side: SupportChatSide;
  tone?: SupportChatTone;
  subject?: string | null;
  badge?: string | null;
};

export function SupportChatPane({
  children,
  footer,
  className = "",
  heightClass = "min-h-[22rem] max-h-[min(70vh,36rem)]",
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  heightClass?: string;
}) {
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden border border-stone/80 bg-mist ${className}`}
    >
      <div
        className={`support-chat-wallpaper relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] ${heightClass}`}
      >
        {children}
      </div>
      {footer ? (
        <div className="shrink-0 border-t border-stone/80 bg-mist/95 backdrop-blur-sm">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function SupportChatTranscript({
  messages,
  emptyLabel = "No messages yet.",
  emptyHint,
}: {
  messages: SupportChatMessage[];
  emptyLabel?: string;
  emptyHint?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const signature = messages.map((item) => item.id).join("|");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [signature]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full min-h-[10rem] flex-col items-center justify-center px-4 py-8 text-center sm:min-h-[16rem] sm:px-6 sm:py-12">
        <span
          className="inline-flex h-10 w-10 items-center justify-center border border-pine/20 bg-mist/80 text-pine sm:h-12 sm:w-12"
          aria-hidden
        >
          <ChatGlyph />
        </span>
        <p className="mt-3 font-display text-base text-pine sm:mt-4 sm:text-xl">
          {emptyLabel}
        </p>
        {emptyHint ? (
          <p className="mt-1.5 max-w-[16rem] text-[0.8rem] leading-relaxed text-ink/55 sm:mt-2 sm:max-w-xs sm:text-sm">
            {emptyHint}
          </p>
        ) : null}
      </div>
    );
  }

  let lastDay = "";

  return (
    <div className="flex flex-col gap-1.5 px-2.5 py-3 sm:gap-2 sm:px-5 sm:py-5">
      {messages.map((message, index) => {
        const day = ticketDayKey(message.createdAt);
        const showDay = day !== lastDay;
        lastDay = day;

        return (
          <div key={message.id} className="space-y-1.5 sm:space-y-2">
            {showDay ? (
              <div className="flex justify-center py-1 sm:py-1.5">
                <span className="border border-stone/70 bg-mist/90 px-2.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/55 shadow-sm sm:px-3 sm:py-1 sm:text-[0.65rem]">
                  {formatTicketDayLabel(message.createdAt)}
                </span>
              </div>
            ) : null}
            <ChatBubble
              message={message}
              style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
            />
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function ChatBubble({
  message,
  style,
}: {
  message: SupportChatMessage;
  style?: CSSProperties;
}) {
  const mine = message.side === "mine";
  const tone = message.tone ?? "portal";

  const shell =
    tone === "margin"
      ? mine
        ? "bg-[#2f463c] text-mist"
        : "border border-dashed border-pine/30 bg-[#f4f1e8] text-ink"
      : tone === "email"
        ? mine
          ? "bg-pine text-mist"
          : "border border-pine/15 bg-white text-ink"
        : mine
          ? "bg-pine text-mist"
          : "border border-stone/80 bg-mist text-ink shadow-sm";

  const metaTone = mine ? "text-mist/55" : "text-ink/40";

  return (
    <div
      className={`animate-chat-bubble flex ${mine ? "justify-end" : "justify-start"}`}
      style={style}
    >
      <div
        className={`group relative max-w-[min(100%,20rem)] sm:max-w-[min(100%,28rem)] ${
          mine ? "origin-bottom-right" : "origin-bottom-left"
        }`}
      >
        {!mine ? (
          <div className="mb-1 flex items-center gap-2 px-1">
            <span
              className="inline-flex h-5 w-5 items-center justify-center bg-pine text-[0.55rem] font-semibold tracking-wide text-mist sm:h-6 sm:w-6 sm:text-[0.6rem]"
              aria-hidden
            >
              {initials(message.author)}
            </span>
            <span className="text-[0.6rem] font-medium text-celadon sm:text-[0.65rem]">
              {message.author}
            </span>
            {message.badge ? (
              <span className="text-[0.55rem] uppercase tracking-[0.12em] text-ink/40 sm:text-[0.6rem]">
                {message.badge}
              </span>
            ) : null}
          </div>
        ) : null}

        <div
          className={`relative px-3 py-2 sm:px-3.5 sm:py-2.5 ${shell} ${
            mine ? "rounded-[1.1rem_1.1rem_0.35rem_1.1rem]" : "rounded-[1.1rem_1.1rem_1.1rem_0.35rem]"
          }`}
        >
          {mine && (message.badge || tone === "email") ? (
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              {message.badge ? (
                <span className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-mist/60">
                  {message.badge}
                </span>
              ) : null}
              {tone === "email" && !message.badge ? (
                <span className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-mist/60">
                  Email
                </span>
              ) : null}
            </div>
          ) : null}

          {message.subject ? (
            <p
              className={`mb-1.5 border-b pb-1.5 text-sm font-medium ${
                mine
                  ? "border-mist/15 text-mist"
                  : "border-stone/70 text-pine"
              }`}
            >
              {message.subject}
            </p>
          ) : null}

          <p className="whitespace-pre-wrap text-[0.9rem] leading-relaxed sm:text-[0.925rem]">
            {message.body}
          </p>

          <div className={`mt-1.5 flex items-center justify-end gap-1.5 ${metaTone}`}>
            {mine ? (
              <span className="text-[0.6rem] font-medium tracking-wide opacity-80">
                {message.author === "You" ? "" : message.author}
              </span>
            ) : null}
            <time
              dateTime={message.createdAt}
              className="text-[0.65rem] tabular-nums"
            >
              {formatTicketClock(message.createdAt)}
            </time>
            {mine ? <DoubleCheck /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SupportChatComposer({
  value,
  onChange,
  onSubmit,
  pending,
  disabled,
  maxLength,
  placeholder,
  submitLabel = "Send",
  settledHint,
  enableEmojiPicker = false,
  enterToSend = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending?: boolean;
  disabled?: boolean;
  maxLength: number;
  placeholder: string;
  submitLabel?: string;
  settledHint?: string;
  enableEmojiPicker?: boolean;
  /** When true, Enter sends (Shift+Enter still inserts a new line). */
  enterToSend?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

  if (disabled && settledHint) {
    return (
      <div className="px-4 py-4 text-center text-sm text-ink/55">{settledHint}</div>
    );
  }

  function rememberSelection() {
    const el = textareaRef.current;
    if (!el) return;
    selectionRef.current = {
      start: el.selectionStart,
      end: el.selectionEnd,
    };
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    const selection = selectionRef.current;
    const start = selection?.start ?? value.length;
    const end = selection?.end ?? value.length;
    const next = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
    if (next.length > maxLength) return;
    onChange(next);
    const caret = start + emoji.length;
    selectionRef.current = { start: caret, end: caret };
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:py-3"
    >
      <div className="flex items-end gap-1.5 sm:gap-2">
        {enableEmojiPicker ? (
          <EmojiPickerButton
            disabled={pending || disabled}
            onPick={insertEmoji}
          />
        ) : null}
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Message</span>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onSelect={rememberSelection}
            onKeyUp={rememberSelection}
            onClick={rememberSelection}
            rows={1}
            maxLength={maxLength}
            placeholder={placeholder}
            disabled={pending || disabled}
            enterKeyHint={enterToSend ? "send" : undefined}
            onKeyDown={(event) => {
              if (
                enterToSend &&
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (!pending && !disabled && value.trim()) {
                  event.currentTarget.form?.requestSubmit();
                }
              }
            }}
            onInput={(event) => {
              const el = event.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            className="max-h-[120px] min-h-[2.5rem] w-full resize-none rounded-[1.15rem] border border-stone bg-white/85 px-3.5 py-2.5 text-[16px] leading-relaxed text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink/35 focus:border-pine/50 focus:shadow-[0_0_0_3px_rgb(95_143_122/0.18)] disabled:opacity-60 sm:min-h-[2.75rem] sm:max-h-[140px] sm:rounded-[1.25rem] sm:px-4 sm:py-3 sm:text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending || disabled || !value.trim()}
          aria-label={submitLabel}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] bg-pine text-mist transition-colors hover:bg-celadon disabled:opacity-40 sm:h-11 sm:w-11 sm:rounded-[1.1rem]"
        >
          {pending ? <Spinner /> : <SendIcon />}
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between px-1 sm:mt-1.5">
        <p className="hidden text-[0.65rem] text-ink/40 sm:block">
          Press send when you are ready
        </p>
        <p
          className={`ml-auto text-[0.6rem] tabular-nums sm:text-[0.65rem] ${
            value.length > maxLength * 0.9 ? "text-ink/70" : "text-ink/40"
          }`}
        >
          {value.length}/{maxLength}
        </p>
      </div>
    </form>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function DoubleCheck() {
  return (
    <svg
      viewBox="0 0 16 12"
      className="h-3 w-3 text-celadon"
      fill="none"
      aria-hidden
    >
      <path
        d="M1 6.5 3.8 9.2 8.5 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 6.5 9 9.2 14.5 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
      <path
        d="M4 11.5 19.5 4l-4.2 16.2-4.1-6.3L4 11.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M11.2 13.9 19.5 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChatGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path
        d="M5 6.5h14v9.2H9.2L5 19.5V6.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 10h7M8.5 13h4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-[50%] border-2 border-mist/30 border-t-mist"
      aria-hidden
    />
  );
}
