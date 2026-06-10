"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, updateDoc, doc, query, orderBy } from "firebase/firestore";
import {
  Bell, AlertCircle, Check, CheckCircle2, Send, Download,
  Loader2, ChevronLeft, Users, Calendar, ArrowRight,
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
  extensionSent?: boolean;
  extensionSentAt?: string;
  extensionReceived?: boolean;
  extensionReceivedAt?: string;
  rehabPlanCompleted?: boolean;
}

function effectiveEndDate(p: Patient): Date | null {
  if (p.startDate) {
    try {
      const start = parseISO(p.startDate);
      if (isValid(start)) {
        const standard3m = addMonths(start, 3);
        const standard6m = addMonths(start, 6);
        let end = p.extensionReceived ? standard6m : standard3m;
        
        if (p.endDate) {
          const dbEnd = parseISO(p.endDate);
          if (isValid(dbEnd)) {
            const dbEndStr = format(dbEnd, "yyyy-MM-dd");
            const std3mStr = format(standard3m, "yyyy-MM-dd");
            const std6mStr = format(standard6m, "yyyy-MM-dd");
            if (dbEndStr !== std3mStr && dbEndStr !== std6mStr) {
              end = dbEnd;
            }
          }
        }
        return end;
      }
    } catch { return null; }
  }
  if (p.endDate) { try { const d = parseISO(p.endDate); return isValid(d) ? d : null; } catch { return null; } }
  return null;
}

function daysLeft(p: Patient): number | null {
  const end = effectiveEndDate(p);
  if (!end) return null;
  return differenceInDays(end, new Date());
}

function fmtDate(s: string | undefined | null, fallback = "—") {
  if (!s) return fallback;
  try { return format(parseISO(s), "dd/MM/yyyy", { locale: he }); }
  catch { return fallback; }
}

function UrgencyBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-[10px] text-[var(--muted)]">—</span>;
  if (days < 0) return <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-500/10 text-slate-400">פגה</span>;
  if (days <= 7) return <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-500/15 text-rose-400 animate-pulse">{days} ימים</span>;
  if (days <= 14) return <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-orange-500/15 text-orange-400">{days} ימים</span>;
  return <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-400">{days} ימים</span>;
}

export default function RemindersPage() {
  const { user, role, roles } = useAuth();
  const router = useRouter();
  const isSocialWorker = role === "social_worker" && !roles.some(r => ["admin","manager"].includes(r));

  const [patients,  setPatients]  = useState<Patient[]>([]);
  const [workers,   setWorkers]   = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [pSnap, uSnap] = await Promise.all([
          getDocs(query(collection(db, "patients"), orderBy("firstName"))),
          getDocs(collection(db, "users")),
        ]);
        setPatients(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient)));
        const wm: Record<string, string> = {};
        uSnap.forEach(d => { wm[d.id] = d.data().displayName || d.data().name || d.data().email || "—"; });
        setWorkers(wm);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const active = useMemo(() => patients.filter(p => p.status === "active"), [patients]);

  // Patients expiring within 30 days, filtered by role
  const upcoming = useMemo(() => {
    let list = isSocialWorker
      ? active.filter(p => p.assignedWorkerId === user?.uid)
      : active;
    return list
      .filter(p => { const d = daysLeft(p); return d !== null && d <= 30; })
      .sort((a, b) => (daysLeft(a) ?? 0) - (daysLeft(b) ?? 0));
  }, [active, isSocialWorker, user?.uid]);

  const urgent = useMemo(() => upcoming.filter(p => { const d = daysLeft(p); return d !== null && d <= 14 && !p.extensionSent; }), [upcoming]);

  async function markExtensionSent(patientId: string) {
    setSaving(patientId + "_s");
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, "patients", patientId), { extensionSent: true, extensionSentAt: now });
      setPatients(prev => prev.map(p => p.id === patientId ? { ...p, extensionSent: true, extensionSentAt: now } : p));
    } catch (e) { console.error(e); }
    finally { setSaving(null); }
  }

  async function markExtensionReceived(patient: Patient) {
    setSaving(patient.id + "_r");
    try {
      const start = patient.startDate ? parseISO(patient.startDate) : new Date();
      const newEnd = format(addMonths(start, 6), "yyyy-MM-dd");
      const now = new Date().toISOString();
      await updateDoc(doc(db, "patients", patient.id), {
        extensionReceived: true, extensionReceivedAt: now,
        extensionSent: true, endDate: newEnd,
      });
      setPatients(prev => prev.map(p =>
        p.id === patient.id ? { ...p, extensionReceived: true, extensionReceivedAt: now, extensionSent: true, endDate: newEnd } : p
      ));
    } catch (e) { console.error(e); }
    finally { setSaving(null); }
  }

  return (
    <RoleGuard allowedRoles={["admin", "manager", "social_worker"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6">
          <div className="flex items-center gap-3 h-12">
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <Link href="/admin" className="hover:text-[var(--foreground)] transition-colors">ניהול</Link>
              <ChevronLeft className="w-3 h-3 opacity-30 rotate-180" />
              <span className="text-[var(--foreground)]/70">תזכורות ומשימות</span>
            </div>
            <button onClick={() => router.push("/admin")}
              className="md:hidden p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-rose-400" />
              <h1 className="text-sm font-semibold">תזכורות — הארכות שהות</h1>
            </div>
            {urgent.length > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-full animate-pulse">
                {urgent.length} פעולות דחופות
              </span>
            )}
          </div>
        </header>

        <main className="px-4 md:px-6 py-6 pb-24 max-w-5xl mx-auto">

          {/* ── Summary ── */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: "בתוך 30 יום",     value: upcoming.length,                          color: "text-amber-400",   bg: "bg-amber-500/8" },
              { label: "בתוך 14 יום",     value: upcoming.filter(p => (daysLeft(p)??999) <= 14).length, color: "text-orange-400", bg: "bg-orange-500/8" },
              { label: "דחוף — ללא הארכה", value: urgent.length,                            color: "text-rose-400",    bg: "bg-rose-500/8" },
            ].map(s => (
              <div key={s.label} className={`${s.bg} border border-[var(--border)] rounded-xl px-4 py-3`}>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-[var(--muted)] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Urgent Section ── */}
          <AnimatePresence>
            {urgent.length > 0 && (
              <motion.section initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-400 flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                  נדרשת פעולה עכשיו ({urgent.length})
                </h2>
                <div className="space-y-2">
                  {urgent.map(p => {
                    const days = daysLeft(p);
                    return (
                      <motion.div key={p.id}
                        layout
                        className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 font-black text-sm shrink-0">
                            {p.firstName?.[0]}{p.lastName?.[0]}
                          </div>
                          <div className="min-w-0">
                            <button onClick={() => router.push(`/patients/${p.id}`)}
                              className="font-black text-sm hover:text-rose-400 transition-colors text-right block">
                              {p.firstName} {p.lastName}
                            </button>
                            <p className="text-[10px] text-[var(--muted)] mt-0.5">
                              {workers[p.assignedWorkerId || ""] || "לא שובץ"} • סיום: {fmtDate(effectiveEndDate(p)?.toISOString())}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <UrgencyBadge days={days} />
                          <button onClick={() => markExtensionSent(p.id)} disabled={saving === p.id + "_s"}
                            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-black bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-xl hover:bg-orange-500/20 transition-all disabled:opacity-50">
                            {saving === p.id + "_s" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            הארכה נשלחה
                          </button>
                          <button onClick={() => markExtensionReceived(p)} disabled={saving === p.id + "_r"}
                            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/20 transition-all disabled:opacity-50">
                            {saving === p.id + "_r" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            הארכה התקבלה (+3 חודשים)
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* ── Full Table ── */}
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-rose-400" /></div>
          ) : upcoming.length === 0 ? (
            <div className="text-center py-20 opacity-20">
              <Users className="w-8 h-8 mx-auto mb-3" />
              <p className="text-sm font-bold">אין משתתפים המסיימים שהות ב-30 הימים הקרובים</p>
            </div>
          ) : (
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)] mb-3">
                כל המשתתפים המסיימים בחודש הקרוב ({upcoming.length})
              </h2>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--foreground)]/[0.02]">
                        {["משתתף", "סיום", "ימים נותרים", 'עו"ס', "הארכה נשלחה", "הארכה התקבלה", "פעולה"].map(h => (
                          <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-[var(--muted)] whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {upcoming.map((p, i) => {
                        const endDate = effectiveEndDate(p);
                        const days = daysLeft(p);
                        const rowBg = days !== null && days <= 7 && days >= 0
                          ? "bg-rose-500/[0.03]"
                          : days !== null && days <= 14 && days >= 0
                          ? "bg-orange-500/[0.03]"
                          : "";
                        return (
                          <motion.tr key={p.id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                            className={`hover:bg-[var(--foreground)]/[0.02] transition-colors ${rowBg}`}>
                            <td className="px-4 py-3">
                              <button onClick={() => router.push(`/patients/${p.id}`)}
                                className="text-right hover:text-rose-400 transition-colors font-semibold leading-tight">
                                {p.firstName} {p.lastName}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-xs text-[var(--muted)]">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3 h-3 shrink-0" />
                                {endDate ? format(endDate, "dd/MM/yy", { locale: he }) : "—"}
                              </div>
                            </td>
                            <td className="px-4 py-3"><UrgencyBadge days={days} /></td>
                            <td className="px-4 py-3 text-xs text-[var(--muted)]">
                              {workers[p.assignedWorkerId || ""] || "—"}
                            </td>
                            <td className="px-4 py-3">
                              {p.extensionSent ? (
                                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                                  <Check className="w-3 h-3" /> {fmtDate(p.extensionSentAt)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-[var(--muted)]/50">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {p.extensionReceived ? (
                                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                                  <CheckCircle2 className="w-3 h-3" /> {fmtDate(p.extensionReceivedAt)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-[var(--muted)]/50">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {!p.extensionReceived && (
                                <div className="flex items-center gap-1.5">
                                  {!p.extensionSent && (
                                    <button onClick={() => markExtensionSent(p.id)} disabled={saving === p.id + "_s"}
                                      className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-lg hover:bg-orange-500/20 transition-all disabled:opacity-50">
                                      {saving === p.id + "_s" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                      נשלחה
                                    </button>
                                  )}
                                  <button onClick={() => markExtensionReceived(p)} disabled={saving === p.id + "_r"}
                                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all disabled:opacity-50">
                                    {saving === p.id + "_r" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                    +3 חודשים
                                  </button>
                                </div>
                              )}
                              {p.extensionReceived && (
                                <span className="text-[10px] text-emerald-400 font-bold">הושלם ✓</span>
                              )}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </RoleGuard>
  );
}
