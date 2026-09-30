export const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["⌘", "K"], label: "Open the command palette" },
  { keys: ["G", "O"], label: "Go to Overview" },
  { keys: ["G", "M"], label: "Go to Monitors" },
  { keys: ["G", "P"], label: "Go to Pipeline" },
  { keys: ["C"], label: "Create a monitor" },
  { keys: ["?"], label: "Show keyboard shortcuts" },
];

/** Matches when every typed character appears in order, so "sptv" finds "SpectraTV". Lower scores rank first. */
export function fuzzyScore(query: string, text: string): number | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  const haystack = text.toLowerCase();
  const direct = haystack.indexOf(needle);
  if (direct >= 0) return direct;
  let position = -1;
  let gaps = 0;
  for (const character of needle) {
    const next = haystack.indexOf(character, position + 1);
    if (next < 0) return null;
    gaps += next - position - 1;
    position = next;
  }
  return 100 + gaps;
}
