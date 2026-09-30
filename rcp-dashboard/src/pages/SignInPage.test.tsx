import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startDemoSession } from "../auth";
import { SignInPage } from "./SignInPage";

vi.mock("../auth", () => ({
  isLocalAuth: () => false,
  login: vi.fn(),
  safeNext: (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/"),
  startDemoSession: vi.fn(),
}));

const assign = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderAt(url: string) {
  vi.stubGlobal("location", { ...window.location, assign });
  render(<MemoryRouter initialEntries={[url]}><SignInPage /></MemoryRouter>);
}

describe("SignInPage", () => {
  it("puts the live demo first and returns the visitor to where they were headed", async () => {
    vi.mocked(startDemoSession).mockResolvedValue();
    renderAt("/signin?next=%2Fpipeline");

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Try the live demo");
    expect(buttons[1]).toHaveTextContent("Sign in or create an account");

    fireEvent.click(buttons[0]);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pipeline"));
  });

  it("refuses to follow an off-site return address", async () => {
    vi.mocked(startDemoSession).mockResolvedValue();
    renderAt("/signin?next=%2F%2Fevil.example");

    fireEvent.click(screen.getByRole("button", { name: /Try the live demo/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("shows why the demo could not start", async () => {
    vi.mocked(startDemoSession).mockRejectedValue(new Error("A lot of people are trying the demo right now. Try again in a minute."));
    renderAt("/signin");

    fireEvent.click(screen.getByRole("button", { name: /Try the live demo/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in a minute");
  });
});
