import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DailyEvidence } from "../types";
import { Tracker } from "./Tracker";

afterEach(cleanup);

const days: DailyEvidence[] = [
  { day: "2026-09-28", up: 0, down: 0, disagreement: 0, noData: 0, status: "NO_DATA" },
  { day: "2026-09-29", up: 2_879, down: 1, disagreement: 0, noData: 0, status: "OUTAGE" },
];

describe("Tracker", () => {
  it("keeps a single confirmed DOWN visible without painting the whole day red", () => {
    render(<Tracker days={days} label="Checkout API, last 2 days" />);

    const outageDay = screen.getByRole("listitem", { name: "29 Sept: Confirmed downtime" });
    const down = outageDay.querySelector("i.down") as HTMLElement;
    const up = outageDay.querySelector("i.up") as HTMLElement;
    expect(Number(down.style.flexGrow)).toBeCloseTo(0.18);
    expect(Number(up.style.flexGrow)).toBeCloseTo(0.82);
    expect(screen.getByRole("listitem", { name: "28 Sept: No data" }).children).toHaveLength(0);
  });

  it("spells out the day's counts on hover", () => {
    render(<Tracker days={days} label="Checkout API, last 2 days" />);

    fireEvent.mouseEnter(screen.getByRole("listitem", { name: "29 Sept: Confirmed downtime" }));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Confirmed downtime");
    expect(tooltip).toHaveTextContent("Up2,879");
    expect(tooltip).toHaveTextContent("Down1");
  });
});
