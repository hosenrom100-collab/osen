"use client";

import { useState } from "react";
import { db } from "@/lib/firebase/config";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Dialog, btnPrimary, btnGhost } from "./Dialog";
import type { PatientLite } from "@/lib/workshops/data";
import { DailyDuty, dutyCandidates, dutyIdFor } from "@/lib/workshops/duties";
import { DAY_FULL, Session } from "@/lib/workshops/types";
import { dayOf, shortDate } from "@/lib/workshops/dates";

/** Picks the day's breakfast duty for a program; opened from the program's breakfast entry in the calendar. */
export function DutyDialog({ s, programName, accent, patients, duties, userId, onClose, onSaved, onSettings }: {
  s: Session; programName: string; accent?: number; patients: PatientLite[]; duties: DailyDuty[]; userId?: string;
  onClose: () => void; onSaved: () => void; onSettings: () => void;
}) {
  const id = dutyIdFor(s.programId, s.date);
  const [picked, setPicked] = useState<string[]>(() => duties.find(d => d.id === id)?.breakfastIds || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const people = dutyCandidates(s.programId, s.groupIds, s.date, patients);
  const toggle = (pid: string) => setPicked(l => (l.includes(pid) ? l.filter(x => x !== pid) : [...l, pid]));

  const save = async () => {
    setSaving(true); setError("");
    try {
      const ref = doc(db, "daily_duties", id);
      if (picked.length) await setDoc(ref, { programId: s.programId, date: s.date, breakfastIds: picked, updatedAt: serverTimestamp(), updatedBy: userId || null });
      else await deleteDoc(ref);
      onSaved();
    } catch { setError("השמירה נכשלה. נסה שוב."); setSaving(false); }
  };

  return (
    <Dialog title="תורני ארוחת בוקר" subtitle={`${programName} · יום ${DAY_FULL[dayOf(s.date)]} ${shortDate(s.date)} · ${s.start}–${s.end}`} accent={accent} onClose={onClose}
      footer={<>
        <button onClick={save} disabled={saving} className={btnPrimary}>{saving ? "שומר…" : "שמירה"}</button>
        <button onClick={onClose} className={btnGhost}>ביטול</button>
        <button onClick={onSettings} className="mr-auto text-xs underline text-[var(--foreground)]/60">הגדרות לוז</button>
      </>}>
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
      <p className="text-xs text-[var(--foreground)]/55">השמות יופיעו ביומן, בלוז של מסך הבית ובלוז לשיתוף{picked.length ? ` (נבחרו ${picked.length})` : ""}.</p>
      {error && <p role="alert" className="text-sm text-[#b42318]">{error}</p>}
    </Dialog>
  );
}
