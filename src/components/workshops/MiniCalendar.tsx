"use client";

import { useState } from "react";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DAY_SHORT } from "@/lib/workshops/types";
import { toISO, weekStartOf } from "@/lib/workshops/dates";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

/**
 * Month helper for picking a day — or, with `range="week"`, the whole week of the day you click.
 * Weeks start on Sunday; the picked day/week is filled, today is outlined.
 */
export function MiniCalendar({ value, range, onPick }: { value: string; range: "day" | "week"; onPick: (iso: string) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(parseISO(value)));
  const today = toISO(new Date());
  const from = weekStartOf(month);
  const days = eachDayOfInterval({ start: from, end: addDays(weekStartOf(endOfMonth(month)), 6) }).map(toISO);
  const pickedWeek = toISO(weekStartOf(parseISO(value)));
  const inPick = (iso: string) => (range === "day" ? iso === value : toISO(weekStartOf(parseISO(iso))) === pickedWeek);

  return (
    <div className="w-[17.5rem] p-3 bg-white rounded-xl border border-[var(--border)] shadow-[0_8px_28px_rgba(0,0,0,0.14)]" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMonth(addMonths(month, -1))} aria-label="חודש קודם" className="p-1 rounded-md hover:bg-black/5"><ChevronRight className="w-4 h-4" /></button>
        <span className="text-sm font-bold">{MONTHS[month.getMonth()]} {format(month, "yyyy")}</span>
        <button onClick={() => setMonth(addMonths(month, 1))} aria-label="חודש הבא" className="p-1 rounded-md hover:bg-black/5"><ChevronLeft className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-[var(--foreground)]/50 mb-1">
        {DAY_SHORT.map(d => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map(iso => {
          const d = parseISO(iso);
          const out = d.getMonth() !== month.getMonth();
          const on = inPick(iso);
          const col = d.getDay();
          // In week mode the picked week reads as one band: rounded only at its two ends.
          const cap = range === "week" && on ? (col === 0 ? "rounded-s-md" : col === 6 ? "rounded-e-md" : "") : "rounded-md";
          return (
            <button key={iso} onClick={() => onPick(iso)} aria-pressed={on} aria-label={format(d, "d.M.yyyy")}
              className={`h-8 text-sm tabular-nums ${cap} ${on ? "bg-[var(--btn)] text-white font-bold" : out ? "text-[var(--foreground)]/30 hover:bg-black/5" : "hover:bg-black/5"} ${iso === today && !on ? "ring-1 ring-inset ring-[var(--accent)] text-[var(--accent)] font-bold" : ""}`}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <button onClick={() => { onPick(today); setMonth(startOfMonth(new Date())); }} className="mt-2 w-full text-xs font-bold text-[var(--accent)] py-1 rounded-md hover:bg-black/5">היום</button>
    </div>
  );
}
