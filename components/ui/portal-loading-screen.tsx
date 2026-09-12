"use client";

import { DeskLoader } from "@/components/ui/desk-loader";

type PortalLoadingScreenProps = {
  label?: string;
};

/** Full-viewport loading state for auth hand-offs and route segments. */
export function PortalLoadingScreen({
  label = "Loading…",
}: PortalLoadingScreenProps) {
  return (
    <div
      className="flex min-h-svh flex-col items-center justify-center bg-mist text-ink"
      aria-busy="true"
    >
      <div className="animate-panel-in border border-stone/80 bg-white/60 px-6 py-5 shadow-[0_12px_40px_-18px_rgba(20,53,44,0.2)]">
        <DeskLoader label={label} size="md" />
      </div>
    </div>
  );
}
