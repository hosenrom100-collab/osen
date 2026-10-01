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
  peekNames: (s: Session) => string[];          // first names of the people attending, for the hover peek
  showGroups?: boolean; // show group names on sessions even in program mode
  onOpen: (s: Session) => void;
  groupHue?: (groupId: string) => number | undefined; // a group's own colour (lane headers, tags)
  jointOf?: (s: Session) => boolean;                  // a session shared by several groups of a program
  soft?: Map<string, string[]>;                       // soft warnings: worth a look, not an error
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

/** What a session card says, shared by the card itself and the hover peek. */
function facts(s: Session, mode: Mode, c: Common, groups?: boolean) {
  const dead = s.kind === "cancelled" || s.kind === "moved-away";
  const room = c.roomOf(s.locationId);
  const staffOnly = s.audience === "staff";
  const staff = mode !== "staff" && !s.fixedBlock ? s.staffIds.map(c.nameOf).join(", ") : "";
  const grp = groups || mode !== "program" || c.showGroups ? c.groupsOf(s.groupIds) : "";
  return { dead, room, staff, staffOnly, grp, count: dead ? undefined : c.countOf(s), special: dead ? undefined : c.typeLabel(s), note: changeNote(s), warn: c.warnings.get(s.id), soft: dead ? undefined : c.soft?.get(s.id), joint: !dead && !!c.jointOf?.(s) };
}

/**
 * A session card. Its height follows its content (the grid row grows), so nothing is ever cut off.
 * Order of importance: name, then when/where, then who, then the note; small tags at the bottom.
 */
function Card({ s, mode, c, groups, compact }: { s: Session; mode: Mode; c: Common; groups?: boolean; compact?: boolean }) {
  const t = hueStyle(c.hueOf(s));
  const f = facts(s, mode, c, groups);
  const oneOff = s.kind === "extra" || s.kind === "moved-in";
  const showRoom = !!f.room && !f.dead && mode !== "space";
  const meta = [f.staff ? (f.staffOnly ? `נוכחים: ${f.staff}` : f.staff) : "", f.grp].filter(Boolean).join(" · ");
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [peek, setPeek] = useState<DOMRect | null>(null);
  const enter = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (hover.current) clearTimeout(hover.current);
    hover.current = setTimeout(() => setPeek(el.getBoundingClientRect()), 280);
  };
  const leave = () => { if (hover.current) clearTimeout(hover.current); setPeek(null); };

  // Phone: every card the same shape (name, then one line of room / people / count). The rest is one tap away in the details.
  if (compact) {
    const flag = s.kind === "extra" ? "חד-פעמי" : s.kind === "moved-in" ? "הוזז" : "";
    const tagged = !f.joint && !f.dead && !!groups && s.groupIds.length === 1 && c.groupHue?.(s.groupIds[0]) !== undefined;
    const line = tagged || f.joint ? (f.staff ? (f.staffOnly ? `נוכחים: ${f.staff}` : f.staff) : "") : meta;
    return (
      <button onClick={() => c.onOpen(s)}
        aria-label={[`${s.start}–${s.end}`, s.workshopName, f.room && `מרחב ${f.room}`, f.staff, f.grp, f.count ? `${f.count} משתתפים` : "", f.note, f.warn?.join(", ")].filter(Boolean).join(", ")}
        style={f.dead ? undefined : { backgroundColor: t.fill, color: t.ink, borderInlineStartColor: t.bar, borderInlineStartStyle: oneOff ? "dashed" : "solid" }}
        className={`flex flex-col justify-center w-full h-full min-h-[3.75rem] text-start rounded-md px-2.5 py-1.5 border-s-[3px] ${c.dim(s) ? "opacity-30" : ""} ${f.dead ? "bg-[var(--cal-ink)]/[0.04] text-[var(--cal-faint)] border-[var(--cal-line-day)]" : ""}`}>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`flex-1 min-w-0 truncate text-[15px] font-bold leading-snug ${s.kind === "cancelled" ? "line-through" : ""}`}>{s.workshopName}</span>
          {f.warn && !f.dead && <span className="w-2 h-2 shrink-0 rounded-full bg-[var(--cal-now)]" aria-hidden />}
          {f.soft && !f.warn && <span className="w-2 h-2 shrink-0 rounded-full bg-[#e08a00]" aria-hidden />}
          {f.joint && <span className="shrink-0 px-1.5 rounded bg-white/90 text-[11px] font-semibold" style={{ color: t.ink }}>משותף</span>}
          {tagged && (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 rounded bg-white/90 text-[11px] font-semibold text-[var(--cal-ink)]">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: hueStyle(c.groupHue!(s.groupIds[0])!).bar }} />{c.groupsOf(s.groupIds)}
            </span>
          )}
          {s.kind === "cancelled" && <span className="shrink-0 text-xs font-bold text-[#b42318]">בוטל</span>}
          {flag && !f.dead && <span className="shrink-0 px-1.5 rounded bg-[#fff0c2] text-[11px] font-semibold text-[#6b4700]">{flag}</span>}
        </span>
        {!f.dead && (
          <span className="mt-0.5 flex items-center gap-1.5 min-w-0 text-xs">
            {showRoom && <span className="inline-flex items-center gap-1 shrink-0 max-w-[45%] px-1.5 rounded bg-white/80 font-bold" style={{ color: t.ink }}><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{f.room}</span></span>}
            {line && <span className="flex-1 min-w-0 truncate text-[var(--cal-muted)]">{line}</span>}
            {!line && <span className="flex-1" />}
            {f.count ? <span className="shrink-0 px-1.5 rounded bg-black/[0.06] tabular-nums font-semibold text-[var(--cal-muted)]">{f.count}</span> : null}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      <button onClick={() => { leave(); c.onOpen(s); }} onMouseEnter={enter} onMouseLeave={leave} onPointerDown={leave}
        aria-label={[`${s.start}–${s.end}`, s.workshopName, f.room && `מרחב ${f.room}`, f.staff, f.grp, f.count ? `${f.count} משתתפים` : "", f.note, f.warn?.join(", ")].filter(Boolean).join(", ")}
        style={f.dead ? undefined : { backgroundColor: t.fill, color: t.ink, borderInlineStartColor: t.bar, borderInlineStartStyle: oneOff ? "dashed" : "solid", boxShadow: f.joint ? `inset 0 0 0 1px ${t.bar}, inset 0 0 0 3px ${t.fill}, inset 0 0 0 4px ${t.soft}` : undefined }}
        className={`block w-full h-full text-start rounded-md px-2.5 py-1.5 md:px-2 md:py-1 border-s-[3px] transition-[filter,opacity] hover:brightness-[0.97] focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${c.dim(s) ? "opacity-30" : ""} ${f.dead ? "border border-dashed border-[var(--cal-frame)] text-[var(--cal-muted)]" : "border-transparent"}`}>
        <span className="flex items-start gap-1.5">
          <span className={`flex-1 min-w-0 text-[15px] md:text-[13.5px] font-bold leading-snug line-clamp-2 ${s.kind === "cancelled" ? "line-through" : ""}`}>{s.workshopName}</span>
          <span className="flex items-center gap-1.5 pt-1 shrink-0">
            {f.warn && !f.dead && <span className="w-2 h-2 rounded-full bg-[var(--cal-now)]" />}
            {f.soft && !f.warn && <span className="w-2 h-2 rounded-full bg-[#e08a00]" title={f.soft.join(", ")} />}
            {f.note && !f.dead && <span className="text-[10px] leading-none text-[var(--cal-muted)]">◆</span>}
            {s.change && !s.change.published && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
          </span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs md:text-[11.5px] tabular-nums">
          <span className="font-semibold text-[var(--cal-muted)]">{s.start}–{s.end}</span>
          {s.kind === "cancelled" && <span className="font-bold text-[#b42318]">בוטל</span>}
          {showRoom && (
            <span className="inline-flex items-center gap-1 max-w-full px-1.5 rounded bg-white/80 font-bold" style={{ color: t.ink }}>
              <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{f.room}</span>
            </span>
          )}
        </span>
        {meta && !f.dead && <span className="block mt-0.5 text-xs md:text-[11.5px] leading-snug line-clamp-2 text-[var(--cal-muted)]">{meta}</span>}
        {s.note && !f.dead && <span className="block mt-0.5 text-xs md:text-[11.5px] leading-snug line-clamp-2 italic text-[var(--cal-ink)]/80">{s.note}</span>}
        {(f.special || oneOff || f.count || f.joint) && !f.dead && (
          <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] font-semibold">
            {f.joint && <span className="px-1.5 rounded bg-white text-[var(--cal-ink)] ring-1 ring-current/30" style={{ color: t.ink }}>משותף</span>}
            {f.special && <span className="px-1.5 rounded bg-white/80" style={{ color: t.ink }}>{f.special}</span>}
            {oneOff && <span className="px-1.5 rounded bg-[#fff0c2] text-[#6b4700]">{s.kind === "extra" ? "חד-פעמי" : "הוזז"}</span>}
            {f.count ? <span className="px-1.5 rounded bg-black/[0.06] tabular-nums text-[var(--cal-muted)]" title={`${f.count} ${f.staffOnly ? "בצוות" : "משתתפים"}`}>{f.count} {f.staffOnly ? "בצוות" : "משתתפים"}</span> : null}
            {f.warn && !f.dead && <span className="text-[#b42318] font-bold">{f.warn[0]}{f.warn.length > 1 ? ` (+${f.warn.length - 1})` : ""}</span>}
          </span>
        )}
      </button>
      {peek && <Peek s={s} f={f} rect={peek} c={c} accent={t.bar} />}
    </>
  );
}

/** Hover card with everything about a session, untruncated (like Google Calendar's quick look). */
function Peek({ s, f, rect, c, accent }: { s: Session; f: ReturnType<typeof facts>; rect: DOMRect; c: Common; accent: string }) {
  const W = 288;
  const left = rect.left > W + 16 ? rect.left - W - 8 : Math.min(rect.right + 8, window.innerWidth - W - 8);
  const top = Math.min(Math.max(rect.top - 4, 8), window.innerHeight - 260);
  const names = c.peekNames(s);
  const rows: [string, string][] = [
    [f.staffOnly ? "נוכחים" : "מדריכים", s.staffIds.map(c.nameOf).join(", ")],
    ["קבוצות", c.groupsOf(s.groupIds)],
    ["מרחב", f.room || ""],
  ].filter(([, v]) => v) as [string, string][];
  return (
    <div role="tooltip" dir="rtl" className="fixed z-[80] pointer-events-none rounded-xl bg-white text-[var(--cal-ink)] border border-[var(--cal-frame)] shadow-[0_8px_28px_rgba(0,0,0,0.16)] p-3 text-start"
      style={{ left, top, width: W, borderInlineStart: `4px solid ${accent}` }}>
      <div className="text-[15px] font-bold leading-snug">{s.workshopName}</div>
      <div className="text-xs text-[var(--cal-muted)] tabular-nums mt-0.5">{s.date.split("-").reverse().slice(0, 2).join(".")} · {s.start}–{s.end}{f.special ? ` · ${f.special}` : ""}</div>
      <dl className="mt-2 space-y-1 text-[13px]">
        {rows.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-14 shrink-0 text-[var(--cal-faint)]">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>)}
        {f.count ? <div className="flex gap-2"><dt className="w-14 shrink-0 text-[var(--cal-faint)]">{f.staffOnly ? "בצוות" : "משתתפים"}</dt><dd className="min-w-0 break-words">{f.count}{names.length ? ` · ${names.slice(0, 24).join(", ")}${names.length > 24 ? ` ועוד ${names.length - 24}` : ""}` : ""}</dd></div> : null}
        {s.note && <div className="flex gap-2"><dt className="w-14 shrink-0 text-[var(--cal-faint)]">הערה</dt><dd className="min-w-0 break-words">{s.note}</dd></div>}
        {f.note && <div className="flex gap-2"><dt className="w-14 shrink-0 text-[var(--cal-faint)]">שינוי</dt><dd>{f.note}</dd></div>}
      </dl>
      {f.soft && <ul className="mt-2 rounded-md bg-[#fff3dc] text-[#8a5a00] text-xs px-2 py-1.5 space-y-0.5">{f.soft.map(w => <li key={w}>{w}</li>)}</ul>}
      {f.warn && <ul className="mt-2 rounded-md bg-[#fde8e5] text-[#9b1c12] text-xs px-2 py-1.5 space-y-0.5">{f.warn.map(w => <li key={w}>{w}</li>)}</ul>}
    </div>
  );
}

/** Fixed daily entries (lunch, break, transport): a quiet hatched band, not a card. */
function BandCard({ s, c, groups }: { s: Session; c: Common; groups?: boolean }) {
  const g = groups || c.showGroups || s.groupIds.length ? c.groupsOf(s.groupIds) : "";
  const room = c.roomOf(s.locationId);
  return (
    <button onClick={() => c.onOpen(s)} title={`${s.start}–${s.end} ${s.workshopName}${g ? ` · ${g}` : ""}${room ? ` · ${room}` : ""}`}
      style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(43,33,27,0.04) 0 6px, transparent 6px 12px)" }}
      className={`block w-full h-full text-start rounded-md px-2.5 py-0.5 md:px-2 bg-[var(--cal-ink)]/[0.04] text-[var(--cal-muted)] text-xs md:text-[11.5px] ${c.dim(s) ? "opacity-30" : ""}`}>
      <span className="font-semibold tabular-nums">{s.start}–{s.end}</span>{" "}
      <span className="font-semibold line-clamp-2">{s.workshopName}{g ? ` · ${g}` : ""}{room ? ` · ${room}` : ""}</span>
    </button>
  );
}

function SessionCard({ s, mode, c, groups, compact }: { s: Session; mode: Mode; c: Common; groups?: boolean; compact?: boolean }) {
  return s.band ? <BandCard s={s} c={c} groups={groups} /> : <Card s={s} mode={mode} c={c} groups={groups} compact={compact} />;
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
  onDrop: (s: Session, to: { date: string; start: string; end: string; lane?: number }) => void;
  conflict: (s: Session, to: { date: string; start: string; end: string }) => string | undefined;
}

const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const STEP = 15;
const PX_PER_MIN = 0.8; // desktop density: ~48px per hour, rows still grow to fit their text

interface DragState {
  s: Session; mode: "move" | "resize"; x0: number; y0: number; started: boolean;
  grab: number;          // minutes between the session start and the time under the pointer when grabbing
  x: number; y: number;
  to: { date: string; start: string; end: string; col: number; lane?: number } | null;
}

export function TimeGrid({ columns, mode, groupName, laneMin, corner, drag: dragApi, laneHints, ...c }: Common & {
  columns: Column[]; mode: Mode; groupName: (id: string) => string; laneMin: number; corner?: string; drag?: DragApi;
  laneHints?: Record<string, number>; // workshop → remembered side
}) {
  const now = useNowMinutes();
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const justDragged = useRef(false);
  const all = columns.flatMap(col => col.sessions);
  const { times, covered, rowOf } = timeRows(all);
  const pref = new Map<string, number>(Object.entries(laneHints || {})); // workshop → lane, shared by all days so it stays on one side
  const laid: DayLanes[] = columns.map(col =>
    col.laneMode === "groups" && col.groupIds?.length ? laneByGroup(col.sessions, col.groupIds, groupName) : laneStable(col.sessions, pref));
  const hasLabels = laid.some(l => l.laneLabels);
  const HDR = hasLabels ? 2 : 1;

  // Track positions: column 1 = hour labels, then `lanes` tracks per day.
  const starts: number[] = [];
  let cursor = 2;
  laid.forEach(l => { starts.push(cursor); cursor += l.lanes; });
  const cols = `2.75rem ${laid.map(l => `repeat(${l.lanes}, minmax(${(l.placed.length ? laneMin : 4.5) * (l.minLanes ?? l.lanes) / l.lanes}rem, 1fr))`).join(" ")}`;
  const rows = [
    "auto", ...(hasLabels ? ["auto"] : []),
    ...(times.length < 2 ? ["minmax(96px, auto)"] : times.slice(0, -1).map((t, i) => {
      const dur = times[i + 1] - t;
      return covered[i] ? `minmax(${Math.max(Math.round(dur * PX_PER_MIN), 34)}px, auto)` : dur >= 60 ? "26px" : "10px";
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
  // Which side of the column the pointer is over (lane 0 is the right-most one in RTL); only for side-by-side columns.
  const laneAt = (x: number, k: number): number | undefined => {
    const l = laid[k];
    if (!l || l.laneLabels || (l.minLanes ?? l.lanes) < 2) return undefined;
    const r = gridRef.current?.querySelector<HTMLElement>(`[data-col="${k}"]`)?.getBoundingClientRect();
    if (!r) return undefined;
    const sides = l.minLanes ?? l.lanes;
    return Math.min(sides - 1, Math.max(0, Math.floor((r.right - x) / (r.width / sides))));
  };
  const laneNow = (s: Session): number | undefined => {
    for (const l of laid) { const p = l.placed.find(q => q.s.id === s.id); if (p) return l.laneLabels ? undefined : p.side ?? p.lane; }
    return undefined;
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
    return { date: columns[col]?.date ?? st.s.date, start: fmtMin(start), end: fmtMin(start + dur), col, lane: laneAt(x, col) };
  };
  const computeRef = useRef(computeTo);
  computeRef.current = computeTo;
  const laneRef = useRef(laneNow);
  laneRef.current = laneNow;
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
      const laneChanged = st.mode === "move" && to?.lane !== undefined && to.lane !== laneRef.current(st.s);
      if (!cancel && to && (to.date !== st.s.date || to.start !== st.s.start || to.end !== st.s.end || laneChanged)) dropRef.current?.(st.s, { date: to.date, start: to.start, end: to.end, ...(laneChanged ? { lane: to.lane } : {}) });
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
  // Hour labels: every covered round hour, plus an in-between time only when it is 25+ minutes from the last label.
  const labelAt = new Set<number>();
  { let last = -999; times.slice(0, -1).forEach((t, i) => { if (covered[i] && (t % 60 === 0 || t - last >= 25)) { labelAt.add(t); last = t; } }); }
  const hasSub = columns.some(col => col.sub);
  const hasToday = columns.some(col => col.today);
  const nowRow = now === null ? -1 : times.findIndex((t, i) => i < times.length - 1 && now >= t && now < times[i + 1]);

  return (
    <div className="hidden md:block lg:overflow-clip overflow-x-auto rounded-[14px] border border-[var(--cal-frame)] bg-[var(--cal-surface)]">
      <div ref={gridRef} className="grid min-w-max lg:min-w-0 relative" style={{ gridTemplateColumns: cols, gridTemplateRows: rows }}>
        {/* Invisible row anchors: where each time row really is, for dragging. */}
        {times.slice(0, -1).map((t, i) => <div key={`a${t}`} data-trow={i} className="pointer-events-none" style={{ gridRow: HDR + 1 + i, gridColumn: 1 }} />)}

        {/* Stretches with no activity: a hatched band, named when long enough to matter. */}
        {times.slice(0, -1).map((t, i) => !covered[i] && (
          <div key={`g${t}`} className="pointer-events-none flex items-center justify-center text-[11px] font-medium text-[var(--cal-faint)]"
            style={{ gridRow: HDR + 1 + i, gridColumn: "2 / -1", backgroundImage: "repeating-linear-gradient(135deg, rgba(43,33,27,0.035) 0 6px, transparent 6px 12px)" }}>
            {times[i + 1] - t >= 60 && <span className="bg-white px-2 rounded">ללא פעילות · {fmtMin(t)}–{fmtMin(times[i + 1])}</span>}
          </div>
        ))}

        {/* Hour lines stop at the gutter; a short tick joins them to it. Only round hours get a line. */}
        {times.slice(0, -1).map((t, i) => t % 60 === 0 && (
          <div key={`l${t}`} className="pointer-events-none border-t border-[var(--cal-line-hour)]" style={{ gridRow: HDR + 1 + i, gridColumn: "2 / -1" }} />
        ))}
        {times.slice(0, -1).map((t, i) => t % 60 === 0 && (
          <div key={`k${t}`} className="pointer-events-none border-t border-[var(--cal-line-day)] w-1.5 justify-self-end" style={{ gridRow: HDR + 1 + i, gridColumn: 1 }} />
        ))}
        {/* Hour labels, centred on their line. */}
        {times.slice(0, -1).map((t, i) => labelAt.has(t) && (
          <div key={`t${t}`} className="relative" style={{ gridRow: HDR + 1 + i, gridColumn: 1 }}>
            <span className={`absolute inset-x-0 top-0 ${i === 0 ? "translate-y-0.5" : "-translate-y-1/2"} text-center tabular-nums leading-none bg-[var(--cal-surface)] py-0.5 ${t % 60 === 0 ? "text-xs font-semibold text-[var(--cal-muted)]" : "text-[11px] font-medium text-[var(--cal-faint)]"}`}>{fmtMin(t)}</span>
          </div>
        ))}
        {/* "Now" chip in the gutter, level with the red line. */}
        {hasToday && nowRow >= 0 && now !== null && (
          <div className="relative z-10 pointer-events-none" style={{ gridRow: HDR + 1 + nowRow, gridColumn: 1 }}>
            <span className="absolute inset-x-0.5 -translate-y-1/2 text-center text-[10px] font-bold leading-none tabular-nums rounded bg-[var(--cal-now)] text-white py-0.5"
              style={{ top: `${((now - times[nowRow]) / (times[nowRow + 1] - times[nowRow])) * 100}%` }}>{fmtMin(now)}</span>
          </div>
        )}

        {/* Corner above the gutter: the week number, so the frame reads as one piece. */}
        <div className="sticky top-[3.25rem] z-20 bg-[var(--cal-surface)] border-b border-[var(--cal-frame)] flex items-end justify-center pb-1.5 text-[11px] font-semibold text-[var(--cal-faint)]"
          style={{ gridRow: `1 / ${HDR + 1}`, gridColumn: 1 }}>{corner}</div>
        {columns.map((col, k) => {
          const l = laid[k];
          const c1 = starts[k];
          return (
            <div key={col.id} className="contents">
              {/* One continuous day separator, header to bottom, so header and body always line up. */}
              <div className="pointer-events-none border-s border-[var(--cal-line-day)]" style={{ gridRow: `1 / -1`, gridColumn: c1 }} />
              {l.laneLabels && l.laneLabels.slice(1).map((_, i) => (
                <div key={`d${i}`} className="pointer-events-none border-s border-dashed border-[var(--cal-line-lane)]" style={{ gridRow: `2 / -1`, gridColumn: c1 + (i + 1) * (l.unit ?? 1) }} />
              ))}
              {/* A group with nothing of its own that day keeps its place, shaded, so every group stays where it always is. */}
              {l.laneLabels && l.placed.length > 0 && l.laneLabels.map((_, g) => {
                const u = l.unit ?? 1;
                const used = l.placed.some(p => p.lane < (g + 1) * u && p.lane + p.span > g * u);
                return !used && (
                  <div key={`e${g}`} className="pointer-events-none flex justify-center pt-3 text-[11px] font-medium text-[var(--cal-faint)]"
                    style={{ gridRow: `${HDR + 1} / -1`, gridColumn: `${c1 + g * u} / span ${u}`, backgroundImage: "repeating-linear-gradient(135deg, rgba(43,33,27,0.03) 0 6px, transparent 6px 12px)" }}>
                    <span className="bg-white px-1.5 rounded h-fit">אין פעילות לקבוצה</span>
                  </div>
                );
              })}
              <div data-col={k} className={`sticky top-[3.25rem] z-20 bg-[var(--cal-surface)] px-2 pt-2 text-center text-[var(--cal-ink)] ${l.laneLabels ? "" : "border-b border-[var(--cal-frame)] pb-2"}`}
                style={{ gridRow: 1, gridColumn: `${c1} / span ${l.lanes}` }}>
                {col.header}
                {hasSub && <div className="mt-1 min-h-[1.25rem]">{col.sub && <span className="inline-block max-w-full truncate px-2 rounded-full bg-[var(--cal-ink)]/[0.06] text-[11px] font-medium text-[var(--cal-muted)]">{col.sub}</span>}</div>}
              </div>
              {l.laneLabels && l.laneLabels.map((name, i) => {
                const h = col.groupIds?.[i] ? c.groupHue?.(col.groupIds[i]) : undefined;
                return (
                  <div key={i} className="sticky top-[7.25rem] z-20 bg-[var(--cal-surface)] px-2 pb-1.5 pt-0.5 text-[11px] font-semibold text-center text-[var(--cal-muted)] truncate border-b border-[var(--cal-frame)]"
                    style={{ gridRow: 2, gridColumn: `${c1 + i * (l.unit ?? 1)} / span ${l.unit ?? 1}`, boxShadow: h !== undefined ? `inset 0 -2px 0 ${hueStyle(h).bar}` : undefined }} title={name}>
                    {h !== undefined && <span className="inline-block w-1.5 h-1.5 rounded-full me-1 align-middle" style={{ backgroundColor: hueStyle(h).bar }} />}{name}
                  </div>
                );
              })}
              {col.onAdd && (
                <button onClick={col.onAdd} aria-label="הוסף מפגש חד-פעמי" title="הוסף מפגש חד-פעמי"
                  className="group flex items-end justify-center pb-1 text-xs font-semibold text-transparent hover:text-[var(--cal-muted)] hover:bg-[var(--cal-ink)]/[0.025] focus-visible:text-[var(--cal-muted)]"
                  style={{ gridRow: `${HDR + 1} / -1`, gridColumn: `${c1} / span ${l.lanes}` }}>
                  <span className="flex items-center gap-1"><Plus className="w-3 h-3" />הוסף</span>
                </button>
              )}
              {l.placed.map(({ s, lane, span }) => (
                <div key={s.id} onPointerDown={e => startDrag(e, s, "move")}
                  onClickCapture={e => { if (justDragged.current) { e.stopPropagation(); e.preventDefault(); } }}
                  className={`group relative z-[1] hover:z-[18] focus-within:z-[18] min-w-0 [contain:inline-size] p-0.5 ${dragApi?.can(s) ? "cursor-grab active:cursor-grabbing" : ""} ${drag?.started && drag.s.id === s.id ? "opacity-40" : ""}`}
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
                    <span className="w-2 h-2 -mr-1 rounded-full bg-[var(--cal-now)]" /><span className="flex-1 border-t-[1.5px] border-[var(--cal-now)]" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {drag?.started && drag.to && (() => {
          const k = drag.to.col, from = rowFor(toMin(drag.to.start)), upto = rowFor(toMin(drag.to.end) - 1) + 1;
          return <div className="pointer-events-none z-[6] rounded-md border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)]"
            style={{ gridRow: `${HDR + 1 + from} / ${HDR + 1 + Math.max(upto, from + 1)}`, gridColumn: drag.to.lane !== undefined ? `${(starts[k] ?? 2) + drag.to.lane * Math.floor((laid[k]?.lanes ?? 1) / (laid[k]?.minLanes ?? 1))} / span ${Math.floor((laid[k]?.lanes ?? 1) / (laid[k]?.minLanes ?? 1))}` : `${starts[k] ?? 2} / span ${laid[k]?.lanes ?? 1}` }} />;
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
  const now = useNowMinutes();
  const isToday = selected === today;
  const toM = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const period = (t: string) => (toM(t) < 720 ? "בוקר" : toM(t) < 900 ? "צהריים" : "אחר הצהריים");
  return (
    <div className="md:hidden" onTouchStart={e => setTouchX(e.touches[0].clientX)} onTouchEnd={e => onTouchEnd(e.changedTouches[0].clientX)}>
      {/* Day strip: weekday over a big date; today in a filled circle, the picked day in a soft pill. */}
      <div className="flex border-b border-[var(--cal-frame)] overflow-x-auto bg-white">
        {cols.map(date => {
          const on = selected === date, td = date === today;
          return (
            <button key={date} onClick={() => setSelected(date)} aria-pressed={on} aria-label={`יום ${DAY_SHORT[dayOf(date)]} ${shortDate(date)}`}
              className="flex-1 min-w-14 py-2 flex flex-col items-center gap-1">
              <span className={`text-xs font-medium ${on ? "text-[var(--cal-ink)]" : "text-[var(--cal-muted)]"}`}>{DAY_SHORT[dayOf(date)]}</span>
              <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-base font-bold tabular-nums ${td ? "bg-[var(--accent)] text-white" : on ? "bg-[var(--cal-ink)]/[0.09] text-[var(--cal-ink)]" : "text-[var(--cal-ink)]"}`}>{date.slice(8).replace(/^0/, "")}</span>
            </button>
          );
        })}
      </div>
      {closure && <p className="mx-3 mt-3 px-3 py-2.5 text-sm font-medium text-[var(--cal-muted)] bg-[var(--cal-ink)]/[0.05] rounded-lg">{closure}</p>}
      <ul className="px-3 py-2">
        {list.map((s, i) => {
          const done = isToday && now !== null && now >= toM(s.end);
          const live = isToday && now !== null && now >= toM(s.start) && now < toM(s.end);
          const head = i === 0 || period(list[i - 1].start) !== period(s.start);
          return (
            <li key={s.id}>
              {head && <div className="text-[11px] font-semibold text-[var(--cal-faint)] pt-3 pb-1.5 px-1">{period(s.start)}</div>}
              <div className="flex gap-2 items-stretch mb-1.5">
                <span dir="ltr" className={`w-12 shrink-0 pt-1.5 text-center tabular-nums leading-tight ${done ? "text-[var(--cal-faint)]" : "text-[var(--cal-ink)]"}`}>
                  <span className="block text-sm font-bold">{s.start}</span>
                  <span className="block text-xs font-medium text-[var(--cal-faint)]">{s.end}</span>
                  {live && <span className="mt-1 inline-block rounded bg-[var(--cal-now)] px-1 text-[10px] font-bold text-white">עכשיו</span>}
                </span>
                <div className={`flex-1 min-w-0 ${live ? "rounded-md ring-2 ring-[var(--cal-now)]/60" : ""}`}><SessionCard s={s} mode={mode} c={c} groups compact /></div>
              </div>
            </li>
          );
        })}
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

