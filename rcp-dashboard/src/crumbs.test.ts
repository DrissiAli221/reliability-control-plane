import { describe, expect, it } from "vitest";
import { crumbs } from "./crumbs";

describe("top bar path", () => {
  it("names the section and links back up from a detail page", () => {
    expect(crumbs("/").map((c) => c.label)).toEqual(["rcp", "Overview"]);
    expect(crumbs("/monitors")).toEqual([{ label: "rcp", to: "/" }, { label: "Monitors", to: undefined }]);
    expect(crumbs("/monitors/3F2A9C1E-aaaa")).toEqual([
      { label: "rcp", to: "/" },
      { label: "Monitors", to: "/monitors" },
      { label: "3f2a9c1e" },
    ]);
  });
});
