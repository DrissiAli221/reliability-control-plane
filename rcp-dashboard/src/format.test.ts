import { describe, expect, it } from "vitest";
import { elapsed, isBlockedCheck, monitorState, outcomeTone, relativeTime } from "./format";
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

  it("runs an incident clock that stays short at every scale", () => {
    expect(elapsed(65_000)).toBe("01:05");
    expect(elapsed(3_725_000)).toBe("1:02:05");
    expect(elapsed(2 * 86_400_000 + 3 * 3_600_000)).toBe("2d 03h");
    expect(elapsed(-5)).toBe("00:00");
  });
});

describe("isBlockedCheck", () => {
  const challenge = { outcome: "HTTP_RESPONSE", httpStatus: 403, botProtection: "CLOUDFLARE_CHALLENGE" };
  it("is blocked only when NO_DATA and every region was an unaccepted challenge", () => {
    expect(isBlockedCheck({ verdict: "NO_DATA", results: [challenge, challenge] })).toBe(true);
    expect(isBlockedCheck({ verdict: "DISAGREEMENT", results: [challenge, { outcome: "HTTP_RESPONSE", httpStatus: 200 }] })).toBe(false);
    expect(isBlockedCheck({ verdict: "NO_DATA", results: [challenge, { outcome: "UNSAFE_TARGET", httpStatus: null }] })).toBe(false);
    expect(isBlockedCheck({ verdict: "NO_DATA", acceptedHttpStatuses: [200, 403], results: [challenge] })).toBe(false);
    expect(isBlockedCheck({ verdict: "NO_DATA", results: [] })).toBe(false);
  });
});
