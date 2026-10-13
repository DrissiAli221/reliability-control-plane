export type Box = { top: number; left: number; width: number; height: number };
export type Viewport = { width: number; height: number };
export type Side = "below" | "above" | "left" | "inside" | "centre";
export type CardPlacement = {
  width: number;
  left?: number | string;
  right?: number;
  top?: number | string;
  bottom?: number;
  transform?: string;
};

export const CARD_MAX_WIDTH = 340;
export const CARD_HEIGHT = 240;
export const EDGE = 16;
export const DOCK_BREAKPOINT = 480;
export const GAP = 14;
export const PAD = 6;

export function cardWidth(viewport: Viewport): number {
  return Math.min(CARD_MAX_WIDTH, viewport.width - EDGE * 2);
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Where the tour card goes for a target. The card never leaves a 16px margin inside the viewport, and on narrow
 * screens it docks to the bottom edge instead of sitting next to the target.
 */
export function placeCard(side: Side, frame: Box | null, viewport: Viewport): CardPlacement {
  const width = cardWidth(viewport);
  if (viewport.width <= DOCK_BREAKPOINT) return { width, left: EDGE, right: EDGE, bottom: EDGE };
  if (side === "centre" || !frame) return { width, left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  const maxLeft = viewport.width - width - EDGE;
  const maxTop = viewport.height - CARD_HEIGHT - EDGE;
  const left = clamp(frame.left, EDGE, maxLeft);
  switch (side) {
    case "below": return { width, left, top: clamp(frame.top + frame.height + PAD + GAP, EDGE, maxTop) };
    // Anchored by its bottom edge so the card grows upward from the target.
    case "above": return { width, left, bottom: clamp(viewport.height - (frame.top - PAD - GAP), EDGE, viewport.height - EDGE) };
    case "left": return { width, left: clamp(frame.left - PAD - GAP - width, EDGE, maxLeft), top: clamp(frame.top, EDGE, maxTop) };
    default: return { width, left: clamp(frame.left + frame.width - width, EDGE, maxLeft), top: clamp(frame.top + EDGE, EDGE, maxTop) };
  }
}
