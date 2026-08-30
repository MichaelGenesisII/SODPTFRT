/** Shared walk-through timing and DOM helpers (admin + student). */

import {
  estimateDavidHudSize,
  prepareTourTargetViewport,
  type DavidHudPlacement,
} from "@/lib/tour/david-hud-placement";

export const TOUR_TARGET_POLL_MS = 150;
export const TOUR_TARGET_MAX_ATTEMPTS = 40;
export const TOUR_NAV_POLL_MS = 100;
export const TOUR_NAV_MAX_MS = 8000;
export const TOUR_NAV_RETRY_MS = 1500;

export type LiveTourLocation = {
  pathname: string;
  hash: string;
  search: string;
};

export function readLiveTourLocation(): LiveTourLocation {
  if (typeof window === "undefined") {
    return { pathname: "", hash: "", search: "" };
  }
  return {
    pathname: window.location.pathname,
    hash: window.location.hash,
    search: window.location.search.replace(/^\?/, ""),
  };
}

export function resolveTourTarget(
  primary?: string,
  fallbacks: string[] = [],
): string | null {
  if (primary && document.querySelector(primary)) return primary;
  for (const selector of fallbacks) {
    if (document.querySelector(selector)) return selector;
  }
  return null;
}

let highlightEpoch = 0;
let highlightFollowupFrame = 0;

/** Remove driver.js scroll locks and stray overlay nodes left after teardown. */
export function releaseDriverTourLock() {
  if (typeof document === "undefined") return;

  for (const root of [document.documentElement, document.body]) {
    root.classList.remove(
      "driver-active",
      "driver-no-scroll",
      "driver-no-interaction",
      "driver-fade",
    );
    root.style.overflow = "";
    root.style.pointerEvents = "";
  }

  document
    .querySelectorAll(
      ".driver-active-element, .driver-active-element-parent-no-scroll",
    )
    .forEach((node) => {
      node.classList.remove(
        "driver-active-element",
        "driver-active-element-parent-no-scroll",
      );
      if (node instanceof HTMLElement) {
        node.style.pointerEvents = "";
        node.style.overflow = "";
      }
    });

  document.querySelectorAll(".driver-overlay").forEach((node) => node.remove());
  document.querySelectorAll(".driver-dummy-element").forEach((node) => node.remove());
  document
    .querySelectorAll(".driver-popover:not(.sod-david-tour-popover)")
    .forEach((node) => node.remove());
}

/** Cancel pending highlight frames and fully tear down a driver instance. */
export function teardownTourDriver(instance?: { destroy?: () => void } | null) {
  highlightEpoch += 1;
  if (highlightFollowupFrame) {
    cancelAnimationFrame(highlightFollowupFrame);
    highlightFollowupFrame = 0;
  }
  try {
    instance?.destroy?.();
  } catch {
    // Driver may already be destroyed if a rAF follow-up lost the race.
  }
  releaseDriverTourLock();
}

export function highlightTourTarget(
  instance: {
    highlight: (opts: {
      element?: HTMLElement;
      popover: { title: string; description: string };
    }) => void;
  },
  selector: string | null,
  onPrepared?: (placement: DavidHudPlacement) => void,
) {
  if (selector) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      const epoch = highlightEpoch;
      const hudSize = estimateDavidHudSize();
      const placement = prepareTourTargetViewport(el, hudSize);
      onPrepared?.(placement);

      const highlight = () => {
        if (epoch !== highlightEpoch) return;
        instance.highlight({
          element: el,
          popover: { title: " ", description: " " },
        });
      };

      highlight();
      highlightFollowupFrame = requestAnimationFrame(() => {
        if (epoch !== highlightEpoch) return;
        const finalPlacement = prepareTourTargetViewport(el, hudSize);
        onPrepared?.(finalPlacement);
        highlight();
      });
      return;
    }
  }
  instance.highlight({
    popover: { title: " ", description: " " },
  });
}
