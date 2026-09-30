"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { addDoc, collection, deleteDoc, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { addDays, format } from "date-fns";
import Link from "next/link";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { Dialog, fieldCls, labelCls, btnPrimary } from "@/components/workshops/Dialog";
import { SessionEditor } from "@/components/workshops/SessionEditor";
import { SeriesDays } from "@/components/workshops/SeriesDays";
import { DayAgenda, Row, WeekGrid } from "@/components/workshops/WeekView";
import { AbsenceLite, findConflicts } from "@/lib/workshops/conflicts";
import { buildSessions } from "@/lib/workshops/buildWeek";
import { loadAbsences, loadRefs, notifyStaff, Refs } from "@/lib/workshops/data";
import { toISO, weekDates, weekStartOf, shortDate, dayOf } from "@/lib/workshops/dates";
import { Closure, DAY_SHORT, Session, SessionChange, Workshop } from "@/lib/workshops/types";

// The calendar is always shown on white, whatever the app theme is.
const LIGHT_VARS = {
  "--background": "#ffffff", "--card-bg": "#ffffff", "--foreground": "#1f2937",
  "--border": "#E5E7E0", "--border-subtle": "#EEF0E9", "--accent": "#5f7332", "--accent-soft": "rgba(95,115,50,0.07)",
} as React.CSSProperties;

// Filter choices are remembered per browser (best effort — storage can be unavailable).
const readSaved = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(`schedule.${key}`); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const save = (key: string, value: unknown) => { try { localStorage.setItem(`schedule.${key}`, JSON.stringify(value)); } catch { /* ignore */ } };

type Mode = "program" | "staff" | "space";
const MODES: [Mode, string][] = [["program", "תוכניות"], ["staff", "אנשי צוות"], ["space", "מרחבים"]];

export default function SchedulePage() {
  const { user, isManager } = useAuth();
  const today = toISO(new Date());
  const [weekStart, setWeekStart] = useState(weekStartOf(new Date()));
  const [refs, setRefs] = useState<Refs | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [changes, setChanges] = useState<SessionChange[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [absences, setAbsences] = useState<AbsenceLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>(() => readSaved<Mode>("mode", "program"));
  const [onlyMine, setOnlyMine] = useState(false);
  const [programSel, setProgramSel] = useState<string[]>(() => readSaved<string[]>("programs", []));
  const [groupSel, setGroupSel] = useState<string[]>(() => readSaved<string[]>("groups", []));
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { save("mode", mode); save("programs", programSel); save("groups", groupSel); }, [mode, programSel, groupSel]);
  const [pickedDay, setSelectedDay] = useState(today);
  const [editing, setEditing] = useState<{ session: Session | null; extra?: { date: string; programId?: string } } | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [showClosures, setShowClosures] = useState(false);
  const [series, setSeries] = useState<{ id?: string } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  const load = useCallback(async () => {
    const [r, wSnap, chSnap, clSnap, abs] = await Promise.all([
      loadRefs(),
      getDocs(query(collection(db, "workshops"), where("endDate", ">=", dates[0]))),
      getDocs(query(collection(db, "session_changes"), where("dates", "array-contains-any", dates))),
      getDocs(query(collection(db, "closures"), where("date", ">=", dates[0]), where("date", "<=", dates[6]))),
      loadAbsences(dates).catch(() => []),
    ]);
    setRefs(r);
    // Saved filter picks may point at programs/groups that no longer exist.
    setProgramSel(sel => sel.filter(id => r.programs.some(p => p.id === id)));
    setGroupSel(sel => sel.filter(id => r.groups.some(g => g.id === id)));
    setWorkshops(wSnap.docs.map(d => ({ id: d.id, ...d.data() } as Workshop)).filter(w => w.startDate <= dates[6]));
    setChanges(chSnap.docs.map(d => ({ id: d.id, ...d.data() } as SessionChange)));
    setClosures(clSnap.docs.map(d => ({ id: d.id, ...d.data() } as Closure)));
    setAbsences(abs);
    setLoading(false);
  }, [dates]);
  useEffect(() => { load(); }, [load]);

  // Mobile day selection: fall back to today / first day when the picked day is outside this week.
  const selectedDay = dates.includes(pickedDay) ? pickedDay : dates.includes(today) ? today : dates[0];

  const nameOf = useCallback((id: string) => refs?.staff.find(s => s.id === id)?.name || "—", [refs]);
  const roomOf = useCallback((id?: string) => refs?.locations.find(l => l.id === id)?.name, [refs]);

  const all = useMemo(() => refs ? buildSessions(dates, workshops, refs.programs, changes, closures) : [], [dates, workshops, refs, changes, closures]);
  const groupName = useCallback((id: string) => refs?.groups.find(g => g.id === id)?.name || "", [refs]);
  const groupsOf = useCallback((ids: string[]) => ids.map(groupName).filter(Boolean).join(", "), [groupName]);
  const sessions = useMemo(() => {
    let list = all;
    if (onlyMine && user) list = list.filter(s => s.staffIds.includes(user.uid));
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
  }, [all, onlyMine, user, programSel, groupSel, refs]);

  const groupOptions = useMemo(
    () => (refs && programSel.length ? refs.groups.filter(g => programSel.includes(g.programId)).map(g => ({ id: g.id, label: g.name })) : []),
    [refs, programSel]
  );
  const toggleProgram = (id: string) => {
    const next = programSel.includes(id) ? programSel.filter(x => x !== id) : [...programSel, id];
    setProgramSel(next);
    // Drop group picks that belong to a program that is no longer selected.
    setGroupSel(gs => gs.filter(gid => refs?.groups.find(g => g.id === gid && next.includes(g.programId))));
  };
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
            match: (s: Session) => s.programId === p.id && (s.groupIds.includes(g.id) || (chosen.length > 0 && s.groupIds.length === 0)),
          });
        }
        if (!chosen.length && sessions.some(s => s.programId === p.id && s.groupIds.length === 0)) {
          out.push({ id: `${p.id}:all`, label: `${p.name} · כל התוכנית`, closedReason, match: (s: Session) => s.programId === p.id && s.groupIds.length === 0 });
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

  const rangeLabel = `${format(weekStart, "d.M")} – ${format(addDays(weekStart, 6), "d.M.yyyy")}`;
  const common = { sessions, warnings, nameOf, roomOf, groupsOf, showGroups: programSel.length === 0, onOpen: (s: Session) => setEditing({ session: s }) };
  const activeWorkshops = workshops.filter(w => w.status === "active");

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <style>{`@media print { aside, nav, .no-print { display: none !important; } @page { size: A4 landscape; margin: 10mm; } body { background: #fff !important; } }`}</style>
      <div dir="rtl" style={LIGHT_VARS} className="min-h-screen bg-white text-[var(--foreground)] pb-24 md:pb-8">
        <header className="no-print sticky top-0 z-30 bg-white border-b border-[var(--border)]">
          <div className="px-3 md:px-6 py-2.5 flex items-center gap-2">
            <h1 className="text-base font-bold hidden sm:block ml-2">יומן שבועי</h1>
            <div className="flex items-center">
              <button onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="שבוע קודם" className="p-2 rounded-md hover:bg-[var(--foreground)]/5"><ChevronRight className="w-4 h-4" /></button>
              <span className="text-sm font-bold tabular-nums min-w-[8.5rem] text-center">{rangeLabel}</span>
              <button onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="שבוע הבא" className="p-2 rounded-md hover:bg-[var(--foreground)]/5"><ChevronLeft className="w-4 h-4" /></button>
            </div>
            <button onClick={() => setWeekStart(weekStartOf(new Date()))} className="text-sm px-2.5 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--foreground)]/5">היום</button>
            <div className="mr-auto flex items-center gap-1.5 relative">
              {isManager && (
                <button onClick={() => setEditing({ session: null, extra: { date: dates.includes(today) ? today : dates[0], programId: programSel.length === 1 ? programSel[0] : undefined } })}
                  aria-label="מפגש חד-פעמי" className={`${btnPrimary} flex items-center gap-1.5 !px-2.5 sm:!px-3.5`}>
                  <Plus className="w-4 h-4" /><span className="hidden sm:inline">מפגש חד-פעמי</span>
                </button>
              )}
              <button onClick={() => setMenuOpen(o => !o)} aria-label="עוד פעולות" aria-expanded={menuOpen} className="p-2 rounded-md border border-[var(--border)] hover:bg-[var(--foreground)]/5"><MoreHorizontal className="w-4 h-4" /></button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <ul className="absolute left-0 top-full mt-1 z-50 w-56 bg-white border border-[var(--border)] rounded-md shadow-md py-1 text-sm">
                    {isManager && <>
                      <li><button className="w-full text-right px-3 py-2 hover:bg-[var(--foreground)]/5" onClick={() => { setMenuOpen(false); setSeries({}); }}>ימי פעילות קבועים</button></li>
                      <li><button className="w-full text-right px-3 py-2 hover:bg-[var(--foreground)]/5" onClick={() => { setMenuOpen(false); setShowClosures(true); }}>ימים ללא פעילות</button></li>
                      <li><Link className="block px-3 py-2 hover:bg-[var(--foreground)]/5" href="/admin/workshops">ניהול סדנאות</Link></li>
                      <li><Link className="block px-3 py-2 hover:bg-[var(--foreground)]/5" href="/admin/spaces">ניהול מרחבים</Link></li>
                    </>}
                    <li><button className="w-full text-right px-3 py-2 hover:bg-[var(--foreground)]/5" onClick={() => { setMenuOpen(false); window.print(); }}>הדפסה</button></li>
                  </ul>
                </>
              )}
            </div>
          </div>

          <div className="px-3 md:px-6 pb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex border border-[var(--border)] rounded-md overflow-hidden">
              {MODES.map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)} className={`px-3 py-1.5 text-sm ${mode === k ? "bg-[var(--accent)] text-white font-bold" : "text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/5"}`}>{l}</button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-sm text-[var(--foreground)]/70">
              <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} /> רק המפגשים שלי
            </label>
            {(programSel.length > 0 || groupSel.length > 0) && (
              <button onClick={() => { setProgramSel([]); setGroupSel([]); }} className="text-sm underline text-[var(--foreground)]/60">נקה סינון</button>
            )}
          </div>

          <ChipRow label="תוכנית" allLabel="כל התוכניות" selected={programSel} onClear={() => { setProgramSel([]); setGroupSel([]); }}
            options={refs.programs.map(p => ({ id: p.id, label: p.name }))} onToggle={toggleProgram} />
          {groupOptions.length > 0 && (
            <ChipRow label="קבוצה" allLabel="כל הקבוצות" selected={groupSel} onClear={() => setGroupSel([])}
              options={groupOptions} onToggle={id => setGroupSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])} />
          )}
        </header>

        {weekChanges.length > 0 && (
          <div className="no-print px-3 md:px-6 py-2 border-b border-[var(--border)] flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm bg-amber-500/5">
            <button onClick={() => setShowChanges(true)} className="font-bold underline">שינויים השבוע ({weekChanges.length})</button>
            {isManager && unpublished.length > 0 && (
              <>
                <span className="text-[var(--foreground)]/60">{unpublished.length} טרם פורסמו לצוות</span>
                <button onClick={publish} disabled={publishing} className={`${btnPrimary} mr-auto !py-1`}>פרסם ועדכן צוות</button>
              </>
            )}
          </div>
        )}

        <p className="hidden print:block px-2 py-2 font-bold">יומן שבועי — {rangeLabel}</p>

        {rows.length === 0 ? (
          <p className="text-sm text-[var(--foreground)]/50 py-20 text-center px-4">
            {mode === "program"
              ? <>אין תוכניות פעילות. {isManager && <Link href="/admin/programs" className="underline">הגדר תוכנית</Link>}</>
              : "אין מפגשים בשבוע זה."}
          </p>
        ) : (
          <div className="md:px-6 md:pt-4">
            <WeekGrid {...common} dates={dates} days={days} rows={rows} mode={mode} today={today} globalClosure={globalClosure}
              canEdit={isManager} onAdd={(date, rowId) => setEditing({ session: null, extra: { date, programId: rowId.split(":")[0] } })} />
            <DayAgenda {...common} dates={dates} days={days} rows={rows} mode={mode} today={today} globalClosure={globalClosure}
              selected={selectedDay} setSelected={setSelectedDay} canEdit={isManager}
              onAdd={date => setEditing({ session: null, extra: { date, programId: programSel.length === 1 ? programSel[0] : undefined } })} />
          </div>
        )}

        {editing && (
          <SessionEditor
            key={editing.session?.id ?? "new"}
            session={editing.session} extra={editing.extra} workshops={activeWorkshops}
            staff={refs.staff} locations={refs.locations} canEdit={isManager}
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

        {showClosures && <ClosuresDialog dates={dates} closures={closures} refs={refs} onClose={() => setShowClosures(false)} onChanged={load} />}
      </div>
    </RoleGuard>
  );
}

function ChipRow({ label, allLabel, options, selected, onToggle, onClear }: {
  label: string; allLabel: string; options: { id: string; label: string }[]; selected: string[];
  onToggle: (id: string) => void; onClear: () => void;
}) {
  const chip = (on: boolean) =>
    `shrink-0 whitespace-nowrap px-3 py-1 rounded-md text-sm border ${on ? "bg-[var(--accent)] border-[var(--accent)] text-white font-bold" : "border-[var(--border)] text-[var(--foreground)]/75 hover:bg-[var(--foreground)]/5"}`;
  return (
    <div className="px-3 md:px-6 pb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label={label}>
      <span className="shrink-0 text-xs font-bold text-[var(--foreground)]/50 ml-1">{label}</span>
      <button onClick={onClear} className={chip(selected.length === 0)}>{allLabel}</button>
      {options.map(o => <button key={o.id} onClick={() => onToggle(o.id)} aria-pressed={selected.includes(o.id)} className={chip(selected.includes(o.id))}>{o.label}</button>)}
    </div>
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
