"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * State that remembers itself in this browser (sort, filters, view…). Starts at `initial` on the server and first
 * paint, then picks up the saved value. Storage can be unavailable — then it just behaves like useState.
 */
export function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const v = localStorage.getItem(key); if (v !== null) setValue(JSON.parse(v) as T); } catch { /* ignore */ }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback((v: T | ((p: T) => T)) => {
    setValue(prev => {
      const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [key]);
  return [value, set, ready] as const;
}
