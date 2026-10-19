"use client";

import { useState } from "react";
import { db } from "@/lib/firebase/config";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Dialog, btnPrimary, btnGhost, fieldCls, labelCls } from "./Dialog";
import type { PatientLite } from "@/lib/workshops/data";
import { DailyDuty, dutyCandidates, dutyIdFor, instructorCandidates } from "@/lib/workshops/duties";
import { DAY_FULL, Person } from "@/lib/workshops/types";
import { dayOf, shortDate } from "@/lib/workshops/dates";

/** Sets a program's duty instructor and breakfast duty for one day; opened from the breakfast entry or the calendar menu. */
export function DutyDialog({ programId, date, groupIds = [], programName, accent, patients, staff, duties, userId, onClose, onSaved, onSettings }: {
  programId: string; date: string; groupIds?: string[]; programName: string; accent?: number;
  patients: PatientLite[]; staff: Person[]; duties: DailyDuty[]; userId?: string;
  onClose: () => void; onSaved: () => void; onSettings: () => void;
}) {
  const id = dutyIdFor(programId, date);
  const saved = duties.find(d => d.id === id);
  const [picked, setPicked] = useState<string[]>(() => saved?.breakfastIds || []);
  const [instructorId, setInstructorId] = useState(() => saved?.instructorId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const people = dutyCandidates(programId, groupIds, date, patients);
  const instructors = instructorCandidates(staff);
  const toggle = (pid: string) => setPicked(l => (l.includes(pid) ? l.filter(x => x !== pid) : [...l, pid]));

  const save = async () => {
    setSaving(true); setError("");
    try {
      const ref = doc(db, "daily_duties", id);
      if (picked.length || instructorId) await setDoc(ref, { programId, date, breakfastIds: picked, instructorId: instructorId || null, updatedAt: serverTimestamp(), updatedBy: userId || null });
      else await deleteDoc(ref);
      onSaved();
    } catch { setError("השמירה נכשלה. נסה שוב."); setSaving(false); }
  };

  return (
    <Dialog title="תורנים ליום" subtitle={`${programName} · יום ${DAY_FULL[dayOf(date)]} ${shortDate(date)}`} accent={accent} onClose={onClose}
      footer={<>
        <button onClick={save} disabled={saving} className={btnPrimary}>{saving ? "שומר…" : "שמירה"}</button>
        <button onClick={onClose} className={btnGhost}>ביטול</button>
        <button onClick={onSettings} className="mr-auto text-xs underline text-[var(--foreground)]/60">הגדרות לוז</button>
      </>}>
      <div>
        <label className={labelCls} htmlFor="duty-instructor">מדריך תורן</label>
        <select id="duty-instructor" className={fieldCls} value={instructorId} onChange={e => setInstructorId(e.target.value)}>
          <option value="">ללא</option>
          {instructors.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          {instructorId && !instructors.some(p => p.id === instructorId) && <option value={instructorId}>(לא ברשימת המדריכים)</option>}
        </select>
        {instructors.length === 0 && <p className="text-xs text-[var(--foreground)]/55 mt-1">אין אנשי צוות בתפקיד מדריך/ה.</p>}
      </div>
      <div>
        <p className={labelCls}>תורני ארוחת בוקר{picked.length ? ` (נבחרו ${picked.length})` : ""}</p>
        {people.length === 0
          ? <p className="text-sm text-[var(--foreground)]/60">אין משתתפים פעילים בתוכנית ביום הזה.</p>
          : (
            <ul className="grid grid-cols-2 gap-1">
              {people.map(p => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-[var(--foreground)]/5">
                    <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                    {`${p.firstName} ${p.lastName}`.trim()}
                  </label>
                </li>
              ))}
            </ul>
          )}
      </div>
      <p className="text-xs text-[var(--foreground)]/55">התורנים יופיעו ביומן, בלוז של מסך הבית ובלוז לשיתוף.</p>
      {error && <p role="alert" className="text-sm text-[#b42318]">{error}</p>}
    </Dialog>
  );
}
