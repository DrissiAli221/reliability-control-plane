import { useSyncExternalStore } from "react";
import { currentSession } from "./api";
import { isDemoSession } from "./auth";
import type { Session } from "./types";

let session: Session | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Loads /api/me once per page view; the server's answer decides read-only mode, never a claim the browser parsed. */
export function loadSession(): Promise<void> {
  loading ??= currentSession()
    .then((value) => {
      session = value;
      listeners.forEach((listener) => listener());
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      void loadSession();
      return () => listeners.delete(listener);
    },
    () => session,
  );
}

/** The server's answer once it arrives; until then a demo tab is assumed read-only so no control flashes up. */
export function useReadOnly(): boolean {
  return useSession()?.readOnly ?? isDemoSession();
}
