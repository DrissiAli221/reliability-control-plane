import { describe, expect, it } from "vitest";
import { ALL_STEPS, TOUR, stepsFor, tour } from "./tour";

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
    expect(new Set(ALL_STEPS.map((step) => step.target)).size).toBe(ALL_STEPS.length);
  });

  it("shows the local fault switch only locally and the scheduled outage drill only when deployed", () => {
    const local = stepsFor(true).map((step) => step.target);
    const deployed = stepsFor(false).map((step) => step.target);
    expect(local).toContain("drill");
    expect(local).not.toContain("outage-drill");
    expect(deployed).not.toContain("drill");
    expect(deployed).toContain("outage-drill");
    // Everything else is the same story in both.
    expect(local.filter((target) => target !== "drill")).toEqual(deployed.filter((target) => target !== "outage-drill"));
  });

  it("marks the steps that depend on a target as optional, and describes the drill accurately", () => {
    const fault = ALL_STEPS.find((step) => step.target === "drill")!;
    const outage = ALL_STEPS.find((step) => step.target === "outage-drill")!;
    expect(fault).toMatchObject({ only: "local", optional: true, route: "/pipeline" });
    expect(outage).toMatchObject({ only: "deployed", optional: true, route: "monitor", monitor: "drill" });
    expect(outage.body).toMatch(/two-hour UTC cycles/);
    expect(outage.body).toMatch(/countdown is a forecast/);
    expect(outage.body).not.toMatch(/locally/i);
  });

  it("skips onward, or back when going back, and never below the first step", () => {
    tour.go(3);
    tour.go(4);
    tour.skip(4);
    expect(sessionStorage.getItem("rcp.tour.step")).toBe("5");
    tour.go(4);
    tour.skip(4);
    expect(sessionStorage.getItem("rcp.tour.step")).toBe("3");
    tour.go(1);
    tour.go(0);
    tour.skip(0);
    expect(sessionStorage.getItem("rcp.tour.step")).toBe("1");
    tour.stop();
  });
});
