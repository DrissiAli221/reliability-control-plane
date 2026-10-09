import "@testing-library/jest-dom/vitest";
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOUR, tour } from "../tour";
import { Tour } from "./Tour";

vi.mock("../api", () => ({ listMonitors: vi.fn(async () => []) }));

const stored = () => sessionStorage.getItem("rcp.tour.step");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
});
afterEach(() => {
  cleanup();
  tour.stop();
  vi.useRealTimers();
});

describe("Tour", () => {
  it("skips an optional step whose target is not on the page, instead of centring a claim about it", () => {
    const fault = TOUR.findIndex((step) => step.target === "drill");
    expect(fault).toBeGreaterThan(0); // the local profile has the fault switch step
    tour.go(fault);
    render(<MemoryRouter initialEntries={["/pipeline"]}><Tour /></MemoryRouter>);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(stored()).toBe(String(fault)); // still looking for it
    act(() => { vi.advanceTimersByTime(1000); });
    expect(stored()).toBe(String(fault + 1)); // gone from the page: on to the next step
  });

  it("keeps the fault switch step, and does not skip it, while its target is there", () => {
    const fault = TOUR.findIndex((step) => step.target === "drill");
    tour.go(fault);
    const target = document.createElement("div");
    target.dataset.tour = "drill";
    target.scrollIntoView = () => {}; // jsdom has no scrolling
    document.body.append(target);
    render(<MemoryRouter initialEntries={["/pipeline"]}><Tour /></MemoryRouter>);

    act(() => { vi.advanceTimersByTime(4000); });
    expect(stored()).toBe(String(fault));
    target.remove();
  });

  it("still centres a core step whose target is missing", () => {
    const stages = TOUR.findIndex((step) => step.target === "stages");
    tour.go(stages);
    render(<MemoryRouter initialEntries={["/pipeline"]}><Tour /></MemoryRouter>);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(stored()).toBe(String(stages));
    expect(document.querySelector(".tour-card")).not.toBeNull();
  });
});
