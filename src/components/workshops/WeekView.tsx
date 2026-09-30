"use client";

import { useState } from "react";
import { DAY_FULL, DAY_SHORT, Session } from "@/lib/workshops/types";
import { dayOf, shortDate } from "@/lib/workshops/dates";
import { Plus } from "lucide-react";
import { workshopColor } from "@/lib/workshops/colors";

export interface Row { id: string; label: string; match: (s: Session) => boolean; closedReason: (date: string) => string | undefined }

interface Common {
  sessions: Session[];
  warnings: Map<string, string[]>;
  nameOf: (id: string) => string;
  roomOf: (id?: string) => string | undefined;
  groupsOf: (ids: string[]) => string;
  showGroups?: boolean; // show group names on sessions even in program mode
  onOpen: (s: Session) => void;
}

const sameSet = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();

function SessionButton({ s, mode, c }: { s: Session; mode: "program" | "staff" | "space"; c: Common }) {
  const dead = s.kind === "cancelled" || s.kind === "moved-away";
  const color = workshopColor(s.workshopId);
  const warn = c.warnings.get(s.id);
  const substitute = !dead && s.change?.staffIds && !sameSet(s.staffIds, s.base.staffIds);
  const room = c.roomOf(s.locationId);
  const meta = [
    mode !== "staff" ? s.staffIds.map(c.nameOf).join(", ") : "",
    mode !== "space" ? room : "",
    mode !== "program" || c.showGroups ? c.groupsOf(s.groupIds) : "",
  ].filter(Boolean).join(" · ");

  const tag =
    s.kind === "cancelled" ? { t: "בוטל", cls: "text-rose-500" } :
    s.kind === "moved-away" ? { t: `הוזז ל-${shortDate(s.change!.newDate!)}`, cls: "text-[var(--foreground)]/50" } :
    s.kind === "moved-in" ? { t: `הוזז מ-${shortDate(s.origDate!)}`, cls: "text-amber-600" } :
    s.kind === "extra" ? { t: "מפגש נוסף", cls: "text-amber-600" } :
    substitute ? { t: "מחליף", cls: "text-amber-600" } :
    s.change?.newStart || s.change?.newEnd ? { t: "שעה שונתה", cls: "text-amber-600" } :
    s.change?.locationId !== undefined ? { t: "מרחב שונה", cls: "text-amber-600" } : null;

  return (
    <button onClick={() => c.onOpen(s)}
      style={dead ? undefined : { backgroundColor: color.bg, borderColor: color.border }}
      className={`w-full text-right px-2 py-1.5 mb-1 last:mb-0 rounded-md border hover:brightness-95 ${dead ? "border-dashed border-[var(--border)] bg-transparent" : ""} ${s.kind === "moved-in" || s.kind === "extra" ? "border-dashed" : ""}`}>
      <div className={`flex items-center gap-1.5 text-xs tabular-nums ${dead ? "text-[var(--foreground)]/40" : "text-[var(--foreground)]/60"}`}>
        <span className={s.kind === "cancelled" ? "line-through" : ""}>{s.start}–{s.end}</span>
        {tag && <span className={`font-bold ${tag.cls}`}>{tag.t}</span>}
        {s.change && !s.change.published && <span title="טרם פורסם לצוות" className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-auto" />}
      </div>
      <div className={`text-sm font-bold leading-snug ${dead ? "text-[var(--foreground)]/40" : ""} ${s.kind === "cancelled" ? "line-through" : ""}`}>{s.workshopName}</div>
      {meta && !dead && <div className="text-xs text-[var(--foreground)]/60 leading-snug">{meta}</div>}
      {s.note && <div className="text-xs text-[var(--foreground)]/60 italic leading-snug">{s.note}</div>}
      {warn && !dead && <div className="text-xs text-amber-600 leading-snug">{warn[0]}{warn.length > 1 ? ` (+${warn.length - 1})` : ""}</div>}
    </button>
  );
}

export function WeekGrid({ dates, days, rows, mode, today, globalClosure, canEdit, onAdd, ...c }: Common & {
  dates: string[]; days: number[]; rows: Row[]; mode: "program" | "staff" | "space"; today: string;
  globalClosure: (date: string) => string | undefined; canEdit: boolean; onAdd: (date: string, rowId: string) => void;
}) {
  const cols = days.map(d => dates[d]);
  const template = { gridTemplateColumns: `8rem repeat(${cols.length}, minmax(9rem, 1fr))` };
  return (
    <div className="hidden md:block overflow-x-auto border-y border-[var(--border)]">
     <div className="min-w-max lg:min-w-0">
      <div className="grid border-b border-[var(--border)] text-sm font-bold bg-[var(--background)]" style={template}>
        <div className="sticky right-0 bg-[var(--background)] z-10" />
        {cols.map(date => (
          <div key={date} className={`px-2 py-2 border-r border-[var(--border)] ${date === today ? "bg-[var(--accent-soft)]" : ""}`}>
            יום {DAY_FULL[dayOf(date)]} <span className="font-normal text-[var(--foreground)]/50 tabular-nums">{shortDate(date)}</span>
            {globalClosure(date) && <div className="text-xs font-normal text-[var(--foreground)]/60">{globalClosure(date)}</div>}
          </div>
        ))}
      </div>
      {rows.map(row => (
        <div key={row.id} className="grid border-b border-[var(--border)] last:border-b-0" style={template}>
          <div className="sticky right-0 z-10 bg-[var(--background)] px-2 py-2 text-sm font-bold">{row.label}</div>
          {cols.map(date => {
            const list = c.sessions.filter(s => s.date === date && row.match(s));
            const closed = row.closedReason(date);
            return (
              <div key={date} className={`group relative border-r border-[var(--border)] p-1 min-h-16 ${date === today ? "bg-[var(--accent-soft)]" : ""} ${closed && list.length === 0 ? "bg-[var(--foreground)]/[0.04]" : ""}`}>
                {list.map(s => <SessionButton key={s.id} s={s} mode={mode} c={c} />)}
                {closed && list.length === 0 && <p className="px-1 py-1 text-xs text-[var(--foreground)]/50">{closed}</p>}
                {canEdit && mode === "program" && (
                  <button onClick={() => onAdd(date, row.id)} aria-label="הוסף מפגש חד-פעמי" title="הוסף מפגש חד-פעמי"
                    className="absolute bottom-1 left-1 p-1 rounded text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/10 opacity-0 group-hover:opacity-100 focus:opacity-100">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
     </div>
    </div>
  );
}

export function DayAgenda({ dates, days, mode, today, selected, setSelected, rows, globalClosure, canEdit, onAdd, ...c }: Common & {
  dates: string[]; days: number[]; mode: "program" | "staff" | "space"; today: string; rows: Row[];
  selected: string; setSelected: (d: string) => void; globalClosure: (date: string) => string | undefined;
  canEdit: boolean; onAdd: (date: string) => void;
}) {
  const cols = days.map(d => dates[d]);
  const [touchX, setTouchX] = useState<number | null>(null);
  // Days run right-to-left, so swiping left goes to the next day.
  const onTouchEnd = (x: number) => {
    if (touchX === null || Math.abs(x - touchX) < 60) return;
    const i = cols.indexOf(selected) + (x < touchX ? 1 : -1);
    if (i >= 0 && i < cols.length) setSelected(cols[i]);
    setTouchX(null);
  };
  const daySessions = c.sessions.filter(s => s.date === selected);
  const closure = globalClosure(selected);
  return (
    <div className="md:hidden" onTouchStart={e => setTouchX(e.touches[0].clientX)} onTouchEnd={e => onTouchEnd(e.changedTouches[0].clientX)}>
      <div className="flex border-b border-[var(--border)] overflow-x-auto">
        {cols.map(date => (
          <button key={date} onClick={() => setSelected(date)}
            className={`flex-1 min-w-14 py-2 text-center border-b-2 ${selected === date ? "border-[var(--accent)] font-bold" : "border-transparent text-[var(--foreground)]/60"}`}>
            <div className="text-sm">{DAY_SHORT[dayOf(date)]}</div>
            <div className={`text-xs tabular-nums ${date === today ? "text-[var(--accent)] font-bold" : "text-[var(--foreground)]/50"}`}>{shortDate(date)}</div>
          </button>
        ))}
      </div>
      {closure && <p className="px-4 py-3 text-sm text-[var(--foreground)]/60 bg-[var(--foreground)]/[0.04]">{closure}</p>}
      {rows.map(row => {
        const list = daySessions.filter(row.match);
        const closed = row.closedReason(selected);
        if (list.length === 0 && !closed) return null;
        return (
          <section key={row.id} className="px-2 py-2 border-b border-[var(--border)]">
            <h3 className="px-2 text-xs font-bold text-[var(--foreground)]/50 mb-1">{row.label}</h3>
            {list.map(s => <SessionButton key={s.id} s={s} mode={mode} c={c} />)}
            {closed && list.length === 0 && <p className="px-2 text-sm text-[var(--foreground)]/50">{closed}</p>}
          </section>
        );
      })}
      {daySessions.length === 0 && !closure && <p className="px-4 py-10 text-sm text-center text-[var(--foreground)]/50">אין מפגשים ביום זה.</p>}
      {canEdit && (
        <div className="px-4 py-3">
          <button onClick={() => onAdd(selected)} className="flex items-center gap-1.5 text-sm font-bold text-[var(--accent)]"><Plus className="w-4 h-4" /> הוסף מפגש חד-פעמי ליום זה</button>
        </div>
      )}
    </div>
  );
}
