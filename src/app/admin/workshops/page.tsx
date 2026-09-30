"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db } from "@/lib/firebase/config";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { Plus, Copy } from "lucide-react";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "@/components/workshops/Dialog";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { loadRefs, Refs } from "@/lib/workshops/data";
import { DAY_SHORT, Workshop } from "@/lib/workshops/types";
import { toISO } from "@/lib/workshops/dates";
import { differenceInCalendarWeeks, parseISO, format } from "date-fns";

type Filter = "current" | "upcoming" | "ended" | "all";
const FILTERS: [Filter, string][] = [["current", "פעילות עכשיו"], ["upcoming", "עתידיות"], ["ended", "הסתיימו"], ["all", "הכול"]];

const fmt = (iso: string) => format(parseISO(iso), "d.M.yy");

export default function WorkshopsPage() {
  const router = useRouter();
  const [refs, setRefs] = useState<Refs | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("current");
  const [programFilter, setProgramFilter] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<{ from?: Workshop } | null>(null);

  const load = useCallback(async () => {
    const [r, snap] = await Promise.all([loadRefs(), getDocs(collection(db, "workshops"))]);
    setRefs(r);
    setWorkshops(snap.docs.map(d => ({ id: d.id, ...d.data() } as Workshop)));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = toISO(new Date());
  const progName = (id: string) => refs?.programs.find(p => p.id === id)?.name || "ללא תוכנית";
  const staffName = (id: string) => refs?.staff.find(s => s.id === id)?.name || "—";

  const rows = useMemo(() => workshops
    .filter(w => {
      if (programFilter && w.programId !== programFilter) return false;
      if (search && !w.name.includes(search)) return false;
      if (filter === "current") return w.startDate <= today && w.endDate >= today;
      if (filter === "upcoming") return w.startDate > today;
      if (filter === "ended") return w.endDate < today;
      return true;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate)), [workshops, filter, programFilter, search, today]);

  const grouped = useMemo(() => {
    const m = new Map<string, Workshop[]>();
    rows.forEach(w => m.set(w.programId, [...(m.get(w.programId) || []), w]));
    return [...m.entries()];
  }, [rows]);

  if (loading || !refs) return <PageSkeleton />;

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <header className="border-b border-[var(--border)] px-4 md:px-6 h-14 flex items-center gap-3">
          <h1 className="text-base font-bold flex-1">סדנאות</h1>
          <Link href="/admin/spaces" className={btnGhost}>מרחבים</Link>
          <button onClick={() => setCreating({})} className={`${btnPrimary} flex items-center gap-1.5`}>
            <Plus className="w-4 h-4" /> סדנה חדשה
          </button>
        </header>

        <div className="px-4 md:px-6 py-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex border border-[var(--border)] rounded-md overflow-hidden">
              {FILTERS.map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k)}
                  className={`px-3 py-1.5 text-sm ${filter === k ? "bg-[var(--accent)] text-white font-bold" : "text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/5"}`}>
                  {label}
                </button>
              ))}
            </div>
            <select className={`${fieldCls} !w-auto`} value={programFilter} onChange={e => setProgramFilter(e.target.value)}>
              <option value="">כל התוכניות</option>
              {refs.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className={`${fieldCls} !w-44`} placeholder="חיפוש לפי שם" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {grouped.length === 0 ? (
            <p className="text-sm text-[var(--foreground)]/50 py-16 text-center">
              {workshops.length === 0 ? "עדיין לא הוגדרו סדנאות. לחץ על ״סדנה חדשה״ כדי להתחיל." : "אין סדנאות שמתאימות לסינון."}
            </p>
          ) : grouped.map(([pid, list]) => (
            <section key={pid}>
              <h2 className="text-xs font-bold text-[var(--foreground)]/50 mb-1.5">{progName(pid)}</h2>
              <div className="overflow-x-auto border-y border-[var(--border)]">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="text-xs text-[var(--foreground)]/50">
                    <tr className="text-right">
                      <th className="py-2 font-bold">סדנה</th><th className="font-bold">תאריכים</th><th className="font-bold">מפגשים</th>
                      <th className="font-bold">מעבירים</th><th className="font-bold">משתתפים</th><th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {list.map(w => {
                      const weeks = differenceInCalendarWeeks(parseISO(w.endDate), parseISO(w.startDate)) + 1;
                      const cur = w.startDate <= today && w.endDate >= today
                        ? ` · שבוע ${differenceInCalendarWeeks(parseISO(today), parseISO(w.startDate)) + 1}/${weeks}` : "";
                      return (
                        <tr key={w.id} onClick={() => router.push(`/admin/workshops/${w.id}`)} className="cursor-pointer hover:bg-[var(--foreground)]/[0.03]">
                          <td className="py-2.5 font-bold">
                            {w.name}
                            {w.status !== "active" && <span className="font-normal text-xs text-[var(--foreground)]/50"> · {w.status === "draft" ? "טיוטה" : "מבוטלת"}</span>}
                          </td>
                          <td className="tabular-nums whitespace-nowrap">{fmt(w.startDate)} – {fmt(w.endDate)}<span className="text-[var(--foreground)]/50">{cur}</span></td>
                          <td className="whitespace-nowrap">{(w.slots || []).map(s => `${DAY_SHORT[s.day]} ${s.start}`).join(" · ") || "—"}</td>
                          <td>{(w.staffIds || []).map(staffName).join(", ") || "—"}</td>
                          <td className="tabular-nums">{(w.participantIds || []).length}</td>
                          <td className="text-left">
                            <button onClick={e => { e.stopPropagation(); setCreating({ from: w }); }} aria-label="שכפל סדנה" title="שכפל למחזור חדש"
                              className="p-1.5 rounded-md text-[var(--foreground)]/50 hover:bg-[var(--foreground)]/5"><Copy className="w-4 h-4" /></button>
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

        {creating && <NewWorkshopDialog refs={refs} from={creating.from} onClose={() => setCreating(null)}
          onCreated={id => router.push(`/admin/workshops/${id}`)} />}
      </div>
    </RoleGuard>
  );
}

function NewWorkshopDialog({ refs, from, onClose, onCreated }: {
  refs: Refs; from?: Workshop; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [name, setName] = useState(from?.name || "");
  const [programId, setProgramId] = useState(from?.programId || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = name.trim() && programId && startDate && endDate && endDate >= startDate;

  const create = async () => {
    if (!valid) return;
    setSaving(true);
    const ref = await addDoc(collection(db, "workshops"), {
      name: name.trim(), programId, startDate, endDate,
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
    <Dialog title={from ? "שכפול סדנה למחזור חדש" : "סדנה חדשה"} onClose={onClose}
      footer={<>
        <button onClick={create} disabled={!valid || saving} className={btnPrimary}>{from ? "שכפל" : "צור והמשך"}</button>
        <button onClick={onClose} className={btnGhost}>ביטול</button>
      </>}>
      <div>
        <label className={labelCls}>שם הסדנה</label>
        <input autoFocus className={fieldCls} value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>תוכנית</label>
        <select className={fieldCls} value={programId} onChange={e => setProgramId(e.target.value)}>
          <option value="">בחר תוכנית…</option>
          {refs.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
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
