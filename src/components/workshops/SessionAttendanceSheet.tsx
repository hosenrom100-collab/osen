"use client";

import { useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/app/shopping/components/BottomSheet";
import { AttendanceItem } from "@/components/admin/attendance/AttendanceItem";
import { AttendanceDetailSheet } from "@/components/admin/attendance/AttendanceDetailSheet";
import { useAuth } from "@/context/AuthContext";
import {
  AttendanceEntry, countEntries, dayFillAction, entryFromDoc, Hint, suggestMark, timeInIsrael, todayInIsrael,
} from "@/lib/attendance/model";
import {
  loadDayAttendance, loadSessionDay, saveDayEntry, saveSessionEntry, SessionRecord, StoredDay,
} from "@/lib/attendance/data";
import type { PatientLite } from "@/lib/workshops/data";
import type { Session } from "@/lib/workshops/types";

interface Props {
  session: Session;
  participants: PatientLite[];
  /** Every session of the same day that has participants (for the late / early-leave suggestions). */
  daySessions: Session[];
  onClose: () => void;
  /** Called after a mark was saved, so the calendar can refresh its counts. */
  onChanged?: () => void;
}

const UNSET: AttendanceEntry = entryFromDoc(undefined);

/**
 * Attendance of one workshop session, same rows as the day screen. A present mark fills the
 * participant's day when it is still empty; someone already marked absent for the day shows as
 * absent here; "everyone came" marks whoever is left in one tap.
 */
export function SessionAttendanceSheet({ session, participants, daySessions, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const sid = session.changeId ?? "";
  const [recs, setRecs] = useState<SessionRecord[]>([]);
  const [dayMap, setDayMap] = useState<Map<string, StoredDay>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, Hint>>({});

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [r, d] = await Promise.all([loadSessionDay(session.date), loadDayAttendance(session.date)]);
        if (live) { setRecs(r); setDayMap(d); }
      } catch (e) {
        console.error(e);
        if (live) setError("לא ניתן לטעון את הנוכחות.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [session.date]);

  const rows = useMemo(() => {
    const m = new Map<string, SessionRecord>();
    recs.filter(r => r.sessionId === sid).forEach(r => m.set(r.patientId, r));
    return m;
  }, [recs, sid]);

  // What a row shows: its own mark, else "absent" when the whole day was marked absent.
  const shown = (pid: string): AttendanceEntry =>
    rows.get(pid) ?? (dayMap.get(pid)?.status === "absent" ? { status: "absent" } : UNSET);

  const people = useMemo(
    () => [...participants].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "he")),
    [participants]
  );
  const counts = countEntries(people.map(p => shown(p.id)));

  const meta = { changeId: sid, workshopId: session.workshopId, slotId: session.slotId, programId: session.programId, date: session.date };
  const slotOf = (s: Session) => ({ id: s.changeId ?? s.id, start: s.start, end: s.end });

  // The day follows the session: fill an empty day, or take back what this session filled.
  const syncDay = async (pid: string, status: AttendanceEntry["status"], current: SessionRecord[]) => {
    const day = dayMap.get(pid);
    const elsewhere = current.find(r => r.patientId === pid && r.sessionId !== sid && r.status === "present");
    const action = dayFillAction(day, sid, status, elsewhere?.sessionId ?? null);
    if (!action) return;
    const entry: AttendanceEntry =
      action.type === "fill" ? { status: "present", source: "session", derivedFrom: sid, note: day?.note }
      : action.type === "clear" ? { status: "unset", note: day?.note }
      : { ...(day as AttendanceEntry), derivedFrom: action.sessionId };
    await saveDayEntry({ patientId: pid, date: session.date, entry, uid, contextId: "session", legacyIds: day?.docIds });
    setDayMap(prev => new Map(prev).set(pid, { ...entry, docIds: [] }));
  };

  const commit = async (p: PatientLite, entry: AttendanceEntry, withHint = false) => {
    const before = recs;
    const record: SessionRecord = { ...entry, patientId: p.id, sessionId: sid };
    const next = [...recs.filter(r => !(r.patientId === p.id && r.sessionId === sid)), ...(entry.status === "unset" ? [] : [record])];
    setRecs(next);
    setError("");
    try {
      await saveSessionEntry({ session: meta, patientId: p.id, entry, uid });
      await syncDay(p.id, entry.status, next);
      if (withHint) {
        const hint = suggestMark({
          newStatus: entry.status,
          session: { ...slotOf(session), date: session.date },
          daySessions: daySessions.map(slotOf),
          others: next.filter(r => r.patientId === p.id && r.sessionId !== sid).map(r => ({ sessionId: r.sessionId, status: r.status })),
          nowTime: timeInIsrael(),
          today: todayInIsrael(),
        });
        setHints(h => { const c = { ...h }; if (hint) c[p.id] = hint; else delete c[p.id]; return c; });
      }
      onChanged?.();
    } catch (e) {
      console.error(e);
      setRecs(before);
      setError("השמירה נכשלה. נסה שוב.");
    }
  };

  const toggle = (p: PatientLite, status: "present" | "absent") => {
    const cur = rows.get(p.id) ?? UNSET;
    const next = cur.status === status ? "unset" : status;
    commit(p, { ...cur, status: next, late: null, leftEarly: null }, next !== "unset");
  };

  const applyHint = async (p: PatientLite, hint: Hint) => {
    const cur = rows.get(p.id) ?? UNSET;
    const mark = { at: hint.at };
    await commit(p, hint.kind === "late" ? { ...cur, late: mark } : { ...cur, leftEarly: mark });
    // The same mark goes on the day when the participant is present for it.
    const day = dayMap.get(p.id);
    if (day?.status === "present") {
      const entry = { ...day, [hint.kind]: mark };
      try {
        await saveDayEntry({ patientId: p.id, date: session.date, entry, uid, contextId: "session", legacyIds: day.docIds });
        setDayMap(prev => new Map(prev).set(p.id, { ...entry, docIds: [] }));
      } catch (e) { console.error(e); }
    }
    setHints(h => { const c = { ...h }; delete c[p.id]; return c; });
  };

  const markEveryone = async () => {
    const rest = people.filter(p => shown(p.id).status === "unset");
    for (const p of rest) await commit(p, { status: "present" });
  };

  const unmarked = people.filter(p => shown(p.id).status === "unset").length;
  const detailPerson = detailFor ? people.find(p => p.id === detailFor) : undefined;

  return (
    <>
      <BottomSheet
        isOpen
        onClose={onClose}
        size="lg"
        zIndex={150}
        title={<span>{session.workshopName}<span className="text-xs font-semibold text-[var(--muted)] me-2"> · {session.start}–{session.end}</span></span>}
        footer={
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={onClose} className="h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--fill)] text-[var(--foreground)] cursor-pointer border-none">סגור</button>
            <button
              type="button"
              disabled={unmarked === 0}
              onClick={markEveryone}
              className="h-12 px-5 rounded-xl text-sm font-bold btn-primary !text-white cursor-pointer border-none disabled:opacity-40"
            >
              {unmarked > 0 ? `כולם הגיעו (${unmarked})` : "כולם סומנו"}
            </button>
          </div>
        }
      >
        {loading ? (
          <p className="py-10 text-center text-sm text-[var(--muted)]">טוען…</p>
        ) : people.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--muted)]">אין משתתפים במפגש.</p>
        ) : (
          <>
            <p className="text-xs font-semibold text-[var(--muted)] mb-2">
              {counts.present} נוכחים · {counts.absent} נעדרים · {counts.unset} לא סומנו
              {(counts.late > 0 || counts.leftEarly > 0) && ` · ${[counts.late > 0 && `${counts.late} איחורים`, counts.leftEarly > 0 && `${counts.leftEarly} יצאו מוקדם`].filter(Boolean).join(", ")}`}
            </p>
            {error && <p className="text-xs font-bold text-rose-500 mb-2" role="alert">{error}</p>}
            <div className="divide-y divide-[var(--border)] -mx-4">
              {people.map(p => {
                const entry = shown(p.id);
                const hint = hints[p.id];
                const dayAbsent = dayMap.get(p.id)?.status === "absent" && entry.status === "present";
                return (
                  <div key={p.id}>
                    <AttendanceItem
                      patient={{ id: p.id, firstName: p.firstName, lastName: p.lastName }}
                      entry={entry}
                      onToggle={s => toggle(p, s)}
                      onSaveNote={text => commit(p, { ...(rows.get(p.id) ?? UNSET), note: text || undefined })}
                      onOpenDetails={() => setDetailFor(p.id)}
                    />
                    {hint && (
                      <div className="px-4 pb-2 -mt-1 flex items-center gap-2 text-[12px] font-semibold text-[var(--muted)]">
                        <span className="min-w-0 truncate">{hint.text}</span>
                        <button type="button" onClick={() => applyHint(p, hint)} className="shrink-0 h-8 px-3 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-xs font-bold cursor-pointer">סמן</button>
                        <button type="button" onClick={() => setHints(h => { const c = { ...h }; delete c[p.id]; return c; })} className="shrink-0 h-8 px-2 rounded-lg text-xs cursor-pointer text-[var(--muted)]">התעלם</button>
                      </div>
                    )}
                    {dayAbsent && (
                      <div className="px-4 pb-2 -mt-1 flex items-center gap-2 text-[12px] font-semibold text-amber-700">
                        <span className="min-w-0 truncate">סומן נעדר ביום, אבל נוכח במפגש.</span>
                        <button
                          type="button"
                          className="shrink-0 h-8 px-3 rounded-lg border border-amber-500/40 text-xs font-bold cursor-pointer"
                          onClick={async () => {
                            const day = dayMap.get(p.id)!;
                            const entry: AttendanceEntry = { ...day, status: "present", source: "manual", derivedFrom: null };
                            try {
                              await saveDayEntry({ patientId: p.id, date: session.date, entry, uid, contextId: "session", legacyIds: day.docIds });
                              setDayMap(prev => new Map(prev).set(p.id, { ...entry, docIds: [] }));
                            } catch (e) { console.error(e); setError("השמירה נכשלה. נסה שוב."); }
                          }}
                        >
                          עדכן ליום נוכח
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </BottomSheet>

      {detailPerson && (
        <AttendanceDetailSheet
          isOpen
          scope="session"
          onClose={() => setDetailFor(null)}
          name={`${detailPerson.firstName} ${detailPerson.lastName}`}
          entry={shown(detailPerson.id)}
          onSave={entry => commit(detailPerson, entry, false)}
        />
      )}
    </>
  );
}
