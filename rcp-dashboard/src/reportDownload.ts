import { reliabilityReportHtml } from "./api";

/** "SpectraTV (EU)" → "spectratv-eu"; falls back to the id when the name has no usable characters. */
export function reportFilename(monitorName: string, monitorId: string, day = new Date()): string {
  const slug = monitorName.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `rcp-reliability-${slug || monitorId}-${day.toISOString().slice(0, 10)}.html`;
}

export async function downloadReport(monitorId: string, monitorName: string): Promise<void> {
  const blob = await reliabilityReportHtml(monitorId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFilename(monitorName, monitorId);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
