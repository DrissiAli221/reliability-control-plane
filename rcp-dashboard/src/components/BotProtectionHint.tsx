import { ShieldAlert } from "lucide-react";

/** A footer row on the check card: the target answered with a bot challenge, so the probe saw the wall, not the site. */
export function BotProtectionHint({ results }: { results: Array<{ region: string; botProtection?: string | null }> }) {
  const regions = results.filter((result) => result.botProtection === "CLOUDFLARE_CHALLENGE").map((result) => result.region);
  if (!regions.length) return null;
  return (
    <div className="panel-note" role="note">
      <ShieldAlert size={16} aria-hidden="true" />
      <div>
        <strong>Bot protection detected</strong>
        <span className="panel-note-tag mono">Cloudflare challenge · {regions.join(", ")}</span>
        <p>
          The site may work in a browser; the probe was challenged before reaching it. Monitor a health endpoint, or accept 403
          for this monitor. Accepting 403 counts the challenge as UP, not proof the page works. This note does not change the verdict.
        </p>
      </div>
    </div>
  );
}
