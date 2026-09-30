"use client";

import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where } from "firebase/firestore";
import { loadAbsences, loadPatients, loadRefs, PatientLite, Refs } from "./data";
import { AbsenceLite } from "./conflicts";
import { Closure, SessionChange, Workshop } from "./types";

/** Everything the schedule views need for a set of consecutive dates (a week, or a single day). */
export function useScheduleData(dates: string[]) {
  const [refs, setRefs] = useState<Refs | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [changes, setChanges] = useState<SessionChange[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [absences, setAbsences] = useState<AbsenceLite[]>([]);
  const [patients, setPatients] = useState<PatientLite[]>([]);
  const [loading, setLoading] = useState(true);
  const first = dates[0], last = dates[dates.length - 1];

  const load = useCallback(async () => {
    const [r, wSnap, chSnap, clSnap, abs, pts] = await Promise.all([
      loadRefs(),
      getDocs(query(collection(db, "workshops"), where("endDate", ">=", first))),
      getDocs(query(collection(db, "session_changes"), where("dates", "array-contains-any", dates))),
      getDocs(query(collection(db, "closures"), where("date", ">=", first), where("date", "<=", last))),
      loadAbsences(dates).catch(() => []),
      loadPatients(),
    ]);
    setRefs(r);
    setWorkshops(wSnap.docs.map(d => ({ id: d.id, ...d.data() } as Workshop)).filter(w => w.startDate <= last));
    setChanges(chSnap.docs.map(d => ({ id: d.id, ...d.data() } as SessionChange)));
    setClosures(clSnap.docs.map(d => ({ id: d.id, ...d.data() } as Closure)));
    setAbsences(abs);
    setPatients(pts);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, last]);
  useEffect(() => { load(); }, [load]);

  return { refs, workshops, changes, closures, absences, patients, loading, reload: load };
}
