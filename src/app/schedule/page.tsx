"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { addDoc, collection, deleteDoc, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { ChevronLeft, ChevronRight, Plus, Printer } from "lucide-react";
import { addDays, format } from "date-fns";
import Link from "next/link";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "@/components/workshops/Dialog";
import { SessionEditor } from "@/components/workshops/SessionEditor";
import { SeriesDays } from "@/components/workshops/SeriesDays";
import { DayAgenda, Row, WeekGrid } from "@/components/workshops/WeekView";
import { AbsenceLite, findConflicts } from "@/lib/workshops/conflicts";
import { buildSessions } from "@/lib/workshops/buildWeek";
import { loadAbsences, loadRefs, notifyStaff, Refs } from "@/lib/workshops/data";
import { toISO, weekDates, weekStartOf, shortDate, dayOf } from "@/lib/workshops/dates";
import { Closure, DAY_SHORT, Session, SessionChange, Workshop } from "@/lib/workshops/types";

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
  const [mode, setMode] = useState<Mode>("program");
  const [onlyMine, setOnlyMine] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");
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
    if (groupFilter) {
      const g = refs?.groups.find(x => x.id === groupFilter);
      // A group sees its own sessions plus whole-program ones for its program.
      list = list.filter(s => s.groupIds.includes(groupFilter) || (s.groupIds.length === 0 && s.programId === g?.programId));
    }
    return list;
  }, [all, onlyMine, user, groupFilter, refs]);
  const warnings = useMemo(() => refs ? findConflicts(all, refs.programs, absences, nameOf, id => roomOf(id) || "המרחב") : new Map<string, string[]>(), [all, refs, absences, nameOf, roomOf]);

  const closedFor = useCallback((programId: string | null, date: string) => {
    const c = closures.find(x => x.date === date && (x.programIds.length === 0 || (programId && x.programIds.includes(programId))));
    return c?.reason || (c ? "אין פעילות" : undefined);
  }, [closures]);

  const rows: Row[] = useMemo(() => {
    if (!refs) return [];
    if (mode === "program") {
      // One row per program; programs whose workshops are split by group get a row per group.
      const out: Row[] = [];
      for (const p of refs.programs) {
        const ps = sessions.filter(s => s.programId === p.id);
        if (ps.length === 0) continue;
        const closedReason = (d: string) => closedFor(p.id, d) || undefined;
        const groupIds = [...new Set(ps.flatMap(s => s.groupIds))];
        if (groupIds.length === 0) {
          out.push({ id: p.id, label: p.name, match: (s: Session) => s.programId === p.id, closedReason });
          continue;
        }
        for (const g of refs.groups.filter(x => groupIds.includes(x.id))) {
          out.push({ id: `${p.id}:${g.id}`, label: `${p.name} · ${g.name}`, match: (s: Session) => s.programId === p.id && s.groupIds.includes(g.id), closedReason });
        }
        if (ps.some(s => s.groupIds.length === 0)) {
          out.push({ id: `${p.id}:all`, label: `${p.name} · כל התוכנית`, match: (s: Session) => s.programId === p.id && s.groupIds.length === 0, closedReason });
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
  }, [refs, mode, sessions, absences, closedFor]);

  // Only show weekdays that matter this week.
  const days = useMemo(() => {
    const set = new Set<number>();
    refs?.programs.forEach(p => { if (sessions.some(s => s.programId === p.id)) p.activeDays.forEach(d => set.add(d)); });
    sessions.forEach(s => set.add(dayOf(s.date)));
    return set.size ? [...set].sort() : [0, 1, 2, 3, 4];
  }, [refs, sessions]);

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
  const common = { sessions, warnings, nameOf, roomOf, groupsOf, onOpen: (s: Session) => setEditing({ session: s }) };
  const activeWorkshops = workshops.filter(w => w.status === "active");

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <style>{`@media print { aside, nav, .no-print { display: none !important; } @page { size: A4 landscape; margin: 10mm; } body { background: #fff !important; } }`}</style>
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pb-24 md:pb-8">
        <header className="no-print border-b border-[var(--border)] px-4 md:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-base font-bold">יומן שבועי</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="שבוע קודם" className="p-1.5 rounded-md hover:bg-[var(--foreground)]/5"><ChevronRight className="w-4 h-4" /></button>
            <span className="text-sm font-bold tabular-nums w-40 text-center">{rangeLabel}</span>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="שבוע הבא" className="p-1.5 rounded-md hover:bg-[var(--foreground)]/5"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setWeekStart(weekStartOf(new Date()))} className="text-sm px-2 py-1 rounded-md hover:bg-[var(--foreground)]/5">היום</button>
          </div>
          <div className="flex border border-[var(--border)] rounded-md overflow-hidden">
            {MODES.map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} className={`px-3 py-1.5 text-sm ${mode === k ? "bg-[var(--accent)] text-white font-bold" : "text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/5"}`}>{l}</button>
            ))}
          </div>
          <select aria-label="סינון לפי קבוצה" className="border border-[var(--border)] rounded-md bg-transparent px-2 py-1.5 text-sm" value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
            <option value="">כל הקבוצות</option>
            {refs.groups.map(g => <option key={g.id} value={g.id}>{refs.programs.find(p => p.id === g.programId)?.name} · {g.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-[var(--foreground)]/70">
            <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} /> רק המפגשים שלי
          </label>
          <div className="mr-auto flex items-center gap-2">
            {isManager && <>
              <button onClick={() => setEditing({ session: null, extra: { date: dates.includes(today) ? today : dates[0] } })} className={`${btnGhost} flex items-center gap-1.5`}><Plus className="w-4 h-4" /> מפגש חד-פעמי</button>
              <button onClick={() => setSeries({})} className={btnGhost}>ימי פעילות קבועים</button>
              <button onClick={() => setShowClosures(true)} className={btnGhost}>ימים ללא פעילות</button>
              <Link href="/admin/workshops" className={btnGhost}>סדנאות</Link>
              <Link href="/admin/spaces" className={btnGhost}>מרחבים</Link>
            </>}
            <button onClick={() => window.print()} aria-label="הדפסה" className={btnGhost}><Printer className="w-4 h-4" /></button>
          </div>
        </header>

        {weekChanges.length > 0 && (
          <div className="no-print px-4 md:px-6 py-2 border-b border-[var(--border)] flex items-center gap-3 text-sm bg-amber-500/5">
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
            {workshops.length === 0 ? <>אין סדנאות מוגדרות. {isManager && <Link href="/admin/workshops" className="underline">הגדר סדנה ראשונה</Link>}</> : "אין מפגשים בשבוע זה."}
          </p>
        ) : (
          <div className="md:px-6 md:pt-4">
            <WeekGrid {...common} dates={dates} days={days} rows={rows} mode={mode} today={today} globalClosure={globalClosure}
              canEdit={isManager} onAdd={(date, rowId) => setEditing({ session: null, extra: { date, programId: rowId.split(":")[0] } })} />
            <DayAgenda {...common} dates={dates} days={days} rows={rows} mode={mode} today={today} globalClosure={globalClosure}
              selected={selectedDay} setSelected={setSelectedDay} />
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
