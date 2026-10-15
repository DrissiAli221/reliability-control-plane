import { afterEach, describe, expect, it, vi } from "vitest";
import { listMonitors, getMonitor, availability, reliabilityReportHtml } from "./api";
import { ApiError, isNotFound } from "./apiError";
import { accessToken, redirectToSignIn, sessionRejected } from "./auth";

vi.mock("./auth", () => ({ accessToken: vi.fn(), redirectToSignIn: vi.fn(), sessionRejected: vi.fn() }));

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("api session handling", () => {
  it("renews a rejected local token once and retries the request", async () => {
    vi.mocked(accessToken).mockResolvedValueOnce("stale").mockResolvedValueOnce("fresh");
    vi.mocked(sessionRejected).mockResolvedValue("retry");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(200, []));

    await expect(listMonitors()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1]?.headers).toMatchObject({ Authorization: "Bearer fresh" });
    expect(redirectToSignIn).not.toHaveBeenCalled();
  });

  it("sends the operator to sign in when a Cognito session is rejected, instead of reporting an outage", async () => {
    vi.mocked(accessToken).mockResolvedValue("expired");
    vi.mocked(sessionRejected).mockResolvedValue("redirected");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(401, {}));

    await expect(listMonitors()).rejects.toThrow("Your session expired");
    expect(sessionRejected).toHaveBeenCalledOnce();
  });

  it("does not loop when a renewed token is rejected too", async () => {
    vi.mocked(accessToken).mockResolvedValue("still-bad");
    vi.mocked(sessionRejected).mockResolvedValue("retry");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(401, {}));

    await expect(listMonitors()).rejects.toThrow("Your session expired");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(redirectToSignIn).toHaveBeenCalledOnce();
  });

  it("goes to sign in when there is no session at all", async () => {
    vi.mocked(accessToken).mockResolvedValue(null);
    const fetch = vi.spyOn(globalThis, "fetch");

    await expect(listMonitors()).rejects.toThrow("Sign in to continue");
    expect(redirectToSignIn).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still reports real API errors with their problem detail", async () => {
    vi.mocked(accessToken).mockResolvedValue("ok");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(503, { detail: "Database unavailable" }));

    await expect(listMonitors()).rejects.toThrow("Database unavailable");
    expect(sessionRejected).not.toHaveBeenCalled();
  });

  it("keeps the status on errors so a missing monitor is not mistaken for an outage", async () => {
    vi.mocked(accessToken).mockResolvedValue("ok");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(404, { title: "Monitor not found", detail: "Monitor not found" }));

    const reason = await getMonitor("gone").catch((error: unknown) => error);
    expect(reason).toBeInstanceOf(ApiError);
    expect(isNotFound(reason)).toBe(true);
    expect(isNotFound(new ApiError("down", 503))).toBe(false);
    expect(isNotFound(new Error("Monitor not found"))).toBe(false);
  });

  it("asks for a preset window by days rather than computing instants in the browser", async () => {
    vi.mocked(accessToken).mockResolvedValue("ok");
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(200, {}));

    await availability("m1", 30);
    await reliabilityReportHtml("m1", 90);

    expect(String(fetch.mock.calls[0][0])).toBe("/api/monitors/m1/availability?days=30");
    expect(String(fetch.mock.calls[1][0])).toBe("/api/monitors/m1/reliability-report/html?days=90");
  });
});
