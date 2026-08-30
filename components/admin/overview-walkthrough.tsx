"use client";

import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  OVERVIEW_TOUR_QUEST_COUNT,
  OVERVIEW_TOUR_STEPS,
  SOD_ADMIN_TOUR_EXPAND_EVENT,
  tourHrefReady,
  tourStepPath,
  type OverviewTourTab,
} from "@/lib/admin/overview-tour-steps";
import { tourStepNeedsOpenSidebar } from "@/lib/tour/sidebar-spotlight";
import {
  highlightTourTarget,
  teardownTourDriver,
} from "@/lib/tour/walkthrough-runtime";
import type { DavidHudPlacement } from "@/lib/tour/david-hud-placement";
import { ASSISTANT_NAME } from "@/lib/assistant/persona";
import { DavidTourHud } from "@/components/tour/david-tour-hud";

type OverviewWalkthroughProps = {
  open: boolean;
  stepIndex: number;
  pathname: string;
  search: string;
  firstName: string;
  onClose: () => void;
  onFinish: () => void;
  onNext: () => void;
  onBack: () => void;
  onRequestTab: (tab: OverviewTourTab) => void;
};

/** Renders `**bold**` and `*italic*` emphasis in tour copy. */
function TourEmphasis({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const token = /(\*\*[^*]+?\*\*|\*[^*]+?\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = token.exec(text)) != null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const raw = match[0]!;
    if (raw.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold text-pine">
          {raw.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={key++} className="italic text-ink/80">
          {raw.slice(1, -1)}
        </em>,
      );
    }
    last = match.index + raw.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

export function OverviewWalkthroughTrigger({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-2.5 border border-pine/20 bg-white/70 py-1.5 pl-1.5 pr-3.5 text-left transition-all duration-300 hover:border-pine/45 hover:bg-white hover:shadow-[0_10px_28px_-18px_rgba(20,53,44,0.45)]"
    >
      <span className="relative h-9 w-9 overflow-hidden rounded-full bg-pine ring-2 ring-celadon/40 transition-transform duration-300 group-hover:scale-[1.04]">
        <Image
          src="/davi.png"
          alt=""
          width={72}
          height={72}
          className="h-full w-full object-cover object-[center_18%]"
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Portal tour
        </span>
        <span className="block text-sm font-medium text-pine">
          Walkthrough Guide with {ASSISTANT_NAME}
        </span>
      </span>
    </button>
  );
}

function expandNavGroup(groupId: string) {
  openTourSidebar(groupId);
}

function openTourSidebar(groupId?: string) {
  window.dispatchEvent(
    new CustomEvent(SOD_ADMIN_TOUR_EXPAND_EVENT, {
      detail: { groupId },
    }),
  );
}

function ensureDriver(): Driver {
  return driver({
    animate: true,
    allowClose: false,
    allowKeyboardControl: false,
    overlayClickBehavior: () => {},
    overlayColor: "rgba(12, 28, 24, 0.78)",
    overlayOpacity: 0.78,
    stagePadding: 12,
    stageRadius: 2,
    popoverClass: "sod-david-tour-popover",
    disableActiveInteraction: true,
  });
}

function highlightStep(
  instance: Driver,
  selector: string,
  onPrepared?: (placement: DavidHudPlacement) => void,
) {
  highlightTourTarget(instance, selector, onPrepared);
}

export function OverviewWalkthrough({
  open,
  stepIndex,
  pathname,
  search,
  firstName,
  onClose,
  onFinish,
  onNext,
  onBack,
  onRequestTab,
}: OverviewWalkthroughProps) {
  const driverRef = useRef<Driver | null>(null);
  const endingRef = useRef(false);
  const [highlightTick, setHighlightTick] = useState(0);
  const [hudPlacement, setHudPlacement] = useState<DavidHudPlacement | null>(
    null,
  );
  const onCloseRef = useRef(onClose);
  const onFinishRef = useRef(onFinish);
  const onRequestTabRef = useRef(onRequestTab);

  const step = OVERVIEW_TOUR_STEPS[stepIndex] ?? OVERVIEW_TOUR_STEPS[0]!;
  const isLast = stepIndex >= OVERVIEW_TOUR_STEPS.length - 1;
  const onStepPage = tourHrefReady(pathname, search, tourStepPath(step));

  useEffect(() => {
    onCloseRef.current = onClose;
    onFinishRef.current = onFinish;
    onRequestTabRef.current = onRequestTab;
  }, [onClose, onFinish, onRequestTab]);

  useEffect(() => {
    if (!open) {
      endingRef.current = false;
      teardownTourDriver(driverRef.current);
      driverRef.current = null;
      return;
    }
    endingRef.current = false;
    return () => {
      endingRef.current = true;
      teardownTourDriver(driverRef.current);
      driverRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    setHighlightTick(0);
    setHudPlacement(null);
  }, [stepIndex]);

  useEffect(() => {
    if (!open || endingRef.current) return;
    const current = OVERVIEW_TOUR_STEPS[stepIndex];
    if (!current) return;

    // Wait until soft-navigation lands on this step's page (and query).
    if (!tourHrefReady(pathname, search, tourStepPath(current))) {
      teardownTourDriver(driverRef.current);
      driverRef.current = null;
      return;
    }

    if (current.expandNavGroup) expandNavGroup(current.expandNavGroup);
    else if (tourStepNeedsOpenSidebar(current.target)) openTourSidebar();
    if (current.tab) onRequestTabRef.current(current.tab);

    if (!current.target) {
      teardownTourDriver(driverRef.current);
      driverRef.current = null;
      return;
    }

    const needsSidebar = tourStepNeedsOpenSidebar(
      current.target,
      current.expandNavGroup,
    );

    let attempts = 0;
    let timer = 0;

    const run = () => {
      if (endingRef.current) return;
      const el = document.querySelector(current.target!);
      if (!el && attempts < 24) {
        attempts += 1;
        timer = window.setTimeout(run, 150);
        return;
      }
      if (!driverRef.current) driverRef.current = ensureDriver();
      highlightStep(driverRef.current, current.target!, setHudPlacement);
      setHighlightTick((tick) => tick + 1);
    };

    timer = window.setTimeout(
      run,
      needsSidebar ? 420 : current.tab ? 280 : 80,
    );
    return () => window.clearTimeout(timer);
  }, [open, stepIndex, pathname, search]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") endTour("close");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function endTour(mode: "close" | "finish") {
    if (endingRef.current) return;
    endingRef.current = true;
    teardownTourDriver(driverRef.current);
    driverRef.current = null;
    if (mode === "finish") onFinishRef.current();
    else onCloseRef.current();
  }

  function goNext() {
    if (isLast) {
      endTour("finish");
      return;
    }
    onNext();
  }

  if (!open) return null;

  const greetingName = firstName.trim() || "there";
  const title =
    stepIndex === 0 ? `Hey ${greetingName}` : step.title;
  const dimOnly = !step.target || !onStepPage;
  const trackSpotlight = Boolean(step.target) && onStepPage;

  return (
    <>
      {dimOnly ? (
        <div
          className="sod-david-tour-hud fixed inset-0 z-[10000] bg-[rgba(12,28,24,0.78)]"
          aria-hidden
        />
      ) : null}
      <DavidTourHud
        open={open}
        stepKey={`${step.id}-${highlightTick}`}
        trackSpotlight={trackSpotlight}
        spotlightSelector={step.target ?? null}
        preferredPlacement={hudPlacement}
        titleId="overview-tour-title"
      >
        <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 bg-pine px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-mist">
                  <span
                    className="inline-block h-1.5 w-1.5 animate-pulse bg-celadon"
                    aria-hidden
                  />
                  Quest {step.quest} / {OVERVIEW_TOUR_QUEST_COUNT}
                </span>
                <button
                  type="button"
                  onClick={() => endTour("close")}
                  className="text-xs font-medium text-ink/45 transition-colors hover:text-pine"
                  aria-label="Skip walk-through"
                >
                  Skip
                </button>
              </div>

              <p className="mt-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                {step.questLabel} · {step.id}
                {!onStepPage ? " · Opening desk…" : ""}
              </p>
              <p className="mt-2 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                {ASSISTANT_NAME}
              </p>
              <h2
                id="overview-tour-title"
                className="mt-1 font-display text-xl leading-tight tracking-[-0.02em] text-pine sm:text-2xl"
              >
                <TourEmphasis text={title} />
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/70">
                <TourEmphasis text={step.body} />
              </p>

              <div
                className="mt-4 flex flex-wrap items-center gap-1.5"
                aria-hidden
              >
                {OVERVIEW_TOUR_STEPS.filter((s) => s.quest === step.quest).map(
                  (s) => {
                    const absoluteIndex = OVERVIEW_TOUR_STEPS.findIndex(
                      (x) => x.id === s.id,
                    );
                    return (
                      <span
                        key={s.id}
                        className={`h-1.5 w-1.5 border border-pine sm:h-2 sm:w-2 ${
                          absoluteIndex === stepIndex
                            ? "bg-pine"
                            : absoluteIndex < stepIndex
                              ? "bg-celadon border-celadon"
                              : "bg-transparent"
                        }`}
                      />
                    );
                  },
                )}
              </div>
              <p className="mt-2 text-[0.65rem] tabular-nums text-ink/35">
                Stop {stepIndex + 1} of {OVERVIEW_TOUR_STEPS.length}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {stepIndex > 0 ? (
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex min-h-[2.6rem] items-center justify-center border border-pine/30 px-3.5 py-2 text-sm font-medium text-pine transition-colors hover:border-pine"
                  >
                    Back
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!onStepPage && Boolean(step.target)}
                  className="inline-flex min-h-[2.6rem] flex-1 items-center justify-center bg-pine px-4 py-2 text-sm font-semibold tracking-wide text-mist transition-transform hover:bg-celadon active:scale-[0.98] disabled:opacity-50 sm:flex-none"
                >
                  {!onStepPage ? "Opening…" : step.cta}
                </button>
              </div>
      </DavidTourHud>
    </>
  );
}
