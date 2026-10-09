import { reliabilityReport, reliabilityReportCsv, reliabilityReportHtml } from "./api";

export type ReportExtension = "html" | "json" | "csv";

/** "SpectraTV (EU)" → "spectratv-eu"; falls back to the id when the name has no usable characters. */
export function reportFilename(monitorName: string, monitorId: string, extension: ReportExtension = "html", day = new Date()): string {
  const slug = monitorName.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `rcp-reliability-${slug || monitorId}-${day.toISOString().slice(0, 10)}.${extension}`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function downloadReport(monitorId: string, monitorName: string): Promise<void> {
  saveBlob(await reliabilityReportHtml(monitorId), reportFilename(monitorName, monitorId));
}

export async function downloadReportJson(monitorId: string, monitorName: string): Promise<void> {
  const report = await reliabilityReport(monitorId);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  saveBlob(blob, reportFilename(monitorName, monitorId, "json"));
}

export async function downloadReportCsv(monitorId: string, monitorName: string): Promise<void> {
  saveBlob(await reliabilityReportCsv(monitorId), reportFilename(monitorName, monitorId, "csv"));
}

/**
 * Opens the report in a new tab and starts the browser's print dialog, where "Save as PDF" is one click.
 * The tab opens before the fetch so the click still counts as the user's gesture; if the browser blocks it,
 * the HTML is downloaded instead and "blocked" tells the caller to say so.
 */
export async function printReport(monitorId: string, monitorName: string): Promise<"printed" | "blocked"> {
  const tab = window.open("", "_blank");
  if (!tab) {
    await downloadReport(monitorId, monitorName);
    return "blocked";
  }
  try {
    const url = URL.createObjectURL(await reliabilityReportHtml(monitorId));
    tab.addEventListener("load", () => tab.print(), { once: true });
    tab.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "printed";
  } catch (reason) {
    tab.close();
    throw reason;
  }
}
