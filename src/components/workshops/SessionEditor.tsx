"use client";

import { useState } from "react";
import { db } from "@/lib/firebase/config";
import { collection, deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "./Dialog";
import { Person, Session, SessionChange, Workshop, DAY_FULL } from "@/lib/workshops/types";
import { ActivityType, pastel } from "@/lib/workshops/activityTypes";
import { dayOf, shortDate } from "@/lib/workshops/dates";

interface Props {
  session: Session | null;          // null → creating an extra session
  extra?: { date: string; programId?: string };
  workshops: Workshop[];
  staff: Person[];
  locations: Person[];
  types?: ActivityType[];
  canEdit: boolean;
  warnings: string[];
  participants?: string[]; // first names of the people attending
  groupNames?: string[];
  accent?: number;         // hue of the session, for the header bar
  busyFor?: (staffId: string, date: string, start: string, end: string, workshopId?: string) => string | undefined;
  userId?: string;
  onClose: () => void;
  onSaved: () => void;
  onEditSeries?: (workshopId: string) => void;
}

const Chip = ({ children }: { children: React.ReactNode }) => <span className="inline-flex items-center h-7 px-3 rounded-full bg-[var(--btn-soft)] text-[var(--btn-soft-text)] text-[13px] font-medium">{children}</span>;
const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><h3 className={labelCls}>{label}</h3><div className="flex flex-wrap gap-1.5 text-sm">{children}</div></div>
);

const quickCls = "rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm font-semibold hover:bg-[var(--foreground)]/5 disabled:opacity-50 transition-colors";
const sameSet = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();

export function SessionEditor({ session, extra, workshops, staff, locations, types = [], canEdit, warnings, participants = [], groupNames = [], accent, busyFor, userId, onClose, onSaved, onEditSeries }: Props) {
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
  const [kind, setKind] = useState(session?.activity || "workshop");
  const defaultKind = workshops.find(w => w.id === workshopId)?.kind || "workshop";
  const [saving, setSaving] = useState(false);
  // Existing sessions open as a readable summary with one-tap actions; the full form is one step further.
  const [stage, setStage] = useState<"view" | "edit">(session ? "view" : "edit");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const nameOf = (id: string) => staff.find(s => s.id === id)?.name || "—";
  const pickWorkshop = (id: string) => {
    setWorkshopId(id);
    const w = workshops.find(x => x.id === id);
    if (w && !session) { setStaffIds(w.staffIds || []); setKind(w.kind || "workshop"); }
  };
  const shiftBy = (d: number) => {
    const add = (t: string) => { const m = Math.min(1439, Math.max(0, Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + d)); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
    setStart(add(start)); setEnd(add(end));
  };
  // Free people first, so picking a substitute does not mean guessing who is available.
  const busyOf = (id: string) => busyFor?.(id, date, start, end, workshopId);
  const staffSorted = [...staff].sort((a, b) => Number(!!busyOf(a.id)) - Number(!!busyOf(b.id)));
  const toggleStaff = (id: string) => setStaffIds(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const save = async (o: { cancelled?: boolean; start?: string; end?: string } = {}) => {
    const isCancelled = o.cancelled ?? cancelled, st = o.start ?? start, en = o.end ?? end;
    setSaving(true);
    try {
      if (isExtra) {
        if (!workshop) return;
        const ref = session?.changeId ? doc(db, "session_changes", session.changeId) : doc(collection(db, "session_changes"));
        await setDoc(ref, {
          workshopId, slotId: null, originalDate: null, newDate: date, newStart: st, newEnd: en,
          staffIds, locationId, note: note.trim(), dates: [date], published: false, ...(kind !== defaultKind ? { kind } : {}),
          updatedAt: serverTimestamp(), updatedBy: userId || null,
        });
      } else if (session && session.changeId) {
        const c: Record<string, unknown> = {};
        if (isCancelled) c.cancelled = true;
        if (date !== session.origDate) c.newDate = date;
        if (st !== session.base.start) c.newStart = st;
        if (en !== session.base.end) c.newEnd = en;
        if (!sameSet(staffIds, session.base.staffIds)) c.staffIds = staffIds;
        if (locationId !== (session.base.locationId || "")) c.locationId = locationId;
        if (note.trim()) c.note = note.trim();
        if (kind !== defaultKind) c.kind = kind;
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

  const roomName = locations.find(l => l.id === session?.locationId)?.name;
  const subtitle = session ? (
    <>יום {DAY_FULL[dayOf(session.date)]} {shortDate(session.date)} · <span dir="ltr" className="tabular-nums">{session.start}–{session.end}</span>{roomName ? ` · ${roomName}` : ""}</>
  ) : undefined;
  const dead = session?.kind === "cancelled";
  const addMin = (t: string, d: number) => { const m = Math.min(1439, Math.max(0, Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + d)); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  // Summary: what, who, where — readable at a glance. Managers get one-tap actions under it.
  if (session && (!canEdit || stage === "view")) {
    const shown = participants.slice(0, 14);
    return (
      <Dialog title={title} subtitle={subtitle} accent={accent} onClose={onClose}
        footer={canEdit ? <>
          <button onClick={() => setStage("edit")} className={btnPrimary}>עריכה מלאה</button>
          <button onClick={onClose} className={btnGhost}>סגור</button>
          {!isExtra && onEditSeries && <button onClick={() => onEditSeries(session.workshopId)} className="text-sm text-[var(--foreground)]/60 underline mr-auto">ימי פעילות קבועים</button>}
        </> : <button onClick={onClose} className={btnGhost}>סגור</button>}>
        {dead && <p className="rounded-lg bg-[#fde2e2] text-[#b42318] text-sm font-bold px-3 py-2">המפגש בוטל</p>}
        {warnings.length > 0 && <ul className="rounded-lg bg-[#fff6dc] text-[#8a5a00] text-[13px] px-3 py-2 space-y-0.5">{warnings.map(w => <li key={w}>{w}</li>)}</ul>}
        <Section label="מעבירים">{session.staffIds.length ? session.staffIds.map(id => <Chip key={id}>{nameOf(id)}</Chip>) : <span className="text-[var(--foreground)]/50">—</span>}</Section>
        {groupNames.length > 0 && <Section label="קבוצות">{groupNames.map(g => <Chip key={g}>{g}</Chip>)}</Section>}
        {participants.length > 0 && (
          <Section label={`משתתפים (${participants.length})`}>
            {shown.map((n, i) => <Chip key={i}>{n}</Chip>)}
            {participants.length > shown.length && <Chip>+{participants.length - shown.length}</Chip>}
          </Section>
        )}
        {session.note && <div><h3 className={labelCls}>הערה</h3><p className="text-sm">{session.note}</p></div>}

        {canEdit && (
          <div>
            <h3 className={labelCls}>פעולות מהירות</h3>
            <div className="grid grid-cols-2 gap-2">
              {!dead && <button disabled={saving} onClick={() => save({ start: addMin(session.start, 15), end: addMin(session.end, 15) })} className={quickCls}>דחה ב-15 דקות</button>}
              {!dead && <button disabled={saving} onClick={() => save({ start: addMin(session.start, -15), end: addMin(session.end, -15) })} className={quickCls}>הקדם ב-15 דקות</button>}
              {!dead && <button disabled={saving} onClick={() => setStage("edit")} className={quickCls}>מחליף או מרחב…</button>}
              {dead
                ? <button disabled={saving} onClick={() => save({ cancelled: false })} className={`${quickCls} col-span-2`}>החזר את המפגש</button>
                : confirmCancel
                  ? <span className="flex gap-1.5"><button disabled={saving} onClick={() => save({ cancelled: true })} className="flex-1 rounded-lg bg-[#b42318] text-white text-sm font-bold px-2 py-2.5">כן, בטל</button><button onClick={() => setConfirmCancel(false)} className="rounded-lg border border-[var(--border)] text-sm px-3">לא</button></span>
                  : <button onClick={() => setConfirmCancel(true)} className={`${quickCls} text-[#b42318]`}>בטל מפגש…</button>}
            </div>
            {ch && <button onClick={revert} disabled={saving} className="mt-3 text-xs text-[var(--foreground)]/55 underline">החזר את כל השינויים למקור</button>}
          </div>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog title={title} subtitle={subtitle} accent={accent} onClose={onClose} wide
      footer={<>
        <button onClick={() => save()} disabled={saving || !valid} className={btnPrimary}>שמור</button>
        {session ? <button onClick={() => setStage("view")} className={btnGhost}>חזרה</button> : <button onClick={onClose} className={btnGhost}>ביטול</button>}
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
        <div className="flex gap-2">
          {[-15, 15].map(d => <button key={d} type="button" onClick={() => shiftBy(d)} className={`${btnGhost} !py-1 !text-xs`}>{d > 0 ? `+${d} דקות` : `${d} דקות`}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>התחלה</label><input type="time" className={fieldCls} value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><label className={labelCls}>סיום</label><input type="time" className={fieldCls} value={end} onChange={e => setEnd(e.target.value)} /></div>
        </div>
        {types.length > 0 && (
          <div>
            <label className={labelCls}>סוג פעילות</label>
            <div className="flex flex-wrap gap-1.5">
              {types.filter(t => !t.archived || t.id === kind).map(t => {
                const on = t.id === kind; const c = pastel(t.hue);
                return <button key={t.id} type="button" onClick={() => setKind(t.id)} aria-pressed={on}
                  className={`px-2.5 py-1 rounded-full text-[13px] font-medium border-s-[3px] border ${on ? "font-bold" : "opacity-70 hover:opacity-100"}`}
                  style={{ backgroundColor: c.fill, color: c.ink, borderColor: on ? c.bar : c.soft, borderInlineStartColor: c.bar }}>{t.label}</button>;
              })}
            </div>
            {kind !== defaultKind && <p className="text-xs text-[var(--foreground)]/50 mt-1">חל על המפגש הזה בלבד. סוג הסדנה עצמה משתנה בעמוד הסדנה.</p>}
          </div>
        )}
        <div>
          <label className={labelCls}>מרחב</label>
          <select className={fieldCls} value={locationId} onChange={e => setLocationId(e.target.value)}>
            <option value="">ללא מרחב</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>מעבירים{!isExtra && session && <span className="font-normal"> — מקור: {session.base.staffIds.map(nameOf).join(", ") || "—"}</span>}</label>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 max-h-56 overflow-y-auto border border-[var(--border)] rounded-lg px-2.5 py-1">
            {staffSorted.map(s => {
              const busy = busyOf(s.id);
              return (
                <li key={s.id}>
                  <label className={`flex items-center gap-2 py-1 text-sm cursor-pointer ${busy && !staffIds.includes(s.id) ? "text-[var(--foreground)]/45" : ""}`} title={busy ? `תפוס/ה: ${busy}` : undefined}>
                    <input type="checkbox" checked={staffIds.includes(s.id)} onChange={() => toggleStaff(s.id)} /> {s.name}
                    {busy && <span className="text-[11px] text-amber-600">· {busy}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </fieldset>

      {participants.length > 0 && (
        <div>
          <label className={labelCls}>משתתפים ({participants.length})</label>
          <p className="text-sm leading-relaxed">{participants.join(", ")}</p>
        </div>
      )}

      <div>
        <label className={labelCls}>הערה (מוצגת ביומן)</label>
        <textarea rows={2} className={fieldCls} value={note} onChange={e => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}

export type { SessionChange };
