"use client";

import { useState } from "react";
import { db } from "@/lib/firebase/config";
import { collection, deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "./Dialog";
import { Person, Session, SessionChange, Workshop, DAY_FULL } from "@/lib/workshops/types";
import { dayOf, shortDate } from "@/lib/workshops/dates";

interface Props {
  session: Session | null;          // null → creating an extra session
  extra?: { date: string; programId?: string };
  workshops: Workshop[];
  staff: Person[];
  locations: Person[];
  canEdit: boolean;
  warnings: string[];
  userId?: string;
  onClose: () => void;
  onSaved: () => void;
  onEditSeries?: (workshopId: string) => void;
}

const sameSet = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();

export function SessionEditor({ session, extra, workshops, staff, locations, canEdit, warnings, userId, onClose, onSaved, onEditSeries }: Props) {
  const isExtra = !session || session.kind === "extra";
  const ch = session?.change;
  const [workshopId, setWorkshopId] = useState(session?.workshopId || "");
  const wsList = workshops.filter(w => !extra?.programId || w.programId === extra.programId);
  const workshop = workshops.find(w => w.id === workshopId);

  const [cancelled, setCancelled] = useState(session?.kind === "cancelled");
  const [date, setDate] = useState(ch?.newDate ?? session?.date ?? extra?.date ?? "");
  const [start, setStart] = useState(session?.start || "09:00");
  const [end, setEnd] = useState(session?.end || "10:30");
  const [staffIds, setStaffIds] = useState<string[]>(session?.staffIds || []);
  const [locationId, setLocationId] = useState(session?.locationId || "");
  const [note, setNote] = useState(session?.note || "");
  const [saving, setSaving] = useState(false);

  const nameOf = (id: string) => staff.find(s => s.id === id)?.name || "—";
  const pickWorkshop = (id: string) => {
    setWorkshopId(id);
    const w = workshops.find(x => x.id === id);
    if (w && !session) setStaffIds(w.staffIds || []);
  };
  const toggleStaff = (id: string) => setStaffIds(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const save = async () => {
    setSaving(true);
    try {
      if (isExtra) {
        if (!workshop) return;
        const ref = session?.changeId ? doc(db, "session_changes", session.changeId) : doc(collection(db, "session_changes"));
        await setDoc(ref, {
          workshopId, slotId: null, originalDate: null, newDate: date, newStart: start, newEnd: end,
          staffIds, locationId, note: note.trim(), dates: [date], published: false,
          updatedAt: serverTimestamp(), updatedBy: userId || null,
        });
      } else if (session && session.changeId) {
        const c: Record<string, unknown> = {};
        if (cancelled) c.cancelled = true;
        if (date !== session.origDate) c.newDate = date;
        if (start !== session.base.start) c.newStart = start;
        if (end !== session.base.end) c.newEnd = end;
        if (!sameSet(staffIds, session.base.staffIds)) c.staffIds = staffIds;
        if (locationId !== (session.base.locationId || "")) c.locationId = locationId;
        if (note.trim()) c.note = note.trim();
        const ref = doc(db, "session_changes", session.changeId);
        if (Object.keys(c).length === 0) await deleteDoc(ref).catch(() => {});
        else await setDoc(ref, {
          workshopId: session.workshopId, slotId: session.slotId, originalDate: session.origDate, ...c,
          dates: [session.origDate, c.newDate].filter(Boolean),
          published: false, updatedAt: serverTimestamp(), updatedBy: userId || null,
        });
      }
      onSaved();
    } finally { setSaving(false); }
  };

  const revert = async () => {
    if (!session?.changeId) return;
    setSaving(true);
    await deleteDoc(doc(db, "session_changes", session.changeId));
    onSaved();
  };

  const title = isExtra ? (session ? "מפגש נוסף" : "מפגש חד-פעמי") : session!.workshopName;
  const valid = isExtra ? !!(workshop && date && end > start) : (cancelled || end > start);

  // Read-only view for non-managers.
  if (!canEdit && session) {
    return (
      <Dialog title={title} onClose={onClose}>
        <dl className="text-sm space-y-2">
          <div><dt className={labelCls}>מועד</dt><dd>יום {DAY_FULL[dayOf(session.date)]} {shortDate(session.date)} · {session.start}–{session.end}</dd></div>
          <div><dt className={labelCls}>מעבירים</dt><dd>{session.staffIds.map(nameOf).join(", ") || "—"}</dd></div>
          <div><dt className={labelCls}>מרחב</dt><dd>{locations.find(l => l.id === session.locationId)?.name || "—"}</dd></div>
          {session.kind === "cancelled" && <p className="text-rose-500 font-bold">המפגש בוטל</p>}
          {session.note && <div><dt className={labelCls}>הערה</dt><dd>{session.note}</dd></div>}
        </dl>
      </Dialog>
    );
  }

  return (
    <Dialog title={title} onClose={onClose}
      footer={<>
        <button onClick={save} disabled={saving || !valid} className={btnPrimary}>שמור</button>
        <button onClick={onClose} className={btnGhost}>סגור</button>
        {!isExtra && onEditSeries && <button onClick={() => onEditSeries(session!.workshopId)} className="text-sm text-[var(--foreground)]/70 underline">ימי פעילות קבועים</button>}
        {!isExtra && ch && <button onClick={revert} disabled={saving} className="mr-auto text-sm text-[var(--foreground)]/60 underline">החזר למקור</button>}
        {isExtra && session && <button onClick={revert} disabled={saving} className="mr-auto text-sm text-rose-500 underline">מחק מפגש</button>}
      </>}>
      {warnings.length > 0 && (
        <ul className="text-xs text-amber-600 space-y-0.5">{warnings.map(w => <li key={w}>{w}</li>)}</ul>
      )}

      {isExtra && (
        <div>
          <label className={labelCls}>סדנה</label>
          <select className={fieldCls} value={workshopId} onChange={e => pickWorkshop(e.target.value)} disabled={!!session}>
            <option value="">בחר סדנה…</option>
            {wsList.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      )}

      {!isExtra && (
        <button onClick={() => setCancelled(c => !c)}
          className={`w-full py-2 rounded-md text-sm font-bold border ${cancelled ? "border-[var(--border)] text-[var(--foreground)]/70" : "border-rose-500/40 text-rose-500"}`}>
          {cancelled ? "המפגש מבוטל — לחץ לביטול הביטול" : "בטל מפגש זה"}
        </button>
      )}

      <fieldset disabled={cancelled} className={`space-y-4 ${cancelled ? "opacity-40" : ""}`}>
        <div>
          <label className={labelCls}>{isExtra ? "תאריך" : "הזזה — תאריך"}</label>
          <input type="date" className={fieldCls} value={date} onChange={e => setDate(e.target.value)} />
          {!isExtra && date !== session!.origDate && (
            <p className="text-xs text-[var(--foreground)]/50 mt-1">המפגש יוזז מ-{shortDate(session!.origDate!)} ל-{date && shortDate(date)}.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>התחלה</label><input type="time" className={fieldCls} value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><label className={labelCls}>סיום</label><input type="time" className={fieldCls} value={end} onChange={e => setEnd(e.target.value)} /></div>
        </div>
        <div>
          <label className={labelCls}>מרחב</label>
          <select className={fieldCls} value={locationId} onChange={e => setLocationId(e.target.value)}>
            <option value="">ללא מרחב</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>מעבירים{!isExtra && session && <span className="font-normal"> — מקור: {session.base.staffIds.map(nameOf).join(", ") || "—"}</span>}</label>
          <ul className="grid grid-cols-2 gap-x-3 max-h-40 overflow-y-auto border border-[var(--border)] rounded-md px-2.5 py-1">
            {staff.map(s => (
              <li key={s.id}>
                <label className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                  <input type="checkbox" checked={staffIds.includes(s.id)} onChange={() => toggleStaff(s.id)} /> {s.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </fieldset>

      <div>
        <label className={labelCls}>הערה (מוצגת ביומן)</label>
        <input className={fieldCls} value={note} onChange={e => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}

export type { SessionChange };
