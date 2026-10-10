import { afterEach, describe, expect, it, vi } from "vitest";
import { reliabilityReport, reliabilityReportCsv, reliabilityReportHtml } from "./api";
import { downloadReport, downloadReportCsv, downloadReportJson, printReport, reportFilename } from "./reportDownload";

vi.mock("./api", () => ({
  reliabilityReport: vi.fn(),
  reliabilityReportCsv: vi.fn(),
  reliabilityReportHtml: vi.fn(),
}));

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  vi.restoreAllMocks();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

function captureDownloads() {
  const downloads: string[] = [];
  const blobs: Blob[] = [];
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);
    return "blob:rcp-report";
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
  return { downloads, blobs };
}

/** jsdom's Blob has no text(). */
function readText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("reportFilename", () => {
  const day = new Date("2026-09-30T12:00:00Z");

  it("names the file after the monitor and defaults to HTML", () => {
    expect(reportFilename("SpectraTV (EU)", "id-1", "html", day)).toBe("rcp-reliability-spectratv-eu-7d-2026-09-30.html");
    expect(reportFilename("SpectraTV (EU)", "id-1", undefined, day)).toBe("rcp-reliability-spectratv-eu-7d-2026-09-30.html");
  });

  it("uses the extension of the chosen format", () => {
    expect(reportFilename("Checkout API", "id-1", "json", day)).toBe("rcp-reliability-checkout-api-7d-2026-09-30.json");
    expect(reportFilename("Checkout API", "id-1", "csv", day)).toBe("rcp-reliability-checkout-api-7d-2026-09-30.csv");
  });

  it("names the chosen window so a 30-day export is not mistaken for a 7-day one", () => {
    expect(reportFilename("Checkout API", "id-1", "html", day, 30)).toBe("rcp-reliability-checkout-api-30d-2026-09-30.html");
    expect(reportFilename("Checkout API", "id-1", "csv", day, 1)).toBe("rcp-reliability-checkout-api-24h-2026-09-30.csv");
    expect(reportFilename("Checkout API", "id-1", "json", day, 90)).toBe("rcp-reliability-checkout-api-90d-2026-09-30.json");
  });

  it("falls back to the id when the name has no usable characters", () => {
    expect(reportFilename("???", "id-1", "csv", day)).toBe("rcp-reliability-id-1-7d-2026-09-30.csv");
  });
});

describe("report exports", () => {
  it("saves the JSON report pretty-printed", async () => {
    const { downloads, blobs } = captureDownloads();
    vi.mocked(reliabilityReport).mockResolvedValue({ schemaVersion: "rcp-report-v1" } as never);

    await downloadReportJson("monitor-1", "Checkout API");

    expect(downloads[0]).toMatch(/^rcp-reliability-checkout-api-7d-\d{4}-\d{2}-\d{2}\.json$/);
    expect(blobs[0].type).toBe("application/json");
    expect(await readText(blobs[0])).toBe('{\n  "schemaVersion": "rcp-report-v1"\n}');
  });

  it("saves the CSV incident list", async () => {
    const { downloads } = captureDownloads();
    vi.mocked(reliabilityReportCsv).mockResolvedValue(new Blob(["incident_id\r\n"]));

    await downloadReportCsv("monitor-1", "Checkout API");

    expect(reliabilityReportCsv).toHaveBeenCalledWith("monitor-1", 7);
    expect(downloads[0]).toMatch(/\.csv$/);
  });

  it("exports the selected window in every format", async () => {
    const { downloads } = captureDownloads();
    vi.mocked(reliabilityReport).mockResolvedValue({} as never);
    vi.mocked(reliabilityReportCsv).mockResolvedValue(new Blob(["x"]));
    vi.mocked(reliabilityReportHtml).mockResolvedValue(new Blob(["x"]));

    await downloadReport("monitor-1", "Checkout API", 30);
    await downloadReportJson("monitor-1", "Checkout API", 30);
    await downloadReportCsv("monitor-1", "Checkout API", 30);

    expect(reliabilityReportHtml).toHaveBeenCalledWith("monitor-1", 30);
    expect(reliabilityReport).toHaveBeenCalledWith("monitor-1", 30);
    expect(reliabilityReportCsv).toHaveBeenCalledWith("monitor-1", 30);
    expect(downloads.every((name) => name.includes("-30d-"))).toBe(true);
  });

  it("opens the report in a tab and prints it once it has loaded", async () => {
    URL.createObjectURL = vi.fn(() => "blob:rcp-report");
    URL.revokeObjectURL = vi.fn();
    vi.mocked(reliabilityReportHtml).mockResolvedValue(new Blob(["<html></html>"]));
    const tab = new EventTarget() as EventTarget & { print: () => void; close: () => void; location: { href: string } };
    tab.print = vi.fn();
    tab.close = vi.fn();
    tab.location = { href: "" };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);

    expect(await printReport("monitor-1", "Checkout API")).toBe("printed");

    expect(tab.location.href).toBe("blob:rcp-report");
    expect(tab.print).not.toHaveBeenCalled();
    tab.dispatchEvent(new Event("load"));
    expect(tab.print).toHaveBeenCalledOnce();
  });

  it("downloads the HTML instead when the tab is blocked", async () => {
    const { downloads } = captureDownloads();
    vi.mocked(reliabilityReportHtml).mockResolvedValue(new Blob(["<html></html>"]));
    vi.spyOn(window, "open").mockReturnValue(null);

    expect(await printReport("monitor-1", "Checkout API")).toBe("blocked");
    expect(downloads[0]).toMatch(/\.html$/);
  });

  it("closes the tab and rethrows when the report cannot be fetched", async () => {
    const close = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({ close } as unknown as Window);
    vi.mocked(reliabilityReportHtml).mockRejectedValue(new Error("Report service unavailable"));

    await expect(printReport("monitor-1", "Checkout API")).rejects.toThrow("Report service unavailable");
    expect(close).toHaveBeenCalledOnce();
  });
});
