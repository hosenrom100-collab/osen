"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { collection, deleteDoc, deleteField, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search } from "lucide-react";
import { MiniCalendar } from "@/components/workshops/MiniCalendar";
import { ProgramScheduleSettings } from "@/components/workshops/ProgramScheduleSettings";
import { DayShiftDialog } from "@/components/workshops/DayShiftDialog";
import { addDays, format, getWeek, parseISO } from "date-fns";
import { he } from "date-fns/locale";
import Link from "next/link";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "@/components/workshops/Dialog";
import { SessionEditor } from "@/components/workshops/SessionEditor";
import { SeriesDays } from "@/components/workshops/SeriesDays";
import { Column, DayAgenda, DragApi, Row, TimeGrid } from "@/components/workshops/WeekView";
import { findConflicts, staffBusyAt } from "@/lib/workshops/conflicts";
import { buildSessions } from "@/lib/workshops/buildWeek";
import { notifyStaff, Refs } from "@/lib/workshops/data";
import { useScheduleData } from "@/lib/workshops/useScheduleData";
import { firstNames, participantsOf } from "@/lib/workshops/people";
import { ColorBy, groupHue, hueStyle, programHue, programShort, sessionHue } from "@/lib/workshops/colors";
import { typeById } from "@/lib/workshops/activityTypes";
import { groupsRunInParallel } from "@/lib/workshops/lanes";
import { moveSession } from "@/lib/workshops/moveSession";
import { ActivityTypesDialog } from "@/components/workshops/ActivityTypesDialog";
import { CopyScheduleDialog } from "@/components/workshops/CopyScheduleDialog";
import { EventPrefill, NewEventDialog } from "@/components/workshops/NewEventDialog";
import { rangeDates, toISO, weekDates, weekStartOf, shortDate, dayOf } from "@/lib/workshops/dates";
import { Closure, DAY_FULL, DAY_SHORT, Program, Session } from "@/lib/workshops/types";

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
// First visit in this browser: start from the program/group the person chose for the home screen.
const homePref = (): { programId?: string; groupId?: string } => {
  try { return JSON.parse(localStorage.getItem("home.schedulePref") || "{}"); } catch { return {}; }
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
  const firstVisit = useRef<boolean>(readSaved<string[] | null>("programs", null) === null && !fromUrl("program"));
  const [programSel, setProgramSel] = useState<string[]>(() => {
    const u = fromUrl("program"); if (u) return u.split(",").filter(Boolean);
    const saved = readSaved<string[] | null>("programs", null); if (saved) return saved;
    const p = homePref().programId; return p ? [p] : [];
  });
  const [groupSel, setGroupSel] = useState<string[]>(() => {
    const u = fromUrl("group"); if (u) return [u];
    if (fromUrl("program")) return [];
    const saved = readSaved<string[] | null>("groups", null); if (saved) return saved.slice(0, 1);
    const g = homePref().groupId; return g ? [g] : [];
  });
  const [view, setView] = useState<View>(() => (fromUrl("view") === "day" ? "day" : readSaved<View>("view", "week")));
  const [colorBy, setColorBy] = useState<ColorBy>(() => readSaved<ColorBy>("colorBy", "type"));
  const [focus, setFocus] = useState<string | null>(null);
  const [showTypes, setShowTypes] = useState(false);
  const [creating, setCreating] = useState<{ date: string; programId?: string; start?: string; prefill?: EventPrefill } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => Promise<void> } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 8000); return () => clearTimeout(t); }, [toast]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [showShift, setShowShift] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // Ctrl+C on the card under the pointer, Ctrl+V to paste it as a new event (opens the "new event" form, filled in).
  const hovered = useRef<Session | null>(null);
  const [clip, setClip] = useState<Session | null>(null);
  useEffect(() => {
    save("mode", mode); save("programs", programSel); save("groups", groupSel); save("view", view); save("colorBy", colorBy);
    try {
      const q = new URLSearchParams();
      if (programSel.length) q.set("program", programSel.join(","));
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores saved choices / loads external data once; nothing to derive during render
    setProgramSel(sel => sel.filter(id => refs.programs.some(p => p.id === id)));
    setGroupSel(sel => sel.filter(id => refs.groups.some(g => g.id === id)));
    // Still nothing picked on a first visit: the program (and group) this person is assigned to, when there is just one.
    if (firstVisit.current && user) {
      firstVisit.current = false;
      const me = refs.staff.find(p => p.id === user.uid);
      if (me?.programIds?.length === 1) {
        setProgramSel(sel => (sel.length ? sel : [me.programIds![0]]));
        const gs = (me.groupIds || []).filter(id => refs.groups.some(g => g.id === id && g.programId === me.programIds![0]));
        if (gs.length === 1) setGroupSel(sel => (sel.length ? sel : gs));
      }
    }
  }, [refs, user]);


  const nameOf = useCallback((id: string) => refs?.staff.find(s => s.id === id)?.name || "—", [refs]);
  const roomOf = useCallback((id?: string) => refs?.locations.find(l => l.id === id)?.name, [refs]);

  const all = useMemo(() => refs ? buildSessions(dates, workshops, refs.programs, changes, closures, types) : [], [dates, workshops, refs, changes, closures, types]);
  const groupName = useCallback((id: string) => refs?.groups.find(g => g.id === id)?.name || "", [refs]);
  const groupsOf = useCallback((ids: string[]) => ids.map(groupName).filter(Boolean).join(", "), [groupName]);
  const sessions = useMemo(() => {
    // A moved session shows only where it now is (tagged "moved from…"), not also as a ghost at its old place.
    let list = all.filter(s => s.kind !== "moved-away");
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
    () => (refs && programSel.length === 1 ? refs.groups.filter(g => programSel.includes(g.programId)).map(g => ({ id: g.id, label: g.name })) : []),
    [refs, programSel]
  );
  const setPrograms = (ids: string[]) => { setProgramSel(ids); setGroupSel([]); };
  const onlyProgram = programSel.length === 1 ? programSel[0] : undefined; // groups and program-wide actions only make sense for one program
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
        if (programSel.length !== 1 || pGroups.length === 0) {
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

  // Weekdays the program(s) on screen are active on — what phone navigation steps through.
  const navDays = useMemo(() => {
    const set = new Set<number>();
    (programSel.length ? refs?.programs.filter(p => programSel.includes(p.id)) || [] : refs?.programs || []).forEach(p => p.activeDays.forEach(d => set.add(d)));
    return set.size ? [...set].sort() : [0, 1, 2, 3, 4];
  }, [refs, programSel]);

  // The day shown in day view / on phones. On a phone it is always an activity day; elsewhere any day of the week.
  const selectedDay = (() => {
    const ok = (d: string) => dates.includes(d) && (!isMobile || days.includes(dayOf(d)));
    if (ok(pickedDay)) return pickedDay;
    if (ok(today)) return today;
    return dates.find(ok) ?? dates[0];
  })();

  const weekChanges = changes.filter(c => c.dates.some(d => dates.includes(d)));
  const unpublished = weekChanges.filter(c => !c.published);

  // Publishing: first a preview of what each person will be told, where single people can be left out; then send.
  const [preview, setPreview] = useState<{ lines: Map<string, string[]>; skip: Set<string> } | null>(null);
  const openPublish = () => {
    const lines = new Map<string, string[]>();
    for (const s of all.filter(x => x.change && !x.change.published)) {
      const what = s.kind === "cancelled" ? "בוטל" : s.kind === "moved-away" ? `הוזז ל-${shortDate(s.change!.newDate!)}` : s.kind === "extra" ? "מפגש נוסף" : "עודכן";
      const line = `${what}: ${s.workshopName}, ${DAY_SHORT[dayOf(s.date)]} ${shortDate(s.date)} ${s.start}`;
      for (const uid of new Set([...s.staffIds, ...s.base.staffIds])) lines.set(uid, [...(lines.get(uid) || []), line]);
    }
    setPreview({ lines, skip: new Set() });
  };
  const publish = async () => {
    if (!preview || publishing) return;
    setPublishing(true);
    try {
      await Promise.all([...preview.lines].filter(([uid]) => !preview.skip.has(uid)).map(([uid, l]) => notifyStaff([uid], "עדכון ביומן השבועי", l.join("\n"))));
      const batch = writeBatch(db);
      unpublished.forEach(c => batch.update(doc(db, "session_changes", c.id), { published: true }));
      await batch.commit();
      setPreview(null);
      load();
    } finally { setPublishing(false); }
  };

  const moveDay = (delta: number) => {
    const d = addDays(new Date(`${selectedDay}T12:00:00`), delta);
    setSelectedDay(toISO(d));
    setWeekStart(weekStartOf(d));
  };
  // Phones skip days the program does not run on, so there are never empty days to swipe through.
  const nextActive = (from: Date, dir: 1 | -1) => {
    let d = from;
    for (let i = 0; i < 14; i++) { d = addDays(d, dir); if (navDays.includes(d.getDay())) return d; }
    return addDays(from, dir);
  };
  const jumpTo = (d: Date) => { setSelectedDay(toISO(d)); setWeekStart(weekStartOf(d)); };
  const step = (dir: 1 | -1) => {
    if (!isMobile) return view === "day" ? moveDay(dir) : setWeekStart(addDays(weekStart, 7 * dir));
    const cur = new Date(`${selectedDay}T12:00:00`);
    if (view === "day") return jumpTo(nextActive(cur, dir));
    // Week: the same weekday next/previous week, or the closest activity day of that week.
    const target = addDays(cur, 7 * dir);
    if (navDays.includes(target.getDay())) return jumpTo(target);
    const fwd = nextActive(target, 1);
    jumpTo(weekStartOf(fwd).getTime() === weekStartOf(target).getTime() ? fwd : nextActive(target, -1));
  };
  const atCurrent = view === "day" ? selectedDay === today : dates.includes(today);
  const goToday = () => {
    const t = new Date();
    jumpTo(!isMobile || navDays.includes(t.getDay()) ? t : nextActive(t, 1));
  };
  useEffect(() => { stepRef.current = step; goTodayRef.current = goToday; onlyProgramRef.current = onlyProgram; });
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  const stepRef = useRef<(d: 1 | -1) => void>(() => {});
  const goTodayRef = useRef<() => void>(() => {});
  const onlyProgramRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    keys.current = e => {
      const el = e.target as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      if (editing || creating || showCopy || showShift || series || settingsFor || showChanges || showClosures || showTypes || showHelp) return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (!isManager) return;
        if (k === "c" && hovered.current && !hovered.current.fixedBlock && !window.getSelection()?.toString()) {
          e.preventDefault(); const s = hovered.current; setClip(s);
          setToast({ text: `הועתק: ${s.workshopName}. Ctrl+V להדבקה` });
        } else if (k === "v" && clip) {
          e.preventDefault();
          setCreating({ date: view === "day" ? selectedDay : dates.includes(today) ? today : dates[0], programId: clip.programId,
            prefill: { name: clip.workshopName, kind: clip.activity, groupIds: clip.groupIds, start: clip.start, end: clip.end, locationId: clip.locationId, staffIds: clip.staffIds } });
        }
        return;
      }
      if (e.altKey) return;
      // Days run right-to-left: the right arrow goes back, the left arrow forward.
      if (e.key === "ArrowRight") { e.preventDefault(); stepRef.current(-1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); stepRef.current(1); }
      else if (k === "t") goTodayRef.current();
      else if (k === "d") setView("day");
      else if (k === "w") setView("week");
      else if (k === "n" && isManager) { e.preventDefault(); setCreating({ date: view === "day" ? selectedDay : dates.includes(today) ? today : dates[0], programId: onlyProgramRef.current }); }
      else if (k === "/") { e.preventDefault(); setSearching(true); }
      else if (e.key === "?") setShowHelp(true);
    };
  });
  useEffect(() => { const on = (e: KeyboardEvent) => keys.current(e); window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on); }, []);

  if (loading || !refs) return <PageSkeleton />;

  const rangeLabel = `${format(weekStart, "d.M")} – ${format(addDays(weekStart, 6), "d.M.yyyy")}`; // print title only
  const programOf = (id: string) => refs.programs.find(p => p.id === id);
  const workshopById = new Map(workshops.map(w => [w.id, w]));
  const laneHints = Object.fromEntries(workshops.filter(w => w.laneHint !== undefined).map(w => [w.id, w.laneHint!]));
  // Programs with several groups: what is shared by groups, and shared activities that run into a group's own one (rarely meant).
  const multiGroup = (programId: string) => refs.groups.filter(g => g.programId === programId).length > 1;
  const jointOf = (s: Session) => !s.fixedBlock && !s.band && multiGroup(s.programId) && s.groupIds.length !== 1;
  const soft = new Map<string, string[]>();
  for (const j of sessions) {
    if (!jointOf(j) || j.kind === "cancelled") continue;
    for (const o of sessions) {
      if (o.id === j.id || o.date !== j.date || o.programId !== j.programId || o.groupIds.length !== 1 || o.fixedBlock || o.band || o.kind === "cancelled") continue;
      if (j.groupIds.length && !j.groupIds.includes(o.groupIds[0])) continue;
      if (!(o.start < j.end && j.start < o.end)) continue;
      soft.set(j.id, [...(soft.get(j.id) || []), `חופף לפעילות של ${groupName(o.groupIds[0])}: ${o.workshopName}`]);
      soft.set(o.id, [...(soft.get(o.id) || []), `חופף לפעילות משותפת: ${j.workshopName}`]);
    }
  }
  const common = {
    sessions, warnings, soft, jointOf,
    groupHue: (id: string) => groupHue(id, refs.groups, refs.programs), nameOf, roomOf, groupsOf, showGroups: programSel.length !== 1,
    programTag: (s: Session) => (programSel.length !== 1 && !frames ? programShort(programOf(s.programId)) : undefined),
    hueOf: (s: Session) => sessionHue(s, colorBy, types, refs.programs),
    typeLabel: (s: Session) => (s.activity !== "workshop" && !s.band ? typeById(types, s.activity).label : undefined),
    dim: (s: Session) => (focusKey !== null && legendKey(s) !== focusKey) || (needle !== "" && !matches(s)),
    peekNames: (s: Session) => (s.fixedBlock || !s.hasParticipants ? [] : firstNames(participantsOf(s, workshopById.get(s.workshopId), patients))),
    countOf: (s: Session) => {
      if (s.fixedBlock) return undefined;
      if (s.audience === "staff") return s.staffIds.length || undefined;
      if (!s.hasParticipants) return undefined;
      const n = participantsOf(s, workshopById.get(s.workshopId), patients).length;
      return n || undefined;
    },
    // A fixed meal/break opens its program's schedule settings; everything else opens the session.
    onHover: (s: Session | null) => { hovered.current = s; },
    onOpen: (s: Session) => (s.fixedBlock ? (isManager && setSettingsFor(s.programId)) : setEditing({ session: s })),
  };
  // Search: names of the session, people, room, groups and participants; what does not match fades.
  const needle = query.trim().toLowerCase();
  const matches = (s: Session) => [s.workshopName, s.note, roomOf(s.locationId), ...s.staffIds.map(nameOf), groupsOf(s.groupIds), ...(s.fixedBlock || !s.hasParticipants ? [] : firstNames(participantsOf(s, workshopById.get(s.workshopId), patients)))]
    .some(v => !!v && v.toLowerCase().includes(needle));
  const hits = needle ? sessions.filter(matches).length : 0;
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
    onDrop: async (s, to, copy) => {
      try {
        if (copy) {
          // Ctrl/Alt + drag: a copy at the new place (a one-off session of the same workshop), the original stays.
          const ref = doc(collection(db, "session_changes"));
          await setDoc(ref, {
            workshopId: s.workshopId, slotId: null, originalDate: null, newDate: to.date, newStart: to.start, newEnd: to.end,
            staffIds: s.staffIds, locationId: s.locationId || "", note: s.note || "", kind: s.activity, title: s.workshopName,
            dates: [to.date], published: false, updatedAt: serverTimestamp(), updatedBy: user?.uid || null,
          });
          setToast({ text: `${s.workshopName} הועתק ל-${to.date !== s.date ? `${shortDate(to.date)} ` : ""}${to.start}–${to.end}`, undo: async () => { await deleteDoc(ref); load(); } });
          load();
          return;
        }
        // Sideways within the day: remember the side for the whole workshop (sessions run in parallel stay where you put them).
        const { lane, ...when } = to;
        const prevHint = workshopById.get(s.workshopId)?.laneHint;
        if (lane !== undefined) await updateDoc(doc(db, "workshops", s.workshopId), { laneHint: lane });
        const moved = when.date !== s.date || when.start !== s.start || when.end !== s.end;
        const undoMove = moved ? await moveSession(s, when, user?.uid) : null;
        const undo = async () => {
          await undoMove?.();
          if (lane !== undefined) await updateDoc(doc(db, "workshops", s.workshopId), { laneHint: prevHint ?? deleteField() });
        };
        setToast({ text: moved ? `${s.workshopName} עודכן ל-${to.date !== s.date ? `${shortDate(to.date)} ` : ""}${to.start}–${to.end}` : `${s.workshopName} הועבר לצד אחר ביומן`, undo: async () => { await undo(); load(); } });
        load();
      } catch { setToast({ text: "השינוי לא נשמר. נסה שוב." }); }
    },
  } : undefined;
  const addFor = (date: string, programId?: string) => (isManager && mode === "program" ? (start?: string) => setCreating({ date, programId, start }) : undefined);
  const laneGroups = onlyProgram && !groupSel[0] ? refs.groups.filter(g => g.programId === onlyProgram) : [];
  const weekLanes: "groups" | "stable" = (() => {
    const p = programOf(onlyProgram || "");
    if (!p || laneGroups.length < 2) return "stable";
    return p.laneMode !== "auto" || groupsRunInParallel(sessions) ? "groups" : "stable";
  })();
  // Several programs on screen: one fixed lane per program, the same on every day, in the program's own colour.
  const frameList = mode === "program" && programSel.length !== 1 && shownPrograms.length >= 2 && shownPrograms.length <= 4 ? shownPrograms : [];
  const frames = frameList.length ? {
    labels: frameList.map(p => p.name), hues: frameList.map(p => programHue(p)),
    frameOf: (s: Session) => { const i = frameList.findIndex(p => p.id === s.programId); return i < 0 ? [] : [i]; },
  } : undefined;
  const columns: Column[] = view === "week"
    ? days.map(d => {
        const date = dates[d];
        const sub = closedFor(onlyProgram || null, date);
        return {
          id: date, date, today: date === today, sessions: sessions.filter(s => s.date === date), laneMode: frames ? "frames" as const : weekLanes, groupIds: laneGroups.map(g => g.id), frames,
          showGroups: !frames && weekLanes === "stable" && !groupSel[0],
          header: <span className="flex flex-col items-center leading-none" aria-label={`יום ${DAY_FULL[dayOf(date)]} ${shortDate(date)}`}><span className="text-xs font-medium text-[var(--cal-muted)]">{DAY_FULL[dayOf(date)]}</span><span className={`mt-1 inline-flex items-center justify-center min-w-8 h-8 px-1 rounded-full text-xl font-bold tabular-nums ${date === today ? "bg-[var(--accent)] text-white" : ""}`}>{format(new Date(`${date}T12:00:00`), "d")}</span><span className="mt-0.5 text-[11px] text-[var(--cal-faint)] tabular-nums">{format(new Date(`${date}T12:00:00`), "MMM", { locale: he })}</span></span>,
          sub, onAdd: addFor(date, onlyProgram),
        };
      })
    : rows.map(row => ({
        id: row.id, sessions: sessions.filter(s => s.date === selectedDay && row.match(s)), laneMode: "stable" as const,
        today: selectedDay === today, header: <span className="block truncate text-sm font-bold pb-0.5" title={row.label}>{row.label}</span>,
        sub: row.closedReason(selectedDay), onAdd: addFor(selectedDay, row.id.split(":")[0]),
      }));
  const currentProgram = onlyProgram ? programOf(onlyProgram) : undefined;
  const dayLabel = `${DAY_FULL[dayOf(selectedDay)]} ${shortDate(selectedDay)}`;
  const dayUrl = `/schedule/day?date=${selectedDay}${onlyProgram ? `&program=${onlyProgram}` : ""}${groupSel[0] ? `&group=${groupSel[0]}` : ""}`;
  const activeWorkshops = workshops.filter(w => w.status === "active");

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <style>{`@media print { aside, nav, .no-print { display: none !important; } @page { size: A4 landscape; margin: 10mm; } body { background: #fff !important; } }`}</style>
      <div dir="rtl" style={LIGHT_VARS} className="min-h-screen bg-white text-[var(--foreground)] pb-24 md:pb-8">
        <header className="no-print sticky top-0 z-30 bg-white border-b border-[var(--cal-frame)]">
          <div className="px-3 md:px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* 1. What am I looking at: program, then its group. */}
            <ProgramPicker programs={refs.programs} selected={programSel} onChange={setPrograms} />
            {groupOptions.length > 1 && (
              <select value={groupSel[0] || ""} onChange={e => pickGroup(e.target.value)} aria-label="קבוצה"
                className="hidden md:block text-sm bg-transparent border border-[var(--cal-frame)] rounded-lg px-2.5 h-8 max-w-[10rem] focus:border-[var(--accent)] outline-none">
                <option value="">כל הקבוצות</option>
                {groupOptions.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            )}

            {/* 2. When: one control, steps by week or by day. */}
            <div className="flex items-center mx-auto">
              <button onClick={() => step(-1)} aria-label="הקודם" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--foreground)]/5"><ChevronRight className="w-4 h-4" /></button>
              {/* Separate spans: a single string gets its parts reordered by the RTL bidi algorithm. */}
              <span className="relative">
                <button onClick={() => setJumpOpen(o => !o)} aria-label="קפיצה לתאריך" aria-expanded={jumpOpen}
                  className="flex items-center gap-1 text-base font-bold tabular-nums min-w-[9rem] justify-center h-8 rounded-lg hover:bg-[var(--foreground)]/5">
                  {view === "day" ? <span>{dayLabel}</span> : <><span>{format(weekStart, "d.M")}</span><span className="text-[var(--foreground)]/40">–</span><span>{format(addDays(weekStart, 6), "d.M")}</span></>}
                </button>
                {jumpOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setJumpOpen(false)} />
                    <div className="absolute top-full mt-1 start-1/2 -translate-x-1/2 z-50"><MiniCalendar value={selectedDay} range={view === "day" ? "day" : "week"} onPick={iso => { jumpTo(parseISO(iso)); setJumpOpen(false); }} /></div>
                  </>
                )}
              </span>
              <button onClick={() => step(1)} aria-label="הבא" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--foreground)]/5"><ChevronLeft className="w-4 h-4" /></button>
            </div>
            {searching ? (
              <div className="flex items-center gap-1.5">
                <input ref={searchRef} autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש: שם, מדריך, מרחב, משתתף" aria-label="חיפוש ביומן"
                  onKeyDown={e => { if (e.key === "Escape") { setQuery(""); setSearching(false); } }}
                  className="text-sm border border-[var(--cal-frame)] rounded-lg px-2.5 h-8 w-52 focus:border-[var(--accent)] outline-none" />
                {needle && <span className="text-xs text-[var(--cal-muted)] tabular-nums">{hits} תוצאות</span>}
                <button onClick={() => { setQuery(""); setSearching(false); }} aria-label="סגור חיפוש" className="w-8 h-8 rounded-lg hover:bg-[var(--foreground)]/5">✕</button>
              </div>
            ) : <button onClick={() => setSearching(true)} aria-label="חיפוש" title="חיפוש (/)" className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--cal-frame)] hover:bg-[var(--foreground)]/5"><Search className="w-4 h-4" /></button>}
            {!atCurrent && <button onClick={goToday} className="text-sm px-3 h-8 rounded-lg border border-[var(--cal-frame)] hover:bg-[var(--foreground)]/5">היום</button>}

            {/* 3. How: view and actions. */}
            <div className="flex items-center gap-1.5 md:relative">
              <div className="flex border border-[var(--cal-frame)] rounded-lg overflow-hidden" role="group" aria-label="תצוגה">
                {VIEWS.map(([k, l]) => (
                  <button key={k} onClick={() => { if (k === "day") setSelectedDay(selectedDay); setView(k); }} aria-pressed={view === k}
                    className={`px-3 h-8 text-sm ${view === k ? "bg-[var(--accent)] text-white font-bold" : "text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/5"}`}>{l}</button>
                ))}
              </div>
              {isManager && (
                <button onClick={() => setCreating({ date: view === "day" ? selectedDay : dates.includes(today) ? today : dates[0], programId: onlyProgram })}
                  aria-label="אירוע חדש" className={`${btnPrimary} flex items-center gap-1.5 !px-3 !py-0 h-8`}>
                  <Plus className="w-4 h-4" /><span className="hidden sm:inline">אירוע</span>
                </button>
              )}
              <button onClick={() => setMenuOpen(o => !o)} aria-label="עוד פעולות" aria-expanded={menuOpen} className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--cal-frame)] hover:bg-[var(--foreground)]/5"><MoreHorizontal className="w-4 h-4" /></button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <ul className="absolute inset-x-3 md:inset-x-auto md:left-0 top-full mt-1 z-50 md:w-60 bg-white border border-[var(--border)] rounded-xl md:rounded-md shadow-lg py-1 text-sm max-h-[calc(100dvh-9rem)] overflow-y-auto">
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
                      <li><button className="w-full text-right px-3 py-2 hover:bg-[var(--foreground)]/5" onClick={() => { setMenuOpen(false); setShowCopy(true); }}>העתקת לוז…</button></li>
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
          <div className="no-print px-3 md:px-4 pt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="מקרא">
            {legend.map(l => (
              <button key={l.key} onClick={() => setFocus(f => (f === l.key ? null : l.key))} aria-pressed={focus === l.key}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border transition-colors ${focus === l.key ? "border-[var(--foreground)]/40 bg-[var(--foreground)]/5" : "border-transparent hover:bg-[var(--foreground)]/5 text-[var(--foreground)]/70"}`}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: hueStyle(l.hue).bar }} aria-hidden />{l.label}
              </button>
            ))}
          </div>
        )}

        {weekChanges.length > 0 && (
          <div className="no-print px-3 md:px-4 pt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <button onClick={() => setShowChanges(true)} className="px-2.5 py-0.5 rounded-full bg-[var(--cal-ink)]/[0.06] font-semibold">שינויים השבוע ({weekChanges.length})</button>
            {isManager && unpublished.length > 0 && (
              <>
                <span className="text-[var(--foreground)]/60 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{unpublished.length} טרם פורסמו לצוות</span>
                <button onClick={openPublish} className={`${btnPrimary} mr-auto !py-1`}>פרסם ועדכן צוות…</button>
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
          <div className="md:px-4 md:pt-3 md:pb-6">
            <TimeGrid {...common} columns={columns} mode={mode} groupName={groupName} laneMin={view === "day" ? 8.5 : 6.5} drag={dragApi} laneHints={laneHints} corner={view === "week" ? `שבוע ${getWeek(weekStart, { weekStartsOn: 0 })}` : undefined} />
            <DayAgenda {...common} dates={dates} days={days} rows={rows} mode={mode} today={today} globalClosure={globalClosure}
              selected={selectedDay} setSelected={setSelectedDay} canEdit={isManager}
              groupChips={groupOptions.length > 1 ? groupOptions.map(g => ({ ...g, hue: groupHue(g.id, refs.groups, refs.programs) })) : undefined}
              groupPicked={groupSel[0] || ""} onPickGroup={pickGroup}
              onAdd={date => setCreating({ date, programId: onlyProgram })} />
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
            onDuplicate={s => { setEditing(null); setCreating({ date: s.date, programId: s.programId, prefill: { name: s.workshopName, kind: s.activity, groupIds: s.groupIds, start: s.start, end: s.end, locationId: s.locationId, staffIds: s.staffIds } }); }}
            onSaved={undo => { setEditing(null); if (undo) setToast({ text: "השינוי נשמר", undo: async () => { await undo(); load(); } }); load(); }}
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
          <ProgramScheduleSettings program={programOf(settingsFor)!} groups={refs.groups} locations={refs.locations} types={types} onClose={() => setSettingsFor(null)} onSaved={() => { setSettingsFor(null); load(); }} />
        )}
        {showShift && (
          <DayShiftDialog date={selectedDay} userId={user?.uid} scopeLabel={currentProgram ? currentProgram.name : "כל התוכניות"}
            sessions={sessions} onClose={() => setShowShift(false)} onSaved={undo => { setShowShift(false); if (undo) setToast({ text: "המפגשים נדחו", undo: async () => { await undo(); load(); } }); load(); }} />
        )}
        {preview && (
          <Dialog title="פרסום שינויים לצוות" subtitle={`${preview.lines.size} אנשי צוות יקבלו הודעה. אפשר להשמיט אנשים מהשליחה.`} onClose={() => setPreview(null)}
            footer={<><button onClick={publish} disabled={publishing} className={btnPrimary}>שלח ופרסם</button><button onClick={() => setPreview(null)} className={btnGhost}>ביטול</button></>}>
            <ul className="divide-y divide-[var(--border)] text-sm">
              {[...preview.lines].map(([uid, l]) => (
                <li key={uid} className="py-2">
                  <label className="flex items-center gap-2 font-bold cursor-pointer"><input type="checkbox" checked={!preview.skip.has(uid)} onChange={() => setPreview(p => { if (!p) return p; const skip = new Set(p.skip); if (skip.has(uid)) skip.delete(uid); else skip.add(uid); return { ...p, skip }; })} />{nameOf(uid)}</label>
                  <ul className="mt-1 ps-6 text-xs text-[var(--foreground)]/65 space-y-0.5">{l.map(x => <li key={x}>{x}</li>)}</ul>
                </li>
              ))}
              {preview.lines.size === 0 && <li className="py-2 text-[var(--foreground)]/55">אין אנשי צוות מושפעים. השינויים יסומנו כמפורסמים בלי הודעות.</li>}
            </ul>
          </Dialog>
        )}
        {showHelp && (
          <Dialog title="קיצורי מקלדת" onClose={() => setShowHelp(false)}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {([["→ / ←", "הקודם / הבא"], ["T", "היום"], ["D / W", "תצוגת יום / שבוע"], ["/", "חיפוש"], ["N", "אירוע חדש"], ["Ctrl+C / Ctrl+V", "העתקת מפגש (מעל כרטיס) והדבקה"], ["Ctrl + גרירה", "העתקה בגרירה"], ["Esc", "סגירה"], ["?", "חלון זה"]] as const).map(([k, v]) => (
                <div key={k} className="contents"><dt><kbd dir="ltr" className="px-1.5 py-0.5 rounded bg-[var(--btn-soft)] text-xs font-semibold">{k}</kbd></dt><dd>{v}</dd></div>
              ))}
            </dl>
          </Dialog>
        )}
        {showCopy && (
          <CopyScheduleDialog refs={refs} workshops={workshops} sessions={all} dates={dates} selectedDay={selectedDay} programId={onlyProgram} userId={user?.uid}
            onClose={() => setShowCopy(false)} onDone={(text, undo) => { setToast({ text, undo: async () => { await undo(); load(); } }); load(); }} />
        )}
        {toast && (
          <div role="status" className="no-print fixed bottom-20 md:bottom-6 inset-x-0 z-[70] mx-auto w-fit max-w-[92vw] flex items-center gap-3 bg-[#2b1e17] text-white text-sm pl-3 pr-4 py-2.5 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
            <span>{toast.text}</span>
            {toast.undo && <button onClick={async () => { await toast.undo!(); setToast(null); }} className="font-bold underline text-[#8fd3b4]">בטל</button>}
          </div>
        )}
        {creating && (
          <NewEventDialog refs={refs} types={types} initial={creating} existing={all}
            busyFor={(id, date, start, end) => absences.some(a => a.userId === id && a.date === date) ? "בהיעדרות" : staffBusyAt(id, date, start, end, all)?.workshopName}
            roomBusy={(loc, date, start, end) => { const o = all.find(x => !x.fixedBlock && x.kind !== "cancelled" && x.kind !== "moved-away" && x.locationId === loc && x.date === date && x.start < end && start < x.end); return o ? `${roomOf(loc)} תפוס ב"${o.workshopName}" (${o.start}–${o.end})` : undefined; }} userId={user?.uid} onClose={() => setCreating(null)}
            onSaved={() => { setCreating(null); load(); }}
            onExisting={() => { setEditing({ session: null, extra: creating }); setCreating(null); }} />
        )}
        {showTypes && <ActivityTypesDialog types={types} programs={refs.programs} onClose={() => setShowTypes(false)} onSaved={() => { setShowTypes(false); load(); }} />}
        {showClosures && <ClosuresDialog dates={dates} refs={refs} onClose={() => setShowClosures(false)} onChanged={load} />}
      </div>
    </RoleGuard>
  );
}

/** Which programs to show side by side: none ticked = all of them. A popover of checkboxes, each in its own colour. */
function ProgramPicker({ programs, selected, onChange }: { programs: Program[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const label = selected.length === 0 ? "כל התוכניות" : selected.length === 1 ? programs.find(p => p.id === selected[0])?.name || "תוכנית" : `${selected.length} תוכניות`;
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="true" aria-label="תוכניות"
        className="text-sm font-bold border border-[var(--cal-frame)] rounded-lg px-2.5 h-8 max-w-[12rem] truncate focus:border-[var(--accent)] outline-none">{label} ▾</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute start-0 top-full mt-1 z-50 w-60 bg-white border border-[var(--border)] rounded-xl shadow-lg py-1 text-sm max-h-[calc(100dvh-9rem)] overflow-y-auto">
            <button className="w-full text-start px-3 py-1.5 hover:bg-[var(--foreground)]/5 font-semibold" onClick={() => { onChange([]); setOpen(false); }}>כל התוכניות</button>
            {programs.map(p => (
              <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[var(--foreground)]/5">
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: hueStyle(programHue(p)).bar }} aria-hidden />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-xs text-[var(--cal-faint)]">{programShort(p)}</span>
                <button type="button" className="text-xs underline text-[var(--cal-muted)]" onClick={e => { e.preventDefault(); onChange([p.id]); setOpen(false); }}>רק זו</button>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ClosuresDialog({ dates, refs, onClose, onChanged }: {
  dates: string[]; refs: Refs; onClose: () => void; onChanged: () => void;
}) {
  const [date, setDate] = useState(dates[0]);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [programId, setProgramId] = useState("");
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<Closure[]>([]);
  const refresh = useCallback(async () => {
    const snap = await getDocs(query(collection(db, "closures"), where("date", ">=", toISO(new Date()))));
    setList(snap.docs.map(d => ({ id: d.id, ...d.data() } as Closure)).sort((a, b) => a.date.localeCompare(b.date)));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the list once when the dialog opens
  useEffect(() => { refresh(); }, [refresh]);
  const last = until && until >= date ? until : date;
  const days = rangeDates(date, last);
  const wanted = programId ? [programId] : [];
  const taken = (d: string) => list.some(c => c.date === d && c.programIds.join() === wanted.join());
  const fresh = days.filter(d => !taken(d));
  const add = async () => {
    if (saving || !fresh.length) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      fresh.forEach(d => batch.set(doc(collection(db, "closures")), { date: d, reason: reason.trim() || "אין פעילות", programIds: wanted }));
      await batch.commit();
      setReason(""); setUntil(""); await refresh(); onChanged();
    } finally { setSaving(false); }
  };
  const remove = async (id: string) => { await deleteDoc(doc(db, "closures", id)); await refresh(); onChanged(); };
  return (
    <Dialog title="ימים ללא פעילות" onClose={onClose}>
      <p className="text-xs text-[var(--foreground)]/60">חגים, אירועים מוסדיים וכד׳. מפגשים שנופלים על היום הזה לא יופיעו ביומן. מוצגים הימים מהיום והלאה.</p>
      <ul className="divide-y divide-[var(--border)] text-sm max-h-56 overflow-y-auto">
        {list.map(c => (
          <li key={c.id} className="py-2 flex items-center gap-2">
            <span className="tabular-nums">{shortDate(c.date)}</span>
            <span className="flex-1">{c.reason}{c.programIds.length ? ` · ${refs.programs.find(p => p.id === c.programIds[0])?.name}` : " · כל התוכניות"}</span>
            <button onClick={() => remove(c.id)} className="text-xs text-rose-500 underline">הסר</button>
          </li>
        ))}
        {list.length === 0 && <li className="py-2 text-[var(--foreground)]/50">אין ימים כאלה קדימה.</li>}
      </ul>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        <div><label className={labelCls}>מתאריך</label><input type="date" className={fieldCls} value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><label className={labelCls}>עד תאריך (לחג של כמה ימים, לא חובה)</label><input type="date" className={fieldCls} value={until} min={date} onChange={e => setUntil(e.target.value)} /></div>
        <div><label className={labelCls}>תוכנית</label>
          <select className={fieldCls} value={programId} onChange={e => setProgramId(e.target.value)}>
            <option value="">כל התוכניות</option>{refs.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div><label className={labelCls}>סיבה</label><input className={fieldCls} value={reason} placeholder="סוכות, יום כיף…" onChange={e => setReason(e.target.value)} /></div>
      </div>
      {days.length > 1 && <p className="text-xs text-[var(--foreground)]/60">{fresh.length} ימים יתווספו{fresh.length < days.length ? ` (${days.length - fresh.length} כבר סגורים)` : ""}.</p>}
      {days.length === 1 && !fresh.length && <p className="text-xs text-[#8a5a00]">היום הזה כבר סגור.</p>}
      <button onClick={add} disabled={!date || saving || !fresh.length} className={btnPrimary}>הוסף</button>
    </Dialog>
  );
}
