import { useState } from "react";
import { reliabilityReportHtml } from "../api";

export function DownloadReportButton({ monitorId }: { monitorId: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const blob = await reliabilityReportHtml(monitorId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rcp-reliability-${monitorId}.html`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The report could not be downloaded");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="report-download">
      <button type="button" onClick={() => void download()} disabled={downloading}>
        {downloading ? "Preparing report…" : "Download 7-day report"}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
