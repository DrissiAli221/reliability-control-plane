import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AcceptedStatusCodesDialog } from "./AcceptedStatusCodesDialog";
import { setAcceptedHttpStatuses } from "../api";
vi.mock("../api", () => ({ setAcceptedHttpStatuses: vi.fn() }));
afterEach(cleanup); beforeEach(() => vi.clearAllMocks());
it("saves an explicit policy and refreshes before closing", async () => {
  vi.mocked(setAcceptedHttpStatuses).mockResolvedValue();
  const close = vi.fn(), saved = vi.fn(async () => undefined);
  render(<AcceptedStatusCodesDialog monitorId="id" codes={[403]} onClose={close} onSaved={saved} />);
  expect(screen.getByRole("textbox")).toHaveValue("403");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "200-201,403" } });
  fireEvent.click(screen.getByRole("button", { name: "Save statuses" }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(setAcceptedHttpStatuses).toHaveBeenCalledWith("id",[200,201,403]); expect(saved).toHaveBeenCalledOnce();
});
it("validates before sending and allows resetting the default", async () => {
  const close = vi.fn();
  render(<AcceptedStatusCodesDialog monitorId="id" codes={[403]} onClose={close} onSaved={async () => undefined} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "600" } });
  fireEvent.click(screen.getByRole("button", { name: "Save statuses" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("between 100 and 599");
  expect(setAcceptedHttpStatuses).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save statuses" }));
  await waitFor(() => expect(setAcceptedHttpStatuses).toHaveBeenCalledWith("id",null));
});
