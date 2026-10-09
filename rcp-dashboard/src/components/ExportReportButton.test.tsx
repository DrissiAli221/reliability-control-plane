import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadReport, downloadReportCsv, downloadReportJson, printReport } from "../reportDownload";
import { ExportReportButton } from "./ExportReportButton";

vi.mock("../reportDownload", () => ({
  downloadReport: vi.fn(),
  downloadReportCsv: vi.fn(),
  downloadReportJson: vi.fn(),
  printReport: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderButton() {
  render(<ExportReportButton monitorId="monitor-1" monitorName="Checkout API" />);
  return screen.getByRole("button", { name: "Choose export format" });
}

async function openMenu() {
  const chevron = renderButton();
  fireEvent.click(chevron);
  await waitFor(() => expect(screen.getByRole("menuitem", { name: /Report \(HTML\)/ })).toHaveFocus());
  return chevron;
}

describe("ExportReportButton", () => {
  it("downloads the HTML report from the main half", async () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => expect(downloadReport).toHaveBeenCalledWith("monitor-1", "Checkout API"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens a labelled menu from the chevron and lists every format with a hint", async () => {
    const chevron = await openMenu();

    expect(chevron).toHaveAttribute("aria-haspopup", "menu");
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Report (HTML)Styled report, works offline",
      "PDFOpens the report to save as PDF",
      "JSONRaw numbers for scripts",
      "CSVIncident list for spreadsheets",
    ]);
  });

  it("opens with ArrowDown and moves with the arrow keys, Home and End, wrapping at the ends", async () => {
    const chevron = renderButton();
    fireEvent.keyDown(chevron, { key: "ArrowDown" });
    const items = () => screen.getAllByRole("menuitem");
    await waitFor(() => expect(items()[0]).toHaveFocus());

    fireEvent.keyDown(items()[0], { key: "ArrowDown" });
    expect(items()[1]).toHaveFocus();
    fireEvent.keyDown(items()[1], { key: "End" });
    expect(items()[3]).toHaveFocus();
    fireEvent.keyDown(items()[3], { key: "ArrowDown" });
    expect(items()[0]).toHaveFocus();
    fireEvent.keyDown(items()[0], { key: "ArrowUp" });
    expect(items()[3]).toHaveFocus();
    fireEvent.keyDown(items()[3], { key: "Home" });
    expect(items()[0]).toHaveFocus();
  });

  it("closes on Escape and returns focus to the chevron", async () => {
    const chevron = await openMenu();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    expect(chevron).toHaveFocus();
  });

  it("closes on Tab and on a click outside", async () => {
    await openMenu();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Choose export format" }));
    await screen.findByRole("menu");
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it.each([
    ["Report (HTML)", downloadReport],
    ["PDF", printReport],
    ["JSON", downloadReportJson],
    ["CSV", downloadReportCsv],
  ])("runs %s from its menu item", async (name, action) => {
    vi.mocked(printReport).mockResolvedValue("printed");
    await openMenu();
    const items = screen.getAllByRole("menuitem");
    fireEvent.click(items.find((item) => item.textContent?.startsWith(name))!);

    await waitFor(() => expect(action).toHaveBeenCalledWith("monitor-1", "Checkout API"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("disables both halves and says so while an export runs", async () => {
    let finish = () => {};
    vi.mocked(downloadReportCsv).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /^CSV/ }));

    expect(await screen.findByRole("button", { name: "Exporting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose export format" })).toBeDisabled();
    finish();
    expect(await screen.findByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("shows a useful error when an export fails", async () => {
    vi.mocked(downloadReport).mockRejectedValue(new Error("Report service unavailable"));
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Report service unavailable");
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("explains the fallback when the PDF tab is blocked", async () => {
    vi.mocked(printReport).mockResolvedValue("blocked");
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /^PDF/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Pop-ups are blocked");
  });
});
