/** Empty input resets the default. An explicit list replaces it; ranges are expanded before sending. */
export function parseStatusCodes(value: string): number[] | null {
  if (!value.trim()) return null;
  const codes = new Set<number>();
  for (const part of value.split(",")) {
    const match = /^(\d{3})(?:\s*-\s*(\d{3}))?$/.exec(part.trim());
    if (!match) throw new Error("Use HTTP codes or ranges, for example 200-399,403.");
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (first < 100 || last > 599 || last < first) throw new Error("HTTP codes must be between 100 and 599; ranges must run forwards.");
    for (let code = first; code <= last; code++) codes.add(code);
  }
  const sorted = [...codes].sort((a, b) => a - b);
  return sorted.length === 200 && sorted[0] === 200 && sorted[199] === 399 ? null : sorted;
}

export function formatStatusCodes(codes: number[] | null | undefined): string {
  if (!codes) return "200-399";
  const sorted = [...new Set(codes)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const first = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    ranges.push(first === sorted[i] ? String(first) : `${first}-${sorted[i]}`);
  }
  return ranges.join(",");
}
