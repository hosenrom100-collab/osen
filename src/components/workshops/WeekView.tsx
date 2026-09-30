"use client";

import { useEffect, useState } from "react";
import { DAY_SHORT, Session } from "@/lib/workshops/types";
import { dayOf, shortDate } from "@/lib/workshops/dates";
import { Plus } from "lucide-react";
import { hueStyle } from "@/lib/workshops/colors";
import { DayLanes, laneByGroup, laneStable, timeRows } from "@/lib/workshops/lanes";

export interface Row { id: string; label: string; match: (s: Session) => boolean; closedReason: (date: string) => string | undefined }

export type Mode = "program" | "staff" | "space";

export interface Common {
  sessions: Session[];
  warnings: Map<string, string[]>;
  nameOf: (id: string) => string;
  roomOf: (id?: string) => string | undefined;
  groupsOf: (ids: string[]) => string;
  hueOf: (s: Session) => number;   // colour of a session, by the viewer's "colour by" choice
  typeLabel: (s: Session) => string | undefined; // name of the type when it is not a plain workshop
  dim: (s: Session) => boolean;    // faded while another legend item is highlighted
  countOf: (s: Session) => number | undefined; // headcount of a session, when known
  showGroups?: boolean; // show group names on sessions even in program mode
  onOpen: (s: Session) => void;
}

const sameSet = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();
/** What changed about a session, in words — shown as a tooltip on one small mark instead of a coloured badge. */
function changeNote(s: Session): string {
  if (s.kind === "moved-away") return `הוזז ל-${shortDate(s.change!.newDate!)}`;
  if (s.kind === "moved-in") return `הוזז מ-${shortDate(s.origDate!)}`;
  if (s.kind === "extra") return "מפגש נוסף";
  const parts: string[] = [];
  if (s.change?.staffIds && !sameSet(s.staffIds, s.base.staffIds)) parts.push("מחליף");
  if (s.change?.newStart || s.change?.newEnd) parts.push("שעה שונתה");
  if (s.change?.locationId !== undefined) parts.push("מרחב שונה");
  return parts.join(", ");
}

/** A session card. Its height follows its content (the grid row grows), so nothing is ever cut off. */
function Card({ s, mode, c, groups }: { s: Session; mode: Mode; c: Common; groups?: boolean }) {
  const dead = s.kind === "cancelled" || s.kind === "moved-away";
  const t = hueStyle(c.hueOf(s));
  const warn = c.warnings.get(s.id);
  const note = changeNote(s);
  const room = c.roomOf(s.locationId);
  const staff = mode !== "staff" && !s.fixedBlock ? s.staffIds.map(c.nameOf).join(", ") : "";
  const grp = groups || mode !== "program" || c.showGroups ? c.groupsOf(s.groupIds) : "";
  const meta = [staff, mode !== "space" ? room : "", grp].filter(Boolean).join(" · ");
  const count = dead ? undefined : c.countOf(s);
  const special = dead ? undefined : c.typeLabel(s);          // events, therapy… stand out from plain workshops
  const oneOff = s.kind === "extra" || s.kind === "moved-in";

  return (
    <button onClick={() => c.onOpen(s)}
      title={[`${s.start}–${s.end} ${s.workshopName}`, meta, count ? `${count} משתתפים` : "", note, s.note, warn?.join(" | ")].filter(Boolean).join("\n")}
      style={dead ? undefined : { backgroundColor: t.fill, color: t.ink, borderColor: oneOff ? t.bar : undefined, borderInlineStartColor: t.bar, boxShadow: special ? `inset 0 0 0 1.5px ${t.bar}` : undefined }}
      className={`block w-full h-full text-start rounded-md px-2.5 py-1.5 border-s-[3px] transition-opacity hover:brightness-[0.97] ${c.dim(s) ? "opacity-30" : ""} ${dead ? "border border-dashed border-[var(--border)] text-[var(--foreground)]/45" : "border-transparent"} ${oneOff && !dead ? "border border-dashed" : ""}`}>
      <span className="flex items-center gap-1.5 text-xs font-medium tabular-nums opacity-80">
        <span>{s.start}–{s.end}</span>
        {s.kind === "cancelled" && <span className="font-bold text-[#b42318] opacity-100">בוטל</span>}
        {special && <span className="px-1.5 rounded font-bold opacity-100 bg-white/70 text-[11px]" style={{ color: t.ink }}>{special}</span>}
        {oneOff && !dead && <span className="px-1.5 rounded font-bold opacity-100 bg-[#fff0c2] text-[#8a5a00] text-[11px]">{s.kind === "extra" ? "חד-פעמי" : "הוזז"}</span>}
        <span className="mr-auto flex items-center gap-1.5">
          {count ? <span className="px-1.5 rounded bg-black/[0.06] font-semibold" title={`${count} משתתפים`}>{count}</span> : null}
          {warn && !dead && <span className="w-2 h-2 rounded-full bg-[#d92d20]" title={warn.join("\n")} />}
          {note && !dead && <span className="text-[10px]" title={note}>◆</span>}
          {s.change && !s.change.published && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="טרם פורסם לצוות" />}
        </span>
      </span>
      <span className={`block text-[15px] font-bold leading-snug mt-0.5 line-clamp-2 ${s.kind === "cancelled" ? "line-through" : ""}`}>{s.workshopName}</span>
      {meta && !dead && <span className="block text-xs leading-snug mt-0.5 line-clamp-2 text-[var(--foreground)]/65">{meta}</span>}
      {s.note && !dead && <span className="block text-xs leading-snug mt-0.5 line-clamp-2 text-[var(--foreground)]/75">{s.note}</span>}
    </button>
  );
}

/** Fixed daily entries (lunch, break, transport): a quiet band, not a card. */
function BandCard({ s, c, groups }: { s: Session; c: Common; groups?: boolean }) {
  const g = groups || c.showGroups || s.groupIds.length ? c.groupsOf(s.groupIds) : "";
  return (
    <button onClick={() => c.onOpen(s)} title={`${s.start}–${s.end} ${s.workshopName}${g ? ` · ${g}` : ""}`}
      className={`block w-full h-full text-start rounded-md px-2.5 py-1 bg-[var(--foreground)]/[0.05] text-[var(--foreground)]/60 text-xs ${c.dim(s) ? "opacity-30" : ""}`}>
      <span className="font-medium tabular-nums">{s.start}–{s.end}</span>{" "}
      <span className="font-semibold line-clamp-2">{s.workshopName}{g ? ` · ${g}` : ""}</span>
    </button>
  );
}

function SessionCard({ s, mode, c, groups }: { s: Session; mode: Mode; c: Common; groups?: boolean }) {
  return s.band ? <BandCard s={s} c={c} groups={groups} /> : <Card s={s} mode={mode} c={c} groups={groups} />;
}

function useNowMinutes() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => { const d = new Date(); setNow(d.getHours() * 60 + d.getMinutes()); };
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export interface Column {
  id: string;
  header: React.ReactNode;
  sub?: string;                       // closure / absence note under the header
  sessions: Session[];
  today?: boolean;
  laneMode: "groups" | "stable";
  groupIds?: string[];                // lane order when laneMode is "groups"
  showGroups?: boolean;               // name the group on each card (when lanes do not already)
  onAdd?: () => void;
}

/**
 * One timetable for every column. The rows are the distinct start/end times of everything on screen, so a given
 * time sits on the same horizontal line in every column, rows grow to fit their content, and stretches with no
 * activity collapse. Parallel sessions sit in lanes that stay the same from day to day.
 */
export function TimeGrid({ columns, mode, groupName, laneMin, ...c }: Common & {
  columns: Column[]; mode: Mode; groupName: (id: string) => string; laneMin: number;
}) {
  const now = useNowMinutes();
  const all = columns.flatMap(col => col.sessions);
  const { times, covered, rowOf } = timeRows(all);
  const pref = new Map<string, number>(); // workshop → lane, shared by all days so it stays on one side
  const laid: DayLanes[] = columns.map(col =>
    col.laneMode === "groups" && col.groupIds?.length ? laneByGroup(col.sessions, col.groupIds, groupName) : laneStable(col.sessions, pref));
  const hasLabels = laid.some(l => l.laneLabels);
  const HDR = hasLabels ? 2 : 1;

  // Track positions: column 1 = hour labels, then `lanes` tracks per day.
  const starts: number[] = [];
  let cursor = 2;
  laid.forEach(l => { starts.push(cursor); cursor += l.lanes; });
  const cols = `3.25rem ${laid.map(l => `repeat(${l.lanes}, minmax(${l.placed.length ? laneMin : 4.5}rem, 1fr))`).join(" ")}`;
  const rows = [
    "auto", ...(hasLabels ? ["auto"] : []),
    ...(times.length < 2 ? ["minmax(96px, auto)"] : times.slice(0, -1).map((t, i) => {
      const dur = times[i + 1] - t;
      return covered[i] ? `minmax(${Math.max(Math.round(dur * 1.1), 44)}px, auto)` : "18px";
    })),
  ].join(" ");

  const nowRow = now === null ? -1 : times.findIndex((t, i) => i < times.length - 1 && now >= t && now < times[i + 1]);

  return (
    <div className="hidden md:block overflow-x-auto border-y border-[var(--border)]">
      <div className="grid min-w-max lg:min-w-0 relative" style={{ gridTemplateColumns: cols, gridTemplateRows: rows }}>
        {/* Hour lines: whole hours a little stronger than the in-between breakpoints. */}
        {times.slice(0, -1).map((t, i) => (
          <div key={`l${t}`} className={`pointer-events-none border-t ${t % 60 === 0 ? "border-[var(--border)]" : "border-[var(--border-subtle)]"}`}
            style={{ gridRow: HDR + 1 + i, gridColumn: "1 / -1" }} />
        ))}
        {/* Hour labels. */}
        {times.slice(0, -1).map((t, i) => covered[i] && (
          <div key={`t${t}`} className="relative text-[11px] font-medium tabular-nums text-[var(--foreground)]/55 text-center pt-0.5"
            style={{ gridRow: HDR + 1 + i, gridColumn: 1 }}>{String(Math.floor(t / 60)).padStart(2, "0")}:{String(t % 60).padStart(2, "0")}</div>
        ))}

        {columns.map((col, k) => {
          const l = laid[k];
          const c1 = starts[k];
          return (
            <div key={col.id} className="contents">
              {/* Day header, lane labels, separator, empty-cell add button. */}
              <div className={`px-2 py-2 text-sm font-bold border-b border-[var(--border)] ${col.today ? "border-b-2 !border-b-[var(--accent)]" : ""}`}
                style={{ gridRow: 1, gridColumn: `${c1} / span ${l.lanes}` }}>
                {col.header}
                {col.sub && <div className="text-xs font-normal text-[var(--foreground)]/60">{col.sub}</div>}
              </div>
              {l.laneLabels && l.laneLabels.map((name, i) => (
                <div key={i} className="px-2 pb-1 text-xs font-semibold text-[var(--foreground)]/55 truncate border-b border-[var(--border)]"
                  style={{ gridRow: 2, gridColumn: c1 + i }}>{name}</div>
              ))}
              <div className="pointer-events-none border-s border-[var(--border)]" style={{ gridRow: `${HDR + 1} / -1`, gridColumn: c1 }} />
              {col.onAdd && (
                <button onClick={col.onAdd} aria-label="הוסף מפגש חד-פעמי" title="הוסף מפגש חד-פעמי"
                  className="group flex items-end justify-center pb-1 text-xs font-semibold text-transparent hover:text-[var(--foreground)]/50 hover:bg-[var(--foreground)]/[0.025] focus-visible:text-[var(--foreground)]/60"
                  style={{ gridRow: `${HDR + 1} / -1`, gridColumn: `${c1} / span ${l.lanes}` }}>
                  <span className="flex items-center gap-1"><Plus className="w-3 h-3" />הוסף</span>
                </button>
              )}
              {l.placed.map(({ s, lane, span }) => (
                <div key={s.id} className="relative z-[1] min-w-0 p-0.5"
                  style={{ gridRow: `${HDR + 1 + rowOf(s.start)} / ${HDR + 1 + rowOf(s.end)}`, gridColumn: `${c1 + lane} / span ${span}` }}>
                  <SessionCard s={s} mode={mode} c={c} groups={col.showGroups} />
                </div>
              ))}
              {col.today && nowRow >= 0 && now !== null && (
                <div className="relative z-10 pointer-events-none" style={{ gridRow: HDR + 1 + nowRow, gridColumn: `${c1} / span ${l.lanes}` }}>
                  <div className="absolute inset-x-0 flex items-center" style={{ top: `${((now - times[nowRow]) / (times[nowRow + 1] - times[nowRow])) * 100}%` }}>
                    <span className="w-2 h-2 -mr-1 rounded-full bg-[#d92d20]" /><span className="flex-1 border-t-[1.5px] border-[#d92d20]" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {times.length < 2 && <div className="text-sm text-[var(--foreground)]/50 px-3 py-6" style={{ gridRow: HDR + 1, gridColumn: "2 / -1" }}>אין מפגשים בתקופה זו.</div>}
      </div>
    </div>
  );
}

/** Phones: one day at a time, everything in chronological order. */
export function DayAgenda({ dates, days, mode, today, selected, setSelected, globalClosure, canEdit, onAdd, ...c }: Common & {
  dates: string[]; days: number[]; mode: Mode; today: string; rows?: unknown;
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
  const list = c.sessions.filter(s => s.date === selected).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
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
      <ul className="px-3 py-2 space-y-1.5">
        {list.map(s => (
          <li key={s.id} className="flex gap-2 items-stretch">
            <span dir="ltr" className="w-11 shrink-0 pt-2 text-center text-[13px] font-bold tabular-nums leading-tight">
              {s.start}<span className="block text-[11px] font-normal text-[var(--foreground)]/50">{s.end}</span>
            </span>
            <div className="flex-1 min-w-0"><SessionCard s={s} mode={mode} c={c} groups /></div>
          </li>
        ))}
      </ul>
      {list.length === 0 && !closure && <p className="px-4 py-10 text-sm text-center text-[var(--foreground)]/50">אין מפגשים ביום זה.</p>}
      {canEdit && (
        <div className="px-4 py-3">
          <button onClick={() => onAdd(selected)} className="flex items-center gap-1.5 text-sm font-bold text-[var(--accent)]"><Plus className="w-4 h-4" /> הוסף מפגש חד-פעמי ליום זה</button>
        </div>
      )}
    </div>
  );
}

