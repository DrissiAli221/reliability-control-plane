import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeleteMonitorDialog } from "./DeleteMonitorDialog";
import { deleteMonitor } from "../api";
vi.mock("../api", () => ({ deleteMonitor: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it("requires the exact monitor name, keeps failures visible and only navigates after success", async () => {
  const onDeleted = vi.fn();
  vi.mocked(deleteMonitor).mockRejectedValueOnce(new Error("Try again")).mockResolvedValueOnce();
  render(<DeleteMonitorDialog monitorId="id" name="Checkout" onClose={vi.fn()} onDeleted={onDeleted} />);
  const submit = screen.getByRole("button", { name: "Delete monitor" });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Checkout" } });
  fireEvent.click(submit);
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
  expect(onDeleted).not.toHaveBeenCalled();
  fireEvent.click(submit);
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  expect(deleteMonitor).toHaveBeenCalledWith("id");
});
it("cancel does not issue a delete request", () => {
  const onClose = vi.fn();
  render(<DeleteMonitorDialog monitorId="id" name="Checkout" onClose={onClose} onDeleted={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onClose).toHaveBeenCalledOnce(); expect(deleteMonitor).not.toHaveBeenCalled();
});
