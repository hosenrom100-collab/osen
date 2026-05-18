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
  Users, AlertCircle, ChevronLeft, X, Check,
  CalendarDays, Filter, Send, Download, Calendar, Edit3,
  Bell,
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
  rehabPlanCompleted?: boolean;
  extensionSent?: boolean;
  extensionSentAt?: string;
  extensionReceived?: boolean;
  extensionReceivedAt?: string;
}

type FilterType = "all" | "urgent" | "norehab" | "mine";

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
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/10 text-slate-400">פגה</span>;
  if (days <= 7)
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 animate-pulse">{days} ימים</span>;
  if (days <= 14)
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-400">{days} ימים</span>;
  if (days <= 30)
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400">{days} ימים</span>;
  return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400">{days} ימים</span>;
}

function fmtDate(d: Date | string | null | undefined, fallback = "—"): string {
  if (!d) return fallback;
  try {
    const date = typeof d === "string" ? parseISO(d) : d;
    return format(date, "dd/MM/yy", { locale: he });
  }
  catch { return fallback; }
}

export default function PatientTrackingPage() {
  const { user, role, roles } = useAuth();
  const router = useRouter();
  const isSocialWorker = role === "social_worker" || (roles.includes("social_worker") && !roles.some(r => ["admin","manager"].includes(r)));

  const [patients,  setPatients]  = useState<Patient[]>([]);
  const [workers,   setWorkers]   = useState<Record<string, string>>({});
  const [groups,    setGroups]    = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<FilterType>(isSocialWorker ? "mine" : "all");
  const [saving,    setSaving]    = useState<string | null>(null);

  // End-date inline editing
  const [editingEndDateId, setEditingEndDateId] = useState<string | null>(null);
  const [editEndDateVal,   setEditEndDateVal]   = useState("");

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
        uSnap.forEach(d => { wm[d.id] = d.data().displayName || d.data().name || d.data().email || "—"; });
        setWorkers(wm);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const active = useMemo(() => patients.filter(p => p.status === "active"), [patients]);

  const stats = useMemo(() => {
    const scope = isSocialWorker ? active.filter(p => p.assignedWorkerId === user?.uid) : active;
    const exp14 = scope.filter(p => { const d = daysLeft(p); return d !== null && d >= 0 && d <= 14; });
    const exp7  = scope.filter(p => { const d = daysLeft(p); return d !== null && d >= 0 && d <= 7; });
    const urgent = exp14.filter(p => !p.extensionSent);
    const mine   = active.filter(p => p.assignedWorkerId === user?.uid);
    const norehab = scope.filter(p => !p.rehabPlanCompleted);
    return {
      total:   scope.length,
      exp14:   exp14.length,
      exp7:    exp7.length,
      urgent:  urgent.length,
      mine:    mine.length,
      norehab: norehab.length,
    };
  }, [active, user?.uid, isSocialWorker]);

  const filtered = useMemo(() => {
    let list = isSocialWorker ? active.filter(p => p.assignedWorkerId === user?.uid) : [...active];
    if (filter === "mine")    list = active.filter(p => p.assignedWorkerId === user?.uid);
    else if (filter === "urgent")  list = list.filter(p => { const d = daysLeft(p); return d !== null && d <= 14 && d >= 0; });
    else if (filter === "norehab") list = list.filter(p => !p.rehabPlanCompleted);
    return list.sort((a, b) => {
      const da = daysLeft(a) ?? 9999;
      const db_ = daysLeft(b) ?? 9999;
      return da - db_;
    });
  }, [active, filter, isSocialWorker, user?.uid]);

  // Urgent patients needing action (for the reminder banner)
  const urgentPatients = useMemo(() => {
    const scope = isSocialWorker ? active.filter(p => p.assignedWorkerId === user?.uid) : active;
    return scope
      .filter(p => { const d = daysLeft(p); return d !== null && d >= 0 && d <= 14 && !p.extensionSent; })
      .sort((a, b) => (daysLeft(a) ?? 0) - (daysLeft(b) ?? 0));
  }, [active, user?.uid, isSocialWorker]);

  async function markExtensionSent(patientId: string) {
    setSaving(patientId + "_sent");
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, "patients", patientId), {
        extensionSent: true,
        extensionSentAt: now,
      });
      setPatients(prev => prev.map(p =>
        p.id === patientId ? { ...p, extensionSent: true, extensionSentAt: now } : p
      ));
    } catch (e) { console.error(e); }
    finally { setSaving(null); }
  }

  async function markExtensionReceived(patient: Patient) {
    setSaving(patient.id + "_recv");
    try {
      const currentEnd = patient.endDate
        ? parseISO(patient.endDate)
        : patient.startDate
          ? addMonths(parseISO(patient.startDate), 3)
          : new Date();
      const newEnd = addMonths(currentEnd, 3);
      const newEndStr = format(newEnd, "yyyy-MM-dd");
      const now = new Date().toISOString();
      await updateDoc(doc(db, "patients", patient.id), {
        extensionReceived: true,
        extensionReceivedAt: now,
        extensionSent: true,
        endDate: newEndStr,
      });
      setPatients(prev => prev.map(p =>
        p.id === patient.id
          ? { ...p, extensionReceived: true, extensionReceivedAt: now, extensionSent: true, endDate: newEndStr }
          : p
      ));
    } catch (e) { console.error(e); }
    finally { setSaving(null); }
  }

  async function saveEndDate(patientId: string) {
    if (!editEndDateVal) return;
    setSaving(patientId + "_date");
    try {
      await updateDoc(doc(db, "patients", patientId), { endDate: editEndDateVal });
      setPatients(prev => prev.map(p =>
        p.id === patientId ? { ...p, endDate: editEndDateVal } : p
      ));
      setEditingEndDateId(null);
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
    { id: "all",     label: "כולם",              count: stats.total },
    { id: "urgent",  label: "דחוף — הארכה נדרשת", count: stats.urgent, color: "text-rose-400" },
    { id: "norehab", label: "שיקום לא הושלם",     count: stats.norehab, color: "text-orange-400" },
    { id: "mine",    label: "שלי",               count: stats.mine },
  ];

  return (
    <RoleGuard allowedRoles={["admin", "manager", "social_worker"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6">
          <div className="flex items-center gap-3 h-12">
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <Link href="/patients" className="hover:text-[var(--foreground)] transition-colors">משתתפים</Link>
              <ChevronLeft className="w-3 h-3 opacity-30 rotate-180" />
              <span className="text-[var(--foreground)]/70">מעקב ותכנון</span>
            </div>
            <button onClick={() => router.push("/patients")}
              className="md:hidden p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-400" />
              <h1 className="text-sm font-semibold">מעקב תקופות שהות והארכות</h1>
            </div>
            {stats.urgent > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] font-black text-rose-400 bg-rose-500/8 border border-rose-500/20 px-2.5 py-1 rounded-full animate-pulse">
                <Bell className="w-3 h-3" />
                {stats.urgent} דחוף
              </span>
            )}
            <span className="mr-auto text-[10px] font-medium text-teal-400 bg-teal-500/8 border border-teal-500/15 px-2.5 py-1 rounded-full">
              {isSocialWorker ? "שלי" : "כולם"}
            </span>
          </div>
        </header>

        <main className="px-4 md:px-6 py-5 pb-24 max-w-6xl mx-auto">

          {/* ── Urgent Reminders Banner ── */}
          <AnimatePresence>
            {urgentPatients.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 bg-rose-500/8 border border-rose-500/25 rounded-2xl overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-rose-500/15">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
                  <p className="text-sm font-black text-rose-300">
                    נדרשת פעולה — {urgentPatients.length} משתתפים מסיימים שהות בתוך 14 יום ועדיין לא נשלחה הארכה
                  </p>
                </div>
                <div className="divide-y divide-rose-500/10">
                  {urgentPatients.map(p => {
                    const days = daysLeft(p);
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                        <button
                          onClick={() => router.push(`/patients/${p.id}`)}
                          className="font-semibold text-sm hover:text-rose-300 transition-colors"
                        >
                          {p.firstName} {p.lastName}
                        </button>
                        <span className="text-[10px] text-rose-400/70 font-mono">
                          {workers[p.assignedWorkerId || ""] || "—"}
                        </span>
                        <UrgencyChip days={days} />
                        <div className="mr-auto flex items-center gap-2">
                          <button
                            onClick={() => markExtensionSent(p.id)}
                            disabled={saving === p.id + "_sent"}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black bg-orange-500/15 text-orange-300 border border-orange-500/20 rounded-lg hover:bg-orange-500/25 transition-all disabled:opacity-50"
                          >
                            {saving === p.id + "_sent" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            סמן: הארכה נשלחה
                          </button>
                          <button
                            onClick={() => markExtensionReceived(p)}
                            disabled={saving === p.id + "_recv"}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/25 transition-all disabled:opacity-50"
                          >
                            {saving === p.id + "_recv" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            סמן: הארכה התקבלה (+3 חודשים)
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Stats ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: "פעילים",              value: stats.total,  color: "text-[var(--foreground)]",  bg: "bg-[var(--surface)]" },
              { label: "מסיימים בתוך 14 יום",  value: stats.exp14, color: "text-orange-400", bg: "bg-orange-500/8" },
              { label: "דחוף — ללא הארכה",     value: stats.urgent, color: "text-rose-400",   bg: "bg-rose-500/8" },
              { label: "שיקום לא הושלם",        value: stats.norehab, color: "text-amber-400",  bg: "bg-amber-500/8" },
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
              אין משתתפים העונים לסינון
            </div>
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--foreground)]/[0.02]">
                      {[
                        "משתתף",
                        "תחילה → סיום",
                        "ימים נותרים",
                        "הארכה נשלחה",
                        "הארכה התקבלה",
                        "תוכנית שיקום",
                        'עו"ס',
                      ].map(h => (
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
                        const rowBg = days !== null && days <= 7 && days >= 0
                          ? "bg-rose-500/[0.03]"
                          : days !== null && days <= 14 && days >= 0
                          ? "bg-orange-500/[0.03]"
                          : "";
                        const isEditingDate = editingEndDateId === p.id;

                        return (
                          <motion.tr key={p.id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.02 }}
                            className={`group hover:bg-[var(--foreground)]/[0.02] transition-colors ${rowBg}`}>

                            {/* Name */}
                            <td className="px-4 py-3">
                              <button
                                onClick={() => router.push(`/patients/${p.id}`)}
                                className="text-right hover:text-teal-400 transition-colors">
                                <p className="font-semibold leading-tight">{p.firstName} {p.lastName}</p>
                                <p className="text-[10px] text-[var(--muted)] font-mono mt-0.5">{p.idNumber || "—"}</p>
                              </button>
                            </td>

                            {/* Dates */}
                            <td className="px-4 py-3">
                              <div className="text-xs space-y-0.5">
                                <div className="flex items-center gap-1 text-[var(--muted)]">
                                  <CalendarDays className="w-3 h-3 shrink-0" />
                                  {p.startDate ? fmtDate(p.startDate) : "—"}
                                </div>
                                {isEditingDate ? (
                                  <div className="flex items-center gap-1 mt-1">
                                    <input
                                      type="date"
                                      value={editEndDateVal}
                                      onChange={e => setEditEndDateVal(e.target.value)}
                                      autoFocus
                                      className="bg-[var(--background)] border border-teal-500/40 rounded px-2 py-1 text-[10px] focus:outline-none focus:border-teal-500 w-32"
                                    />
                                    <button onClick={() => saveEndDate(p.id)} disabled={saving === p.id + "_date"}
                                      className="p-1 rounded bg-teal-500/15 text-teal-400 hover:bg-teal-500/25">
                                      {saving === p.id + "_date" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    </button>
                                    <button onClick={() => setEditingEndDateId(null)}
                                      className="p-1 rounded bg-[var(--foreground)]/5 text-[var(--muted)]">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 group/date cursor-pointer"
                                    onClick={() => { setEditingEndDateId(p.id); setEditEndDateVal(p.endDate || format(endDate || new Date(), "yyyy-MM-dd")); }}>
                                    <span className={days !== null && days <= 14 && days >= 0 ? "text-orange-400 font-semibold" : "text-[var(--muted)]"}>
                                      → {fmtDate(endDate)}
                                    </span>
                                    {isAuto && <span className="text-[9px] text-[var(--muted)] opacity-60">(אוטו׳)</span>}
                                    <Edit3 className="w-3 h-3 text-[var(--muted)] opacity-0 group-hover/date:opacity-60 transition-opacity" />
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Days remaining */}
                            <td className="px-4 py-3">
                              <UrgencyChip days={days} />
                            </td>

                            {/* Extension Sent */}
                            <td className="px-4 py-3">
                              {p.extensionSent ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                                    <Check className="w-3 h-3" /> נשלחה
                                  </span>
                                  {p.extensionSentAt && (
                                    <span className="text-[9px] text-[var(--muted)]">{fmtDate(p.extensionSentAt)}</span>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => markExtensionSent(p.id)}
                                  disabled={saving === p.id + "_sent" || !!p.extensionReceived}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-lg hover:bg-orange-500/20 transition-all disabled:opacity-30"
                                >
                                  {saving === p.id + "_sent" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                  סמן נשלחה
                                </button>
                              )}
                            </td>

                            {/* Extension Received */}
                            <td className="px-4 py-3">
                              {p.extensionReceived ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                                    <CheckCircle2 className="w-3 h-3" /> התקבלה
                                  </span>
                                  {p.extensionReceivedAt && (
                                    <span className="text-[9px] text-[var(--muted)]">{fmtDate(p.extensionReceivedAt)}</span>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => markExtensionReceived(p)}
                                  disabled={saving === p.id + "_recv"}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all disabled:opacity-30"
                                >
                                  {saving === p.id + "_recv" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                  סמן (+3 חודשים)
                                </button>
                              )}
                            </td>

                            {/* Rehab completed */}
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
        </main>
      </div>
    </RoleGuard>
  );
}
