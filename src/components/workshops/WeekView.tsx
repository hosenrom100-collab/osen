"use client";

import { useEffect, useState } from "react";
import { DAY_FULL, DAY_SHORT, Session, isBand } from "@/lib/workshops/types";
import { dayOf, shortDate } from "@/lib/workshops/dates";
import { AlertTriangle, Plus, Users } from "lucide-react";
import { hueStyle } from "@/lib/workshops/colors";

export interface Row { id: string; label: string; match: (s: Session) => boolean; closedReason: (date: string) => string | undefined }

type Mode = "program" | "staff" | "space";

interface Common {
  sessions: Session[];
  warnings: Map<string, string[]>;
  nameOf: (id: string) => string;
  roomOf: (id?: string) => string | undefined;
  groupsOf: (ids: string[]) => string;
  hueOf: (programId: string) => number;
  countOf: (s: Session) => number | undefined; // headcount of a session, when known
  showGroups?: boolean; // show group names on sessions even in program mode
  onOpen: (s: Session) => void;
}

const sameSet = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();

// Status is told by shape and a small tag, not by yet another colour.
const TAG = {
  cancelled: "bg-[#fde2e2] text-[#b42318]",
  moved: "bg-[#fff0c2] text-[#8a5a00]",
  change: "bg-[#dbeafe] text-[#1e4fa3]",
  quiet: "bg-black/5 text-[var(--foreground)]/60",
};

// Below these heights (px) the card flows on fewer lines so short sessions still show everything.
const COMPACT_PX = 92, DENSE_PX = 56;

function SessionButton({ s, mode, c, h }: { s: Session; mode: Mode; c: Common; h?: number }) {
  const dense = h !== undefined && h < DENSE_PX;
  const compact = h !== undefined && h < COMPACT_PX;
  const dead = s.kind === "cancelled" || s.kind === "moved-away";
  const tint = hueStyle(c.hueOf(s.programId));
  const warn = c.warnings.get(s.id);
  const substitute = !dead && s.change?.staffIds && !sameSet(s.staffIds, s.base.staffIds);
  const room = c.roomOf(s.locationId);
  const staff = mode !== "staff" ? s.staffIds.map(c.nameOf).join(", ") : "";
  const groups = mode !== "program" || c.showGroups ? c.groupsOf(s.groupIds) : "";
  const count = dead ? undefined : c.countOf(s);
  const meta = [staff, mode !== "space" ? room : "", groups].filter(Boolean).join(" · ");

  const tag =
    s.kind === "cancelled" ? { t: "בוטל", cls: TAG.cancelled } :
    s.kind === "moved-away" ? { t: `הוזז ל-${shortDate(s.change!.newDate!)}`, cls: TAG.quiet } :
    s.kind === "moved-in" ? { t: `הוזז מ-${shortDate(s.origDate!)}`, cls: TAG.moved } :
    s.kind === "extra" ? { t: "מפגש נוסף", cls: TAG.moved } :
    substitute ? { t: "מחליף", cls: TAG.change } :
    s.change?.newStart || s.change?.newEnd ? { t: "שעה שונתה", cls: TAG.change } :
    s.change?.locationId !== undefined ? { t: "מרחב שונה", cls: TAG.change } : null;

  const struck = s.kind === "cancelled" ? "line-through" : "";
  const fade = dead ? "text-[var(--foreground)]/40" : "text-[var(--foreground)]";
  const time = <span className={`text-[13px] font-semibold tabular-nums ${fade} ${struck}`}>{s.start}–{s.end}</span>;
  const name = <span className={`${compact ? "text-[13px]" : "text-[14px]"} font-bold leading-snug ${fade} ${struck}`}>{s.workshopName}</span>;

  return (
    <button onClick={() => c.onOpen(s)}
      title={[`${s.start}–${s.end} ${s.workshopName}`, meta, count ? `${count} משתתפים` : "", warn?.join(" | ")].filter(Boolean).join(" · ")}
      style={dead ? undefined : { backgroundColor: tint.bg, borderColor: tint.border, borderInlineStartColor: tint.accent }}
      className={`w-full text-right ${compact ? "px-2 py-0.5" : "px-2.5 py-1.5"} mb-1 last:mb-0 rounded-md border border-s-[3px] hover:brightness-95 ${dead ? "border-dashed border-[var(--border)] bg-transparent" : ""} ${s.kind === "moved-in" || s.kind === "extra" ? "border-dashed" : ""}`}>
      <div className={dense ? "flex flex-wrap items-baseline gap-x-1.5" : "flex items-center gap-1.5"}>
        {time}
        {dense && name}
        {tag && <span className={`px-1.5 rounded text-[11px] font-bold leading-4 ${tag.cls}`}>{tag.t}</span>}
        <span className="mr-auto flex items-center gap-1.5">
          {warn && !dead && <AlertTriangle className="w-3.5 h-3.5 text-[#b42318]" aria-label="התנגשות" />}
          {s.change && !s.change.published && <span title="טרם פורסם לצוות" className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
        </span>
      </div>
      {!dense && <div className="mt-0.5">{name}</div>}
      {(meta || count) && !dead && (
        <div className={`flex items-start gap-2 text-xs leading-snug text-[var(--foreground)]/65 ${dense ? "" : "mt-0.5"}`}>
          {meta && <span className={compact ? "line-clamp-1" : "line-clamp-3"}>{meta}</span>}
          {count ? <span className="mr-auto shrink-0 flex items-center gap-0.5 tabular-nums font-semibold"><Users className="w-3 h-3" />{count}</span> : null}
        </div>
      )}
      {s.note && !dense && <div className="text-xs leading-snug mt-0.5 px-1.5 py-0.5 rounded bg-white/70 text-[var(--foreground)]/75">{s.note}</div>}
      {warn && !dead && !compact && <div className="text-xs font-bold leading-snug mt-0.5 text-[#b42318]">{warn[0]}{warn.length > 1 ? ` (+${warn.length - 1})` : ""}</div>}
    </button>
  );
}

/** Fixed daily entries (lunch, break, transport): a quiet band, not a card. */
function Band({ s, c, h, onClick }: { s: Session; c: Common; h?: number; onClick?: () => void }) {
  const groups = c.showGroups || s.groupIds.length ? c.groupsOf(s.groupIds) : "";
  return (
    <button onClick={onClick} title={`${s.start}–${s.end} ${s.workshopName}${groups ? ` · ${groups}` : ""}`}
      style={h ? { height: h } : undefined}
      className="w-full text-right px-2.5 py-1 mb-1 last:mb-0 rounded-md bg-[var(--foreground)]/[0.05] text-[var(--foreground)]/60 text-xs flex items-start gap-2 overflow-hidden">
      <span className="font-semibold tabular-nums shrink-0">{s.start}–{s.end}</span>
      <span className="font-medium">{s.workshopName}{groups ? ` · ${groups}` : ""}</span>
    </button>
  );
}

/** Splits time-sorted sessions into clusters; sessions in a cluster overlap in time (directly or through a chain). */
function clusterByTime(list: Session[]): Session[][] {
  const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const out: Session[][] = [];
  let end = "";
  for (const s of sorted) {
    if (out.length && s.start < end) { out[out.length - 1].push(s); if (s.end > end) end = s.end; }
    else { out.push([s]); end = s.end; }
  }
  return out;
}

const widest = (list: Session[]) => clusterByTime(list.filter(s => !isBand(s.activity))).reduce((m, cl) => Math.max(m, cl.length), 1);

/** Day list (phones): parallel sessions side by side, bands between them in time order. */
function Clustered({ list, mode, c }: { list: Session[]; mode: Mode; c: Common }) {
  const items: { start: string; node: React.ReactNode }[] = [
    ...list.filter(s => isBand(s.activity)).map(s => ({ start: s.start, node: <Band key={s.id} s={s} c={c} onClick={() => c.onOpen(s)} /> })),
    ...clusterByTime(list.filter(s => !isBand(s.activity))).map((cl, i) => ({
      start: cl[0].start,
      node: cl.length === 1 ? (
        <SessionButton key={cl[0].id} s={cl[0]} mode={mode} c={c} />
      ) : (
        <div key={i} className="flex gap-1 mb-1 last:mb-0 items-stretch">
          {cl.map(s => (
            <div key={s.id} className="flex-1 min-w-0 [&>button]:h-full [&>button]:mb-0"><SessionButton s={s} mode={mode} c={c} /></div>
          ))}
        </div>
      ),
    })),
  ].sort((a, b) => a.start.localeCompare(b.start));
  return <>{items.map(i => i.node)}</>;
}

const HOUR_PX = 96;
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

/** Shared vertical time scale for one row: only hours in which this row has a session are drawn, so the same time lines up across all days. */
function timeAxis(list: Session[]) {
  const hours = new Set<number>();
  for (const s of list) for (let h = Math.floor(mins(s.start) / 60); h * 60 < mins(s.end); h++) hours.add(h);
  const sorted = [...hours].sort((a, b) => a - b);
  const y = (t: number) => {
    const h = Math.floor(t / 60);
    const before = sorted.filter(x => x < h).length;
    return (before + (hours.has(h) ? (t - h * 60) / 60 : 0)) * HOUR_PX;
  };
  const gaps = sorted.filter((h, i) => i > 0 && sorted[i - 1] !== h - 1);
  return { hours: sorted, gaps, has: (t: number) => hours.has(Math.floor(t / 60)), y, height: sorted.length * HOUR_PX };
}
type Axis = ReturnType<typeof timeAxis>;

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

/** Sessions placed by clock time; bands sit behind, overlapping sessions share the width of their time window. */
function Timeline({ list, axis, mode, c, now }: { list: Session[]; axis: Axis; mode: Mode; c: Common; now: number | null }) {
  const bands = list.filter(s => isBand(s.activity));
  return (
    <>
      {axis.hours.map(h => (
        <div key={h}>
          <div className="absolute inset-x-0 border-t border-[var(--border)] pointer-events-none" style={{ top: axis.y(h * 60) }} />
          <div className="absolute inset-x-0 border-t border-dashed border-[var(--border-subtle)] pointer-events-none" style={{ top: axis.y(h * 60 + 30) }} />
        </div>
      ))}
      {axis.gaps.map(h => <div key={`g${h}`} className="absolute inset-x-0 border-t-2 border-dotted border-[var(--foreground)]/25 pointer-events-none" style={{ top: axis.y(h * 60) }} />)}
      {bands.map(s => {
        const top = axis.y(mins(s.start));
        const height = Math.max(axis.y(mins(s.end)) - top - 2, 22);
        return (
          <div key={s.id} className="absolute inset-x-0 px-0.5" style={{ top: top + 1, height }}>
            <Band s={s} c={c} h={height} onClick={() => c.onOpen(s)} />
          </div>
        );
      })}
      {clusterByTime(list.filter(s => !isBand(s.activity))).flatMap(cl => {
        const laneEnd: string[] = [];
        const placed = cl.map(s => {
          let lane = laneEnd.findIndex(e => e <= s.start);
          if (lane < 0) lane = laneEnd.length;
          laneEnd[lane] = s.end;
          return { s, lane };
        });
        return placed.map(({ s, lane }) => {
          const top = axis.y(mins(s.start));
          const height = Math.max(axis.y(mins(s.end)) - top - 2, 28);
          return (
            <div key={s.id} className="absolute overflow-hidden px-0.5 [&>button]:h-full [&>button]:mb-0 [&>button]:overflow-hidden"
              style={{ top: top + 1, height, insetInlineStart: `${(lane / laneEnd.length) * 100}%`, width: `${100 / laneEnd.length}%` }}>
              <SessionButton s={s} mode={mode} c={c} h={height} />
            </div>
          );
        });
      })}
      {now !== null && axis.has(now) && (
        <div className="absolute inset-x-0 z-10 pointer-events-none flex items-center" style={{ top: axis.y(now) }}>
          <span className="w-2 h-2 -mr-1 rounded-full bg-[#d92d20]" /><span className="flex-1 border-t-2 border-[#d92d20]" />
        </div>
      )}
    </>
  );
}

export function WeekGrid({ dates, days, rows, mode, today, globalClosure, canEdit, onAdd, ...c }: Common & {
  dates: string[]; days: number[]; rows: Row[]; mode: Mode; today: string;
  globalClosure: (date: string) => string | undefined; canEdit: boolean; onAdd: (date: string, rowId: string) => void;
}) {
  const cols = days.map(d => dates[d]);
  const now = useNowMinutes();
  // A day column gets wider when some row has parallel sessions in it.
  const par = cols.map(date => rows.reduce((m, r) => Math.max(m, widest(c.sessions.filter(s => s.date === date && r.match(s)))), 1));
  const template = { gridTemplateColumns: `8rem 2.75rem ${par.map(n => `minmax(${n === 1 ? 9 : n * 7.5}rem, ${n}fr)`).join(" ")}` };
  return (
    <div className="hidden md:block overflow-x-auto border-y border-[var(--border)]">
     <div className="min-w-max lg:min-w-0">
      <div className="grid border-b border-[var(--border)] text-sm font-bold bg-[var(--background)]" style={template}>
        <div className="sticky right-0 bg-[var(--background)] z-10" />
        <div />
        {cols.map(date => (
          <div key={date} className={`px-2 py-2 border-r border-[var(--border)] ${date === today ? "bg-[var(--accent-soft)]" : ""}`}>
            יום {DAY_FULL[dayOf(date)]} <span className={`font-normal tabular-nums ${date === today ? "text-[var(--accent)] font-bold" : "text-[var(--foreground)]/50"}`}>{shortDate(date)}</span>
            {globalClosure(date) && <div className="text-xs font-normal text-[var(--foreground)]/60">{globalClosure(date)}</div>}
          </div>
        ))}
      </div>
      {rows.map(row => {
        const rowSessions = c.sessions.filter(s => cols.includes(s.date) && row.match(s));
        const axis = timeAxis(rowSessions);
        const height = Math.max(axis.height, 64);
        return (
        <div key={row.id} className="grid border-b border-[var(--border)] last:border-b-0" style={template}>
          <div className="sticky right-0 z-10 bg-[var(--background)] px-2 py-2 text-sm font-bold flex items-start gap-2">
            {mode === "program" && <span className="w-2.5 h-2.5 mt-1 rounded-sm shrink-0" style={{ backgroundColor: hueStyle(c.hueOf(row.id.split(":")[0])).accent }} aria-hidden />}{row.label}
          </div>
          <div className="relative text-[11px] font-medium tabular-nums text-[var(--foreground)]/55 border-r border-[var(--border)]" style={{ height }}>
            {axis.hours.map(h => <span key={h} className="absolute inset-x-0 text-center leading-none bg-[var(--background)]" style={{ top: axis.y(h * 60) - 5 }}>{String(h).padStart(2, "0")}:00</span>)}
            {axis.gaps.map(h => <span key={`g${h}`} className="absolute inset-x-0 text-center leading-none text-[var(--foreground)]/35" style={{ top: axis.y(h * 60) - 18 }} title="שעות ללא פעילות הוסתרו">⋯</span>)}
          </div>
          {cols.map(date => {
            const list = rowSessions.filter(s => s.date === date);
            const closed = row.closedReason(date);
            return (
              <div key={date} style={{ height }} className={`group relative border-r border-[var(--border)] ${date === today ? "bg-[var(--accent-soft)]" : ""} ${closed && list.length === 0 ? "bg-[var(--foreground)]/[0.04]" : ""}`}>
                <Timeline list={list} axis={axis} mode={mode} c={c} now={date === today ? now : null} />
                {closed && list.length === 0 && <p className="px-2 py-1 text-xs text-[var(--foreground)]/50">{closed}</p>}
                {canEdit && mode === "program" && (
                  <button onClick={() => onAdd(date, row.id)} aria-label="הוסף מפגש חד-פעמי" title="הוסף מפגש חד-פעמי"
                    className="absolute bottom-1 left-1 z-10 p-1 rounded text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/10 opacity-0 group-hover:opacity-100 focus:opacity-100">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        );
      })}
     </div>
    </div>
  );
}

/** One day, one column per row (program/group, person or room) on a shared time scale. */
export function DayGrid({ date, rows, mode, today, closure, canEdit, onAdd, ...c }: Common & {
  date: string; rows: Row[]; mode: Mode; today: string; closure?: string; canEdit: boolean; onAdd: (date: string, rowId: string) => void;
}) {
  const now = useNowMinutes();
  const day = c.sessions.filter(s => s.date === date);
  const axis = timeAxis(day);
  const height = Math.max(axis.height, 96);
  const template = { gridTemplateColumns: `2.75rem repeat(${Math.max(rows.length, 1)}, minmax(11rem, 1fr))` };
  return (
    <div className="hidden md:block overflow-x-auto border-y border-[var(--border)]">
      <div className="min-w-max lg:min-w-0">
        {closure && <p className="px-3 py-2 text-sm bg-[var(--foreground)]/[0.04] border-b border-[var(--border)] text-[var(--foreground)]/70">{closure}</p>}
        <div className="grid border-b border-[var(--border)] text-sm font-bold" style={template}>
          <div />
          {rows.map(row => (
            <div key={row.id} className="px-2 py-2 border-r border-[var(--border)] flex items-center gap-2">
              {mode === "program" && <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: hueStyle(c.hueOf(row.id.split(":")[0])).accent }} aria-hidden />}
              <span className="truncate">{row.label}</span>
            </div>
          ))}
        </div>
        <div className="grid" style={template}>
          <div className="relative text-[11px] font-medium tabular-nums text-[var(--foreground)]/55 border-r border-[var(--border)]" style={{ height }}>
            {axis.hours.map(h => <span key={h} className="absolute inset-x-0 text-center leading-none bg-[var(--background)]" style={{ top: axis.y(h * 60) - 5 }}>{String(h).padStart(2, "0")}:00</span>)}
            {axis.gaps.map(h => <span key={`g${h}`} className="absolute inset-x-0 text-center leading-none text-[var(--foreground)]/35" style={{ top: axis.y(h * 60) - 18 }}>⋯</span>)}
          </div>
          {rows.map(row => {
            const list = day.filter(row.match);
            const closed = row.closedReason(date);
            return (
              <div key={row.id} style={{ height }} className={`group relative border-r border-[var(--border)] ${closed && list.length === 0 ? "bg-[var(--foreground)]/[0.04]" : ""}`}>
                <Timeline list={list} axis={axis} mode={mode} c={c} now={date === today ? now : null} />
                {closed && list.length === 0 && <p className="px-2 py-1 text-xs text-[var(--foreground)]/50">{closed}</p>}
                {canEdit && mode === "program" && (
                  <button onClick={() => onAdd(date, row.id)} aria-label="הוסף מפגש חד-פעמי" title="הוסף מפגש חד-פעמי"
                    className="absolute bottom-1 left-1 z-10 p-1 rounded text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/10 opacity-0 group-hover:opacity-100 focus:opacity-100">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DayAgenda({ dates, days, mode, today, selected, setSelected, rows, globalClosure, canEdit, onAdd, ...c }: Common & {
  dates: string[]; days: number[]; mode: Mode; today: string; rows: Row[];
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
            <Clustered list={list} mode={mode} c={c} />
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
