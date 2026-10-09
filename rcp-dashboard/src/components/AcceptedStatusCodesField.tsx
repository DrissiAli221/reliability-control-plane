export function AcceptedStatusCodesField({ defaultValue = "", disabled = false }: { defaultValue?: string; disabled?: boolean }) {
  return <label className="field"><span>Accepted HTTP statuses</span>
    <input name="acceptedHttpStatuses" defaultValue={defaultValue} placeholder="200-399 (default)" disabled={disabled} maxLength={2500} spellCheck={false} />
    <small>Leave blank for 200-399. An explicit list replaces the default: use 200-399,403 to also accept 403. Accepting 403 counts that response as UP; it does not prove the page works for browsers.</small>
  </label>;
}
