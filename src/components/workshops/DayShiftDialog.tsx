"use client";

import { useState } from "react";
import { db } from "@/lib/firebase/config";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "./Dialog";
import { Session, DAY_FULL } from "@/lib/workshops/types";
import { dayOf, shortDate } from "@/lib/workshops/dates";

const addMinutes = (t: string, d: number) => {
  const m = Math.min(23 * 60 + 59, Math.max(0, Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + d));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** "Everything from 11:00 is 30 minutes late" — shifts every live session of the day in one go. */
export function DayShiftDialog({ date, sessions, scopeLabel, userId, onClose, onSaved }: {
  date: string; sessions: Session[]; scopeLabel: string; userId?: string; onClose: () => void; onSaved: () => void;
}) {
  const movable = sessions.filter(s => !s.fixedBlock && s.date === date && s.kind !== "cancelled" && s.kind !== "moved-away");
  const [from, setFrom] = useState(movable.map(s => s.start).sort()[0] || "09:00");
  const [delta, setDelta] = useState(30);
  const [saving, setSaving] = useState(false);
  const hit = movable.filter(s => s.start >= from);

  const apply = async () => {
    setSaving(true);
    try {
      await Promise.all(hit.map(s => {
        const ch = s.change;
        const extra = s.slotId === null;
        const base = extra ? {} : { workshopId: s.workshopId, slotId: s.slotId, originalDate: s.origDate, dates: [...new Set([...(ch?.dates || []), ...(s.origDate ? [s.origDate] : [])])] };
        return setDoc(doc(db, "session_changes", s.changeId!), {
          ...base, newStart: addMinutes(s.start, delta), newEnd: addMinutes(s.end, delta),
          published: false, updatedAt: serverTimestamp(), updatedBy: userId || null,
        }, { merge: true });
      }));
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Dialog title="דחיית מפגשי היום" onClose={onClose}
      footer={<>
        <button onClick={apply} disabled={saving || hit.length === 0 || delta === 0} className={btnPrimary}>החל על {hit.length} מפגשים</button>
        <button onClick={onClose} className={btnGhost}>ביטול</button>
      </>}>
      <p className="text-sm">יום {DAY_FULL[dayOf(date)]} {shortDate(date)} · {scopeLabel}</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>מהשעה</label><input type="time" className={fieldCls} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className={labelCls}>הזזה (דקות)</label><input type="number" step={5} className={fieldCls} value={delta} onChange={e => setDelta(Number(e.target.value))} /></div>
      </div>
      <div className="flex gap-2">
        {[-15, 15, 30, 60].map(d => <button key={d} onClick={() => setDelta(d)} className={`${btnGhost} !py-1 !text-xs`}>{d > 0 ? `+${d}` : d}</button>)}
      </div>
      <ul className="text-sm divide-y divide-[var(--border)] max-h-48 overflow-y-auto">
        {hit.map(s => <li key={s.id} className="py-1.5 flex justify-between gap-2"><span>{s.workshopName}</span><span className="tabular-nums text-[var(--foreground)]/60">{s.start} ← {addMinutes(s.start, delta)}</span></li>)}
        {hit.length === 0 && <li className="py-2 text-[var(--foreground)]/50">אין מפגשים מהשעה הזו.</li>}
      </ul>
      <p className="text-xs text-[var(--foreground)]/50">השינויים נשמרים כחריגים ומחכים לפרסום לצוות. ארוחות והפסקות קבועות לא זזות.</p>
    </Dialog>
  );
}
