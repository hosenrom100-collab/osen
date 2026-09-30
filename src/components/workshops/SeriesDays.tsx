"use client";

import { useState } from "react";
import { db } from "@/lib/firebase/config";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { rememberBack } from "@/lib/workshops/back";
import { anchorFallback } from "@/lib/workshops/dates";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "./Dialog";
import { DAY_FULL, Group, Person, Program, Slot, Workshop } from "@/lib/workshops/types";

interface Props {
  workshops: Workshop[];
  initialId?: string;
  programs: Program[];
  groups: Group[];
  locations: Person[];
  onClose: () => void;
  onSaved: () => void;
}

const keyOf = (s: Slot) => [...(s.groupIds || [])].sort().join(",");
const newId = () => Math.random().toString(36).slice(2, 9);

/** Edit the fixed weekly activity days of a workshop series, separately for each group. */
export function SeriesDays({ workshops, initialId, programs, groups, locations, onClose, onSaved }: Props) {
  const list = workshops.filter(w => w.status !== "cancelled");
  const [wid, setWid] = useState(initialId && list.some(w => w.id === initialId) ? initialId : list[0]?.id || "");
  const [slots, setSlots] = useState<Slot[]>(() => (list.find(w => w.id === (initialId || list[0]?.id))?.slots || []).map(s => ({ ...s })));
  const [saving, setSaving] = useState(false);

  const w = list.find(x => x.id === wid);
  const days = programs.find(p => p.id === w?.programId)?.activeDays || [0, 1, 2, 3, 4];
  const wGroups = groups.filter(g => w?.groupIds?.includes(g.id));

  const pick = (id: string) => {
    setWid(id);
    setSlots((list.find(x => x.id === id)?.slots || []).map(s => ({ ...s })));
  };
  const patch = (id: string, p: Partial<Slot>) => setSlots(slots.map(s => (s.id === id ? { ...s, ...p } : s)));
  const add = (groupIds: string[]) =>
    setSlots([...slots, { id: newId(), day: days[0] ?? 0, start: "09:00", end: "10:30", groupIds: groupIds.length ? groupIds : undefined }]);

  // Sections. A slot with no group list belongs to every group of the workshop, so:
  //  - no groups: one section for the whole program;
  //  - exactly one group: ONE section, named after it (there is no "together" vs "its own" to tell apart);
  //  - several groups: one per group, "all the workshop's groups", and any other combination already saved.
  type Sec = { key: string; label: string; groupIds: string[]; match: (s: Slot) => boolean };
  const sections: Sec[] = [];
  if (wGroups.length === 0) sections.push({ key: "", label: "כל התוכנית", groupIds: [], match: s => keyOf(s) === "" });
  else if (wGroups.length === 1) {
    const g = wGroups[0];
    sections.push({ key: g.id, label: g.name, groupIds: [], match: s => !s.groupIds?.length || s.groupIds.every(id => id === g.id) });
  } else {
    wGroups.forEach(g => sections.push({ key: g.id, label: g.name, groupIds: [g.id], match: s => keyOf(s) === g.id }));
    sections.push({ key: "", label: "כל קבוצות הסדנה יחד", groupIds: [], match: s => keyOf(s) === "" });
  }
  for (const s of slots) {
    if (sections.some(x => x.match(s))) continue;
    const k = keyOf(s), ids = s.groupIds || [];
    sections.push({ key: k, label: ids.map(id => groups.find(g => g.id === id)?.name || "—").join(" + "), groupIds: ids, match: x => keyOf(x) === k });
  }

  const invalid = slots.some(s => s.end <= s.start);
  const save = async () => {
    if (!w) return;
    setSaving(true);
    // Firestore rejects undefined values, so drop empty groupIds explicitly.
    const clean = slots.map(s => {
      const o: Record<string, unknown> = { id: s.id, day: s.day, start: s.start, end: s.end };
      if (s.locationId) o.locationId = s.locationId;
      if (s.groupIds?.length) o.groupIds = s.groupIds;
      return o;
    });
    await updateDoc(doc(db, "workshops", w.id), { slots: clean, updatedAt: serverTimestamp() });
    onSaved();
  };

  return (
    <Dialog title="ימים ושעות קבועים" subtitle={w ? <>עורכים את הסדנה <b>{w.name}</b>{wGroups.length ? ` · מיועדת ל${wGroups.map(g => g.name).join(", ")}` : ""}. השינוי חל על כל המפגשים שלה, בכל השבועות.</> : undefined} onClose={onClose} wide
      footer={<>
        <button onClick={save} disabled={saving || !w || invalid} className={btnPrimary}>שמור</button>
        <button onClick={onClose} className={btnGhost}>ביטול</button>
        {w && <Link href={`/admin/workshops/${w.id}`} onClick={rememberBack} className="mr-auto text-sm font-semibold text-[var(--accent-text)] underline">לכל פרטי הסדנה ←</Link>}
      </>}>
      {list.length === 0 ? <p className="text-sm text-[var(--foreground)]/60">אין סדנאות להגדרה.</p> : <>
        <div>
          <label className={labelCls}>סדרה (סדנה)</label>
          <select className={fieldCls} value={wid} onChange={e => pick(e.target.value)}>
            {list.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <p className="text-xs text-[var(--foreground)]/60 rounded-lg bg-[var(--foreground)]/[0.04] px-3 py-2 leading-relaxed">
          שינוי חד-פעמי (ביטול, הזזה, מחליף) עושים בלחיצה על המפגש ביומן. כאן משנים את המערכת הקבועה. לשם, תאריכים, צוות ומשתתפים, עוברים ל"כל פרטי הסדנה".
        </p>
        {sections.map(sec => {
          const rows = slots.filter(sec.match);
          return (
            <section key={sec.key || "all"} className="border-t border-[var(--border)] pt-3 space-y-2">
              <h3 className="text-sm font-bold">{sec.label}</h3>
              {rows.length === 0 && <p className="text-xs text-[var(--foreground)]/55 leading-relaxed">{wGroups.length > 1 && sec.groupIds.length ? "אין ימים ייעודיים לקבוצה הזו. היא משתתפת בימים של ״כל קבוצות הסדנה יחד״ שמתחת." : "אין ימי פעילות."}</p>}
              {rows.map(s => (
                <div key={s.id} className="grid grid-cols-2 sm:grid-cols-[8rem_7rem_7rem_minmax(8rem,1fr)_8.5rem_auto] gap-2 items-center">
                  <select aria-label="יום" className={`${fieldCls} col-span-2 sm:col-span-1`} value={s.day} onChange={e => patch(s.id, { day: Number(e.target.value) })}>
                    {days.map(d => <option key={d} value={d}>{DAY_FULL[d]}</option>)}
                    {!days.includes(s.day) && <option value={s.day}>{DAY_FULL[s.day]} (לא פעיל)</option>}
                  </select>
                  <input aria-label="התחלה" type="time" className={fieldCls} value={s.start} onChange={e => patch(s.id, { start: e.target.value })} />
                  <input aria-label="סיום" type="time" className={fieldCls} value={s.end} onChange={e => patch(s.id, { end: e.target.value })} />
                  <select aria-label="מרחב" className={`${fieldCls} col-span-2 sm:col-span-1`} value={s.locationId || ""} onChange={e => patch(s.id, { locationId: e.target.value || undefined })}>
                    <option value="">ללא מרחב</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <select aria-label="תדירות" className={`${fieldCls} col-span-2 sm:col-span-1`} value={s.every || 1}
                    onChange={e => { const n = Number(e.target.value); patch(s.id, { every: n > 1 ? n : undefined, anchorDate: n > 1 ? s.anchorDate || anchorFallback(w?.startDate || "") : undefined }); }}>
                    {[[1, "כל שבוע"], [2, "כל שבועיים"], [3, "כל 3 שבועות"], [4, "כל 4 שבועות"]].map(([n, l]) => <option key={n} value={n}>{l}</option>)}
                  </select>
                  <button onClick={() => setSlots(slots.filter(x => x.id !== s.id))} aria-label="הסר" className="p-1.5 justify-self-end col-span-2 sm:col-span-1 text-[var(--foreground)]/50 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                  {(s.every || 1) > 1 && (
                    <label className="col-span-full flex items-center gap-2 text-xs text-[var(--foreground)]/60">השבוע הראשון שבו זה מתקיים
                      <input type="date" className={`${fieldCls} !w-auto`} value={s.anchorDate || anchorFallback(w?.startDate || "")} onChange={e => patch(s.id, { anchorDate: e.target.value })} />
                    </label>
                  )}
                  {s.end <= s.start && <span className="text-xs text-rose-500 col-span-full">שעת הסיום מוקדמת מההתחלה</span>}
                </div>
              ))}
              <button onClick={() => add(sec.groupIds)} className="flex items-center gap-1 text-sm text-[var(--accent)] font-bold"><Plus className="w-4 h-4" /> הוסף יום</button>
            </section>
          );
        })}
      </>}
    </Dialog>
  );
}
