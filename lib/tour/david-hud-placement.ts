/** David guide HUD placement — corner-hop when clear; bottom-right when overlap is unavoidable. */

export type DavidHudPlacement =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export const DAVID_HUD_DEFAULT_PLACEMENT: DavidHudPlacement = "bottom-right";

type Box = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const VIEWPORT_PAD = 12;
const SPOTLIGHT_MARGIN = 20;
const STAGE_PADDING = 12;

const PLACEMENTS: DavidHudPlacement[] = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
];

export function estimateDavidHudSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 676, height: 320 };
  }
  const vw = window.innerWidth;
  const bubble = Math.min(vw * 0.92, 544);
  const portrait = vw < 640 ? 132 : 176;
  return {
    width: bubble + portrait,
    height: vw < 640 ? 300 : 340,
  };
}

function hudBox(
  placement: DavidHudPlacement,
  width: number,
  height: number,
): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(width, vw - VIEWPORT_PAD * 2);
  const h = Math.min(height, vh - VIEWPORT_PAD * 2);

  switch (placement) {
    case "bottom-right":
      return {
        left: vw - w - VIEWPORT_PAD,
        top: vh - h - VIEWPORT_PAD,
        right: vw - VIEWPORT_PAD,
        bottom: vh - VIEWPORT_PAD,
        width: w,
        height: h,
      };
    case "bottom-left":
      return {
        left: VIEWPORT_PAD,
        top: vh - h - VIEWPORT_PAD,
        right: VIEWPORT_PAD + w,
        bottom: vh - VIEWPORT_PAD,
        width: w,
        height: h,
      };
    case "top-right":
      return {
        left: vw - w - VIEWPORT_PAD,
        top: VIEWPORT_PAD,
        right: vw - VIEWPORT_PAD,
        bottom: VIEWPORT_PAD + h,
        width: w,
        height: h,
      };
    case "top-left":
      return {
        left: VIEWPORT_PAD,
        top: VIEWPORT_PAD,
        right: VIEWPORT_PAD + w,
        bottom: VIEWPORT_PAD + h,
        width: w,
        height: h,
      };
  }
}

function elementBox(el: HTMLElement, stagePadding = STAGE_PADDING): Box {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top - stagePadding,
    left: rect.left - stagePadding,
    right: rect.right + stagePadding,
    bottom: rect.bottom + stagePadding,
    width: rect.width + stagePadding * 2,
    height: rect.height + stagePadding * 2,
  };
}

function overlaps(a: Box, b: Box, margin = SPOTLIGHT_MARGIN): boolean {
  return !(
    a.right + margin <= b.left ||
    a.left >= b.right + margin ||
    a.bottom + margin <= b.top ||
    a.top >= b.bottom + margin
  );
}

function distanceBetweenCenters(a: Box, b: Box): number {
  const ax = (a.left + a.right) / 2;
  const ay = (a.top + a.bottom) / 2;
  const bx = (b.left + b.right) / 2;
  const by = (b.top + b.bottom) / 2;
  return Math.hypot(ax - bx, ay - by);
}

/** Read the spotlight cutout bounds (driver stage + padding). */
export function readSpotlightBox(
  fallbackSelector?: string | null,
  stagePadding = STAGE_PADDING,
): Box | null {
  if (typeof window === "undefined") return null;

  const inflate = (rect: DOMRect): Box => ({
    top: rect.top - stagePadding,
    left: rect.left - stagePadding,
    right: rect.right + stagePadding,
    bottom: rect.bottom + stagePadding,
    width: rect.width + stagePadding * 2,
    height: rect.height + stagePadding * 2,
  });

  const active = document.querySelector<HTMLElement>(".driver-active-element");
  if (active) {
    const rect = active.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return inflate(rect);
  }

  if (fallbackSelector) {
    const el = document.querySelector<HTMLElement>(fallbackSelector);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return inflate(rect);
    }
  }

  return null;
}

/**
 * Hop to a clear corner when possible. Wide or low targets prefer top corners
 * so full-width tab bars can scroll above David.
 */
export function computeDavidHudPlacement(
  spotlight: Box | null,
  hudWidth: number,
  hudHeight: number,
): DavidHudPlacement {
  if (!spotlight || hudWidth <= 0 || hudHeight <= 0) {
    return DAVID_HUD_DEFAULT_PLACEMENT;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const wide = spotlight.width >= vw * 0.45;
  const low = spotlight.bottom >= vh * 0.42;

  const scored = PLACEMENTS.map((placement) => {
    const hud = hudBox(placement, hudWidth, hudHeight);
    return {
      placement,
      hud,
      overlaps: overlaps(hud, spotlight),
      distance: distanceBetweenCenters(hud, spotlight),
    };
  });

  const clear = scored.filter((item) => !item.overlaps);
  if (clear.length === 0) {
    return DAVID_HUD_DEFAULT_PLACEMENT;
  }

  if (wide || low) {
    const topClear = clear.filter((item) => item.placement.startsWith("top"));
    if (topClear.length > 0) {
      topClear.sort((a, b) => b.distance - a.distance);
      return topClear[0]!.placement;
    }
  }

  clear.sort((a, b) => b.distance - a.distance);
  return clear[0]!.placement;
}

/** True when the spotlight overlaps David in every corner — partial cover is OK. */
export function spotlightRequiresHudOverlap(
  spotlight: Box | null,
  hudWidth: number,
  hudHeight: number,
): boolean {
  if (!spotlight || hudWidth <= 0 || hudHeight <= 0) return false;
  return PLACEMENTS.every((placement) =>
    overlaps(hudBox(placement, hudWidth, hudHeight), spotlight),
  );
}

export function davidOnLeft(placement: DavidHudPlacement): boolean {
  return placement === "bottom-left" || placement === "top-left";
}

export function davidHudContainerClass(placement: DavidHudPlacement): string {
  switch (placement) {
    case "bottom-right":
      return "bottom-0 right-0 items-end justify-end";
    case "bottom-left":
      return "bottom-0 left-0 items-end justify-start";
    case "top-right":
      return "top-0 right-0 items-start justify-end";
    case "top-left":
      return "top-0 left-0 items-start justify-start";
  }
}

function stickyTopInset(): number {
  if (typeof window === "undefined") return VIEWPORT_PAD;

  let inset = VIEWPORT_PAD;
  for (const header of document.querySelectorAll<HTMLElement>("header")) {
    const style = getComputedStyle(header);
    if (style.position !== "sticky" && style.position !== "fixed") continue;
    const rect = header.getBoundingClientRect();
    if (rect.height > 0 && rect.top <= VIEWPORT_PAD + 4) {
      inset = Math.max(inset, rect.bottom + 8);
    }
  }
  return inset;
}

function scrollMarginsForPlacement(
  placement: DavidHudPlacement,
  hudSize: { width: number; height: number },
): { top: string; right: string; bottom: string; left: string } {
  const hud = hudBox(placement, hudSize.width, hudSize.height);
  const topInset = stickyTopInset();
  const m = SPOTLIGHT_MARGIN;
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  let top = `${topInset}px`;
  let bottom = `${VIEWPORT_PAD}px`;
  let left = `${VIEWPORT_PAD}px`;
  let right = `${VIEWPORT_PAD}px`;

  if (placement.startsWith("bottom")) {
    bottom = `${Math.max(VIEWPORT_PAD, vh - hud.top + m)}px`;
  } else {
    top = `${Math.max(topInset, hud.bottom + m)}px`;
  }

  if (placement.endsWith("right")) {
    right = `${Math.max(VIEWPORT_PAD, vw - hud.left + m)}px`;
  } else if (placement.endsWith("left")) {
    left = `${Math.max(VIEWPORT_PAD, hud.right + m)}px`;
  }

  return { top, right, bottom, left };
}

function scrollClearOfHud(
  el: HTMLElement,
  placement: DavidHudPlacement,
  hudSize: { width: number; height: number },
) {
  const margins = scrollMarginsForPlacement(placement, hudSize);
  const prev = {
    scrollMarginTop: el.style.scrollMarginTop,
    scrollMarginRight: el.style.scrollMarginRight,
    scrollMarginBottom: el.style.scrollMarginBottom,
    scrollMarginLeft: el.style.scrollMarginLeft,
  };

  el.style.scrollMarginTop = margins.top;
  el.style.scrollMarginRight = margins.right;
  el.style.scrollMarginBottom = margins.bottom;
  el.style.scrollMarginLeft = margins.left;

  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });

  const doc = document.scrollingElement ?? document.documentElement;
  if (placement.startsWith("bottom")) {
    const hud = hudBox(placement, hudSize.width, hudSize.height);
    const rect = el.getBoundingClientRect();
    const maxBottom = hud.top - SPOTLIGHT_MARGIN;
    if (rect.bottom > maxBottom) {
      doc.scrollTop += rect.bottom - maxBottom;
    }
  }

  el.style.scrollMarginTop = prev.scrollMarginTop;
  el.style.scrollMarginRight = prev.scrollMarginRight;
  el.style.scrollMarginBottom = prev.scrollMarginBottom;
  el.style.scrollMarginLeft = prev.scrollMarginLeft;
}

function placementStillCoversSpotlight(
  el: HTMLElement,
  placement: DavidHudPlacement,
  hudSize: { width: number; height: number },
): boolean {
  return overlaps(hudBox(placement, hudSize.width, hudSize.height), elementBox(el));
}

/**
 * Pick a corner, scroll the spotlight into the matching safe band, then highlight.
 */
export function prepareTourTargetViewport(
  el: HTMLElement,
  hudSize = estimateDavidHudSize(),
): DavidHudPlacement {
  const spotlight = elementBox(el);
  let placement = computeDavidHudPlacement(spotlight, hudSize.width, hudSize.height);

  scrollClearOfHud(el, placement, hudSize);

  if (placementStillCoversSpotlight(el, placement, hudSize)) {
    const fallbacks: DavidHudPlacement[] = [
      "top-left",
      "top-right",
      "bottom-left",
      DAVID_HUD_DEFAULT_PLACEMENT,
    ];
    for (const alt of fallbacks) {
      if (alt === placement) continue;
      scrollClearOfHud(el, alt, hudSize);
      if (!placementStillCoversSpotlight(el, alt, hudSize)) {
        placement = alt;
        break;
      }
    }
  }

  if (placementStillCoversSpotlight(el, placement, hudSize)) {
    const doc = document.scrollingElement ?? document.documentElement;
    const rect = el.getBoundingClientRect();
    const topInset = stickyTopInset();
    if (rect.top < topInset) {
      doc.scrollTop += rect.top - topInset;
    }
    const hud = hudBox(DAVID_HUD_DEFAULT_PLACEMENT, hudSize.width, hudSize.height);
    if (rect.bottom > hud.top - SPOTLIGHT_MARGIN) {
      doc.scrollTop += rect.bottom - (hud.top - SPOTLIGHT_MARGIN);
    }
  }

  return placement;
}
