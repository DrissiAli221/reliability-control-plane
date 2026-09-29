import { reliabilityReportHtml } from "./api";

export async function downloadReport(monitorId: string): Promise<void> {
  const blob = await reliabilityReportHtml(monitorId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rcp-reliability-${monitorId}.html`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
