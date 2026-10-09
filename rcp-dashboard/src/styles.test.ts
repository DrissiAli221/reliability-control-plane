import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Tests run from rcp-dashboard/ (jsdom gives import.meta.url a non-file scheme).
const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css);
  if (!match) throw new Error(`No rule for ${selector}`);
  return match[1];
}

describe("markers on tracks", () => {
  // The owner dislikes bright lines that stick out of a bar. A marker is a notch: the track's height, a cut in the panel colour.
  it.each([
    [".timeline-now", "var(--surface)"],
    [".drill-meter-now", "var(--bg)"],
  ])("%s is a 2px notch the height of its track", (selector, colour) => {
    const body = rule(selector);
    expect(body).toMatch(/top:\s*0[;\s]/);
    expect(body).toMatch(/bottom:\s*0[;\s]/);
    expect(body).toMatch(/width:\s*2px/);
    expect(body).toContain(`background: ${colour}`);
    expect(body).not.toMatch(/(top|bottom):\s*-/);
  });

  it("keeps the drill's now notch moving smoothly", () => {
    expect(rule(".drill-meter-now")).toContain("transition: left 1s linear");
  });
});
