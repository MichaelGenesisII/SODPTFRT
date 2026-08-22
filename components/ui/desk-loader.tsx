"use client";

import { PulseLoader } from "react-spinners";

const PINE = "#14352c";
const MIST = "#eef3f0";

type DeskLoaderProps = {
  /** Accessible status text (also shown when `showLabel` is true). */
  label?: string;
  showLabel?: boolean;
  /** Compact for buttons; room for form overlays. */
  size?: "sm" | "md";
  /** Light dots on dark buttons (pine). */
  tone?: "pine" | "mist";
  className?: string;
};

/**
 * SOD desk loader via react-spinners PulseLoader (three soft pulses).
 */
export function DeskLoader({
  label = "Working…",
  showLabel = true,
  size = "sm",
  tone = "pine",
  className = "",
}: DeskLoaderProps) {
  const color = tone === "mist" ? MIST : PINE;
  const dot = size === "md" ? 10 : 8;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`inline-flex items-center gap-2.5 ${className}`}
    >
      <PulseLoader
        color={color}
        size={dot}
        margin={4}
        speedMultiplier={0.85}
        aria-hidden
      />
      {showLabel ? (
        <span
          className={`font-medium tracking-wide ${
            tone === "mist" ? "text-mist/90" : "text-ink/65"
          } ${size === "md" ? "text-sm" : "text-xs"}`}
        >
          {label}
        </span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}

/** Soft mist overlay for a form while a desk action runs. */
export function DeskLoaderOverlay({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  if (!active) return null;

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-mist/80 backdrop-blur-[2px]"
      aria-busy="true"
    >
      <div className="animate-panel-in border border-pine/15 bg-white/70 px-5 py-4 shadow-[0_12px_40px_-18px_rgba(20,53,44,0.35)]">
        <DeskLoader label={label} size="md" />
      </div>
    </div>
  );
}
