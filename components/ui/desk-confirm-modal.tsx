"use client";

import { useEffect, type ReactNode } from "react";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";

type DeskConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  eyebrow?: string;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  busyLabel?: string;
};

export function DeskConfirmModal({
  open,
  onClose,
  onConfirm,
  eyebrow,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  busyLabel = "Working…",
}: DeskConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="desk-confirm-modal-title"
        className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <DeskLoaderOverlay active={busy} label={busyLabel} />
        {eyebrow ? (
          <p
            className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] ${
              destructive ? "text-red-800/80" : "text-celadon"
            }`}
          >
            {eyebrow}
          </p>
        ) : null}
        <h3
          id="desk-confirm-modal-title"
          className={`font-display text-2xl tracking-[-0.02em] text-pine ${eyebrow ? "mt-3" : ""}`}
        >
          {title}
        </h3>
        <div className="mt-3 text-sm leading-relaxed text-ink/70">{body}</div>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`inline-flex min-h-[2.5rem] min-w-[9rem] items-center justify-center px-4 py-2.5 text-sm font-medium text-mist transition-colors disabled:opacity-60 ${
              destructive
                ? "bg-red-800 hover:bg-red-900"
                : "bg-pine hover:bg-pine/90"
            }`}
          >
            {busy ? <DeskLoader label={busyLabel} tone="mist" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
