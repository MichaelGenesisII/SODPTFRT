"use client";

import type { ReactNode } from "react";

export type FinanceDeskStage = {
  id: string;
  /** Short rail label — verb-led, not a page title. */
  label: string;
  /** One-line purpose under the stage headline. */
  hint: string;
  /** Optional count chip on the rail. */
  count?: number;
  /** Soft urgency for counts that need eyes. */
  urgent?: boolean;
};

/**
 * Shared Books / Payments chrome: one corridor, several stations.
 * Stages stay visible so the admin never “leaves” the desk.
 */
export function FinanceDeskFlow({
  kicker,
  title,
  lead,
  stages,
  activeId,
  onStage,
  children,
  aside,
}: {
  kicker: string;
  title: string;
  lead: string;
  stages: FinanceDeskStage[];
  activeId: string;
  onStage: (id: string) => void;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const active = stages.find((s) => s.id === activeId) ?? stages[0];
  const activeIndex = Math.max(
    0,
    stages.findIndex((s) => s.id === activeId),
  );

  return (
    <div className="relative space-y-5">
      <header className="relative overflow-hidden border border-stone/80 bg-white/55 px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(95,143,122,0.18),_transparent_52%),linear-gradient(125deg,rgba(20,53,44,0.04),transparent_42%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-8 top-0 h-full w-24 bg-gradient-to-l from-pine/[0.06] to-transparent"
          aria-hidden
        />

        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-celadon">
              {kicker}
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.7rem,4.8vw,2.45rem)] leading-[1.05] tracking-[-0.03em] text-pine">
              {title}
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-ink/65">{lead}</p>
          </div>
          {aside ? <div className="relative shrink-0">{aside}</div> : null}
        </div>

        <nav
          className="relative mt-7"
          aria-label={`${kicker} steps`}
        >
          <ol className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {stages.map((stage, index) => {
              const selected = stage.id === activeId;
              const passed = index < activeIndex;
              return (
                <li key={stage.id} className="flex min-w-0 shrink-0 items-stretch">
                  {index > 0 ? (
                    <span
                      className={`mx-0.5 hidden w-4 self-center border-t sm:block ${
                        passed || selected
                          ? "border-pine/35"
                          : "border-stone/70"
                      }`}
                      aria-hidden
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onStage(stage.id)}
                    aria-current={selected ? "step" : undefined}
                    className={`group relative flex min-w-[7.5rem] flex-col gap-1 border px-3.5 py-3 text-left transition-[background,border,color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:min-w-[8.75rem] ${
                      selected
                        ? "border-pine bg-pine text-mist shadow-[0_10px_28px_-16px_rgba(20,53,44,0.55)]"
                        : "border-stone/80 bg-mist/40 text-ink hover:border-pine/35 hover:bg-white/80"
                    }`}
                  >
                    <span
                      className={`flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] ${
                        selected ? "text-mist/70" : "text-ink/40"
                      }`}
                    >
                      <span className="tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {typeof stage.count === "number" && stage.count > 0 ? (
                        <span
                          className={`ml-auto tabular-nums ${
                            selected
                              ? "bg-mist/20 px-1.5 py-0.5 text-mist"
                              : stage.urgent
                                ? "bg-amber-100 px-1.5 py-0.5 text-amber-950"
                                : "bg-pine/10 px-1.5 py-0.5 text-pine"
                          }`}
                        >
                          {stage.count}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`font-display text-lg leading-none tracking-[-0.02em] ${
                        selected ? "text-mist" : "text-pine"
                      }`}
                    >
                      {stage.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      <section
        key={active?.id}
        className="animate-fade-rise space-y-5"
        aria-labelledby="finance-desk-stage-title"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone/70 pb-4">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Step {String(activeIndex + 1).padStart(2, "0")} of{" "}
              {String(stages.length).padStart(2, "0")}
            </p>
            <h2
              id="finance-desk-stage-title"
              className="mt-1 font-display text-[clamp(1.35rem,3.5vw,1.85rem)] tracking-[-0.02em] text-pine"
            >
              {active?.label}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-ink/60">{active?.hint}</p>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}
