import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RollingText } from "./RollingText";

afterEach(cleanup);

describe("RollingText", () => {
  it("keeps the readable value for assistive tech and positions each digit strip", () => {
    const { container, rerender } = render(<RollingText value="92.9%" />);
    expect(screen.getByLabelText("92.9%")).toBeInTheDocument();
    const strips = () => [...container.querySelectorAll<HTMLElement>(".rolling-strip")].map((strip) => strip.style.transform);
    expect(strips()).toEqual(["translateY(-90%)", "translateY(-20%)", "translateY(-90%)"]);

    rerender(<RollingText value="93.4%" />);
    expect(strips()).toEqual(["translateY(-90%)", "translateY(-30%)", "translateY(-40%)"]);
  });
});
