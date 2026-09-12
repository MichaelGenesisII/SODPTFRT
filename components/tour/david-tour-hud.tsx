"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  computeDavidHudPlacement,
  davidHudContainerClass,
  davidOnLeft,
  DAVID_HUD_DEFAULT_PLACEMENT,
  estimateDavidHudSize,
  readSpotlightBox,
  spotlightRequiresHudOverlap,
  type DavidHudPlacement,
} from "@/lib/tour/david-hud-placement";
import { ASSISTANT_NAME } from "@/lib/assistant/persona";

type DavidTourHudProps = {
  open: boolean;
  stepKey: string | number;
  trackSpotlight?: boolean;
  spotlightSelector?: string | null;
  preferredPlacement?: DavidHudPlacement | null;
  titleId: string;
  children: ReactNode;
};

export function DavidTourHud({
  open,
  stepKey,
  trackSpotlight = true,
  spotlightSelector = null,
  preferredPlacement = null,
  titleId,
  children,
}: DavidTourHudProps) {
  const hudRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<DavidHudPlacement>(
    preferredPlacement ?? DAVID_HUD_DEFAULT_PLACEMENT,
  );

  useEffect(() => {
    if (preferredPlacement) {
      setPlacement(preferredPlacement);
    }
  }, [preferredPlacement, stepKey]);

  useEffect(() => {
    if (!open) return;

    let frame = 0;
    let timers: number[] = [];

    const measure = () => {
      const node = hudRef.current;
      const est = estimateDavidHudSize();
      const rect = node?.getBoundingClientRect();
      const width = rect && rect.width > 80 ? rect.width : est.width;
      const height = rect && rect.height > 80 ? rect.height : est.height;
      const spotlight = trackSpotlight
        ? readSpotlightBox(spotlightSelector)
        : null;

      if (
        spotlight &&
        spotlightRequiresHudOverlap(spotlight, width, height)
      ) {
        setPlacement(DAVID_HUD_DEFAULT_PLACEMENT);
        return;
      }

      if (preferredPlacement) {
        setPlacement(preferredPlacement);
        return;
      }

      const next = computeDavidHudPlacement(spotlight, width, height);
      setPlacement((prev) => (prev === next ? prev : next));
    };

    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    schedule();
    timers = [120, 320, 640].map((ms) => window.setTimeout(schedule, ms));

    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open, stepKey, trackSpotlight, spotlightSelector, preferredPlacement]);

  const portraitLeft = davidOnLeft(placement);
  const anchorTop = placement.startsWith("top");

  return (
    <div
      className={`sod-david-tour-hud pointer-events-none fixed z-[10000001] flex p-3 transition-[top,right,bottom,left] duration-300 ease-out sm:p-5 ${davidHudContainerClass(placement)}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={hudRef}
        className={`pointer-events-auto relative flex w-full max-w-[28rem] gap-0 sm:max-w-[34rem] ${
          portraitLeft ? "flex-row-reverse" : "flex-row"
        } ${anchorTop ? "items-start" : "items-end"}`}
      >
        <div
          className={`animate-sheet-up relative min-w-0 flex-1 ${
            anchorTop
              ? portraitLeft
                ? "mt-6 ml-[-0.75rem] sm:mt-10 sm:ml-[-1.25rem]"
                : "mt-6 mr-[-0.75rem] sm:mt-10 sm:mr-[-1.25rem]"
              : portraitLeft
                ? "mb-6 ml-[-0.75rem] sm:mb-10 sm:ml-[-1.25rem]"
                : "mb-6 mr-[-0.75rem] sm:mb-10 sm:mr-[-1.25rem]"
          }`}
        >
          <div className="relative border-2 border-pine bg-mist px-4 py-4 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)] sm:px-5 sm:py-5">
            {children}
            <span
              className={`absolute h-4 w-4 rotate-45 border-pine bg-mist ${
                portraitLeft
                  ? `-left-2 border-b-2 border-l-2 ${anchorTop ? "top-16 sm:top-20" : "bottom-16 sm:bottom-20"}`
                  : `-right-2 border-r-2 border-t-2 ${anchorTop ? "top-16 sm:top-20" : "bottom-16 sm:bottom-20"}`
              }`}
              aria-hidden
            />
          </div>
        </div>

        <div
          className={`relative z-[1] shrink-0 self-end ${anchorTop ? "mt-0" : "mb-0"}`}
        >
          <div
            className={`pointer-events-none absolute rounded-full bg-celadon/25 blur-2xl ${
              portraitLeft
                ? "-right-3 bottom-8 h-24 w-24 sm:-right-4 sm:h-32 sm:w-32"
                : "-left-3 bottom-8 h-24 w-24 sm:-left-4 sm:h-32 sm:w-32"
            }`}
            aria-hidden
          />
          <div className="animate-fade-rise relative h-[9.5rem] w-[8.25rem] overflow-hidden sm:h-[13rem] sm:w-[11rem]">
            <Image
              src="/davi.png"
              alt={ASSISTANT_NAME}
              width={280}
              height={280}
              priority
              className="h-[120%] w-full object-cover object-[center_8%] drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]"
            />
            <div
              className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0c1c18]/80 to-transparent"
              aria-hidden
            />
          </div>
          <p className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-pine/90 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-mist">
            Guide
          </p>
        </div>
      </div>
    </div>
  );
}
