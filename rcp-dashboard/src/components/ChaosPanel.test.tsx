import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { faultMode, setFaultMode } from "../api";
import { ChaosPanel } from "./ChaosPanel";

vi.mock("../api", () => ({ faultMode: vi.fn(), setFaultMode: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChaosPanel", () => {
  it("switches the local fault mode and explains whether it can open an incident", async () => {
    vi.mocked(faultMode).mockResolvedValueOnce("PASS_THROUGH").mockResolvedValue("HTTP_503");
    vi.mocked(setFaultMode).mockResolvedValue("HTTP_503");
    render(<ChaosPanel />);

    expect(await screen.findByRole("radio", { name: "Off" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "HTTP 503" }));

    await waitFor(() => expect(screen.getByRole("radio", { name: "HTTP 503" })).toBeChecked());
    expect(setFaultMode).toHaveBeenCalledWith("HTTP_503");
    expect(screen.getByText(/An incident opens on the 2nd consecutive DOWN/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore real probing" })).toBeInTheDocument();
  });

  it("says an oversized body is inconclusive and never opens an incident", async () => {
    vi.mocked(faultMode).mockResolvedValue("RESPONSE_TOO_LARGE");
    render(<ChaosPanel />);

    expect(await screen.findByText(/inconclusive, so checks are NO_DATA and never open an incident/)).toBeInTheDocument();
    expect(screen.queryByText(/An incident opens/)).not.toBeInTheDocument();
  });

  it("shows a failed switch instead of pretending the mode changed", async () => {
    vi.mocked(faultMode).mockResolvedValue("PASS_THROUGH");
    vi.mocked(setFaultMode).mockRejectedValue(new Error("Fault control is only available locally"));
    render(<ChaosPanel />);

    fireEvent.click(await screen.findByRole("radio", { name: "Timeout" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Fault control is only available locally");
    expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
  });
});
