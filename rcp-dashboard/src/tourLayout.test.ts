import { describe, expect, it } from "vitest";
import { EDGE, placeCard, type Box, type Side } from "./tourLayout";

const SIDES: Side[] = ["below", "above", "left", "inside"];

/** Resolves a placement to the rectangle the card occupies (height 240 where it is not pinned by top and bottom). */
function rect(viewport: { width: number; height: number }, side: Side, frame: Box) {
  const p = placeCard(side, frame, viewport);
  const left = typeof p.left === "number" ? p.left : viewport.width - (p.right ?? 0) - p.width;
  const right = p.right !== undefined && p.left !== undefined ? viewport.width - p.right : left + p.width;
  const top = typeof p.top === "number" ? p.top : viewport.height - (p.bottom ?? 0) - 240;
  return { left, right, top, bottom: top + 240, width: p.width, p };
}

describe("placeCard", () => {
  it("caps the width at the existing size and shrinks it to fit small screens", () => {
    expect(placeCard("below", { top: 100, left: 100, width: 50, height: 20 }, { width: 1200, height: 800 }).width).toBe(340);
    expect(placeCard("below", { top: 100, left: 100, width: 50, height: 20 }, { width: 320, height: 640 }).width).toBe(288);
  });

  it("keeps a 16px margin on every side for any target position on desktop and tablet", () => {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 600, height: 900 }]) {
      for (const side of SIDES) {
        for (const left of [-40, 0, 20, viewport.width / 2, viewport.width - 10, viewport.width + 60]) {
          for (const top of [0, 30, viewport.height / 2, viewport.height - 20]) {
            const r = rect(viewport, side, { top, left, width: 120, height: 40 });
            if (side === "above") {
              expect(r.p.bottom).toBeGreaterThanOrEqual(EDGE);
            } else {
              expect(r.top).toBeGreaterThanOrEqual(EDGE);
              expect(r.bottom).toBeLessThanOrEqual(viewport.height - EDGE);
            }
            expect(r.left).toBeGreaterThanOrEqual(EDGE);
            expect(r.right).toBeLessThanOrEqual(viewport.width - EDGE);
          }
        }
      }
    }
  });

  it("docks to the bottom with 16px side margins on screens up to 480px wide", () => {
    for (const width of [320, 390, 480]) {
      const p = placeCard("below", { top: 10, left: 300, width: 80, height: 30 }, { width, height: 700 });
      expect(p).toEqual({ width: Math.min(340, width - 32), left: 16, right: 16, bottom: 16 });
    }
  });

  it("centres when there is no target", () => {
    expect(placeCard("centre", null, { width: 1000, height: 700 }).transform).toBe("translate(-50%, -50%)");
  });
});
