export function BotProtectionHint({ results }: { results: Array<{ region: string; botProtection?: string | null }> }) {
  const regions = results.filter((result) => result.botProtection === "CLOUDFLARE_CHALLENGE").map((result) => result.region);
  if (!regions.length) return null;
  return <p className="trace-note"><strong>Bot protection detected (Cloudflare challenge).</strong>{" "}
    Seen in {regions.join(", ")}. The site may work for browsers. Monitor a health endpoint, or review the accepted statuses: accepting 403 counts the challenge response as UP, not proof that the page is usable. This hint does not change the verdict.
  </p>;
}
