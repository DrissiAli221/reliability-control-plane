import { windowInfo, type WindowDays } from "./reportWindow";
import { reliabilityReport, reliabilityReportCsv, reliabilityReportHtml } from "./api";

export type ReportExtension = "html" | "json" | "csv";

/** "SpectraTV (EU)" → "spectratv-eu"; falls back to the id when the name has no usable characters. The window is part of the name so a 30-day export is never mistaken for a 7-day one. */
export function reportFilename(monitorName: string, monitorId: string, extension: ReportExtension = "html", day = new Date(), days: WindowDays = 7): string {
  const slug = monitorName.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `rcp-reliability-${slug || monitorId}-${windowInfo(days).short}-${day.toISOString().slice(0, 10)}.${extension}`;
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

export async function downloadReport(monitorId: string, monitorName: string, days: WindowDays = 7): Promise<void> {
  saveBlob(await reliabilityReportHtml(monitorId, days), reportFilename(monitorName, monitorId, "html", new Date(), days));
}

export async function downloadReportJson(monitorId: string, monitorName: string, days: WindowDays = 7): Promise<void> {
  const report = await reliabilityReport(monitorId, days);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  saveBlob(blob, reportFilename(monitorName, monitorId, "json", new Date(), days));
}

export async function downloadReportCsv(monitorId: string, monitorName: string, days: WindowDays = 7): Promise<void> {
  saveBlob(await reliabilityReportCsv(monitorId, days), reportFilename(monitorName, monitorId, "csv", new Date(), days));
}

/**
 * Opens the report in a new tab and starts the browser's print dialog, where "Save as PDF" is one click.
 * The tab opens before the fetch so the click still counts as the user's gesture; if the browser blocks it,
 * the HTML is downloaded instead and "blocked" tells the caller to say so.
 */
export async function printReport(monitorId: string, monitorName: string, days: WindowDays = 7): Promise<"printed" | "blocked"> {
  const tab = window.open("", "_blank");
  if (!tab) {
    await downloadReport(monitorId, monitorName, days);
    return "blocked";
  }
  try {
    const url = URL.createObjectURL(await reliabilityReportHtml(monitorId, days));
    tab.addEventListener("load", () => tab.print(), { once: true });
    tab.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "printed";
  } catch (reason) {
    tab.close();
    throw reason;
  }
}
