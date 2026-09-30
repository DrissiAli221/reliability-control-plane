import { describe, expect, it } from "vitest";
import { applyTheme, toggleTheme } from "./theme";

describe("theme", () => {
  it("toggles between dark and light and remembers the choice", () => {
    applyTheme("dark");
    toggleTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("rcp.theme")).toBe("light");
    toggleTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
