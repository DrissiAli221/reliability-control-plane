import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reliabilityReportHtml } from "../api";
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

    render(<DownloadReportButton monitorId="monitor-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Download 7-day report" }));

    await waitFor(() => expect(filename).toBe("rcp-reliability-monitor-1.html"));
    expect(reliabilityReportHtml).toHaveBeenCalledWith("monitor-1");
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it("shows a useful error when report generation fails", async () => {
    vi.mocked(reliabilityReportHtml).mockRejectedValue(new Error("Report service unavailable"));

    render(<DownloadReportButton monitorId="monitor-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Download 7-day report" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Report service unavailable");
    expect(screen.getByRole("button", { name: "Download 7-day report" })).toBeEnabled();
  });
});
