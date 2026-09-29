import { useCallback, useEffect, useRef, useState } from "react";

export type LiveData<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
  refresh: () => Promise<void>;
};

/**
 * Loads on mount and every `intervalMs`. A failed refresh keeps the last data but reports the error,
 * so the page can mark it as stale rather than pretending it is current.
 */
export function useLiveData<T>(load: () => Promise<T>, intervalMs = 30_000): LiveData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const result = await load();
      if (current !== generation.current) return;
      setData(result);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (reason) {
      if (current !== generation.current) return;
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    const requests = generation;
    void refresh();
    const timer = window.setInterval(() => void refresh(), intervalMs);
    return () => {
      // Invalidate in-flight loads so a late response cannot update an unmounted page.
      requests.current++;
      window.clearInterval(timer);
    };
  }, [refresh, intervalMs]);

  return { data, error, loading, updatedAt, refresh };
}

/** Re-renders every second so relative times ("12s ago") stay truthful between refreshes. */
export function useNow(tickMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(timer);
  }, [tickMs]);
  return now;
}
