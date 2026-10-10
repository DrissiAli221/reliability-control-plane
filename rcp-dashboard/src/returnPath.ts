/**
 * The page a visitor asked for before signing in is restored afterwards. That page can belong to someone else by then
 * (a different account, the shared demo) or be gone, so the restore is marked, and a monitor page that turns out not to
 * exist is dropped in favour of the list instead of greeting the visitor with an error.
 */
const KEY = "rcp.restored-path";
const FRESH_MS = 2 * 60_000;

export function rememberReturnPath(path: string): void {
  if (path === "/" || path === "/signin") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // Without storage the visitor just sees the not-found page, which is still correct.
  }
}

/** True once if `path` is the page restored by the last sign-in; the mark is always forgotten. */
export function takeReturnPath(path: string): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return false;
    const mark = JSON.parse(raw) as { path?: string; at?: number };
    return mark.path === path && typeof mark.at === "number" && Date.now() - mark.at < FRESH_MS;
  } catch {
    return false;
  }
}
