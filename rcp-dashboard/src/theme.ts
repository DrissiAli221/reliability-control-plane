import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const KEY = "rcp.theme";
const listeners = new Set<() => void>();

function stored(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

let current: Theme = stored();

/** Applies the saved theme to <html>; the console is dark unless the viewer chose light. */
export function applyTheme(theme: Theme = current): void {
  current = theme;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Without storage the choice lasts for this page view only.
  }
  listeners.forEach((listener) => listener());
}

export function toggleTheme(): void {
  applyTheme(current === "dark" ? "light" : "dark");
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
