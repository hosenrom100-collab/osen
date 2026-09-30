"use client";

import { useMemo, useState } from "react";
import { addDays, addMonths, format, parseISO } from "date-fns";
import { db } from "@/lib/firebase/config";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "./Dialog";
import { StaffPicker } from "./StaffPicker";
import { Refs } from "@/lib/workshops/data";
import { ActivityType, pastel } from "@/lib/workshops/activityTypes";
import { DAY_FULL } from "@/lib/workshops/types";
import { OPEN_END, dayOf, toISO } from "@/lib/workshops/dates";

const REPEATS: [number, string][] = [[0, "לא חוזר"], [1, "כל שבוע"], [2, "כל שבועיים"], [3, "כל 3 שבועות"], [4, "כל 4 שבועות"]];

/**
 * A new event — a team meeting, a workshop, anything — optionally repeating every N weeks.
 * It is created as its own activity, so it can be edited later for all of its dates at once.
 */
export function NewEventDialog({ refs, types, initial, userId, onClose, onSaved, onExisting }: {
  refs: Refs; types: ActivityType[]; initial: { date: string; programId?: string };
  userId?: string; onClose: () => void; onSaved: () => void; onExisting: () => void;
}) {
  const pickable = types.filter(t => !t.band && !t.archived);
  const [name, setName] = useState("");
  const [kind, setKind] = useState(pickable.find(t => t.id === "staff_meeting")?.id || pickable[0]?.id || "workshop");
  const [programId, setProgramId] = useState(initial.programId || refs.programs[0]?.id || "");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [locationId, setLocationId] = useState("");
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [every, setEvery] = useState(0);
  const [until, setUntil] = useState(toISO(addMonths(parseISO(initial.date), 3)));
  const [noEnd, setNoEnd] = useState(false);
  const [saving, setSaving] = useState(false);

  const type = types.find(t => t.id === kind);
  const staffOnly = type?.audience === "staff";
  const progGroups = useMemo(() => refs.groups.filter(g => g.programId === programId), [refs, programId]);
  const toggleGroup = (id: string) => setGroupIds(g => (g.includes(id) ? g.filter(x => x !== id) : [...g, id]));

  const occurrences = useMemo(() => {
    if (!every || (!noEnd && until < date)) return 1;
    const stop = noEnd ? toISO(addMonths(parseISO(date), 6)) : until; // an open-ended series is previewed for 6 months
    let n = 0;
    for (let d = parseISO(date); toISO(d) <= stop && n < 200; d = addDays(d, 7 * every)) n++;
    return n;
  }, [every, date, until, noEnd]);

  const valid = !!name.trim() && !!programId && !!date && end > start && (!every || noEnd || until >= date);
  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "workshops"), {
        name: name.trim(), kind, programId, groupIds, startDate: date, endDate: every ? (noEnd ? OPEN_END : until) : date,
        slots: [{ id: Math.random().toString(36).slice(2, 9), day: dayOf(date), start, end, ...(locationId ? { locationId } : {}), ...(every > 1 ? { every, anchorDate: date } : {}) }],
        staffIds, participantIds: [], notes: "", status: "active",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: userId || null,
      });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Dialog title="אירוע חדש" subtitle="ישיבת צוות, סדנה או כל פעילות אחרת, חד-פעמית או חוזרת" onClose={onClose} wide
      footer={<>
        <button onClick={save} disabled={saving || !valid} className={btnPrimary}>{every ? (noEnd ? "צור אירוע חוזר" : `צור ${occurrences} מפגשים`) : "צור אירוע"}</button>
        <button onClick={onClose} className={btnGhost}>ביטול</button>
        <button onClick={onExisting} className="mr-auto text-sm font-semibold text-[var(--accent-text)] underline">מפגש נוסף בסדנה קיימת</button>
      </>}>
      <div>
        <label className={labelCls}>שם האירוע</label>
        <input autoFocus className={fieldCls} value={name} placeholder={staffOnly ? "ישיבת צוות שבועית, הדרכת עו״סים…" : "שם הפעילות"} onChange={e => setName(e.target.value)} />
      </div>

      <div>
        <label className={labelCls}>סוג</label>
        <div className="flex flex-wrap gap-1.5">
          {pickable.map(t => {
            const on = t.id === kind, c = pastel(t.hue);
            return <button key={t.id} type="button" onClick={() => setKind(t.id)} aria-pressed={on}
              className={`px-2.5 py-1 rounded-full text-[13px] font-medium border border-s-[3px] ${on ? "font-bold" : "opacity-70 hover:opacity-100"}`}
              style={{ backgroundColor: c.fill, color: c.ink, borderColor: on ? c.bar : c.soft, borderInlineStartColor: c.bar }}>{t.label}{t.audience === "staff" ? " · צוות" : ""}</button>;
          })}
        </div>
        {staffOnly && <p className="text-xs text-[var(--foreground)]/55 mt-1.5">אירוע לצוות בלבד: המשובצים הם הנוכחים, והוא לא יופיע בלוז שנשלח למשתתפים.</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>תוכנית</label>
          <select className={fieldCls} value={programId} onChange={e => { setProgramId(e.target.value); setGroupIds([]); }}>
            {refs.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>מרחב</label>
          <select className={fieldCls} value={locationId} onChange={e => setLocationId(e.target.value)}>
            <option value="">ללא מרחב</option>
            {refs.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>

      {progGroups.length > 0 && (
        <div>
          <label className={labelCls}>{staffOnly ? "לצוות של" : "קבוצות"}</label>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setGroupIds([])} aria-pressed={groupIds.length === 0}
              className={`h-7 px-3 rounded-full text-[13px] font-medium ${groupIds.length === 0 ? "bg-[var(--btn)] text-[var(--btn-text)]" : "bg-[var(--btn-soft)] text-[var(--btn-soft-text)]"}`}>כל התוכנית</button>
            {progGroups.map(g => (
              <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} aria-pressed={groupIds.includes(g.id)}
                className={`h-7 px-3 rounded-full text-[13px] font-medium ${groupIds.includes(g.id) ? "bg-[var(--btn)] text-[var(--btn-text)]" : "bg-[var(--btn-soft)] text-[var(--btn-soft-text)]"}`}>{g.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1"><label className={labelCls}>תאריך (המפגש הראשון)</label><input type="date" className={fieldCls} value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><label className={labelCls}>התחלה</label><input type="time" className={fieldCls} value={start} onChange={e => setStart(e.target.value)} /></div>
        <div><label className={labelCls}>סיום</label><input type="time" className={fieldCls} value={end} onChange={e => setEnd(e.target.value)} /></div>
      </div>
      {date && <p className="text-xs text-[var(--foreground)]/55 -mt-3">יום {DAY_FULL[dayOf(date)]}{end <= start ? " · שעת הסיום מוקדמת מההתחלה" : ""}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>חזרה</label>
          <select className={fieldCls} value={every} onChange={e => setEvery(Number(e.target.value))}>
            {REPEATS.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
          </select>
        </div>
        {every > 0 && (
          <div>
            <label className={labelCls}>עד תאריך</label>
            <input type="date" className={fieldCls} value={until} min={date} disabled={noEnd} onChange={e => setUntil(e.target.value)} />
            <label className="flex items-center gap-1.5 mt-1.5 text-xs text-[var(--foreground)]/65 cursor-pointer"><input type="checkbox" checked={noEnd} onChange={e => setNoEnd(e.target.checked)} />ללא תאריך סיום</label>
          </div>
        )}
      </div>
      {every > 0 && <p className="text-xs text-[var(--foreground)]/55 -mt-3">{noEnd ? `ללא סיום (הצגה מקדימה: ${occurrences} מפגשים ב-6 החודשים הקרובים)` : `${occurrences} מפגשים`}, בכל {every === 1 ? "שבוע" : `${every} שבועות`} ביום {DAY_FULL[dayOf(date)]}. ימים סגורים ביומן מדולגים.</p>}

      <StaffPicker label={staffOnly ? "נוכחים" : "מעבירים"} staff={refs.staff} selected={staffIds} onChange={setStaffIds} programId={programId} groupIds={groupIds} />
    </Dialog>
  );
}
