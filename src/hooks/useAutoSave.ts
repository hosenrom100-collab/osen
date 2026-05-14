import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Debounced auto-save hook.
 *
 * - Call trigger() after any user mutation to schedule a save.
 * - Call saveNow() to flush immediately (e.g. from a manual Save button).
 * - Call reset() when data reloads externally (date/id change) so a
 *   pending timer from the previous context doesn't fire into the new one.
 *
 * saveFn is stored in a ref internally, so it always runs with the latest
 * closure — use refs for values you need inside saveFn to avoid stale reads.
 */
export function useAutoSave(
  saveFn: () => Promise<void>,
  debounceMs = 1500,
) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error,  setError]  = useState<string | null>(null);

  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);

  // Always keep the latest saveFn in the ref
  useEffect(() => { saveFnRef.current = saveFn; }, [saveFn]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const doSave = useCallback(async () => {
    setStatus("saving");
    setError(null);
    try {
      await saveFnRef.current();
      setStatus("saved");
      // Auto-clear "saved" badge after 2.5s
      setTimeout(() => setStatus(s => s === "saved" ? "idle" : s), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "שגיאה בשמירה";
      setStatus("error");
      setError(msg);
    }
  }, []);

  /** Schedule a debounced save. Resets the timer on each call. */
  const trigger = useCallback(() => {
    setStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doSave, debounceMs);
  }, [debounceMs, doSave]);

  /** Flush immediately, cancelling any pending debounce. */
  const saveNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    doSave();
  }, [doSave]);

  /** Reset all state + cancel any pending timer (call when data reloads). */
  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus("idle");
    setError(null);
  }, []);

  return { status, error, trigger, saveNow, reset };
}
