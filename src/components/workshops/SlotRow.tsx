"use client";

import { Trash2 } from "lucide-react";
import { fieldCls } from "./Dialog";
import { DAY_FULL, Slot } from "@/lib/workshops/types";
import { anchorFallback } from "@/lib/workshops/dates";

const EVERY: [number, string][] = [[1, "כל שבוע"], [2, "כל שבועיים"], [3, "כל 3 שבועות"], [4, "כל 4 שבועות"]];

/** One weekly meeting (day, hours, room, rhythm). The only editor of a slot, used by the workshop page and by the calendar's series dialog. */
export function SlotRow({ slot: s, days, locations, workshopStart, onChange, onRemove, children }: {
  slot: Slot; days: number[]; locations: { id: string; name: string }[]; workshopStart: string;
  onChange: (patch: Partial<Slot>) => void; onRemove: () => void; children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="יום" className={`${fieldCls} !w-28`} value={s.day} onChange={e => onChange({ day: Number(e.target.value) })}>
        {days.map(d => <option key={d} value={d}>יום {DAY_FULL[d]}</option>)}
        {!days.includes(s.day) && <option value={s.day}>יום {DAY_FULL[s.day]} (לא פעיל)</option>}
      </select>
      <input aria-label="התחלה" type="time" step={900} className={`${fieldCls} !w-28`} value={s.start} onChange={e => onChange({ start: e.target.value })} />
      <span className="text-[var(--foreground)]/40">–</span>
      <input aria-label="סיום" type="time" step={900} className={`${fieldCls} !w-28`} value={s.end} onChange={e => onChange({ end: e.target.value })} />
      <select aria-label="מרחב" className={`${fieldCls} !w-36`} value={s.locationId || ""} onChange={e => onChange({ locationId: e.target.value || undefined })}>
        <option value="">ללא מרחב</option>
        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <select aria-label="תדירות" className={`${fieldCls} !w-32`} value={s.every || 1}
        onChange={e => { const n = Number(e.target.value); onChange({ every: n > 1 ? n : undefined, anchorDate: n > 1 ? s.anchorDate || anchorFallback(workshopStart) : undefined }); }}>
        {EVERY.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
      </select>
      {(s.every || 1) > 1 && (
        <label className="w-full flex items-center gap-2 text-xs text-[var(--foreground)]/60">השבוע הראשון שבו זה מתקיים
          <input type="date" className={`${fieldCls} !w-auto`} value={s.anchorDate || anchorFallback(workshopStart)} onChange={e => onChange({ anchorDate: e.target.value })} />
        </label>
      )}
      {s.end <= s.start && <span className="text-xs text-rose-500">שעת הסיום מוקדמת מההתחלה</span>}
      {children}
      <button onClick={onRemove} aria-label="הסר מפגש" className="p-2 text-[var(--foreground)]/50 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}
