"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { EmojiStyle, Theme, type EmojiClickData } from "emoji-picker-react";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] w-full items-center justify-center bg-mist text-sm text-ink/50 lg:h-[350px] lg:w-[min(22rem,calc(100vw-2rem))]">
      Loading emoji…
    </div>
  ),
});

function subscribeCompact(onChange: () => void) {
  const media = window.matchMedia("(max-width: 1023px)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getCompactSnapshot() {
  return window.matchMedia("(max-width: 1023px)").matches;
}

function getCompactServerSnapshot() {
  return false;
}

type EmojiPickerButtonProps = {
  disabled?: boolean;
  onPick: (emoji: string) => void;
};

export function EmojiPickerButton({ disabled, onPick }: EmojiPickerButtonProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const compact = useSyncExternalStore(
    subscribeCompact,
    getCompactSnapshot,
    getCompactServerSnapshot,
  );

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target)) {
        const sheet = document.getElementById(panelId);
        if (sheet?.contains(target)) return;
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, panelId]);

  useEffect(() => {
    if (!open || !compact) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, compact]);

  function handleEmojiClick(emojiData: EmojiClickData) {
    onPick(emojiData.emoji);
    setOpen(false);
  }

  const picker = (
    <EmojiPicker
      onEmojiClick={handleEmojiClick}
      theme={Theme.LIGHT}
      emojiStyle={EmojiStyle.NATIVE}
      lazyLoadEmojis
      autoFocusSearch={false}
      searchPlaceHolder="Search emoji"
      width={compact ? "100%" : "min(22rem, calc(100vw - 2rem))"}
      height={compact ? 300 : 350}
      previewConfig={{ showPreview: false }}
    />
  );

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-label="Insert emoji"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-[1rem] border border-stone bg-white/85 text-base text-ink transition-colors hover:border-pine/40 hover:bg-mist disabled:opacity-40 sm:h-11 sm:w-11 sm:rounded-[1.1rem] sm:text-lg"
      >
        😊
      </button>

      {open && compact ? (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Close emoji picker"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            className="animate-sheet-up relative z-10 overflow-hidden rounded-t-2xl border border-stone/80 bg-mist pb-[env(safe-area-inset-bottom)] shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-stone/70 px-4 py-2.5">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
                Emoji
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-pine"
              >
                Done
              </button>
            </div>
            {picker}
          </div>
        </div>
      ) : null}

      {open && !compact ? (
        <div
          id={panelId}
          className="absolute bottom-[calc(100%+0.5rem)] left-0 z-30 overflow-hidden border border-stone/80 bg-mist shadow-sm"
        >
          {picker}
        </div>
      ) : null}
    </div>
  );
}
