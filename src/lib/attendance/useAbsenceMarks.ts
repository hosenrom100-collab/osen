"use client";

import { useCallback, useEffect, useState } from "react";
import { AbsenceMarks, loadAbsenceMarks } from "./data";
import { absentInSession } from "./model";

const EMPTY: AbsenceMarks = { session: new Map(), dayAbsent: new Map() };

/**
 * Who is marked away in each session of a range of dates. Only staff can read attendance, so
 * nothing is loaded when `enabled` is false. Call `reload` after a mark is saved.
 */
export function useAbsenceMarks(dates: string[], enabled: boolean) {
  const [marks, setMarks] = useState<AbsenceMarks>(EMPTY);
  const [version, setVersion] = useState(0);
  const first = dates[0], last = dates[dates.length - 1];

  useEffect(() => {
    if (!enabled || !first) return;
    let live = true;
    loadAbsenceMarks(first, last).then(m => { if (live) setMarks(m); }).catch(() => {});
    return () => { live = false; };
  }, [enabled, first, last, version]);

  const absentOf = useCallback(
    (sessionId: string | null | undefined, date: string, participantIds: string[]) =>
      sessionId ? absentInSession(participantIds, marks.session.get(sessionId), marks.dayAbsent.get(date)) : [],
    [marks]
  );
  const reload = useCallback(() => setVersion(v => v + 1), []);
  return { absentOf, reload };
}
