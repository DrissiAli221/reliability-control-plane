import { describe, expect, it } from "vitest";
import { ApiError } from "./apiError";
import { capacityLine, capacityOf, capacityReason, createErrorMessage } from "./capacity";
import type { Session } from "./types";

const limits = { maxPerOwner: 5, maxTotal: 30, minIntervalSeconds: 60, maxTimeoutMs: 5000 };
const session = (owned: number, total: number, over: Partial<Session["limits"]> = {}): Session => ({
  subject: "s", readOnly: false, limits: { ...limits, ...over }, usage: { ownedMonitors: owned, totalMonitors: total },
});

describe("capacity", () => {
  it("says nothing until the server reports usage", () => {
    const capacity = capacityOf({ subject: "s", readOnly: false, limits });
    expect(capacity.known).toBe(false);
    expect(capacityLine(capacity)).toBeNull();
    expect(capacityReason(capacity)).toBeNull();
    expect(capacityOf(null).full).toBe(false);
  });

  it("shows own and shared use in one quiet line", () => {
    expect(capacityLine(capacityOf(session(2, 8)))).toBe("2 of 5 yours · 8 of 30 on this demo");
    expect(capacityLine(capacityOf(session(2, 8)), true)).toBe("8 of 30 on this demo");
    expect(capacityLine(capacityOf(session(2, 8, { maxTotal: 0 })))).toBe("2 of 5 yours");
  });

  it("explains a full demo in plain words, and a full account separately", () => {
    const total = capacityReason(capacityOf(session(1, 30)));
    expect(total).toBe("This demo runs at most 30 monitors across all accounts so its cloud costs stay bounded; each account can have 5.");
    expect(capacityReason(capacityOf(session(5, 12)))).toMatch(/already have 5 of 5 monitors/);
    expect(capacityOf(session(5, 12)).ownerFull).toBe(true);
    expect(capacityReason(capacityOf(session(4, 29)))).toBeNull();
  });

  it("never treats an unlimited deployment as full", () => {
    expect(capacityOf(session(1, 999, { maxTotal: 0 })).totalFull).toBe(false);
  });

  it("rewrites the API's terse capacity answers", () => {
    const deployment = new ApiError("This deployment already runs its maximum of 30 monitors", 409, "Deployment monitor limit reached");
    expect(createErrorMessage(deployment, limits)).toBe("This demo runs at most 30 monitors across all accounts so its cloud costs stay bounded; each account can have 5.");
    const owner = new ApiError("Maximum of 5 monitors per owner reached", 409, "Monitor quota reached");
    expect(createErrorMessage(owner, limits)).toMatch(/^You already have 5 of 5 monitors/);
  });

  it("leaves every other error as the server said it", () => {
    expect(createErrorMessage(new ApiError("Unsafe target", 400, "Unsafe monitoring target"))).toBe("Unsafe target");
    expect(createErrorMessage(new Error("offline"))).toBe("offline");
    expect(createErrorMessage("odd")).toBe("Monitor could not be created");
  });
});
