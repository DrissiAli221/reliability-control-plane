import { ShieldAlert } from "lucide-react";

/** A compact note on the check card: the target answered with a bot challenge, so the probe saw the wall, not the site. */
export function BotProtectionHint({ results, onAccept }: {
  results: Array<{ region: string; botProtection?: string | null }>;
  /** Opens the accepted-statuses editor with 403 added; omitted for read-only viewers and the trace view. */
  onAccept?: () => void;
}) {
  const regions = results.filter((result) => result.botProtection === "CLOUDFLARE_CHALLENGE").map((result) => result.region);
  if (!regions.length) return null;
  return (
    <div className="bot-note" role="note">
      <ShieldAlert size={20} aria-hidden="true" />
      <div className="bot-note-text">
        <strong>Cloudflare is blocking the probes</strong>
        <span className="panel-note-tag mono">{regions.join(", ")}</span>
        <p>Challenged checks are not counted. Monitor a health endpoint, or accept 403 to count the challenge as UP.</p>
      </div>
      {onAccept && <button type="button" className="button secondary bot-note-action" onClick={onAccept}>Accept 403</button>}
    </div>
  );
}
