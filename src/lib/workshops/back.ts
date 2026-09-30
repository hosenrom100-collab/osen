const KEY = "schedule.back";

/** Remember where in the calendar the user was (program, day/week view), before leaving for a workshop page. */
export function rememberBack() {
  try { sessionStorage.setItem(KEY, window.location.pathname + window.location.search); } catch { /* ignore */ }
}

/** Where "back to the calendar" should go: the remembered calendar state, else the program's calendar. */
export function readBack(programId?: string): string {
  try { const v = sessionStorage.getItem(KEY); if (v && v.startsWith("/schedule")) return v; } catch { /* ignore */ }
  return programId ? `/schedule?program=${programId}` : "/schedule";
}
