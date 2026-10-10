/** The history windows the monitor page offers. Checks are retained 90 days, so 90 is the longest. */
export const WINDOWS = [
  { days: 1, param: "24h", label: "24 h", short: "24h", words: "24 hours" },
  { days: 7, param: "7d", label: "7 d", short: "7d", words: "7 days" },
  { days: 30, param: "30d", label: "30 d", short: "30d", words: "30 days" },
  { days: 90, param: "90d", label: "90 d", short: "90d", words: "90 days" },
] as const;

export type WindowDays = (typeof WINDOWS)[number]["days"];
export const DEFAULT_WINDOW: WindowDays = 7;

/** The `?window=` value from the URL; anything unknown means the default rather than an error. */
export function parseWindow(param: string | null): WindowDays {
  return WINDOWS.find((item) => item.param === param)?.days ?? DEFAULT_WINDOW;
}

export function windowInfo(days: number) {
  return WINDOWS.find((item) => item.days === days) ?? WINDOWS[1];
}
