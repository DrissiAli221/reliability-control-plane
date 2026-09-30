import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reliabilityReportHtml } from "../api";
import { reportFilename } from "../reportDownload";
import { DownloadReportButton } from "./DownloadReportButton";

vi.mock("../api", () => ({ reliabilityReportHtml: vi.fn() }));

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe("DownloadReportButton", () => {
  it("downloads the owner-authorized HTML report", async () => {
    vi.mocked(reliabilityReportHtml).mockResolvedValue(new Blob(["<html></html>"]));
    URL.createObjectURL = vi.fn(() => "blob:rcp-report");
    URL.revokeObjectURL = vi.fn();
    let filename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      filename = this.download;
    });

    render(<DownloadReportButton monitorId="monitor-1" monitorName="Checkout API" />);
    fireEvent.click(screen.getByRole("button", { name: "Download 7-day report" }));

    await waitFor(() => expect(filename).toMatch(/^rcp-reliability-checkout-api-\d{4}-\d{2}-\d{2}\.html$/));
    expect(reliabilityReportHtml).toHaveBeenCalledWith("monitor-1");
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it("shows a useful error when report generation fails", async () => {
    vi.mocked(reliabilityReportHtml).mockRejectedValue(new Error("Report service unavailable"));

    render(<DownloadReportButton monitorId="monitor-1" monitorName="Checkout API" />);
    fireEvent.click(screen.getByRole("button", { name: "Download 7-day report" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Report service unavailable");
    expect(screen.getByRole("button", { name: "Download 7-day report" })).toBeEnabled();
  });

  it("names the file after the monitor and falls back to its id", () => {
    const day = new Date("2026-09-30T12:00:00Z");
    expect(reportFilename("SpectraTV (EU)", "id-1", day)).toBe("rcp-reliability-spectratv-eu-2026-09-30.html");
    expect(reportFilename("???", "id-1", day)).toBe("rcp-reliability-id-1-2026-09-30.html");
  });
});
