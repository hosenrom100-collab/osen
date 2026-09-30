"use client";

import { useEffect, useRef, useState } from "react";
import { DAY_SHORT, Session } from "@/lib/workshops/types";
import { dayOf, shortDate } from "@/lib/workshops/dates";
import { MapPin, Plus } from "lucide-react";
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
  const meta = [staff, grp].filter(Boolean).join(" · ");
  const showRoom = !!room && !dead && mode !== "space";
  const count = dead ? undefined : c.countOf(s);
  const special = dead ? undefined : c.typeLabel(s);          // events, therapy… stand out from plain workshops
  const oneOff = s.kind === "extra" || s.kind === "moved-in";

  return (
    <button onClick={() => c.onOpen(s)}
      title={[`${s.start}–${s.end} ${s.workshopName}`, meta, room ? `מרחב: ${room}` : "", count ? `${count} משתתפים` : "", note, s.note, warn?.join(" | ")].filter(Boolean).join("\n")}
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
      {showRoom && (
        <span className="inline-flex items-center gap-1 max-w-full mt-1 px-2 py-0.5 rounded-md bg-white/75 text-xs font-bold" style={{ color: t.ink }} title={`מרחב: ${room}`}>
          <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{room}</span>
        </span>
      )}
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
  date?: string;                      // the day this column is (week view); dragging sideways moves a session here
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
export interface DragApi {
  can: (s: Session) => boolean;
  onDrop: (s: Session, to: { date: string; start: string; end: string }) => void;
  conflict: (s: Session, to: { date: string; start: string; end: string }) => string | undefined;
}

const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const STEP = 15;
const PX_PER_MIN = 1.1;

interface DragState {
  s: Session; mode: "move" | "resize"; x0: number; y0: number; started: boolean;
  grab: number;          // minutes between the session start and the time under the pointer when grabbing
  x: number; y: number;
  to: { date: string; start: string; end: string; col: number } | null;
}

export function TimeGrid({ columns, mode, groupName, laneMin, drag: dragApi, ...c }: Common & {
  columns: Column[]; mode: Mode; groupName: (id: string) => string; laneMin: number; drag?: DragApi;
}) {
  const now = useNowMinutes();
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const justDragged = useRef(false);
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

  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

  // Pointer → clock time, through the row rectangles actually on screen (rows are not linear in time).
  const timeAt = (y: number): number | null => {
    const els = gridRef.current?.querySelectorAll<HTMLElement>("[data-trow]");
    if (!els || !els.length) return null;
    const first = els[0].getBoundingClientRect(), last = els[els.length - 1].getBoundingClientRect();
    if (y < first.top) return times[0] - (first.top - y) / PX_PER_MIN;
    if (y >= last.bottom) return times[times.length - 1] + (y - last.bottom) / PX_PER_MIN;
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (y >= r.top && y < r.bottom) return times[i] + ((y - r.top) / r.height) * (times[i + 1] - times[i]);
    }
    return null;
  };
  const colAt = (x: number): number => {
    const heads = [...(gridRef.current?.querySelectorAll<HTMLElement>("[data-col]") || [])];
    let best = 0, bestD = Infinity;
    heads.forEach((h, i) => {
      const r = h.getBoundingClientRect();
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (d < bestD) { bestD = d; best = Number(h.dataset.col ?? i); }
    });
    return best;
  };
  const snap = (m: number) => Math.round(m / STEP) * STEP;
  const computeTo = (st: DragState, x: number, y: number): DragState["to"] => {
    const tp = timeAt(y);
    if (tp === null) return null;
    const dur = toMin(st.s.end) - toMin(st.s.start);
    const origin = Math.max(columns.findIndex(col => col.sessions.some(z => z.id === st.s.id)), 0);
    if (st.mode === "resize") {
      const start = toMin(st.s.start);
      const end = Math.min(1440, Math.max(start + STEP, snap(tp)));
      return { date: st.s.date, start: fmtMin(start), end: fmtMin(end === 1440 ? 1439 : end), col: origin };
    }
    const start = Math.min(1439 - dur, Math.max(0, snap(tp - st.grab)));
    const col = columns.some(col => col.date) ? colAt(x) : origin;
    return { date: columns[col]?.date ?? st.s.date, start: fmtMin(start), end: fmtMin(start + dur), col };
  };
  const computeRef = useRef(computeTo);
  computeRef.current = computeTo;
  const dropRef = useRef(dragApi?.onDrop);
  dropRef.current = dragApi?.onDrop;

  const startDrag = (e: React.PointerEvent, s: Session, m: "move" | "resize") => {
    if (!dragApi?.can(s) || e.button !== 0) return;
    const tp = timeAt(e.clientY) ?? toMin(s.start);
    const st: DragState = { s, mode: m, x0: e.clientX, y0: e.clientY, started: false, grab: tp - toMin(s.start), x: e.clientX, y: e.clientY, to: null };
    dragRef.current = st;
    setDrag(st);
  };
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const st = dragRef.current;
      if (!st || (!st.started && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) < 5)) return;
      const next = { ...st, started: true, x: e.clientX, y: e.clientY, to: computeRef.current(st, e.clientX, e.clientY) };
      dragRef.current = next; setDrag(next);
    };
    const end = (cancel: boolean) => {
      const st = dragRef.current;
      dragRef.current = null; setDrag(null);
      if (!st?.started) return;
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 60);
      const to = st.to;
      if (!cancel && to && (to.date !== st.s.date || to.start !== st.s.start || to.end !== st.s.end)) dropRef.current?.(st.s, { date: to.date, start: to.start, end: to.end });
    };
    const up = () => end(false);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") end(true); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("keydown", key);
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);

  const rowFor = (t: number) => Math.min(Math.max(times.findLastIndex(x => x <= t), 0), Math.max(times.length - 2, 0));
  const nowRow = now === null ? -1 : times.findIndex((t, i) => i < times.length - 1 && now >= t && now < times[i + 1]);

  return (
    <div className="hidden md:block overflow-x-auto border-y border-[var(--border)]">
      <div ref={gridRef} className="grid min-w-max lg:min-w-0 relative" style={{ gridTemplateColumns: cols, gridTemplateRows: rows }}>
        {/* Invisible row anchors: where each time row really is, for dragging. */}
        {times.slice(0, -1).map((t, i) => <div key={`a${t}`} data-trow={i} className="pointer-events-none" style={{ gridRow: HDR + 1 + i, gridColumn: 1 }} />)}
        {/* Hour lines: whole hours a little stronger than the in-between breakpoints. */}
        {times.slice(0, -1).map((t, i) => (
          <div key={`l${t}`} className={`pointer-events-none border-t ${t % 60 === 0 ? "border-[var(--border)]" : "border-[var(--border-subtle)]"}`}
            style={{ gridRow: HDR + 1 + i, gridColumn: "1 / -1" }} />
        ))}
        {/* Hour labels. */}
        {times.slice(0, -1).map((t, i) => covered[i] && (
          <div key={`t${t}`} className="relative text-[11px] font-semibold tabular-nums text-[#3a2a21]/70 text-center pt-0.5"
            style={{ gridRow: HDR + 1 + i, gridColumn: 1 }}>{String(Math.floor(t / 60)).padStart(2, "0")}:{String(t % 60).padStart(2, "0")}</div>
        ))}

        <div className="bg-[#f3eee8] border-b border-[var(--border)]" style={{ gridRow: `1 / ${HDR + 1}`, gridColumn: 1 }} />
        {columns.map((col, k) => {
          const l = laid[k];
          const c1 = starts[k];
          return (
            <div key={col.id} className="contents">
              {/* Day header, lane labels, separator, empty-cell add button. */}
              <div data-col={k} className={`px-2 py-2 text-sm font-bold border-b border-[var(--border)] text-[#3a2a21] ${col.today ? "bg-[var(--accent-soft)] border-b-2 !border-b-[var(--accent)]" : "bg-[#f3eee8]"}`}
                style={{ gridRow: 1, gridColumn: `${c1} / span ${l.lanes}` }}>
                {col.header}
                {col.sub && <div className="text-xs font-normal text-[var(--foreground)]/60">{col.sub}</div>}
              </div>
              {l.laneLabels && l.laneLabels.map((name, i) => (
                <div key={i} className="px-2 pb-1 text-xs font-semibold text-[#3a2a21]/70 truncate border-b border-[var(--border)] bg-[#f3eee8]"
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
                <div key={s.id} onPointerDown={e => startDrag(e, s, "move")}
                  onClickCapture={e => { if (justDragged.current) { e.stopPropagation(); e.preventDefault(); } }}
                  className={`group relative z-[1] min-w-0 p-0.5 ${dragApi?.can(s) ? "cursor-grab active:cursor-grabbing" : ""} ${drag?.started && drag.s.id === s.id ? "opacity-40" : ""}`}
                  style={{ gridRow: `${HDR + 1 + rowOf(s.start)} / ${HDR + 1 + rowOf(s.end)}`, gridColumn: `${c1 + lane} / span ${span}` }}>
                  <SessionCard s={s} mode={mode} c={c} groups={col.showGroups} />
                  {dragApi?.can(s) && (
                    <div onPointerDown={e => { e.stopPropagation(); startDrag(e, s, "resize"); }} title="גרור לשינוי משך"
                      className="absolute inset-x-3 bottom-0.5 h-1.5 rounded-full bg-black/30 cursor-ns-resize opacity-0 group-hover:opacity-100 z-[2]" />
                  )}
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
        {drag?.started && drag.to && (() => {
          const k = drag.to.col, from = rowFor(toMin(drag.to.start)), upto = rowFor(toMin(drag.to.end) - 1) + 1;
          return <div className="pointer-events-none z-[6] rounded-md border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)]"
            style={{ gridRow: `${HDR + 1 + from} / ${HDR + 1 + Math.max(upto, from + 1)}`, gridColumn: `${starts[k] ?? 2} / span ${laid[k]?.lanes ?? 1}` }} />;
        })()}
        {times.length < 2 && <div className="text-sm text-[var(--foreground)]/50 px-3 py-6" style={{ gridRow: HDR + 1, gridColumn: "2 / -1" }}>אין מפגשים בתקופה זו.</div>}
      </div>
      {drag?.started && drag.to && (() => {
        const warn = dragApi?.conflict(drag.s, drag.to);
        const d = drag.to.date;
        return (
          <div className="fixed z-[60] pointer-events-none px-3 py-2 rounded-lg bg-[#2b1e17] text-white text-xs shadow-[0_8px_24px_rgba(0,0,0,0.3)] max-w-[16rem]" style={{ left: drag.x + 14, top: drag.y + 14 }} dir="rtl">
            <div className="font-bold text-[13px]">{drag.s.workshopName}</div>
            <div className="tabular-nums mt-0.5">{d !== drag.s.date ? `${shortDate(d)} · ` : ""}{drag.to.start}–{drag.to.end}</div>
            {warn && <div className="mt-1 text-[#ffb4a8] font-semibold">{warn}</div>}
          </div>
        );
      })()}
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

