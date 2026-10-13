"use client";

import { useMemo, useState } from "react";
import { addDays, parseISO } from "date-fns";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "./Dialog";
import { Refs } from "@/lib/workshops/data";
import { Session, Workshop } from "@/lib/workshops/types";
import { shortDate, toISO } from "@/lib/workshops/dates";
import { planExceptionsCopy, planGroupCopy, planProgramCopy } from "@/lib/workshops/copyPlan";

type Tab = "program" | "group" | "days";
const TABS: [Tab, string][] = [["program", "תוכנית למחזור חדש"], ["group", "קבוצה לקבוצה"], ["days", "יום או שבוע"]];

/**
 * Copy a schedule: a whole program into a new cycle, one group's weekly meetings to another group,
 * or the one-off changes of a day/week to another date. Everything can be undone from the toast afterwards.
 */
export function CopyScheduleDialog({ refs, workshops, sessions, dates, selectedDay, programId, userId, onClose, onDone }: {
  refs: Refs; workshops: Workshop[]; sessions: Session[]; dates: string[]; selectedDay: string; programId?: string; userId?: string;
  onClose: () => void; onDone: (text: string, undo: () => Promise<void>) => void;
}) {
  const [tab, setTab] = useState<Tab>("program");
  const [pid, setPid] = useState(programId || refs.programs[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const progWorkshops = useMemo(() => workshops.filter(w => w.programId === pid && w.status === "active"), [workshops, pid]);
  const groups = refs.groups.filter(g => g.programId === pid);

  // program → new cycle
  const [picked, setPicked] = useState<string[] | null>(null);
  const chosen = progWorkshops.filter(w => (picked ?? progWorkshops.map(x => x.id)).includes(w.id));
  const [newStart, setNewStart] = useState(toISO(addDays(parseISO(selectedDay), 7 * 12)));
  const [withStaff, setWithStaff] = useState(true);
  const [withPeople, setWithPeople] = useState(false);
  const programPlan = useMemo(() => planProgramCopy(chosen, newStart, { staff: withStaff, participants: withPeople }), [chosen, newStart, withStaff, withPeople]);

  // group → group
  const [from, setFrom] = useState(groups[0]?.id || "");
  const [to, setTo] = useState(groups[1]?.id || "");
  const [shift, setShift] = useState(0);
  const groupPlan = useMemo(() => (from && to && from !== to ? planGroupCopy(progWorkshops, from, to, shift) : []), [progWorkshops, from, to, shift]);

  // day / week → another date
  const [scope, setScope] = useState<"day" | "week">("day");
  const [target, setTarget] = useState(toISO(addDays(parseISO(selectedDay), scope === "day" ? 1 : 7)));
  const srcDates = scope === "day" ? [selectedDay] : dates;
  const offset = Math.round((parseISO(target).getTime() - parseISO(scope === "day" ? selectedDay : dates[0]).getTime()) / 86400000);
  const daysPlan = useMemo(() => planExceptionsCopy(sessions.filter(s => !programId || s.programId === programId), srcDates, offset), [sessions, srcDates, offset, programId]);

  const run = async (go: () => Promise<{ text: string; undo: () => Promise<void> }>) => {
    if (saving) return;
    setSaving(true);
    try { const r = await go(); onDone(r.text, r.undo); onClose(); } finally { setSaving(false); }
  };
  const copyProgram = () => run(async () => {
    const batch = writeBatch(db);
    const refsNew = programPlan.map(w => { const r = doc(collection(db, "workshops")); batch.set(r, { ...w, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: userId || null }); return r; });
    await batch.commit();
    return { text: `נוצרו ${refsNew.length} סדנאות במחזור חדש`, undo: async () => { const b = writeBatch(db); refsNew.forEach(r => b.delete(r)); await b.commit(); } };
  });
  const copyGroup = () => run(async () => {
    const batch = writeBatch(db);
    const before = groupPlan.map(p => { const w = progWorkshops.find(x => x.id === p.id)!; return { id: w.id, groupIds: w.groupIds || [], slots: w.slots }; });
    groupPlan.forEach(p => batch.update(doc(db, "workshops", p.id), { groupIds: p.groupIds, slots: p.slots, updatedAt: serverTimestamp() }));
    await batch.commit();
    return { text: `הלוז הועתק ב-${groupPlan.length} סדנאות`, undo: async () => { const b = writeBatch(db); before.forEach(p => b.update(doc(db, "workshops", p.id), { groupIds: p.groupIds, slots: p.slots })); await b.commit(); } };
  });
  const copyDays = () => run(async () => {
    const batch = writeBatch(db);
    const refsNew = daysPlan.map(x => { const r = doc(collection(db, "session_changes")); batch.set(r, { ...x, updatedAt: serverTimestamp(), updatedBy: userId || null }); return r; });
    await batch.commit();
    return { text: `הועתקו ${refsNew.length} מפגשים ל-${shortDate(target)}`, undo: async () => { const b = writeBatch(db); refsNew.forEach(r => b.delete(r)); await b.commit(); } };
  });

  const ready = tab === "program" ? programPlan.length > 0 : tab === "group" ? groupPlan.length > 0 : daysPlan.length > 0 && offset !== 0;
  const act = tab === "program" ? copyProgram : tab === "group" ? copyGroup : copyDays;
  const label = tab === "program" ? `צור ${programPlan.length} סדנאות` : tab === "group" ? `העתק ב-${groupPlan.length} סדנאות` : `העתק ${daysPlan.length} מפגשים`;

  return (
    <Dialog title="העתקת לוז" subtitle="הכול ניתן לביטול מיד אחרי הביצוע" onClose={onClose} wide
      footer={<><button onClick={act} disabled={saving || !ready} className={btnPrimary}>{label}</button><button onClick={onClose} className={btnGhost}>ביטול</button></>}>
      <div className="flex border border-[var(--border)] rounded-lg overflow-hidden" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 px-2 h-9 text-sm ${tab === k ? "bg-[var(--accent)] text-white font-bold" : "hover:bg-[var(--foreground)]/5"}`}>{l}</button>)}
      </div>

      {tab !== "days" && (
        <div><label className={labelCls}>תוכנית</label>
          <select className={fieldCls} value={pid} onChange={e => { setPid(e.target.value); setPicked(null); const g = refs.groups.filter(x => x.programId === e.target.value); setFrom(g[0]?.id || ""); setTo(g[1]?.id || ""); }}>
            {refs.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
      )}

      {tab === "program" && <>
        <p className="text-xs text-[var(--foreground)]/60">הסדנאות הפעילות השבוע בתוכנית. כל התאריכים זזים במספר שלם של שבועות, כך שהימים והקצב (למשל כל שבועיים) נשמרים.</p>
        <ul className="divide-y divide-[var(--border)] text-sm max-h-48 overflow-y-auto">
          {progWorkshops.map(w => (
            <li key={w.id}><label className="flex items-center gap-2 py-1.5 cursor-pointer"><input type="checkbox" checked={chosen.includes(w)} onChange={() => setPicked(p => { const cur = p ?? progWorkshops.map(x => x.id); return cur.includes(w.id) ? cur.filter(x => x !== w.id) : [...cur, w.id]; })} />{w.name}</label></li>
          ))}
          {progWorkshops.length === 0 && <li className="py-2 text-[var(--foreground)]/50">אין סדנאות פעילות השבוע בתוכנית.</li>}
        </ul>
        <div><label className={labelCls}>המחזור החדש מתחיל בשבוע של</label><input type="date" className={fieldCls} value={newStart} onChange={e => setNewStart(e.target.value)} /></div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={withStaff} onChange={e => setWithStaff(e.target.checked)} />להעתיק צוות</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={withPeople} onChange={e => setWithPeople(e.target.checked)} />להעתיק משתתפים</label>
        </div>
        <p className="text-sm font-semibold">ייווצרו {programPlan.length} סדנאות{programPlan[0] ? `, מ-${shortDate(programPlan[0].startDate)}` : ""}.</p>
      </>}

      {tab === "group" && (groups.length < 2 ? <p className="text-sm text-[var(--foreground)]/60">לתוכנית הזו יש פחות משתי קבוצות.</p> : <>
        <p className="text-xs text-[var(--foreground)]/60">מעתיק את המפגשים השבועיים שהם רק של הקבוצה המקורית. מפגשים שכבר קיימים לקבוצת היעד באותה שעה מדולגים.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>מקבוצה</label><select className={fieldCls} value={from} onChange={e => setFrom(e.target.value)}>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
          <div><label className={labelCls}>לקבוצה</label><select className={fieldCls} value={to} onChange={e => setTo(e.target.value)}>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
        </div>
        <div><label className={labelCls}>הזזת השעות (דקות, אפשר שלילי)</label><input type="number" step={15} className={`${fieldCls} !w-32`} value={shift} onChange={e => setShift(Number(e.target.value))} /></div>
        <p className="text-sm font-semibold">{groupPlan.length ? `${groupPlan.reduce((n, p) => n + p.slots.length, 0) - groupPlan.reduce((n, p) => n + (progWorkshops.find(w => w.id === p.id)?.slots.length || 0), 0)} מפגשים יתווספו ב-${groupPlan.length} סדנאות.` : "אין מה להעתיק."}</p>
      </>)}

      {tab === "days" && <>
        <p className="text-xs text-[var(--foreground)]/60">מעתיק רק מפגשים חד-פעמיים ושינויים ({programId ? "של התוכנית שמוצגת" : "של כל התוכניות"}). מפגשים קבועים חוזרים בעצמם.</p>
        <div className="flex gap-2">
          {([["day", "היום שמוצג"], ["week", "כל השבוע"]] as const).map(([k, l]) => <button key={k} aria-pressed={scope === k} onClick={() => { setScope(k); setTarget(toISO(addDays(parseISO(selectedDay), k === "day" ? 1 : 7))); }} className={`${btnGhost} ${scope === k ? "!bg-[var(--accent)] !text-white" : ""}`}>{l}</button>)}
        </div>
        <div><label className={labelCls}>{scope === "day" ? "ליום" : "לשבוע שמתחיל ב"}</label><input type="date" className={fieldCls} value={target} onChange={e => setTarget(e.target.value)} /></div>
        <p className="text-sm font-semibold">{daysPlan.length ? `יועתקו ${daysPlan.length} מפגשים.` : "אין ביום הזה מפגשים חד-פעמיים או שינויים להעתקה."}</p>
      </>}
    </Dialog>
  );
}
