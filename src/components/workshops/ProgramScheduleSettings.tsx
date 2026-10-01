"use client";

import { useState } from "react";
import { db } from "@/lib/firebase/config";
import { deleteField, doc, updateDoc } from "firebase/firestore";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "./Dialog";
import { ActivityKind, DAY_SHORT, DailyBlock, Group, Program } from "@/lib/workshops/types";
import { ActivityType } from "@/lib/workshops/activityTypes";
import { PROGRAM_HUES, groupHue, programHue } from "@/lib/workshops/colors";

const newId = () => Math.random().toString(36).slice(2, 9);
const validUrl = (u: string) => !u || /^https?:\/\/\S+$/.test(u);

/** Schedule settings of one program: colour, daily meals/breaks (per group if needed) and the community group links. */
export function ProgramScheduleSettings({ program, groups, locations, types, onClose, onSaved }: {
  program: Program; groups: Group[]; locations: { id: string; name: string }[]; types: ActivityType[]; onClose: () => void; onSaved: () => void;
}) {
  const blockTypes = types.filter(t => t.band && !t.archived);
  const [laneMode, setLaneMode] = useState<"groups" | "auto">(program.laneMode === "auto" ? "auto" : "groups");
  const [hue, setHue] = useState(programHue(program));
  const [blocks, setBlocks] = useState<DailyBlock[]>((program.dailyBlocks || []).map(b => ({ ...b })));
  const [staffUrl, setStaffUrl] = useState(program.staffGroupUrl || "");
  const [partUrl, setPartUrl] = useState(program.participantsGroupUrl || "");
  const [saving, setSaving] = useState(false);
  const progGroups = groups.filter(g => g.programId === program.id);
  // Each group's colour: its own, or (undefined) a shade of the program's colour.
  const [groupColors, setGroupColors] = useState<Record<string, number | undefined>>(() => Object.fromEntries(progGroups.map(g => [g.id, g.color])));
  const autoHue = (id: string) => groupHue(id, progGroups.map(g => ({ ...g, color: undefined })), [{ ...program, color: hue }])!;

  const patch = (id: string, p: Partial<DailyBlock>) => setBlocks(bs => bs.map(b => (b.id === id ? { ...b, ...p } : b)));
  const toggle = (list: number[] | string[] | undefined, v: number | string) => {
    const a = (list || []) as (number | string)[];
    return (a.includes(v) ? a.filter(x => x !== v) : [...a, v]) as number[] & string[];
  };
  // The preset's own type when it still exists (even renamed); else a quiet type with a similar name; never just "the first one".
  const add = (kind: ActivityKind, label: string, start: string, end: string) => {
    const like = (t: ActivityType) => label.includes(t.label) || t.label.includes(label.split(" ")[0]);
    const pick = blockTypes.find(t => t.id === kind) || blockTypes.find(like) || types.find(t => t.id === kind) || blockTypes[0];
    setBlocks(bs => [...bs, { id: newId(), kind: pick?.id || kind, label, start, end }]);
  };

  const invalid = blocks.some(b => !b.label.trim() || b.end <= b.start) || !validUrl(staffUrl) || !validUrl(partUrl);
  const save = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "programs", program.id), {
        scheduleColor: hue, laneMode,
        dailyBlocks: blocks.map(b => ({ ...b, label: b.label.trim(), days: b.days || [], groupIds: b.groupIds || [], locationId: b.locationId || "" })),
        staffGroupUrl: staffUrl.trim(), participantsGroupUrl: partUrl.trim(),
      });
      await Promise.all(progGroups.filter(g => groupColors[g.id] !== g.color).map(g =>
        updateDoc(doc(db, "groups", g.id), { scheduleColor: groupColors[g.id] ?? deleteField() })));
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Dialog title={`הגדרות לוז · ${program.name}`} onClose={onClose} wide
      footer={<>
        <button onClick={save} disabled={saving || invalid} className={btnPrimary}>שמור</button>
        <button onClick={onClose} className={btnGhost}>ביטול</button>
      </>}>
      <div>
        <label className={labelCls}>צבע התוכנית ביומן</label>
        <div className="flex gap-2">
          {PROGRAM_HUES.map(h => (
            <button key={h} onClick={() => setHue(h)} aria-label={`גוון ${h}`} aria-pressed={hue === h}
              className={`w-7 h-7 rounded-md border-2 ${hue === h ? "border-[var(--foreground)]" : "border-transparent"}`}
              style={{ backgroundColor: `hsl(${h} 55% 55%)` }} />
          ))}
        </div>
      </div>

      {progGroups.length > 1 && (
        <div>
          <label className={labelCls}>תצוגת הקבוצות ביומן</label>
          <select className={fieldCls} value={laneMode} onChange={e => setLaneMode(e.target.value as typeof laneMode)}>
            <option value="groups">עמודה קבועה לכל קבוצה (ברירת מחדל)</option>
            <option value="auto">עמודות לקבוצות רק בשבוע שבו הן פועלות באותן שעות</option>
          </select>
        </div>
      )}

      {progGroups.length > 1 && (
        <div>
          <label className={labelCls}>צבע לכל קבוצה</label>
          <ul className="space-y-2">
            {progGroups.map(g => {
              const own = groupColors[g.id];
              return (
                <li key={g.id} className="flex items-center gap-2 flex-wrap">
                  <span className="w-24 text-sm font-semibold truncate">{g.name}</span>
                  <button onClick={() => setGroupColors(c => ({ ...c, [g.id]: undefined }))} aria-pressed={own === undefined}
                    className={`h-7 px-2 rounded-md border-2 text-xs font-semibold flex items-center gap-1 ${own === undefined ? "border-[var(--foreground)]" : "border-[var(--border)]"}`}>
                    <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: `hsl(${autoHue(g.id)} 55% 55%)` }} />אוטומטי
                  </button>
                  {PROGRAM_HUES.map(h => (
                    <button key={h} onClick={() => setGroupColors(c => ({ ...c, [g.id]: h }))} aria-label={`גוון ${h}`} aria-pressed={own === h}
                      className={`w-6 h-6 rounded-md border-2 ${own === h ? "border-[var(--foreground)]" : "border-transparent"}`}
                      style={{ backgroundColor: `hsl(${h} 55% 55%)` }} />
                  ))}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-[var(--foreground)]/50 mt-1.5">אוטומטי: גוון של צבע התוכנית, שונה לכל קבוצה.</p>
        </div>
      )}

      <div>
        <label className={labelCls}>ארוחות, הפסקות והסעות קבועות</label>
        <p className="text-xs text-[var(--foreground)]/50 mb-2">מופיעות כל יום פעילות של התוכנית. אפשר להגביל לקבוצות מסוימות או לימים מסוימים.</p>
        <ul className="space-y-3">
          {blocks.map(b => (
            <li key={b.id} className="border border-[var(--border)] rounded-md p-2.5 space-y-2">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input className={fieldCls} value={b.label} placeholder="שם, למשל ארוחת צהריים" onChange={e => patch(b.id, { label: e.target.value })} />
                <button onClick={() => setBlocks(bs => bs.filter(x => x.id !== b.id))} aria-label="הסר" className="p-2 text-rose-500"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className={`${fieldCls} col-span-2`} value={b.kind} onChange={e => patch(b.id, { kind: e.target.value as ActivityKind })}>
                  {blockTypes.concat(types.filter(t => t.band && t.archived && t.id === b.kind)).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <select className={`${fieldCls} col-span-2`} value={b.locationId || ""} onChange={e => patch(b.id, { locationId: e.target.value })} aria-label="מרחב">
                  <option value="">ללא מרחב</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <input type="time" className={fieldCls} value={b.start} onChange={e => patch(b.id, { start: e.target.value })} />
                <input type="time" className={fieldCls} value={b.end} onChange={e => patch(b.id, { end: e.target.value })} />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-[var(--foreground)]/50 ml-1">ימים:</span>
                {program.activeDays.map(d => {
                  const on = !b.days?.length || b.days.includes(d);
                  return <button key={d} onClick={() => patch(b.id, { days: b.days?.length ? toggle(b.days, d) : program.activeDays.filter(x => x !== d) })}
                    className={`px-2 py-0.5 rounded text-xs border ${on ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--foreground)]/60"}`}>{DAY_SHORT[d]}</button>;
                })}
              </div>
              {progGroups.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs text-[var(--foreground)]/50 ml-1">קבוצות:</span>
                  <button onClick={() => patch(b.id, { groupIds: [] })}
                    className={`px-2 py-0.5 rounded text-xs border ${!b.groupIds?.length ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--foreground)]/60"}`}>כולן</button>
                  {progGroups.map(g => (
                    <button key={g.id} onClick={() => patch(b.id, { groupIds: toggle(b.groupIds, g.id) })}
                      className={`px-2 py-0.5 rounded text-xs border ${b.groupIds?.includes(g.id) ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--foreground)]/60"}`}>{g.name}</button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 mt-2">
          <button onClick={() => add("meal", "ארוחת בוקר", "08:30", "09:00")} className={`${btnGhost} flex items-center gap-1 !py-1 !text-xs`}><Plus className="w-3.5 h-3.5" />ארוחת בוקר</button>
          <button onClick={() => add("meal", "ארוחת צהריים", "12:30", "13:15")} className={`${btnGhost} flex items-center gap-1 !py-1 !text-xs`}><Plus className="w-3.5 h-3.5" />ארוחת צהריים</button>
          <button onClick={() => add("break", "הפסקה", "10:30", "10:45")} className={`${btnGhost} flex items-center gap-1 !py-1 !text-xs`}><Plus className="w-3.5 h-3.5" />הפסקה</button>
          <button onClick={() => add("transport", "הסעה", "15:30", "16:00")} className={`${btnGhost} flex items-center gap-1 !py-1 !text-xs`}><Plus className="w-3.5 h-3.5" />הסעה</button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className={labelCls}>קישור לקבוצת הצוות של התוכנית</label>
          <input dir="ltr" className={`${fieldCls} text-left`} value={staffUrl} placeholder="https://chat.whatsapp.com/…" onChange={e => setStaffUrl(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>קישור לקבוצת המשתתפים של התוכנית</label>
          <input dir="ltr" className={`${fieldCls} text-left`} value={partUrl} placeholder="https://chat.whatsapp.com/…" onChange={e => setPartUrl(e.target.value)} />
        </div>
        {(!validUrl(staffUrl) || !validUrl(partUrl)) && <p className="text-xs text-rose-500">הקישור חייב להתחיל ב-https://</p>}
      </div>
    </Dialog>
  );
}
