import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonitorToggleButton } from "./MonitorToggleButton";

describe("MonitorToggleButton", () => {
  it("runs the requested pause action", async () => {
    const onToggle = vi.fn(async () => undefined);
    render(<MonitorToggleButton enabled onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button", { name: "Pause checks" }));

    await waitFor(() => expect(onToggle).toHaveBeenCalledOnce());
  });

  it("shows a failed resume without pretending the monitor changed", async () => {
    render(<MonitorToggleButton enabled={false} onToggle={async () => { throw new Error("Unavailable"); }} />);

    fireEvent.click(screen.getByRole("button", { name: "Resume checks" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unavailable");
    expect(screen.getByRole("button", { name: "Resume checks" })).toBeEnabled();
  });
});
