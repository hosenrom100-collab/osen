"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, updateDoc, doc, query, orderBy,
} from "firebase/firestore";
import {
  ArrowRight, Loader2, CheckCircle2, Clock, FileText,
  Users, AlertCircle, ChevronLeft, Edit3, X, Check,
  CalendarDays, Filter,
} from "lucide-react";
import { addMonths, differenceInDays, parseISO, format, isValid } from "date-fns";
import { he } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  idNumber?: string;
  startDate?: string;
  endDate?: string;
  hosenType?: string;
  status: string;
  assignedWorkerId?: string;
  rehabPlan?: string;
  rehabPlanCompleted?: boolean;
}

type FilterType = "all" | "expiring" | "noplan" | "mine";

function effectiveEndDate(p: Patient): Date | null {
  if (p.endDate) {
    try { const d = parseISO(p.endDate); return isValid(d) ? d : null; }
    catch { return null; }
  }
  if (p.startDate) {
    try { const d = parseISO(p.startDate); return isValid(d) ? addMonths(d, 3) : null; }
    catch { return null; }
  }
  return null;
}

function daysLeft(p: Patient): number | null {
  const end = effectiveEndDate(p);
  if (!end) return null;
  return differenceInDays(end, new Date());
}

function UrgencyChip({ days }: { days: number | null }) {
  if (days === null)
    return <span className="text-[10px] text-[var(--muted)]">—</span>;
  if (days < 0)
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/10 text-slate-400">פג</span>;
  if (days <= 7)
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 animate-pulse">{days} ימים</span>;
  if (days <= 14)
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-400">{days} ימים</span>;
  if (days <= 30)
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400">{days} ימים</span>;
  return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400">{days} ימים</span>;
}

function fmtDate(d: Date | null | undefined, fallback = "—"): string {
  if (!d) return fallback;
  try { return format(d, "dd/MM/yy", { locale: he }); }
  catch { return fallback; }
}

export default function PatientTrackingPage() {
  const { user, role } = useAuth();
  const router = useRouter();
  const isSocialWorker = role === "social_worker";

  const [patients,  setPatients]  = useState<Patient[]>([]);
  const [workers,   setWorkers]   = useState<Record<string, string>>({});
  const [groups,    setGroups]    = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<FilterType>(isSocialWorker ? "mine" : "all");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPlan,  setEditPlan]  = useState("");
  const [saving,    setSaving]    = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [pSnap, gSnap, uSnap] = await Promise.all([
          getDocs(query(collection(db, "patients"), orderBy("firstName"))),
          getDocs(collection(db, "groups")),
          getDocs(collection(db, "users")),
        ]);
        setPatients(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient)));
        const gm: Record<string, string> = {};
        gSnap.forEach(d => { gm[d.id] = d.data().name; });
        setGroups(gm);
        const wm: Record<string, string> = {};
        uSnap.forEach(d => { wm[d.id] = d.data().name || d.data().email || "—"; });
        setWorkers(wm);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const active = useMemo(() => patients.filter(p => p.status === "active"), [patients]);

  const stats = useMemo(() => {
    const exp30 = active.filter(p => { const d = daysLeft(p); return d !== null && d >= 0 && d <= 30; });
    const exp7  = active.filter(p => { const d = daysLeft(p); return d !== null && d >= 0 && d <= 7; });
    const mine  = active.filter(p => p.assignedWorkerId === user?.uid);
    const noplan = active.filter(p => !p.rehabPlan);
    return { total: active.length, exp30: exp30.length, exp7: exp7.length, mine: mine.length, noplan: noplan.length };
  }, [active, user?.uid]);

  const filtered = useMemo(() => {
    let list = [...active];
    if (filter === "mine" || isSocialWorker)
      list = list.filter(p => p.assignedWorkerId === user?.uid);
    else if (filter === "expiring")
      list = list.filter(p => { const d = daysLeft(p); return d !== null && d <= 30; });
    else if (filter === "noplan")
      list = list.filter(p => !p.rehabPlan);
    return list;
  }, [active, filter, isSocialWorker, user?.uid]);

  async function saveRehabPlan(id: string) {
    setSaving(id);
    try {
      await updateDoc(doc(db, "patients", id), { rehabPlan: editPlan.trim() });
      setPatients(prev => prev.map(p => p.id === id ? { ...p, rehabPlan: editPlan.trim() } : p));
      setEditingId(null);
    } catch (e) { console.error(e); }
    finally { setSaving(null); }
  }

  async function toggleCompleted(p: Patient) {
    const next = !p.rehabPlanCompleted;
    try {
      await updateDoc(doc(db, "patients", p.id), { rehabPlanCompleted: next });
      setPatients(prev => prev.map(x => x.id === p.id ? { ...x, rehabPlanCompleted: next } : x));
    } catch (e) { console.error(e); }
  }

  const FILTERS: { id: FilterType; label: string; count?: number; color?: string }[] = [
    { id: "all",      label: "כולם",          count: stats.total },
    { id: "expiring", label: "מסיימים בקרוב", count: stats.exp30,  color: "text-amber-400" },
    { id: "noplan",   label: "ללא תוכנית",    count: stats.noplan, color: "text-rose-400" },
    { id: "mine",     label: "שלי",           count: stats.mine },
  ];

  return (
    <RoleGuard allowedRoles={["admin", "manager", "social_worker"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6">
          <div className="flex items-center gap-3 h-12">
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <Link href="/patients" className="hover:text-[var(--foreground)] transition-colors">מטופלים</Link>
              <ChevronLeft className="w-3 h-3 opacity-30 rotate-180" />
              <span className="text-[var(--foreground)]/70">מעקב ותכנון</span>
            </div>
            <button onClick={() => router.push("/patients")}
              className="md:hidden p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-400" />
              <h1 className="text-sm font-semibold">מעקב מטופלים ותכניות שיקום</h1>
            </div>
            <span className="mr-auto text-[10px] font-medium text-teal-400 bg-teal-500/8 border border-teal-500/15 px-2.5 py-1 rounded-full">
              {isSocialWorker ? "שלי" : "כולם"}
            </span>
          </div>
        </header>

        <main className="px-4 md:px-6 py-5 pb-24 max-w-6xl mx-auto">

          {/* ── Stats ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: "פעילים",         value: stats.total,  color: "text-[var(--foreground)]",  bg: "bg-[var(--surface)]" },
              { label: "מסיימים ב-30 יום", value: stats.exp30, color: "text-amber-400", bg: "bg-amber-500/8" },
              { label: "מסיימים ב-7 ימים", value: stats.exp7,  color: "text-rose-400",  bg: "bg-rose-500/8" },
              { label: "ללא תוכנית שיקום", value: stats.noplan, color: "text-orange-400", bg: "bg-orange-500/8" },
            ].map(s => (
              <div key={s.label} className={`${s.bg} border border-[var(--border)] rounded-xl px-4 py-3`}>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-[var(--muted)] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Filter tabs ── */}
          {!isSocialWorker && (
            <div className="flex gap-2 flex-wrap mb-4">
              {FILTERS.map(f => (
                <button key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    filter === f.id
                      ? "bg-teal-500/10 border-teal-500/30 text-teal-400"
                      : "bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-strong)]"
                  }`}>
                  <Filter className="w-3 h-3" />
                  {f.label}
                  {f.count !== undefined && (
                    <span className={`text-[10px] font-bold ${f.color ?? ""}`}>{f.count}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ── Table ── */}
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-[var(--muted)] text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
              אין מטופלים העונים לסינון
            </div>
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--foreground)]/[0.02]">
                      {["מטופל + ת\"ז", "שיבוץ", "סיום (אוטומטי)", "ימים נותרים", "תוכנית שיקום", "הושלמה", "עו\"ס"].map(h => (
                        <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-[var(--muted)] whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    <AnimatePresence>
                      {filtered.map((p, i) => {
                        const endDate = effectiveEndDate(p);
                        const days    = daysLeft(p);
                        const isAuto  = !p.endDate && !!p.startDate;
                        const isEditing = editingId === p.id;
                        const rowBg = days !== null && days <= 7 && days >= 0
                          ? "bg-rose-500/[0.03]"
                          : days !== null && days <= 30 && days >= 0
                          ? "bg-amber-500/[0.03]"
                          : "";

                        return (
                          <motion.tr key={p.id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.02 }}
                            className={`group hover:bg-[var(--foreground)]/[0.02] transition-colors ${rowBg}`}>

                            {/* Name + ID */}
                            <td className="px-4 py-3">
                              <button
                                onClick={() => router.push(`/patients/${p.id}`)}
                                className="text-right hover:text-teal-400 transition-colors">
                                <p className="font-semibold leading-tight">{p.firstName} {p.lastName}</p>
                                <p className="text-[10px] text-[var(--muted)] font-mono mt-0.5">{p.idNumber || "—"}</p>
                              </button>
                            </td>

                            {/* Start date */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                                <CalendarDays className="w-3 h-3 shrink-0" />
                                {p.startDate ? fmtDate(parseISO(p.startDate)) : "—"}
                              </div>
                            </td>

                            {/* End date */}
                            <td className="px-4 py-3">
                              <div className="text-xs">
                                <span className={days !== null && days <= 30 && days >= 0 ? "text-amber-400 font-semibold" : "text-[var(--muted)]"}>
                                  {fmtDate(endDate)}
                                </span>
                                {isAuto && (
                                  <span className="text-[9px] text-[var(--muted)] block opacity-60">אוטומטי</span>
                                )}
                              </div>
                            </td>

                            {/* Days remaining */}
                            <td className="px-4 py-3">
                              <UrgencyChip days={days} />
                            </td>

                            {/* Rehab plan (inline editor) */}
                            <td className="px-4 py-3 max-w-[260px]">
                              {isEditing ? (
                                <div className="flex items-start gap-2">
                                  <textarea
                                    value={editPlan}
                                    onChange={e => setEditPlan(e.target.value)}
                                    autoFocus
                                    rows={2}
                                    className="flex-1 bg-[var(--background)] border border-teal-500/40 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-teal-500"
                                    placeholder="תאר את תוכנית השיקום..."
                                  />
                                  <div className="flex flex-col gap-1 shrink-0">
                                    <button onClick={() => saveRehabPlan(p.id)} disabled={saving === p.id}
                                      className="p-1.5 rounded-lg bg-teal-500/15 text-teal-400 hover:bg-teal-500/25 transition-colors">
                                      {saving === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    </button>
                                    <button onClick={() => setEditingId(null)}
                                      className="p-1.5 rounded-lg bg-[var(--foreground)]/5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditingId(p.id); setEditPlan(p.rehabPlan || ""); }}
                                  className="w-full text-right group/plan flex items-start gap-2">
                                  <span className={`text-xs leading-relaxed flex-1 ${p.rehabPlan ? "text-[var(--foreground)]/80" : "text-[var(--muted)] italic"}`}>
                                    {p.rehabPlan || "לא הוגדרה תוכנית"}
                                  </span>
                                  <Edit3 className="w-3 h-3 text-[var(--muted)] opacity-0 group-hover/plan:opacity-100 shrink-0 mt-0.5 transition-opacity" />
                                </button>
                              )}
                            </td>

                            {/* Completed checkbox */}
                            <td className="px-4 py-3">
                              <button onClick={() => toggleCompleted(p)}
                                className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all ${
                                  p.rehabPlanCompleted
                                    ? "bg-teal-500 border-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.4)]"
                                    : "border-[var(--border)] hover:border-teal-500/50"
                                }`}>
                                {p.rehabPlanCompleted && <Check className="w-3.5 h-3.5 text-white" />}
                              </button>
                            </td>

                            {/* Social worker */}
                            <td className="px-4 py-3">
                              <span className="text-xs text-[var(--muted)]">
                                {workers[p.assignedWorkerId || ""] || "—"}
                              </span>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Extension reminder ── */}
          {stats.exp30 > 0 && (
            <div className="mt-5 flex items-center gap-3 px-4 py-3 bg-amber-500/8 border border-amber-500/20 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-amber-300/90">
                <span className="font-semibold">{stats.exp30} מטופלים</span> מסיימים את תקופת השיקום בחודש הקרוב.
                בדוק/י האם יש לבצע <span className="font-semibold">הארכה לחצי שנה</span>.
              </p>
            </div>
          )}
        </main>
      </div>
    </RoleGuard>
  );
}
