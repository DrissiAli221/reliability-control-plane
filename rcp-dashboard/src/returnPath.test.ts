import { afterEach, describe, expect, it, vi } from "vitest";
import { rememberReturnPath, takeReturnPath } from "./returnPath";

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

describe("restored sign-in page", () => {
  it("recognises the page it restored, once", () => {
    rememberReturnPath("/monitors/abc?check=1");
    expect(takeReturnPath("/monitors/abc?check=1")).toBe(true);
    expect(takeReturnPath("/monitors/abc?check=1")).toBe(false);
  });

  it("ignores another page and forgets the mark when asked about it", () => {
    rememberReturnPath("/monitors/abc");
    expect(takeReturnPath("/monitors/other")).toBe(false);
    expect(takeReturnPath("/monitors/abc")).toBe(false);
  });

  it("does not remember the home page or a stale restore", () => {
    rememberReturnPath("/");
    expect(takeReturnPath("/")).toBe(false);
    vi.useFakeTimers();
    rememberReturnPath("/monitors/abc");
    vi.advanceTimersByTime(3 * 60_000);
    expect(takeReturnPath("/monitors/abc")).toBe(false);
  });
});
