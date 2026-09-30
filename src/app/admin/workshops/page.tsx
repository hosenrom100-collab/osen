"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db } from "@/lib/firebase/config";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { Plus, Copy } from "lucide-react";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "@/components/workshops/Dialog";
import { Segmented, SortTh, TypeBadge, WHITE_VARS, nextSort, selectCls, Dir } from "@/components/workshops/ListKit";
import { usePersisted } from "@/lib/usePersisted";
import { ActivityType, DEFAULT_TYPES, loadActivityTypes, pastel, typeById } from "@/lib/workshops/activityTypes";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { loadRefs, Refs } from "@/lib/workshops/data";
import { DAY_SHORT, Workshop } from "@/lib/workshops/types";
import { toISO } from "@/lib/workshops/dates";
import { differenceInCalendarWeeks, parseISO, format } from "date-fns";

type Filter = "current" | "upcoming" | "ended" | "all";
const FILTERS: [Filter, string][] = [["current", "פעילות עכשיו"], ["upcoming", "עתידיות"], ["ended", "הסתיימו"], ["all", "הכול"]];
type SortKey = "name" | "type" | "program" | "start" | "end" | "staff" | "participants";

const fmt = (iso: string) => format(parseISO(iso), "d.M.yy");

export default function WorkshopsPage() {
  const router = useRouter();
  const [refs, setRefs] = useState<Refs | null>(null);
  const [types, setTypes] = useState<ActivityType[]>(DEFAULT_TYPES);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  // Every choice below is remembered in this browser and is the default next time.
  const [filter, setFilter] = usePersisted<Filter>("workshops.filter", "current");
  const [programFilter, setProgramFilter] = usePersisted("workshops.program", "");
  const [typeFilter, setTypeFilter] = usePersisted("workshops.type", "");
  const [sortState, setSortState] = usePersisted<{ sort: SortKey; dir: Dir }>("workshops.sort", { sort: "start", dir: "asc" });
  const [grouped, setGrouped] = usePersisted("workshops.grouped", false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<{ from?: Workshop } | null>(null);

  const load = useCallback(async () => {
    const [r, snap, tps] = await Promise.all([loadRefs(), getDocs(collection(db, "workshops")), loadActivityTypes()]);
    setRefs(r); setTypes(tps);
    setWorkshops(snap.docs.map(d => ({ id: d.id, ...d.data() } as Workshop)));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = toISO(new Date());
  const progName = (id: string) => refs?.programs.find(p => p.id === id)?.name || "ללא תוכנית";
  const staffName = (id: string) => refs?.staff.find(s => s.id === id)?.name || "—";
  const groupNames = (w: Workshop) => (w.groupIds || []).map(id => refs?.groups.find(g => g.id === id)?.name).filter(Boolean).join(", ");
  const typeOf = (w: Workshop) => typeById(types, w.kind);

  const rows = useMemo(() => {
    const list = workshops.filter(w => {
      if (programFilter && w.programId !== programFilter) return false;
      if (typeFilter && (w.kind || "workshop") !== typeFilter) return false;
      if (search && !w.name.includes(search)) return false;
      if (filter === "current") return w.startDate <= today && w.endDate >= today;
      if (filter === "upcoming") return w.startDate > today;
      if (filter === "ended") return w.endDate < today;
      return true;
    });
    const { sort, dir } = sortState;
    const val = (w: Workshop): string | number =>
      sort === "name" ? w.name : sort === "type" ? typeOf(w).label : sort === "program" ? progName(w.programId) :
      sort === "start" ? w.startDate : sort === "end" ? w.endDate : sort === "staff" ? (w.staffIds || []).length : (w.participantIds || []).length;
    const cmp = (a: Workshop, b: Workshop) => {
      const x = val(a), y = val(b);
      const r = typeof x === "number" ? x - (y as number) : String(x).localeCompare(String(y), "he");
      return (dir === "asc" ? r : -r) || a.name.localeCompare(b.name, "he");
    };
    return list.sort(cmp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshops, filter, programFilter, typeFilter, search, today, sortState, types, refs]);

  const grouping = useMemo(() => {
    if (!grouped) return [["", rows]] as [string, Workshop[]][];
    const m = new Map<string, Workshop[]>();
    rows.forEach(w => m.set(w.programId, [...(m.get(w.programId) || []), w]));
    return [...m.entries()].sort((a, b) => progName(a[0]).localeCompare(progName(b[0]), "he"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, grouped, refs]);

  if (loading || !refs) return <PageSkeleton />;
  const onSort = (k: SortKey) => setSortState(cur => nextSort(cur, k));
  const th = { sort: sortState.sort, dir: sortState.dir, onSort };

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div dir="rtl" style={WHITE_VARS} className="min-h-screen bg-white text-[var(--foreground)]">
        <header className="border-b border-[var(--border)] px-4 md:px-6 h-14 flex items-center gap-3">
          <h1 className="text-lg font-bold">סדנאות ופעילויות</h1>
          <span className="text-sm text-[var(--foreground)]/45 tabular-nums">{rows.length}</span>
          <span className="flex-1" />
          <Link href="/admin/spaces" className={btnGhost}>מרחבים</Link>
          <button onClick={() => setCreating({})} className={`${btnPrimary} flex items-center gap-1.5`}>
            <Plus className="w-4 h-4" /> פעילות חדשה
          </button>
        </header>

        <div className="px-4 md:px-6 py-4 space-y-3 max-w-7xl">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="תקופה" value={filter} options={FILTERS} onChange={setFilter} />
            <select className={selectCls} value={programFilter} onChange={e => setProgramFilter(e.target.value)} aria-label="תוכנית">
              <option value="">כל התוכניות</option>
              {refs.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className={selectCls} value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="סוג פעילות">
              <option value="">כל הסוגים</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input className={`${selectCls} w-44`} placeholder="חיפוש לפי שם" value={search} onChange={e => setSearch(e.target.value)} />
            <label className="flex items-center gap-1.5 text-sm text-[var(--foreground)]/65 cursor-pointer mr-auto">
              <input type="checkbox" checked={grouped} onChange={e => setGrouped(e.target.checked)} /> קבץ לפי תוכנית
            </label>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-[var(--foreground)]/50 py-16 text-center border border-[var(--border)] rounded-xl">
              {workshops.length === 0 ? "עדיין לא הוגדרו פעילויות. לחץ על ״פעילות חדשה״ כדי להתחיל." : "אין פעילויות שמתאימות לסינון."}
            </p>
          ) : grouping.map(([pid, list]) => (
            <section key={pid || "all"}>
              {grouped && <h2 className="text-sm font-bold mb-1.5">{progName(pid)} <span className="font-normal text-[var(--foreground)]/45 tabular-nums">{list.length}</span></h2>}
              <div className="overflow-x-auto border border-[var(--border)] rounded-xl bg-white">
                <table className="w-full text-sm min-w-[820px]">
                  <thead className="text-xs text-[var(--foreground)]/55 bg-[var(--foreground)]/[0.03] border-b border-[var(--border)]">
                    <tr>
                      <SortTh k="name" {...th} className="ps-4">שם</SortTh>
                      <SortTh k="type" {...th}>סוג</SortTh>
                      {!grouped && <SortTh k="program" {...th}>תוכנית</SortTh>}
                      <SortTh k="start" {...th}>מתחילה</SortTh>
                      <SortTh k="end" {...th}>מסתיימת</SortTh>
                      <th className="font-semibold text-start">מפגשים</th>
                      <SortTh k="staff" {...th}>מעבירים</SortTh>
                      <SortTh k="participants" {...th}>משתתפים</SortTh>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {list.map(w => {
                      const weeks = differenceInCalendarWeeks(parseISO(w.endDate), parseISO(w.startDate)) + 1;
                      const cur = w.startDate <= today && w.endDate >= today ? `שבוע ${differenceInCalendarWeeks(parseISO(today), parseISO(w.startDate)) + 1}/${weeks}` : "";
                      const t = typeOf(w); const c = pastel(t.hue);
                      return (
                        <tr key={w.id} onClick={() => router.push(`/admin/workshops/${w.id}`)} className={`cursor-pointer hover:bg-[var(--foreground)]/[0.025] ${w.status !== "active" ? "opacity-60" : ""}`}>
                          <td className="py-3 ps-4 pe-2 font-semibold">
                            {w.name}
                            {groupNames(w) && <span className="block font-normal text-xs text-[var(--foreground)]/55">{groupNames(w)}</span>}
                            {w.status !== "active" && <span className="font-normal text-xs text-[var(--foreground)]/50">{w.status === "draft" ? "טיוטה" : "מבוטלת"}</span>}
                          </td>
                          <td className="pe-2"><TypeBadge label={t.label} {...c} /></td>
                          {!grouped && <td className="pe-2 text-[var(--foreground)]/75">{progName(w.programId)}</td>}
                          <td className="tabular-nums whitespace-nowrap pe-2">{fmt(w.startDate)}{cur && <span className="block text-xs text-[var(--accent)] font-semibold">{cur}</span>}</td>
                          <td className="tabular-nums whitespace-nowrap pe-2">{fmt(w.endDate)}</td>
                          <td className="whitespace-nowrap pe-2 text-[var(--foreground)]/75">{(w.slots || []).map(s => `${DAY_SHORT[s.day]} ${s.start}`).join(" · ") || "—"}</td>
                          <td className="pe-2 text-[var(--foreground)]/75 max-w-[14rem] truncate">{(w.staffIds || []).map(staffName).join(", ") || "—"}</td>
                          <td className="tabular-nums pe-2">{(w.participantIds || []).length || "—"}</td>
                          <td className="text-left pe-2">
                            <button onClick={e => { e.stopPropagation(); setCreating({ from: w }); }} aria-label="שכפל" title="שכפל למחזור חדש"
                              className="p-1.5 rounded-md text-[var(--foreground)]/45 hover:bg-[var(--foreground)]/5"><Copy className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>

        {creating && <NewWorkshopDialog refs={refs} types={types} from={creating.from} onClose={() => setCreating(null)}
          onCreated={id => router.push(`/admin/workshops/${id}`)} />}
      </div>
    </RoleGuard>
  );
}

function NewWorkshopDialog({ refs, types, from, onClose, onCreated }: {
  refs: Refs; types: ActivityType[]; from?: Workshop; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [name, setName] = useState(from?.name || "");
  const [programId, setProgramId] = useState(from?.programId || "");
  const [kind, setKind] = useState(from?.kind || "workshop");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = name.trim() && programId && startDate && endDate && endDate >= startDate;

  const create = async () => {
    if (!valid) return;
    setSaving(true);
    const ref = await addDoc(collection(db, "workshops"), {
      name: name.trim(), programId, startDate, endDate, kind,
      groupIds: from?.groupIds || [],
      slots: from?.slots || [],
      staffIds: from?.staffIds || [],
      participantIds: [], // a new cycle starts with a fresh participant list
      notes: from?.notes || "",
      status: "active",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    onCreated(ref.id);
  };

  return (
    <Dialog title={from ? "שכפול פעילות למחזור חדש" : "פעילות חדשה"} onClose={onClose}
      footer={<>
        <button onClick={create} disabled={!valid || saving} className={btnPrimary}>{from ? "שכפל" : "צור והמשך"}</button>
        <button onClick={onClose} className={btnGhost}>ביטול</button>
      </>}>
      <div>
        <label className={labelCls}>שם הסדנה</label>
        <input autoFocus className={fieldCls} value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>סוג פעילות</label>
        <select className={fieldCls} value={kind} onChange={e => setKind(e.target.value)}>
          {types.filter(t => !t.band && (!t.archived || t.id === kind)).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>תוכנית</label>
        <select className={fieldCls} value={programId} onChange={e => setProgramId(e.target.value)}>
          <option value="">בחר תוכנית…</option>
          {refs.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>תאריך התחלה</label>
          <input type="date" className={fieldCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>תאריך סיום</label>
          <input type="date" className={fieldCls} value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>
      {from && <p className="text-xs text-[var(--foreground)]/50">המפגשים והצוות יועתקו. רשימת המשתתפים תתחיל ריקה.</p>}
    </Dialog>
  );
}
