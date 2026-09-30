import { Download } from "lucide-react";
import { useState } from "react";
import { downloadReport } from "../reportDownload";

export function DownloadReportButton({ monitorId, monitorName }: { monitorId: string; monitorName: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      await downloadReport(monitorId, monitorName);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The report could not be downloaded");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="inline-action">
      <button type="button" className="button secondary" onClick={() => void download()} disabled={downloading}>
        <Download size={14} aria-hidden="true" />
        {downloading ? "Preparing report…" : "Download 7-day report"}
      </button>
      {error && <span className="inline-error" role="alert">{error}</span>}
    </div>
  );
}
