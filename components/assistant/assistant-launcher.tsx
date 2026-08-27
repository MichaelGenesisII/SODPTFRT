"use client";

import { SupportHeadsetIcon } from "@/components/assistant/support-headset-icon";

function CloseIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M7 7l10 10M17 7L7 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AssistantLauncher({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="group relative">
      {!open ? (
        <>
          <span
            aria-hidden
            className="assistant-launcher-ring pointer-events-none absolute inset-0 rounded-full"
          />
          <span
            aria-hidden
            className="assistant-launcher-ring assistant-launcher-ring-delay pointer-events-none absolute inset-0 rounded-full"
          />
        </>
      ) : null}

      <span
        aria-hidden
        className={`pointer-events-none absolute bottom-[calc(100%+0.65rem)] right-0 hidden whitespace-nowrap rounded-full border border-stone/80 bg-white/95 px-3 py-1.5 text-[0.72rem] font-medium tracking-wide text-pine shadow-[0_8px_24px_-10px_rgba(20,53,44,0.35)] backdrop-blur-sm transition-all duration-200 sm:block ${
          open
            ? "translate-y-1 opacity-0"
            : "translate-y-0 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        Chat with David
      </span>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? "assistant-panel" : undefined}
        aria-label={open ? "Close chat with David" : "Open chat with David"}
        className={`assistant-launcher-button relative inline-flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-full border border-white/70 bg-gradient-to-br from-pine via-pine to-celadon text-mist shadow-[0_14px_40px_-12px_rgba(20,53,44,0.55)] transition-[transform,box-shadow,background-color] duration-300 hover:scale-[1.04] hover:shadow-[0_18px_44px_-10px_rgba(20,53,44,0.62)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-celadon active:scale-[0.98] sm:h-16 sm:w-16 ${
          open ? "assistant-launcher-open" : ""
        }`}
      >
        <span
          className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-300 ${
            open ? "scale-75 opacity-0" : "scale-100 opacity-100"
          }`}
          aria-hidden
        >
          <SupportHeadsetIcon className="h-[1.65rem] w-[1.65rem] sm:h-7 sm:w-7" />
        </span>

        <span
          className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-300 ${
            open ? "scale-100 opacity-100" : "scale-75 opacity-0"
          }`}
          aria-hidden
        >
          <CloseIcon className="h-6 w-6" />
        </span>
      </button>
    </div>
  );
}
