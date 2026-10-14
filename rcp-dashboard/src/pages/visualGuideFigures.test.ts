import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import availability from "../../public/visual-guide/availability.html?raw";
import deployment from "../../public/visual-guide/deployment.html?raw";
import embed from "../../public/visual-guide/embed.js?raw";
import lifecycle from "../../public/visual-guide/lifecycle.html?raw";
import machine from "../../public/visual-guide/machine.html?raw";
import verdicts from "../../public/visual-guide/verdicts.html?raw";

const FIGURES: Record<string, string> = { deployment, lifecycle, verdicts, availability, machine };

function load(name: string) {
  const dom = new JSDOM(FIGURES[name], {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window: Window) {
      (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
    },
  });
  return dom.window.document;
}

const pressed = (doc: Document) => [...doc.querySelectorAll<HTMLButtonElement>("button[data-filter]")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.filter);

describe.each(["deployment", "lifecycle"])("%s figure flow chips", (name) => {
  it("reflects the real state: a selected node clears the chips, clearing or picking a chip restores them", () => {
    const doc = load(name);
    expect(pressed(doc)).toEqual(["all"]);

    const chips = [...doc.querySelectorAll<HTMLButtonElement>("button[data-filter]")];
    chips[1].click();
    expect(pressed(doc)).toEqual([chips[1].dataset.filter]);

    const node = doc.querySelector<SVGGElement>("[data-node]")!;
    node.dispatchEvent(new (doc.defaultView as unknown as typeof globalThis).MouseEvent("click", { bubbles: true }));
    expect(node.getAttribute("aria-pressed")).toBe("true");
    expect(pressed(doc)).toEqual([]);
    expect(doc.querySelector(".active.dim, [data-filter].active")).toBeNull();

    doc.querySelector<HTMLButtonElement>("#clear-selection")!.click();
    expect(pressed(doc)).toEqual(["all"]);

    node.dispatchEvent(new (doc.defaultView as unknown as typeof globalThis).MouseEvent("click", { bubbles: true }));
    expect(pressed(doc)).toEqual([]);
    chips[2].click();
    expect(node.getAttribute("aria-pressed")).toBe("false");
    expect(pressed(doc)).toEqual([chips[2].dataset.filter]);
  });
});

describe("embedded figures", () => {
  it.each(["deployment", "lifecycle", "verdicts", "availability", "machine"])("%s has no standalone-figure link left", (name) => {
    expect(FIGURES[name]).not.toContain("figure-open");
    expect(embed).not.toContain("figure-open");
  });
});

describe("figure themes", () => {
  it.each(["deployment", "lifecycle", "verdicts", "availability"])("%s drives its colours from tokens with a light set and follows the system when standalone", (name) => {
    const html = FIGURES[name];
    const tokens = html.slice(html.indexOf('<style id="theme-tokens">'), html.indexOf("</style>", html.indexOf('<style id="theme-tokens">')));
    expect(tokens).toContain(':root[data-theme="light"]');
    expect(tokens).toContain("@media(prefers-color-scheme:light){:root:not([data-theme])");
    expect(tokens).toMatch(/--c-111111:#111111;/);
    // The dark surface and text colours are only ever referenced through their tokens in the figure's own CSS.
    const rest = html.replace(tokens, "");
    expect(rest).not.toMatch(/(?:fill|background|stroke):#111111/);
    expect(rest).toContain("var(--c-111111)");
  });

  it("exports the svg in the current theme", () => {
    for (const name of ["deployment", "lifecycle", "verdicts", "availability"]) expect(FIGURES[name]).toContain("copy.setAttribute('data-theme'");
  });

  it("applies the dashboard theme to every figure, and follows the system setting only when standalone", () => {
    expect(embed).toContain("document.documentElement.dataset.theme = theme");
    expect(embed).toContain("if (!embedded) scheme.addEventListener");
  });
});

