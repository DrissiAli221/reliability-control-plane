import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileMenu } from "./AppShell";

afterEach(cleanup);

function setup() {
  const onLogout = vi.fn();
  render(
    <div>
      <button type="button">Elsewhere</button>
      <MobileMenu local={false} readOnly={false} theme="dark" onLogout={onLogout} />
    </div>,
  );
  return { trigger: screen.getByRole("button", { name: "More" }), onLogout };
}

describe("MobileMenu", () => {
  it("opens on click and exposes menu items", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent?.trim())).toEqual(["Light theme", "Sign out"]);
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
  });

  it("closes on Escape and returns focus to the button", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on an outside click and runs the chosen item", () => {
    const { trigger, onLogout } = setup();
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(onLogout).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
