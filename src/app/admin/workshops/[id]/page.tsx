"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db } from "@/lib/firebase/config";
import { collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where, serverTimestamp } from "firebase/firestore";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import { fieldCls, labelCls, btnPrimary, btnGhost } from "@/components/workshops/Dialog";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { loadRefs, Refs } from "@/lib/workshops/data";
import { buildSessions } from "@/lib/workshops/buildWeek";
import { rangeDates, shortDate, overlaps, dayOf } from "@/lib/workshops/dates";
import { Closure, DAY_FULL, DAY_SHORT, SessionChange, Slot, Workshop } from "@/lib/workshops/types";

interface PatientLite { id: string; name: string; programIds: string[]; groupIds: string[] }
interface GroupLite { id: string; name: string; programId: string }

const newSlot = (day: number): Slot => ({ id: Math.random().toString(36).slice(2, 9), day, start: "09:00", end: "10:30" });

export default function WorkshopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [refs, setRefs] = useState<Refs | null>(null);
  const [saved, setSaved] = useState<Workshop | null>(null);
  const [form, setForm] = useState<Workshop | null>(null);
  const [others, setOthers] = useState<Workshop[]>([]);
  const [patients, setPatients] = useState<PatientLite[]>([]);
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [changes, setChanges] = useState<SessionChange[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [allPrograms, setAllPrograms] = useState(false);

  const load = useCallback(async () => {
    const [r, wSnap, allW, pSnap, gSnap, cSnap] = await Promise.all([
      loadRefs(),
      getDoc(doc(db, "workshops", id)),
      getDocs(collection(db, "workshops")),
      getDocs(query(collection(db, "patients"), where("status", "==", "active"))),
      getDocs(collection(db, "groups")),
      getDocs(query(collection(db, "session_changes"), where("workshopId", "==", id))),
    ]);
    if (!wSnap.exists()) { setLoading(false); return; }
    const w = { id: wSnap.id, ...wSnap.data() } as Workshop;
    w.slots ||= []; w.staffIds ||= []; w.participantIds ||= [];
    const clSnap = await getDocs(query(collection(db, "closures"), where("date", ">=", w.startDate), where("date", "<=", w.endDate)));
    setRefs(r); setSaved(w); setForm(w);
    setOthers(allW.docs.map(d => ({ id: d.id, ...d.data() } as Workshop)).filter(x => x.id !== id && x.status === "active"));
    setPatients(pSnap.docs.map(d => {
      const p = d.data();
      return { id: d.id, name: `${p.firstName || ""} ${p.lastName || ""}`.trim(), programIds: p.programIds || (p.programId ? [p.programId] : []), groupIds: p.groupIds || (p.hosenType ? [p.hosenType] : []) };
    }).sort((a, b) => a.name.localeCompare(b.name, "he")));
    setGroups(gSnap.docs.map(d => ({ id: d.id, name: d.data().name, programId: d.data().programId })));
    setChanges(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as SessionChange)));
    setClosures(clSnap.docs.map(d => ({ id: d.id, ...d.data() } as Closure)));
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(form), [saved, form]);
  const program = refs?.programs.find(p => p.id === form?.programId);

  const sessions = useMemo(() => {
    if (!saved || !refs || saved.status !== "active") return [];
    return buildSessions(rangeDates(saved.startDate, saved.endDate), [saved], refs.programs, changes, closures);
  }, [saved, refs, changes, closures]);

  if (loading) return <PageSkeleton />;
  if (!form || !saved || !refs) return <div dir="rtl" className="p-8 text-sm">הסדנה לא נמצאה. <Link href="/admin/workshops" className="underline">חזרה לרשימה</Link></div>;

  const set = (patch: Partial<Workshop>) => setForm({ ...form, ...patch });
  const nameOf = (uid: string) => refs.staff.find(s => s.id === uid)?.name || "—";
  const roomName = (lid?: string) => refs.locations.find(l => l.id === lid)?.name;

  // Flag staff already teaching another workshop at an overlapping time.
  const clashFor = (staffId: string) => {
    for (const o of others) {
      if (!o.staffIds?.includes(staffId)) continue;
      if (o.endDate < form.startDate || o.startDate > form.endDate) continue;
      for (const a of form.slots) for (const b of o.slots || []) {
        if (a.day === b.day && overlaps(a.start, a.end, b.start, b.end)) return `${o.name}, ${DAY_SHORT[b.day]} ${b.start}`;
      }
    }
    return null;
  };

  const save = async () => {
    setSaving(true);
    const data: Partial<Workshop> = { ...form };
    delete data.id;
    await updateDoc(doc(db, "workshops", id), { ...data, updatedAt: serverTimestamp() });
    setSaved(form);
    // Window changed? Reload closures for the new range.
    const clSnap = await getDocs(query(collection(db, "closures"), where("date", ">=", form.startDate), where("date", "<=", form.endDate)));
    setClosures(clSnap.docs.map(d => ({ id: d.id, ...d.data() } as Closure)));
    setSaving(false);
  };

  const remove = async () => {
    if (!confirm(`למחוק את הסדנה "${form.name}" לצמיתות? אפשר גם לסמן אותה כמבוטלת.`)) return;
    const chSnap = await getDocs(query(collection(db, "session_changes"), where("workshopId", "==", id)));
    await Promise.all(chSnap.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "workshops", id));
    router.push("/admin/workshops");
  };

  const toggle = (key: "staffIds" | "participantIds", val: string) =>
    set({ [key]: form[key].includes(val) ? form[key].filter(x => x !== val) : [...form[key], val] } as Partial<Workshop>);

  const days = program?.activeDays.length ? program.activeDays : [0, 1, 2, 3, 4];
  const setSlot = (sid: string, patch: Partial<Slot>) => set({ slots: form.slots.map(s => (s.id === sid ? { ...s, ...patch } : s)) });

  const eligible = patients.filter(p =>
    (allPrograms || p.programIds.includes(form.programId) || form.participantIds.includes(p.id)) && (!search || p.name.includes(search)));
  const progGroups = groups.filter(g => g.programId === form.programId);
  const addGroup = (gid: string) => {
    const ids = patients.filter(p => p.groupIds.includes(gid)).map(p => p.id);
    set({ participantIds: [...new Set([...form.participantIds, ...ids])] });
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pb-24">
        <header className="border-b border-[var(--border)] px-4 md:px-6 h-14 flex items-center gap-2">
          <Link href="/admin/workshops" className="flex items-center text-sm text-[var(--foreground)]/60 hover:text-[var(--foreground)]">
            סדנאות <ChevronRight className="w-4 h-4 rotate-180" />
          </Link>
          <h1 className="text-base font-bold flex-1 truncate">{form.name || "סדנה"}</h1>
          <Link href="/schedule" className={btnGhost}>ליומן</Link>
        </header>

        <div className="px-4 md:px-6 max-w-3xl divide-y divide-[var(--border)]">
          {/* Details */}
          <section className="py-5 space-y-4">
            <h2 className="text-sm font-bold">פרטים</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>שם הסדנה</label>
                <input className={fieldCls} value={form.name} onChange={e => set({ name: e.target.value })} /></div>
              <div><label className={labelCls}>תוכנית</label>
                <select className={fieldCls} value={form.programId} onChange={e => set({ programId: e.target.value })}>
                  {refs.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
              <div><label className={labelCls}>תאריך התחלה</label>
                <input type="date" className={fieldCls} value={form.startDate} onChange={e => set({ startDate: e.target.value })} /></div>
              <div><label className={labelCls}>תאריך סיום</label>
                <input type="date" className={fieldCls} value={form.endDate} min={form.startDate} onChange={e => set({ endDate: e.target.value })} /></div>
              <div><label className={labelCls}>סטטוס</label>
                <select className={fieldCls} value={form.status} onChange={e => set({ status: e.target.value as Workshop["status"] })}>
                  <option value="active">פעילה</option><option value="draft">טיוטה (לא מופיעה ביומן)</option><option value="cancelled">מבוטלת</option>
                </select></div>
              <div><label className={labelCls}>הערות</label>
                <input className={fieldCls} value={form.notes || ""} onChange={e => set({ notes: e.target.value })} /></div>
            </div>
          </section>

          {/* Weekly meetings */}
          <section className="py-5 space-y-3">
            <h2 className="text-sm font-bold">מפגשים שבועיים</h2>
            {form.slots.length === 0 && <p className="text-sm text-[var(--foreground)]/50">לא הוגדרו מפגשים — הסדנה לא תופיע ביומן.</p>}
            {form.slots.map(s => (
              <div key={s.id} className="flex flex-wrap items-center gap-2">
                <select className={`${fieldCls} !w-28`} value={s.day} onChange={e => setSlot(s.id, { day: Number(e.target.value) })}>
                  {days.map(d => <option key={d} value={d}>יום {DAY_FULL[d]}</option>)}
                  {!days.includes(s.day) && <option value={s.day}>יום {DAY_FULL[s.day]} (לא פעיל)</option>}
                </select>
                <input type="time" className={`${fieldCls} !w-28`} value={s.start} onChange={e => setSlot(s.id, { start: e.target.value })} />
                <span className="text-[var(--foreground)]/40">–</span>
                <input type="time" className={`${fieldCls} !w-28`} value={s.end} onChange={e => setSlot(s.id, { end: e.target.value })} />
                <select className={`${fieldCls} !w-36`} value={s.locationId || ""} onChange={e => setSlot(s.id, { locationId: e.target.value || undefined })}>
                  <option value="">ללא מרחב</option>
                  {refs.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {s.end <= s.start && <span className="text-xs text-rose-500">שעת הסיום מוקדמת מההתחלה</span>}
                <button onClick={() => set({ slots: form.slots.filter(x => x.id !== s.id) })} aria-label="הסר מפגש"
                  className="p-2 text-[var(--foreground)]/50 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button onClick={() => set({ slots: [...form.slots, newSlot(days[0])] })} className={`${btnGhost} flex items-center gap-1.5`}>
                <Plus className="w-4 h-4" /> הוסף מפגש
              </button>
              <Link href="/admin/spaces" className="text-xs underline text-[var(--foreground)]/60">ניהול מרחבים</Link>
            </div>
          </section>

          {/* Staff */}
          <section className="py-5 space-y-3">
            <h2 className="text-sm font-bold">מעבירים <span className="font-normal text-[var(--foreground)]/50">({form.staffIds.length})</span></h2>
            <ul className="grid sm:grid-cols-2 gap-x-4">
              {refs.staff.map(s => {
                const on = form.staffIds.includes(s.id);
                const clash = clashFor(s.id);
                return (
                  <li key={s.id}>
                    <label className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => toggle("staffIds", s.id)} />
                      <span className={on ? "font-bold" : ""}>{s.name}</span>
                      {clash && <span className="text-xs text-amber-600">משובץ גם ב{clash}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Participants */}
          <section className="py-5 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-sm font-bold">משתתפים <span className="font-normal text-[var(--foreground)]/50">({form.participantIds.length})</span></h2>
              <input className={`${fieldCls} !w-44`} placeholder="חיפוש" value={search} onChange={e => setSearch(e.target.value)} />
              <label className="flex items-center gap-1.5 text-xs text-[var(--foreground)]/60">
                <input type="checkbox" checked={allPrograms} onChange={e => setAllPrograms(e.target.checked)} /> כל התוכניות
              </label>
              {form.participantIds.length > 0 && (
                <button onClick={() => set({ participantIds: [] })} className="text-xs underline text-[var(--foreground)]/60">נקה הכול</button>
              )}
            </div>
            {progGroups.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-[var(--foreground)]/50">הוסף קבוצה:</span>
                {progGroups.map(g => (
                  <button key={g.id} onClick={() => addGroup(g.id)} className="px-2.5 py-1 text-xs border border-[var(--border)] rounded-md hover:bg-[var(--foreground)]/5">{g.name}</button>
                ))}
              </div>
            )}
            <ul className="grid sm:grid-cols-2 gap-x-4 max-h-96 overflow-y-auto">
              {eligible.map(p => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.participantIds.includes(p.id)} onChange={() => toggle("participantIds", p.id)} />
                    <span className={form.participantIds.includes(p.id) ? "font-bold" : ""}>{p.name}</span>
                  </label>
                </li>
              ))}
              {eligible.length === 0 && <li className="text-sm text-[var(--foreground)]/50 py-2">לא נמצאו משתתפים פעילים.</li>}
            </ul>
          </section>

          {/* Sessions */}
          <section className="py-5 space-y-2">
            <h2 className="text-sm font-bold">כל המפגשים <span className="font-normal text-[var(--foreground)]/50">({sessions.filter(s => s.kind !== "cancelled" && s.kind !== "moved-away").length})</span></h2>
            {dirty && <p className="text-xs text-amber-600">הרשימה מתעדכנת לאחר שמירה.</p>}
            <ul className="divide-y divide-[var(--border)] text-sm">
              {sessions.map(s => (
                <li key={s.id} className={`py-1.5 flex gap-3 tabular-nums ${s.kind === "cancelled" || s.kind === "moved-away" ? "text-[var(--foreground)]/40 line-through" : ""}`}>
                  <span className="w-24">יום {DAY_SHORT[dayOf(s.date)]} {shortDate(s.date)}</span>
                  <span className="w-28">{s.start}–{s.end}</span>
                  <span className="flex-1 no-underline">{s.staffIds.map(nameOf).join(", ")}{roomName(s.locationId) ? ` · ${roomName(s.locationId)}` : ""}</span>
                  <span className="text-xs no-underline">
                    {s.kind === "cancelled" ? "בוטל" : s.kind === "moved-away" ? "הוזז" : s.kind === "moved-in" ? "הוזז אליו" : s.kind === "extra" ? "נוסף" : s.change ? "שונה" : ""}
                  </span>
                </li>
              ))}
              {sessions.length === 0 && <li className="py-3 text-[var(--foreground)]/50">אין מפגשים. בדוק שהסדנה פעילה, שיש לה מפגשים שבועיים ושהימים תואמים לימי הפעילות של התוכנית.</li>}
            </ul>
          </section>

          <section className="py-5">
            <button onClick={remove} className="text-sm text-rose-500 hover:underline">מחק סדנה</button>
          </section>
        </div>

        {dirty && (
          <div className="fixed bottom-0 inset-x-0 z-30 border-t border-[var(--border)] bg-[var(--card-bg)] px-4 py-3 flex items-center gap-3 justify-center md:pr-64" dir="rtl">
            <span className="text-sm text-[var(--foreground)]/70">יש שינויים שלא נשמרו</span>
            <button onClick={save} disabled={saving || !form.name.trim() || !form.programId || form.endDate < form.startDate || form.slots.some(s => s.end <= s.start)} className={btnPrimary}>שמור שינויים</button>
            <button onClick={() => setForm(saved)} className={btnGhost}>בטל</button>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
