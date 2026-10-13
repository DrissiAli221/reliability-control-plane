import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, PaletteButton } from "./CommandPalette";

vi.mock("../api", () => ({ listMonitors: vi.fn().mockResolvedValue([]) }));
vi.mock("../session", () => ({ useReadOnly: () => false }));

afterEach(cleanup);

async function open() {
  render(
    <MemoryRouter>
      <button type="button">Before</button>
      <PaletteButton />
      <main><button type="button">Page action</button></main>
      <CommandPalette />
    </MemoryRouter>,
  );
  const opener = screen.getByRole("button", { name: /Search/ });
  opener.focus();
  await act(async () => { fireEvent.click(opener); });
  return opener;
}

describe("CommandPalette focus", () => {
  it("wraps Shift+Tab from the first element to the last, and Tab back to the first", async () => {
    await open();
    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    const input = screen.getByRole("combobox");
    expect(document.activeElement).toBe(input);

    const focusable = dialog.querySelectorAll<HTMLElement>("input, button, [tabindex]:not([tabindex='-1'])");
    const last = focusable[focusable.length - 1];
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);
  });

  it("restores focus to the opener on Escape", async () => {
    const opener = await open();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });

  it("restores focus to the opener when a command is chosen and when the backdrop is clicked", async () => {
    const opener = await open();
    fireEvent.click(screen.getByRole("option", { name: /Overview/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);

    await act(async () => { fireEvent.click(opener); });
    fireEvent.mouseDown(document.querySelector(".dialog-backdrop") as HTMLElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });

  it("falls back to the main region when the opener is gone", async () => {
    render(<MemoryRouter><main><button type="button">Page action</button></main><CommandPalette /></MemoryRouter>);
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    await act(async () => { fireEvent.keyDown(window, { key: "k", metaKey: true }); });
    opener.remove();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(document.activeElement).toBe(document.querySelector("main"));
  });
});
