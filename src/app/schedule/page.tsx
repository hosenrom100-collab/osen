"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { addDoc, collection, deleteDoc, doc, writeBatch } from "firebase/firestore";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { ProgramScheduleSettings } from "@/components/workshops/ProgramScheduleSettings";
import { DayShiftDialog } from "@/components/workshops/DayShiftDialog";
import { addDays, format } from "date-fns";
import Link from "next/link";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { Dialog, fieldCls, labelCls, btnPrimary } from "@/components/workshops/Dialog";
import { SessionEditor } from "@/components/workshops/SessionEditor";
import { SeriesDays } from "@/components/workshops/SeriesDays";
import { Column, DayAgenda, DragApi, Row, TimeGrid } from "@/components/workshops/WeekView";
import { findConflicts, staffBusyAt } from "@/lib/workshops/conflicts";
import { buildSessions } from "@/lib/workshops/buildWeek";
import { notifyStaff, Refs } from "@/lib/workshops/data";
import { useScheduleData } from "@/lib/workshops/useScheduleData";
import { firstNames, participantsOf } from "@/lib/workshops/people";
import { ColorBy, hueStyle, sessionHue } from "@/lib/workshops/colors";
import { typeById } from "@/lib/workshops/activityTypes";
import { groupsRunInParallel } from "@/lib/workshops/lanes";
import { moveSession } from "@/lib/workshops/moveSession";
import { ActivityTypesDialog } from "@/components/workshops/ActivityTypesDialog";
import { toISO, weekDates, weekStartOf, shortDate, dayOf } from "@/lib/workshops/dates";
import { Closure, DAY_FULL, DAY_SHORT, Session } from "@/lib/workshops/types";

// The calendar is always shown on white, whatever the app theme is.
const LIGHT_VARS = {
  "--background": "#ffffff", "--card-bg": "#ffffff", "--foreground": "#1f2937",
  "--border": "#D3CCC1", "--border-subtle": "#E7E2D9", "--accent": "#1f5c46", "--accent-soft": "rgba(31,92,70,0.07)",
  "--btn": "#3a2a21", "--btn-hover": "#2b1e17", "--btn-text": "#ffffff", "--btn-soft": "#f0e9e3", "--btn-soft-hover": "#e6dcd3", "--btn-soft-text": "#3a2a21",
} as React.CSSProperties;

// Filter choices are remembered per browser (best effort — storage can be unavailable).
const readSaved = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(`schedule.${key}`); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const save = (key: string, value: unknown) => { try { localStorage.setItem(`schedule.${key}`, JSON.stringify(value)); } catch { /* ignore */ } };

type Mode = "program" | "staff" | "space";
type View = "week" | "day";
const MODES: [Mode, string][] = [["program", "לפי תוכנית"], ["staff", "לפי איש צוות"], ["space", "לפי מרחב"]];
const COLOR_BY: [ColorBy, string][] = [["type", "סוג פעילות"], ["program", "תוכנית"], ["workshop", "סדנה"]];
const VIEWS: [View, string][] = [["week", "שבוע"], ["day", "יום"]];

export default function SchedulePage() {
  const { user, isManager } = useAuth();
  const today = toISO(new Date());
  const [weekStart, setWeekStart] = useState(weekStartOf(new Date()));
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const { refs, types, workshops, changes, closures, absences, patients, loading, reload: load } = useScheduleData(dates);
  const [mode, setMode] = useState<Mode>(() => readSaved<Mode>("mode", "program"));
  const [onlyMine, setOnlyMine] = useState(false);
  // A link (?program=…&group=…&view=day) wins over what this browser remembered.
  const fromUrl = (k: string) => { try { return new URLSearchParams(window.location.search).get(k); } catch { return null; } };
  const [programSel, setProgramSel] = useState<string[]>(() => { const u = fromUrl("program"); return u ? [u] : readSaved<string[]>("programs", []).slice(0, 1); });
  const [groupSel, setGroupSel] = useState<string[]>(() => { const u = fromUrl("group"); return u ? [u] : readSaved<string[]>("groups", []).slice(0, 1); });
  const [view, setView] = useState<View>(() => (fromUrl("view") === "day" ? "day" : readSaved<View>("view", "week")));
  const [colorBy, setColorBy] = useState<ColorBy>(() => readSaved<ColorBy>("colorBy", "type"));
  const [focus, setFocus] = useState<string | null>(null);
  const [showTypes, setShowTypes] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => Promise<void> } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 8000); return () => clearTimeout(t); }, [toast]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [showShift, setShowShift] = useState(false);
  useEffect(() => {
    save("mode", mode); save("programs", programSel); save("groups", groupSel); save("view", view); save("colorBy", colorBy);
    try {
      const q = new URLSearchParams();
      if (programSel[0]) q.set("program", programSel[0]);
      if (groupSel[0]) q.set("group", groupSel[0]);
      if (view === "day") q.set("view", "day");
      window.history.replaceState(null, "", q.size ? `?${q}` : window.location.pathname);
    } catch { /* ignore */ }
  }, [mode, programSel, groupSel, view, colorBy]);
  const [pickedDay, setSelectedDay] = useState(today);
  const [editing, setEditing] = useState<{ session: Session | null; extra?: { date: string; programId?: string } } | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [showClosures, setShowClosures] = useState(false);
  const [series, setSeries] = useState<{ id?: string } | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Saved filter picks may point at programs/groups that no longer exist.
  useEffect(() => {
    if (!refs) return;
    setProgramSel(sel => sel.filter(id => refs.programs.some(p => p.id === id)));
    setGroupSel(sel => sel.filter(id => refs.groups.some(g => g.id === id)));
  }, [refs]);

  // Mobile day selection: fall back to today / first day when the picked day is outside this week.
  const selectedDay = dates.includes(pickedDay) ? pickedDay : dates.includes(today) ? today : dates[0];

  const nameOf = useCallback((id: string) => refs?.staff.find(s => s.id === id)?.name || "—", [refs]);
  const roomOf = useCallback((id?: string) => refs?.locations.find(l => l.id === id)?.name, [refs]);

  const all = useMemo(() => refs ? buildSessions(dates, workshops, refs.programs, changes, closures, types) : [], [dates, workshops, refs, changes, closures, types]);
  const groupName = useCallback((id: string) => refs?.groups.find(g => g.id === id)?.name || "", [refs]);
  const groupsOf = useCallback((ids: string[]) => ids.map(groupName).filter(Boolean).join(", "), [groupName]);
  const sessions = useMemo(() => {
    let list = all;
    if (mode !== "program") list = list.filter(s => !s.fixedBlock);
    if (onlyMine && user) list = list.filter(s => s.fixedBlock || s.staffIds.includes(user.uid));
    if (programSel.length) list = list.filter(s => programSel.includes(s.programId));
    if (groupSel.length && refs) {
      // Per program: if some of its groups are picked, keep their sessions plus whole-program ones.
      list = list.filter(s => {
        const own = refs.groups.filter(g => g.programId === s.programId).map(g => g.id);
        const chosen = groupSel.filter(id => own.includes(id));
        return chosen.length === 0 || s.groupIds.length === 0 || s.groupIds.some(id => chosen.includes(id));
      });
    }
    return list;
  }, [all, mode, onlyMine, user, programSel, groupSel, refs]);

  const groupOptions = useMemo(
    () => (refs && programSel.length ? refs.groups.filter(g => programSel.includes(g.programId)).map(g => ({ id: g.id, label: g.name })) : []),
    [refs, programSel]
  );
  const pickProgram = (id: string) => { setProgramSel(id ? [id] : []); setGroupSel([]); };
  const pickGroup = (id: string) => setGroupSel(id ? [id] : []);
  const warnings = useMemo(() => refs ? findConflicts(all, refs.programs, absences, nameOf, id => roomOf(id) || "המרחב") : new Map<string, string[]>(), [all, refs, absences, nameOf, roomOf]);

  const closedFor = useCallback((programId: string | null, date: string) => {
    const c = closures.find(x => x.date === date && (x.programIds.length === 0 || (programId && x.programIds.includes(programId))));
    return c?.reason || (c ? "אין פעילות" : undefined);
  }, [closures]);

  const shownPrograms = useMemo(
    () => (refs ? (programSel.length ? refs.programs.filter(p => programSel.includes(p.id)) : refs.programs) : []),
    [refs, programSel]
  );

  // Rows exist even when a program has no sessions this week, so the grid is always visible.
  const rows: Row[] = useMemo(() => {
    if (!refs) return [];
    if (mode === "program") {
      const out: Row[] = [];
      for (const p of shownPrograms) {
        const closedReason = (d: string) => closedFor(p.id, d) || (p.activeDays.includes(dayOf(d)) ? undefined : "לא יום פעילות");
        const pGroups = refs.groups.filter(g => g.programId === p.id);
        // No program picked → one merged row per program; a picked program is split by group.
        if (programSel.length === 0 || pGroups.length === 0) {
          out.push({ id: p.id, label: p.name, match: (s: Session) => s.programId === p.id, closedReason });
          continue;
        }
        const chosen = groupSel.filter(id => pGroups.some(g => g.id === id));
        for (const g of chosen.length ? pGroups.filter(x => chosen.includes(x.id)) : pGroups) {
          out.push({
            id: `${p.id}:${g.id}`, label: `${p.name} · ${g.name}`, closedReason,
            match: (s: Session) => s.programId === p.id && (s.groupIds.includes(g.id) || ((chosen.length > 0 || !!s.fixedBlock) && s.groupIds.length === 0)),
          });
        }
        if (!chosen.length && sessions.some(s => s.programId === p.id && s.groupIds.length === 0 && !s.fixedBlock)) {
          out.push({ id: `${p.id}:all`, label: `${p.name} · כל התוכנית`, closedReason, match: (s: Session) => s.programId === p.id && s.groupIds.length === 0 && !s.fixedBlock });
        }
      }
      return out;
    }
    if (mode === "staff") {
      const ids = [...new Set(sessions.flatMap(s => s.staffIds))];
      return refs.staff.filter(p => ids.includes(p.id)).map(p => ({
        id: p.id, label: p.name, match: (s: Session) => s.staffIds.includes(p.id),
        closedReason: (d: string) => absences.some(a => a.userId === p.id && a.date === d) ? "בהיעדרות" : undefined,
      }));
    }
    const ids = new Set(sessions.map(s => s.locationId || ""));
    const list = refs.locations.filter(l => ids.has(l.id)).map(l => ({ id: l.id, label: l.name, match: (s: Session) => (s.locationId || "") === l.id, closedReason: () => undefined }));
    if (ids.has("")) list.push({ id: "", label: "ללא מרחב", match: (s: Session) => !s.locationId, closedReason: () => undefined });
    return list;
  }, [refs, mode, sessions, absences, closedFor, shownPrograms, programSel, groupSel]);

  // Weekdays = active days of the programs on screen, plus any day that has a session.
  const days = useMemo(() => {
    const set = new Set<number>();
    (mode === "program" ? shownPrograms : refs?.programs || []).forEach(p => p.activeDays.forEach(d => set.add(d)));
    sessions.forEach(s => set.add(dayOf(s.date)));
    return set.size ? [...set].sort() : [0, 1, 2, 3, 4];
  }, [refs, sessions, shownPrograms, mode]);

  const globalClosure = (d: string) => closedFor(null, d);

  const weekChanges = changes.filter(c => c.dates.some(d => dates.includes(d)));
  const unpublished = weekChanges.filter(c => !c.published);

  const publish = async () => {
    setPublishing(true);
    // One tailored message per affected person.
    const lines = new Map<string, string[]>();
    for (const s of all.filter(x => x.change && !x.change.published)) {
      const what = s.kind === "cancelled" ? "בוטל" : s.kind === "moved-away" ? `הוזז ל-${shortDate(s.change!.newDate!)}` : s.kind === "extra" ? "מפגש נוסף" : "עודכן";
      const line = `${what}: ${s.workshopName}, ${DAY_SHORT[dayOf(s.date)]} ${shortDate(s.date)} ${s.start}`;
      for (const uid of new Set([...s.staffIds, ...s.base.staffIds])) lines.set(uid, [...(lines.get(uid) || []), line]);
    }
    await Promise.all([...lines].map(([uid, l]) => notifyStaff([uid], "עדכון ביומן השבועי", l.join("\n"))));
    const batch = writeBatch(db);
    unpublished.forEach(c => batch.update(doc(db, "session_changes", c.id), { published: true }));
    await batch.commit();
    setPublishing(false);
    load();
  };

  if (loading || !refs) return <PageSkeleton />;

  const rangeLabel = `${format(weekStart, "d.M")} – ${format(addDays(weekStart, 6), "d.M.yyyy")}`; // print title only
  const programOf = (id: string) => refs.programs.find(p => p.id === id);
  const workshopById = new Map(workshops.map(w => [w.id, w]));
  const common = {
    sessions, warnings, nameOf, roomOf, groupsOf, showGroups: programSel.length === 0,
    hueOf: (s: Session) => sessionHue(s, colorBy, types, refs.programs),
    typeLabel: (s: Session) => (s.activity !== "workshop" && !s.band ? typeById(types, s.activity).label : undefined),
    dim: (s: Session) => focusKey !== null && legendKey(s) !== focusKey,
    countOf: (s: Session) => {
      if (s.fixedBlock || !s.hasParticipants) return undefined;
      const n = participantsOf(s, workshopById.get(s.workshopId), patients).length;
      return n || undefined;
    },
    // A fixed meal/break opens its program's schedule settings; everything else opens the session.
    onOpen: (s: Session) => (s.fixedBlock ? (isManager && setSettingsFor(s.programId)) : setEditing({ session: s })),
  };
  const legendKey = (s: Session) => (colorBy === "type" ? s.activity : colorBy === "program" ? s.programId : s.workshopId);
  const focusKey = focus;
  const legend = (() => {
    const seen = new Map<string, { key: string; label: string; hue: number }>();
    for (const s of sessions) {
      const k = legendKey(s);
      if (!seen.has(k)) seen.set(k, { key: k, label: colorBy === "type" ? typeById(types, s.activity).label : colorBy === "program" ? programOf(s.programId)?.name || "—" : s.workshopName, hue: sessionHue(s, colorBy, types, refs.programs) });
    }
    return [...seen.values()];
  })();
  // Drag a card to move it (sideways = another day), or its bottom edge to change the length. Managers only.
  const dragApi: DragApi | undefined = isManager ? {
    can: s => !s.fixedBlock && !!s.changeId && s.kind !== "cancelled" && s.kind !== "moved-away",
    conflict: (s, to) => {
      const warn: string[] = [];
      for (const id of s.staffIds) {
        if (absences.some(a => a.userId === id && a.date === to.date)) warn.push(`${nameOf(id)} בהיעדרות`);
        const busy = staffBusyAt(id, to.date, to.start, to.end, all, s.workshopId);
        if (busy) warn.push(`${nameOf(id)} משובץ ב"${busy.workshopName}"`);
      }
      const room = s.locationId && all.find(o => o.id !== s.id && !o.fixedBlock && o.kind !== "cancelled" && o.kind !== "moved-away" && o.locationId === s.locationId && o.date === to.date && o.start < to.end && to.start < o.end);
      if (room) warn.push(`${roomOf(s.locationId)} תפוס ב"${room.workshopName}"`);
      if (closedFor(s.programId, to.date)) warn.push("יום ללא פעילות");
      return warn.slice(0, 3).join(" · ") || undefined;
    },
    onDrop: async (s, to) => {
      try {
        const undo = await moveSession(s, to, user?.uid);
        setToast({ text: `${s.workshopName} עודכן ל-${to.date !== s.date ? `${shortDate(to.date)} ` : ""}${to.start}–${to.end}`, undo: async () => { await undo(); load(); } });
        load();
      } catch { setToast({ text: "השינוי לא נשמר. נסה שוב." }); }
    },
  } : undefined;
  const addFor = (date: string, programId?: string) => (isManager && mode === "program" ? () => setEditing({ session: null, extra: { date, programId } }) : undefined);
  const laneGroups = programSel[0] && !groupSel[0] ? refs.groups.filter(g => g.programId === programSel[0]) : [];
  const weekLanes: "groups" | "stable" = (() => {
    const p = programOf(programSel[0]);
    if (!p || laneGroups.length < 2) return "stable";
    return p.laneMode === "groups" || (p.laneMode === "auto" && groupsRunInParallel(sessions)) ? "groups" : "stable";
  })();
  const columns: Column[] = view === "week"
    ? days.map(d => {
        const date = dates[d];
        const sub = closedFor(programSel[0] || null, date);
        return {
          id: date, date, today: date === today, sessions: sessions.filter(s => s.date === date), laneMode: weekLanes, groupIds: laneGroups.map(g => g.id),
          showGroups: weekLanes === "stable" && !groupSel[0],
          header: <span className="flex flex-col items-center leading-tight"><span className="text-[15px]">יום {DAY_FULL[dayOf(date)]}</span><span className={`text-xs font-semibold tabular-nums mt-0.5 ${date === today ? "text-[var(--accent)]" : "text-[var(--foreground)]/55"}`}>{shortDate(date)}</span></span>,
          sub, onAdd: addFor(date, programSel[0]),
        };
      })
    : rows.map(row => ({
        id: row.id, sessions: sessions.filter(s => s.date === selectedDay && row.match(s)), laneMode: "stable" as const,
        today: selectedDay === today, header: <span className="truncate">{row.label}</span>,
        sub: row.closedReason(selectedDay), onAdd: addFor(selectedDay, row.id.split(":")[0]),
      }));
  const currentProgram = programSel[0] ? programOf(programSel[0]) : undefined;
  const moveDay = (delta: number) => {
    const d = addDays(new Date(`${selectedDay}T12:00:00`), delta);
    setSelectedDay(toISO(d));
    setWeekStart(weekStartOf(d));
  };
  const step = (dir: 1 | -1) => (view === "day" ? moveDay(dir) : setWeekStart(addDays(weekStart, 7 * dir)));
  const atCurrent = view === "day" ? selectedDay === today : dates.includes(today);
  const goToday = () => { setSelectedDay(today); setWeekStart(weekStartOf(new Date())); };
  const dayLabel = `${DAY_FULL[dayOf(selectedDay)]} ${shortDate(selectedDay)}`;
  const dayUrl = `/schedule/day?date=${selectedDay}${programSel[0] ? `&program=${programSel[0]}` : ""}${groupSel[0] ? `&group=${groupSel[0]}` : ""}`;
  const activeWorkshops = workshops.filter(w => w.status === "active");

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <style>{`@media print { aside, nav, .no-print { display: none !important; } @page { size: A4 landscape; margin: 10mm; } body { background: #fff !important; } }`}</style>
      <div dir="rtl" style={LIGHT_VARS} className="min-h-screen bg-white text-[var(--foreground)] pb-24 md:pb-8">
        <header className="no-print sticky top-0 z-30 bg-white border-b border-[var(--border)]">
          <div className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* 1. What am I looking at: program, then its group. */}
            <select value={programSel[0] || ""} onChange={e => pickProgram(e.target.value)} aria-label="תוכנית"
              className="text-sm font-bold bg-transparent border border-[var(--border)] rounded-md px-2.5 py-1.5 max-w-[11rem] focus:border-[var(--accent)] outline-none">
              <option value="">כל התוכניות</option>
              {refs.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {groupOptions.length > 1 && (
              <select value={groupSel[0] || ""} onChange={e => pickGroup(e.target.value)} aria-label="קבוצה"
                className="text-sm bg-transparent border border-[var(--border)] rounded-md px-2.5 py-1.5 max-w-[10rem] focus:border-[var(--accent)] outline-none">
                <option value="">כל הקבוצות</option>
                {groupOptions.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            )}

            {/* 2. When: one control, steps by week or by day. */}
            <div className="flex items-center">
              <button onClick={() => step(-1)} aria-label="הקודם" className="p-1.5 rounded-md hover:bg-[var(--foreground)]/5"><ChevronRight className="w-4 h-4" /></button>
              {/* Separate spans: a single string gets its parts reordered by the RTL bidi algorithm. */}
              <span className="flex items-center gap-1 text-sm font-bold tabular-nums min-w-[8.5rem] justify-center">
                {view === "day" ? <span>{dayLabel}</span> : <><span>{format(weekStart, "d.M")}</span><span className="text-[var(--foreground)]/40">–</span><span>{format(addDays(weekStart, 6), "d.M")}</span></>}
              </span>
              <button onClick={() => step(1)} aria-label="הבא" className="p-1.5 rounded-md hover:bg-[var(--foreground)]/5"><ChevronLeft className="w-4 h-4" /></button>
            </div>
            {!atCurrent && <button onClick={goToday} className="text-sm px-2.5 py-1 rounded-md border border-[var(--border)] hover:bg-[var(--foreground)]/5">היום</button>}

            {/* 3. How: view and actions. */}
            <div className="mr-auto flex items-center gap-1.5 relative">
              <div className="flex border border-[var(--border)] rounded-md overflow-hidden" role="group" aria-label="תצוגה">
                {VIEWS.map(([k, l]) => (
                  <button key={k} onClick={() => { if (k === "day") setSelectedDay(selectedDay); setView(k); }} aria-pressed={view === k}
                    className={`px-2.5 py-1 text-sm ${view === k ? "bg-[var(--accent)] text-white font-bold" : "text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/5"}`}>{l}</button>
                ))}
              </div>
              {isManager && (
                <button onClick={() => setEditing({ session: null, extra: { date: view === "day" ? selectedDay : dates.includes(today) ? today : dates[0], programId: programSel[0] } })}
                  aria-label="מפגש חד-פעמי" className={`${btnPrimary} flex items-center gap-1.5 !px-2.5 !py-1.5 sm:!px-3`}>
                  <Plus className="w-4 h-4" /><span className="hidden sm:inline">מפגש</span>
                </button>
              )}
              <button onClick={() => setMenuOpen(o => !o)} aria-label="עוד פעולות" aria-expanded={menuOpen} className="p-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--foreground)]/5"><MoreHorizontal className="w-4 h-4" /></button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <ul className="absolute left-0 top-full mt-1 z-50 w-60 bg-white border border-[var(--border)] rounded-md shadow-md py-1 text-sm max-h-[70vh] overflow-y-auto">
                    <li className="px-3 pt-1.5 pb-1 text-xs font-bold text-[var(--foreground)]/50">קיבוץ</li>
                    {MODES.map(([k, l]) => (
                      <li key={k}><button aria-pressed={mode === k} className={`w-full text-right px-3 py-1.5 hover:bg-[var(--foreground)]/5 ${mode === k ? "font-bold text-[var(--accent)]" : ""}`} onClick={() => { setMode(k); setMenuOpen(false); }}>{l}</button></li>
                    ))}
                    <li className="px-3 pt-1.5 pb-1 text-xs font-bold text-[var(--foreground)]/50">צבע לפי</li>
                    {COLOR_BY.map(([k, l]) => (
                      <li key={k}><button aria-pressed={colorBy === k} className={`w-full text-right px-3 py-1.5 hover:bg-[var(--foreground)]/5 ${colorBy === k ? "font-bold text-[var(--accent)]" : ""}`} onClick={() => { setColorBy(k); setFocus(null); setMenuOpen(false); }}>{l}</button></li>
                    ))}
                    <li className="border-t border-[var(--border)] my-1" />
                    <li><label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[var(--foreground)]/5"><input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} /> רק המפגשים שלי</label></li>
                    <li className="border-t border-[var(--border)] my-1" />
                    <li><Link className="block px-3 py-2 hover:bg-[var(--foreground)]/5" href={dayUrl}>עמוד יומי לשיתוף</Link></li>
                    <li><button className="w-full text-right px-3 py-2 hover:bg-[var(--foreground)]/5" onClick={() => { setMenuOpen(false); window.print(); }}>הדפסה</button></li>
                    {isManager && <>
                      <li className="border-t border-[var(--border)] my-1" />
                      <li><button className="w-full text-right px-3 py-2 hover:bg-[var(--foreground)]/5" onClick={() => { setMenuOpen(false); setShowShift(true); }}>דחיית מפגשי היום</button></li>
                      <li><button className="w-full text-right px-3 py-2 hover:bg-[var(--foreground)]/5" onClick={() => { setMenuOpen(false); setShowTypes(true); }}>סוגי פעילות</button></li>
                      <li><button className="w-full text-right px-3 py-2 hover:bg-[var(--foreground)]/5" onClick={() => { setMenuOpen(false); setSeries({}); }}>ימי פעילות קבועים</button></li>
                      <li><button className="w-full text-right px-3 py-2 hover:bg-[var(--foreground)]/5" onClick={() => { setMenuOpen(false); setShowClosures(true); }}>ימים ללא פעילות</button></li>
                      {currentProgram && <li><button className="w-full text-right px-3 py-2 hover:bg-[var(--foreground)]/5" onClick={() => { setMenuOpen(false); setSettingsFor(currentProgram.id); }}>הגדרות לוז: {currentProgram.name}</button></li>}
                      <li><Link className="block px-3 py-2 hover:bg-[var(--foreground)]/5" href="/admin/workshops">ניהול סדנאות</Link></li>
                      <li><Link className="block px-3 py-2 hover:bg-[var(--foreground)]/5" href="/admin/spaces">ניהול מרחבים</Link></li>
                    </>}
                  </ul>
                </>
              )}
            </div>
          </div>
        </header>

        {legend.length > 1 && colorBy !== "workshop" && (
          <div className="no-print px-3 py-1.5 border-b border-[var(--border)] flex flex-wrap items-center gap-1.5" role="group" aria-label="מקרא">
            {legend.map(l => (
              <button key={l.key} onClick={() => setFocus(f => (f === l.key ? null : l.key))} aria-pressed={focus === l.key}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border transition-colors ${focus === l.key ? "border-[var(--foreground)]/40 bg-[var(--foreground)]/5" : "border-transparent hover:bg-[var(--foreground)]/5 text-[var(--foreground)]/70"}`}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: hueStyle(l.hue).bar }} aria-hidden />{l.label}
              </button>
            ))}
          </div>
        )}

        {weekChanges.length > 0 && (
          <div className="no-print px-3 py-1.5 border-b border-[var(--border)] flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <button onClick={() => setShowChanges(true)} className="font-semibold underline">שינויים השבוע ({weekChanges.length})</button>
            {isManager && unpublished.length > 0 && (
              <>
                <span className="text-[var(--foreground)]/60 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{unpublished.length} טרם פורסמו לצוות</span>
                <button onClick={publish} disabled={publishing} className={`${btnPrimary} mr-auto !py-1`}>פרסם ועדכן צוות</button>
              </>
            )}
          </div>
        )}

        <p className="hidden print:block px-2 py-2 font-bold">יומן שבועי — <bdi dir="ltr">{rangeLabel}</bdi></p>

        {rows.length === 0 ? (
          <p className="text-sm text-[var(--foreground)]/50 py-20 text-center px-4">
            {mode === "program"
              ? <>אין תוכניות פעילות. {isManager && <Link href="/admin/programs" className="underline">הגדר תוכנית</Link>}</>
              : "אין מפגשים בשבוע זה."}
          </p>
        ) : (
          <div className="md:px-2 md:pt-2">
            <TimeGrid {...common} columns={columns} mode={mode} groupName={groupName} laneMin={view === "day" ? 10 : 7.5} drag={dragApi} />
            <DayAgenda {...common} dates={dates} days={days} rows={rows} mode={mode} today={today} globalClosure={globalClosure}
              selected={selectedDay} setSelected={setSelectedDay} canEdit={isManager}
              onAdd={date => setEditing({ session: null, extra: { date, programId: programSel.length === 1 ? programSel[0] : undefined } })} />
          </div>
        )}

        {editing && (
          <SessionEditor
            key={editing.session?.id ?? "new"}
            session={editing.session} extra={editing.extra} workshops={activeWorkshops}
            staff={refs.staff} locations={refs.locations} types={types} canEdit={isManager}
            accent={editing.session ? sessionHue(editing.session, colorBy, types, refs.programs) : undefined}
            groupNames={editing.session ? editing.session.groupIds.map(groupName).filter(Boolean) : []}
            participants={editing.session ? firstNames(participantsOf(editing.session, workshopById.get(editing.session.workshopId), patients)) : []}
            busyFor={(staffId, date, start, end, workshopId) =>
              absences.some(a => a.userId === staffId && a.date === date) ? "בהיעדרות" : staffBusyAt(staffId, date, start, end, all, workshopId)?.workshopName}
            warnings={editing.session ? warnings.get(editing.session.id) || [] : []}
            userId={user?.uid} onClose={() => setEditing(null)}
            onEditSeries={id => { setEditing(null); setSeries({ id }); }}
            onSaved={() => { setEditing(null); load(); }}
          />
        )}

        {showChanges && (
          <Dialog title="שינויים השבוע" onClose={() => setShowChanges(false)}>
            <ul className="divide-y divide-[var(--border)] text-sm">
              {all.filter(s => s.change).map(s => (
                <li key={s.id}>
                  <button className="w-full text-right py-2" onClick={() => { setShowChanges(false); setEditing({ session: s }); }}>
                    <span className="font-bold">{s.workshopName}</span>{" "}
                    <span className="text-[var(--foreground)]/60 tabular-nums">יום {DAY_SHORT[dayOf(s.date)]} {shortDate(s.date)} {s.start}</span>
                    <span className="block text-xs text-[var(--foreground)]/60">
                      {s.kind === "cancelled" ? "בוטל" : s.kind === "moved-away" ? `הוזז ל-${shortDate(s.change!.newDate!)}` : s.kind === "moved-in" ? `הוזז מ-${shortDate(s.origDate!)}` : s.kind === "extra" ? "מפגש נוסף" : "עודכן"}
                      {s.change && !s.change.published ? " · טרם פורסם" : ""}
                      {s.note ? ` · ${s.note}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Dialog>
        )}

        {series && (
          <SeriesDays workshops={workshops} initialId={series.id} programs={refs.programs} groups={refs.groups} locations={refs.locations}
            onClose={() => setSeries(null)} onSaved={() => { setSeries(null); load(); }} />
        )}

        {settingsFor && programOf(settingsFor) && (
          <ProgramScheduleSettings program={programOf(settingsFor)!} groups={refs.groups} types={types} onClose={() => setSettingsFor(null)} onSaved={() => { setSettingsFor(null); load(); }} />
        )}
        {showShift && (
          <DayShiftDialog date={selectedDay} userId={user?.uid} scopeLabel={currentProgram ? currentProgram.name : "כל התוכניות"}
            sessions={sessions} onClose={() => setShowShift(false)} onSaved={() => { setShowShift(false); load(); }} />
        )}
        {toast && (
          <div role="status" className="no-print fixed bottom-20 md:bottom-6 inset-x-0 z-[70] mx-auto w-fit max-w-[92vw] flex items-center gap-3 bg-[#2b1e17] text-white text-sm pl-3 pr-4 py-2.5 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
            <span>{toast.text}</span>
            {toast.undo && <button onClick={async () => { await toast.undo!(); setToast(null); }} className="font-bold underline text-[#8fd3b4]">בטל</button>}
          </div>
        )}
        {showTypes && <ActivityTypesDialog types={types} programs={refs.programs} onClose={() => setShowTypes(false)} onSaved={() => { setShowTypes(false); load(); }} />}
        {showClosures && <ClosuresDialog dates={dates} closures={closures} refs={refs} onClose={() => setShowClosures(false)} onChanged={load} />}
      </div>
    </RoleGuard>
  );
}

function ClosuresDialog({ dates, closures, refs, onClose, onChanged }: {
  dates: string[]; closures: Closure[]; refs: Refs; onClose: () => void; onChanged: () => void;
}) {
  const [date, setDate] = useState(dates[0]);
  const [reason, setReason] = useState("");
  const [programId, setProgramId] = useState("");
  const add = async () => {
    await addDoc(collection(db, "closures"), { date, reason: reason.trim() || "אין פעילות", programIds: programId ? [programId] : [] });
    setReason(""); onChanged();
  };
  const remove = async (id: string) => { await deleteDoc(doc(db, "closures", id)); onChanged(); };
  return (
    <Dialog title="ימים ללא פעילות" onClose={onClose}>
      <p className="text-xs text-[var(--foreground)]/60">חגים, אירועים מוסדיים וכד׳. מפגשים שנופלים על היום הזה לא יופיעו ביומן.</p>
      <ul className="divide-y divide-[var(--border)] text-sm">
        {closures.map(c => (
          <li key={c.id} className="py-2 flex items-center gap-2">
            <span className="tabular-nums">{shortDate(c.date)}</span>
            <span className="flex-1">{c.reason}{c.programIds.length ? ` · ${refs.programs.find(p => p.id === c.programIds[0])?.name}` : " · כל התוכניות"}</span>
            <button onClick={() => remove(c.id)} className="text-xs text-rose-500 underline">הסר</button>
          </li>
        ))}
        {closures.length === 0 && <li className="py-2 text-[var(--foreground)]/50">אין ימים כאלה בשבוע הזה.</li>}
      </ul>
      <div className="grid grid-cols-2 gap-3 pt-2">
        <div><label className={labelCls}>תאריך</label><input type="date" className={fieldCls} value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><label className={labelCls}>תוכנית</label>
          <select className={fieldCls} value={programId} onChange={e => setProgramId(e.target.value)}>
            <option value="">כל התוכניות</option>{refs.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div className="col-span-2"><label className={labelCls}>סיבה</label><input className={fieldCls} value={reason} placeholder="סוכות, יום כיף…" onChange={e => setReason(e.target.value)} /></div>
      </div>
      <button onClick={add} disabled={!date} className={btnPrimary}>הוסף</button>
    </Dialog>
  );
}
