"use client";

import { useEffect, useState } from "react";
import { PulseLoader } from "react-spinners";

const MIST = "#eef3f0";

const DEFAULT_STAGES = [
  "Submitting your answers…",
  "Grading auto-marked questions…",
  "Preparing your score…",
] as const;

/**
 * Full-screen submit overlay for the dark exam runner.
 * Cycles calm status lines so the wait feels purposeful.
 */
export function ExamSubmitOverlay({
  active,
  stages = DEFAULT_STAGES,
}: {
  active: boolean;
  stages?: readonly string[];
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % stages.length);
    }, 1600);
    return () => window.clearInterval(id);
  }, [active, stages]);

  if (!active) return null;

  const label = stages[index] ?? stages[0]!;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0f2820]/92 px-6 backdrop-blur-sm"
      aria-busy="true"
      role="alertdialog"
      aria-label={label}
    >
      <div className="animate-panel-in w-full max-w-sm border border-mist/15 bg-white/[0.06] px-6 py-8 text-center text-mist shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)]">
        <PulseLoader
          color={MIST}
          size={11}
          margin={5}
          speedMultiplier={0.8}
          aria-hidden
        />
        <p className="mt-5 font-display text-xl tracking-[-0.02em] text-mist">
          {label}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-mist/55">
          Please keep this page open for a moment.
        </p>
      </div>
    </div>
  );
}
