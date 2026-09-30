import { describe, expect, it } from "vitest";
import { TOUR, tour } from "./tour";

describe("tour", () => {
  it("keeps its step in session storage and ends past the last step", () => {
    tour.start();
    expect(sessionStorage.getItem("rcp.tour.step")).toBe("0");
    tour.go(TOUR.length - 1);
    expect(sessionStorage.getItem("rcp.tour.step")).toBe(String(TOUR.length - 1));
    tour.go(TOUR.length);
    expect(sessionStorage.getItem("rcp.tour.step")).toBeNull();
  });

  it("gives every step a unique target", () => {
    expect(new Set(TOUR.map((step) => step.target)).size).toBe(TOUR.length);
  });
});
