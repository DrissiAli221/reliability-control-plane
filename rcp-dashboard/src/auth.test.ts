import { afterEach, describe, expect, it, vi } from "vitest";
import { accessToken, isLocalAuth, sessionRejected } from "./auth";

const token = (value: string, expiresInSeconds: number) =>
  new Response(JSON.stringify({ accessToken: value, tokenType: "Bearer", expiresInSeconds }), { status: 200 });

afterEach(async () => {
  await sessionRejected();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("local development session", () => {
  it("runs in local mode under the test build", () => {
    expect(isLocalAuth()).toBe(true);
  });

  it("reuses a token until shortly before it expires, then fetches a new one", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-30T12:00:00Z") });
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(token("first", 3600)).mockResolvedValueOnce(token("second", 3600));

    expect(await accessToken()).toBe("first");
    vi.advanceTimersByTime(3_000_000);
    expect(await accessToken()).toBe("first");
    vi.advanceTimersByTime(580_000);
    expect(await accessToken()).toBe("second");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("drops a token the API rejected so the next request gets a fresh one", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(token("rejected", 3600)).mockResolvedValueOnce(token("fresh", 3600));

    expect(await accessToken()).toBe("rejected");
    expect(await sessionRejected()).toBe("retry");
    expect(await accessToken()).toBe("fresh");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares one token request between parallel callers", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(token("shared", 3600));

    const tokens = await Promise.all([accessToken(), accessToken(), accessToken()]);
    expect(tokens).toEqual(["shared", "shared", "shared"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
