"use client";

import { useEffect } from "react";

type PortraitLightboxProps = {
  open: boolean;
  imageUrl: string;
  title: string;
  subtitle?: string | null;
  onClose: () => void;
};

export function PortraitLightbox({
  open,
  imageUrl,
  title,
  subtitle,
  onClose,
}: PortraitLightboxProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close portrait"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg border border-stone bg-mist shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-stone/70 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg text-pine">{title}</p>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-ink/50">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm font-medium text-pine"
          >
            Close
          </button>
        </div>
        <div className="bg-pine/5 p-3 sm:p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`Portrait of ${title}`}
            className="mx-auto max-h-[min(70vh,36rem)] w-auto max-w-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}
