import { describe, expect, it } from "vitest";
import { faviconSvg, tabTitle } from "./tabSignal";

describe("tab signal", () => {
  it("counts open incidents in the title only when there are any", () => {
    expect(tabTitle("Overview", 0)).toBe("RCP · Overview");
    expect(tabTitle("Pipeline", 2)).toBe("(2) RCP · Pipeline");
  });

  it("turns the favicon red while an incident is open", () => {
    expect(faviconSvg(false)).toContain('fill="#7c6cff"');
    expect(faviconSvg(true)).toContain('fill="#e5484d"');
  });
});
