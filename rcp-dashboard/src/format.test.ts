import { describe, expect, it } from "vitest";
import { monitorState, outcomeTone, relativeTime } from "./format";
import type { MonitorOverview } from "./types";

const monitor: MonitorOverview = {
  id: "monitor-1",
  name: "Checkout API",
  targetUrl: "https://example.com/",
  enabled: true,
  nextCheckAt: null,
  incidentStatus: "HEALTHY",
  latestVerdict: "UP",
  latestCheckedAt: null,
};

describe("format", () => {
  it("treats only target-facing failures as faults, matching the backend verdict policy", () => {
    expect(outcomeTone("HTTP_RESPONSE", 204)).toBe("good");
    expect(outcomeTone("HTTP_RESPONSE", 503)).toBe("fault");
    expect(outcomeTone("CONNECT_TIMEOUT", null)).toBe("fault");
    expect(outcomeTone("UNSAFE_TARGET", null)).toBe("muted");
    expect(outcomeTone("RESPONSE_TOO_LARGE", null)).toBe("muted");
  });

  it("lets an open incident outrank a recovered latest check, and a pause outrank both", () => {
    expect(monitorState({ ...monitor, incidentStatus: "OPEN" })).toEqual({ label: "Incident", tone: "fault" });
    expect(monitorState({ ...monitor, incidentStatus: "OPEN", enabled: false }).label).toBe("Paused");
    expect(monitorState({ ...monitor, latestVerdict: "DISAGREEMENT" }).tone).toBe("warn");
  });

  it("formats compact relative times", () => {
    const now = Date.parse("2026-09-29T12:00:00Z");
    expect(relativeTime("2026-09-29T11:59:58Z", now)).toBe("just now");
    expect(relativeTime("2026-09-29T11:59:30Z", now)).toBe("30s ago");
    expect(relativeTime("2026-09-29T11:00:00Z", now)).toBe("1h ago");
    expect(relativeTime("2026-09-29T12:05:00Z", now)).toBe("in 5m");
    expect(relativeTime(null, now)).toBe("—");
  });
});
