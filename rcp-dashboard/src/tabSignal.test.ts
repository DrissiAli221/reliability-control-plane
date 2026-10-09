import { describe, expect, it } from "vitest";
import { faviconSvg, incidentChanges, tabTitle } from "./tabSignal";
import type { MonitorOverview } from "./types";

describe("tab signal", () => {
  it("counts open incidents in the title only when there are any", () => {
    expect(tabTitle("Overview", 0)).toBe("RCP · Overview");
    expect(tabTitle("Pipeline", 2)).toBe("(2) RCP · Pipeline");
  });

  it("turns the favicon red while an incident is open", () => {
    expect(faviconSvg(false)).toContain('fill="#7c63ff"');
    expect(faviconSvg(false)).not.toContain('fill="#e5484d"');
    expect(faviconSvg(true)).toContain('fill="#e5484d"');
  });

  it("announces only transitions after the first poll", () => {
    const monitor = (id: string, open: boolean): MonitorOverview => ({
      id, name: id, targetUrl: "https://example.com", enabled: true, nextCheckAt: null,
      incidentStatus: open ? "OPEN" : "HEALTHY", latestVerdict: open ? "DOWN" : "UP", latestCheckedAt: null,
    });
    expect(incidentChanges(null, [monitor("a", true)], 1)).toEqual([]);
    const previous = new Map([["a", false], ["b", true], ["c", true]]);
    const changes = incidentChanges(previous, [monitor("a", true), monitor("b", false), monitor("c", true), monitor("new", true)], 2);
    expect(changes.map((change) => [change.monitorId, change.kind])).toEqual([["a", "opened"], ["b", "resolved"]]);
  });
});
