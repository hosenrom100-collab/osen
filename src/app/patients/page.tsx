"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useMemo, Fragment } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, orderBy, doc, updateDoc, where } from "firebase/firestore";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  Search, ArrowRight, User, Loader2, Calendar, Plus, Edit3,
  ChevronLeft, AlertCircle, RefreshCw, Check, X, ArrowLeftRight,
  Users, ChevronDown, ChevronUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";

export type PatientStatus = "active" | "finished" | "waiting_intake" | "waiting_start";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  startDate: string;
  endDate: string;
  hosenType?: string;
  status: PatientStatus;
  assignedWorkerId?: string;
  programId?: string;
}
interface Group   { id: string; name: string; programId?: string }
interface Program { id: string; name: string }
interface Worker  { id: string; name: string }

const STATUS_META: Record<PatientStatus, { label: string; pill: string }> = {
  active:         { label: "פעיל",           pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  finished:       { label: "סיום",           pill: "bg-slate-500/10  text-slate-400  border-slate-500/20"  },
  waiting_intake: { label: "ממתין לאינטייק", pill: "bg-amber-500/10  text-amber-400  border-amber-500/20"  },
  waiting_start:  { label: "ממתין להתחלה",  pill: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
};

const PROGRAM_PALETTE = [
  { bg: "bg-blue-600/10",   border: "border-blue-500/25",   text: "text-blue-400",   chip: "bg-blue-600 border-blue-500"    },
  { bg: "bg-violet-600/10", border: "border-violet-500/25", text: "text-violet-400", chip: "bg-violet-600 border-violet-500" },
  { bg: "bg-rose-600/10",   border: "border-rose-500/25",   text: "text-rose-400",   chip: "bg-rose-600 border-rose-500"    },
  { bg: "bg-amber-600/10",  border: "border-amber-500/25",  text: "text-amber-400",  chip: "bg-amber-600 border-amber-500"  },
  { bg: "bg-teal-600/10",   border: "border-teal-500/25",   text: "text-teal-400",   chip: "bg-teal-600 border-teal-500"    },
  { bg: "bg-indigo-600/10", border: "border-indigo-500/25", text: "text-indigo-400", chip: "bg-indigo-600 border-indigo-500" },
];

const AVATAR_COLORS = ["bg-blue-600","bg-violet-600","bg-rose-600","bg-amber-600","bg-teal-600","bg-indigo-600"];
const avatarColor   = (name: string) => AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

const NO_PROGRAM_ID = "__none__";

export default function PatientsPage() {
  const { assignedGroups, isAdmin } = useAuth();
  const router = useRouter();

  const [patients,      setPatients]      = useState<Patient[]>([]);
  const [groups,        setGroups]        = useState<Group[]>([]);
  const [programs,      setPrograms]      = useState<Program[]>([]);
  const [socialWorkers, setSocialWorkers] = useState<Worker[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);

  const [searchTerm,    setSearchTerm]    = useState("");
  const [filterStatus,  setFilterStatus]  = useState<string>("all");
  const [filterProgram, setFilterProgram] = useState<string>("all");
  const [showAll,       setShowAll]       = useState(isAdmin || assignedGroups.length === 0);
  const [collapsed,     setCollapsed]     = useState<Set<string>>(new Set());

  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [editForm,    setEditForm]    = useState<Partial<Patient>>({});
  const [isSaving,    setIsSaving]    = useState(false);
  const [histPatient, setHistPatient] = useState<Patient | null>(null);
  const [history,     setHistory]     = useState<{ date: string; status: string }[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  /* ── Data fetching ── */
  useEffect(() => {
    Promise.all([fetchPrograms(), fetchGroups(), fetchWorkers(), fetchPatients()]);
  }, []);

  const fetchPrograms = async () => {
    const snap = await getDocs(query(collection(db, "programs"), orderBy("name")));
    setPrograms(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
  };

  const fetchGroups = async () => {
    const snap = await getDocs(query(collection(db, "groups"), orderBy("name")));
    setGroups(snap.docs.map(d => ({ id: d.id, name: d.data().name, programId: d.data().programId })));
  };

  const fetchWorkers = async () => {
    const snap = await getDocs(collection(db, "users"));
    const list: Worker[] = [];
    snap.forEach(d => {
      const data = d.data();
      if (["social_worker","admin","manager"].includes(data.role))
        list.push({ id: d.id, name: data.name || data.email });
    });
    setSocialWorkers(list);
  };

  const fetchPatients = async () => {
    setLoadError(null);
    try {
      const snap = await getDocs(collection(db, "patients"));
      setPatients(snap.docs.map(d => ({ id: d.id, ...d.data(), status: d.data().status || "active" } as Patient)));
    } catch (e: any) {
      setLoadError(e.message || "שגיאה בטעינת הנתונים");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (patient: Patient) => {
    setHistPatient(patient);
    setHistLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "attendance"), where("patientId", "==", patient.id), orderBy("date", "desc"))
      );
      setHistory(snap.docs.map(d => ({ date: d.data().date, status: d.data().status })));
    } finally {
      setHistLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!editPatient) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "patients", editPatient.id), editForm);
      setPatients(ps => ps.map(p => p.id === editPatient.id ? { ...p, ...editForm } : p));
      setEditPatient(null);
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = async (id: string, status: PatientStatus) => {
    await updateDoc(doc(db, "patients", id), { status });
    setPatients(ps => ps.map(p => p.id === id ? { ...p, status } : p));
  };

  const toggleCollapse = (id: string) =>
    setCollapsed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  /* ── Helpers ── */
  const resolveGroup = (ht?: string) =>
    groups.find(g => g.id === ht || g.name === ht) ?? null;

  /* ── Filtered patients ── */
  const filtered = useMemo(() => patients.filter(p => {
    const matchSearch =
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.idNumber || "").includes(searchTerm);

    let matchAccess = showAll;
    if (!matchAccess) {
      const g = groups.find(g => g.id === (p.hosenType || "") || g.name === (p.hosenType || ""));
      matchAccess = g ? assignedGroups.includes(g.id) : false;
    }

    const matchStatus = filterStatus === "all" || p.status === filterStatus;

    const matchProgram = filterProgram === "all" || (() => {
      const g = resolveGroup(p.hosenType);
      return (g?.programId ?? NO_PROGRAM_ID) === filterProgram;
    })();

    return matchSearch && matchAccess && matchStatus && matchProgram;
  }), [patients, searchTerm, filterStatus, filterProgram, showAll, groups, assignedGroups]);

  /* ── Build program → group sections ── */
  const programSections = useMemo(() => {
    const map = new Map<string, {
      program: Program | null;
      pal: (typeof PROGRAM_PALETTE)[0];
      groupMap: Map<string, { group: Group | null; patients: Patient[] }>;
    }>();

    for (const p of filtered) {
      const group   = resolveGroup(p.hosenType);
      const program = group?.programId ? programs.find(pr => pr.id === group.programId) ?? null : null;
      const pid     = program?.id ?? NO_PROGRAM_ID;
      const gid     = group?.id   ?? "__none__";

      if (!map.has(pid)) {
        const idx = program ? programs.findIndex(pr => pr.id === program.id) % PROGRAM_PALETTE.length : PROGRAM_PALETTE.length - 1;
        map.set(pid, { program, pal: PROGRAM_PALETTE[idx], groupMap: new Map() });
      }
      const entry = map.get(pid)!;
      if (!entry.groupMap.has(gid))
        entry.groupMap.set(gid, { group: group ?? null, patients: [] });
      entry.groupMap.get(gid)!.patients.push(p);
    }

    return Array.from(map.entries()).sort(([aId, a], [bId, b]) => {
      if (aId === NO_PROGRAM_ID) return 1;
      if (bId === NO_PROGRAM_ID) return -1;
      return (a.program?.name ?? "").localeCompare(b.program?.name ?? "");
    });
  }, [filtered, groups, programs]);

  /* ── Programs with patients (for chips) ── */
  const activePrograms = useMemo(() => {
    const ids = new Set(programSections.filter(([id]) => id !== NO_PROGRAM_ID).map(([id]) => id));
    return programs.filter(pr => ids.has(pr.id));
  }, [programSections, programs]);

  const hasUnassigned = programSections.some(([id]) => id === NO_PROGRAM_ID);

  /* ── Render ── */
  return (
    <RoleGuard allowedRoles={["admin","manager","instructor","social_worker","employee"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-slate-950 text-white">

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-white/[0.07]">
          <div className="px-4 md:px-5 pt-4 md:pt-0 pb-3 md:pb-0 space-y-3 md:space-y-0 md:flex md:items-center md:gap-3 md:h-12">

            {/* Back — mobile only */}
            <button onClick={() => router.push("/")}
              className="md:hidden p-2.5 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center">
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Title */}
            <div className="flex items-center gap-3 md:shrink-0">
              <h1 className="text-[15px] font-semibold text-white">מצבת מטופלים</h1>
              <span className="text-[11px] text-slate-500 hidden md:inline">{filtered.length} מטופלים</span>
              {/* mobile subtitle */}
              <p className="text-[11px] text-slate-500 md:hidden">{filtered.length} מטופלים</p>
            </div>

            {/* Search — flex-1 on desktop */}
            <div className="relative flex-1 md:max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
              <input type="text" placeholder="חיפוש לפי שם או ת.ז..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/[0.07] rounded md:rounded py-2 md:py-1.5 pr-9 pl-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 md:mr-auto">
              {assignedGroups.length > 0 && (
                <button onClick={() => setShowAll(v => !v)}
                  aria-label={showAll ? "הצג קבוצות שלי בלבד" : "הצג הכל"}
                  className={`p-2 rounded border transition-all min-w-[32px] min-h-[32px] flex items-center justify-center text-xs ${showAll ? "bg-blue-600/15 border-blue-500/30 text-blue-400" : "bg-white/5 border-white/[0.07] text-slate-500"}`}>
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => router.push("/patients/new")}
                className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-semibold active:scale-95 transition-all">
                <Plus className="w-3.5 h-3.5" />
                <span>מטופל חדש</span>
              </button>
            </div>
          </div>

          {/* Status + Program chips — full row on both */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 md:px-5 pb-2 md:pb-2 md:border-t md:border-white/[0.05] md:pt-1.5">
              {[
                { key: "all",           label: "הכל" },
                { key: "active",        label: "פעיל" },
                { key: "waiting_intake",label: "ממתין לאינטייק" },
                { key: "waiting_start", label: "ממתין להתחלה" },
                { key: "finished",      label: "סיים" },
              ].map(f => (
                <button key={f.key} onClick={() => setFilterStatus(f.key)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                    filterStatus === f.key
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
                  }`}>
                  {f.label}
                </button>
              ))}

              {(activePrograms.length > 0 || hasUnassigned) && (
                <div className="w-px bg-white/10 shrink-0 mx-1 self-stretch" />
              )}

              {activePrograms.map((pr, i) => {
                const pal    = PROGRAM_PALETTE[i % PROGRAM_PALETTE.length];
                const active = filterProgram === pr.id;
                return (
                  <button key={pr.id} onClick={() => setFilterProgram(active ? "all" : pr.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                      active ? `${pal.chip} text-white` : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
                    }`}>
                    <Users className="w-3 h-3" />
                    {pr.name}
                  </button>
                );
              })}

              {hasUnassigned && (
                <button onClick={() => setFilterProgram(filterProgram === NO_PROGRAM_ID ? "all" : NO_PROGRAM_ID)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                    filterProgram === NO_PROGRAM_ID
                      ? "bg-slate-600 border-slate-500 text-white"
                      : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
                  }`}>
                  ללא תוכנית
                </button>
              )}
          </div>
        </header>

        {/* ── Content ── */}
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-28">

          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-slate-500 text-sm">טוען מטופלים...</p>
            </div>
          )}

          {!loading && loadError && (
            <div className="flex flex-col items-center py-24 gap-4">
              <AlertCircle className="w-10 h-10 text-rose-400" />
              <p className="text-slate-400 text-sm">{loadError}</p>
              <button onClick={() => { setLoading(true); fetchPatients(); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-bold hover:bg-white/10 transition-all">
                <RefreshCw className="w-4 h-4" /> נסה שוב
              </button>
            </div>
          )}

          {!loading && !loadError && filtered.length === 0 && (
            <div className="flex flex-col items-center py-24 gap-3">
              <User className="w-10 h-10 text-slate-700" />
              <p className="text-slate-500 text-sm">לא נמצאו מטופלים</p>
            </div>
          )}

          {!loading && !loadError && filtered.length > 0 && (
            <div className="space-y-5">
              {programSections.map(([pid, { program, pal, groupMap }]) => {
                const total     = Array.from(groupMap.values()).reduce((s, g) => s + g.patients.length, 0);
                const isOpen    = !collapsed.has(pid);
                const label     = program?.name ?? "ללא תוכנית";

                return (
                  <section key={pid}>

                    {/* Program header — card on mobile, compact label on desktop */}
                    <button onClick={() => toggleCollapse(pid)}
                      className={`w-full flex items-center justify-between mb-2 transition-all
                        px-4 py-3 rounded-2xl border hover:brightness-110 ${pal.bg} ${pal.border}
                        md:px-2 md:py-1.5 md:rounded md:bg-transparent md:border-0 md:border-b md:border-white/[0.07] md:hover:brightness-100 md:hover:bg-transparent`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 hidden md:block ${pal.text.replace("text-","bg-")}`} />
                        <Users className={`w-4 h-4 shrink-0 md:hidden ${pal.text}`} />
                        <span className={`font-semibold text-sm truncate md:text-xs md:font-bold md:uppercase md:tracking-wider ${pal.text}`}>{label}</span>
                        <span className="text-xs text-slate-500 font-medium shrink-0">{total}</span>
                      </div>
                      {isOpen
                        ? <ChevronUp   className="w-4 h-4 text-slate-500 shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                      }
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div key="body"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          {/* Desktop table */}
                          <div className="hidden md:block bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
                            <table className="w-full text-right">
                              <thead>
                                <tr className="border-b border-white/8 bg-white/[0.015]">
                                  {["מטופל","ת.ז","תוכנית","קבוצה","עו״ס","סטטוס","תאריך התחלה",""].map(h => (
                                    <th key={h} className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {Array.from(groupMap.entries()).map(([gid, { group, patients }]) => (
                                  <Fragment key={gid}>
                                    {groupMap.size > 1 && (
                                      <tr key={`gh-${gid}`}>
                                        <td colSpan={8} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest ${pal.text} opacity-60 bg-white/[0.01]`}>
                                          {group?.name ?? "ללא קבוצה"} — {patients.length}
                                        </td>
                                      </tr>
                                    )}
                                    {patients.map(p => (
                                      <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                          <div className="flex items-center gap-2">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black text-white shrink-0 ${avatarColor(p.firstName)}`}>
                                              {`${p.firstName?.[0] ?? ""}${p.lastName?.[0] ?? ""}`.toUpperCase()}
                                            </div>
                                            <span className="font-semibold text-sm">{p.firstName} {p.lastName}</span>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">{p.idNumber}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                          <span className="text-[11px] font-bold text-slate-400">
                                            {program?.name || "—"}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                          <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${pal.bg} ${pal.text}`}>
                                            {group?.name ?? resolveGroup(p.hosenType)?.name ?? "—"}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                                          {socialWorkers.find(w => w.id === p.assignedWorkerId)?.name || "—"}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                          <select value={p.status} onChange={e => updateStatus(p.id, e.target.value as PatientStatus)}
                                            className={`border rounded-full px-2 py-0.5 bg-transparent text-[10px] font-bold focus:outline-none cursor-pointer ${STATUS_META[p.status].pill}`}>
                                            {Object.entries(STATUS_META).map(([v, m]) => (
                                              <option key={v} value={v} className="bg-slate-900 text-white">{m.label}</option>
                                            ))}
                                          </select>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                          {p.startDate ? format(new Date(p.startDate + "T12:00:00"), "dd/MM/yyyy") : "—"}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                          <div className="flex items-center gap-1.5">
                                            <button onClick={() => fetchHistory(p)} aria-label="נוכחות" className="p-1.5 rounded-lg bg-white/5 hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400 transition-all"><Calendar className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => { setEditPatient(p); setEditForm({ firstName: p.firstName, lastName: p.lastName, idNumber: p.idNumber, hosenType: p.hosenType, assignedWorkerId: p.assignedWorkerId, status: p.status, startDate: p.startDate, endDate: p.endDate }); }}
                                              aria-label="עריכה" className="p-1.5 rounded-lg bg-white/5 hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 transition-all"><Edit3 className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => router.push(`/patients/${p.id}`)} aria-label="פרופיל" className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white transition-all"><ChevronLeft className="w-3.5 h-3.5" /></button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Mobile cards */}
                          <div className="md:hidden space-y-4">
                            {Array.from(groupMap.entries()).map(([gid, { group, patients }]) => (
                              <div key={gid}>
                                {groupMap.size > 1 && (
                                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 px-1 ${pal.text} opacity-70`}>
                                    {group?.name ?? "ללא קבוצה"} — {patients.length}
                                  </p>
                                )}
                                <div className="space-y-2">
                                  {patients.map(p => {
                                    const initials = `${p.firstName?.[0] ?? ""}${p.lastName?.[0] ?? ""}`.toUpperCase();
                                    return (
                                      <motion.div key={p.id}
                                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                        className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
                                        <div className="flex items-center gap-3 px-4 py-3.5">
                                          <div className={`w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-sm font-black text-white ${avatarColor(p.firstName)}`}>
                                            {initials}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="font-bold text-[15px] leading-tight truncate">{p.firstName} {p.lastName}</p>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                              <span className="text-[11px] text-slate-500 font-mono">{p.idNumber}</span>
                                              {group && (
                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${pal.bg} ${pal.text}`}>
                                                  {group.name}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <select value={p.status} onChange={e => updateStatus(p.id, e.target.value as PatientStatus)}
                                            className={`border rounded-full px-2.5 py-1 bg-transparent text-[10px] font-bold focus:outline-none cursor-pointer shrink-0 ${STATUS_META[p.status].pill}`}>
                                            {Object.entries(STATUS_META).map(([v, m]) => (
                                              <option key={v} value={v} className="bg-slate-900 text-white">{m.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="flex border-t border-white/5">
                                          <button onClick={() => fetchHistory(p)} className="flex-1 h-10 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/5 transition-colors">
                                            <Calendar className="w-3.5 h-3.5" /> נוכחות
                                          </button>
                                          <div className="w-px bg-white/5" />
                                          <button onClick={() => { setEditPatient(p); setEditForm({ firstName: p.firstName, lastName: p.lastName, idNumber: p.idNumber, hosenType: p.hosenType, assignedWorkerId: p.assignedWorkerId, status: p.status, startDate: p.startDate, endDate: p.endDate }); }}
                                            className="flex-1 h-10 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-blue-400 hover:bg-blue-500/5 transition-colors">
                                            <Edit3 className="w-3.5 h-3.5" /> עריכה
                                          </button>
                                          <div className="w-px bg-white/5" />
                                          <button onClick={() => router.push(`/patients/${p.id}`)}
                                            className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
                                            <ChevronLeft className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </motion.div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* ── History modal ── */}
        <AnimatePresence>
          {histPatient && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setHistPatient(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 26, stiffness: 260 }}
                className="relative bg-slate-900 border-t sm:border border-white/10 w-full max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl">
                <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-3 mb-1 sm:hidden" />
                <div className="flex items-center justify-between p-5 border-b border-white/8">
                  <div>
                    <h2 className="font-bold text-base">היסטוריית נוכחות</h2>
                    <p className="text-emerald-400 text-[11px] font-bold mt-0.5">{histPatient.firstName} {histPatient.lastName}</p>
                  </div>
                  <button onClick={() => setHistPatient(null)} className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-4 max-h-[55vh] overflow-y-auto space-y-2">
                  {histLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
                  ) : history.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-10">אין רישומי נוכחות</p>
                  ) : history.map((r, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/[0.03] rounded-xl border border-white/5">
                      <p className="text-sm font-semibold">{r.date ? format(new Date(r.date + "T12:00:00"), "dd/MM/yyyy") : "—"}</p>
                      <span className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                        r.status === "present" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      }`}>
                        {r.status === "present" ? <><Check className="w-3 h-3" />נוכח</> : <><X className="w-3 h-3" />נפקד</>}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-white/5">
                  <button onClick={() => setHistPatient(null)} className="w-full py-3 bg-white/5 rounded-xl font-bold text-sm hover:bg-white/10 transition-all">סגור</button>
                </div>
              </motion.div>
            </div>
          )}

          {editPatient && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setEditPatient(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 26, stiffness: 260 }}
                className="relative bg-slate-900 border-t sm:border border-white/10 w-full max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92dvh]">
                <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />
                <div className="flex items-center justify-between p-5 border-b border-white/8 shrink-0">
                  <h3 className="font-bold text-base">עריכה מהירה</h3>
                  <button onClick={() => setEditPatient(null)} className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                  <div className="grid grid-cols-2 gap-3">
                    {[["שם פרטי","firstName"],["שם משפחה","lastName"]].map(([label, field]) => (
                      <div key={field}>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">{label}</label>
                        <input value={(editForm as any)[field] || ""}
                          onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">תעודת זהות</label>
                    <input value={editForm.idNumber || ""}
                      onChange={e => setEditForm(f => ({ ...f, idNumber: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">קבוצה</label>
                    <select value={editForm.hosenType || ""}
                      onChange={e => setEditForm(f => ({ ...f, hosenType: e.target.value }))}
                      className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors">
                      <option value="">בחר קבוצה</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">עו״ס אחראי</label>
                    <select value={editForm.assignedWorkerId || ""}
                      onChange={e => setEditForm(f => ({ ...f, assignedWorkerId: e.target.value }))}
                      className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors">
                      <option value="">בחר עו״ס</option>
                      {socialWorkers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">תאריך התחלה</label>
                      <input type="date" value={editForm.startDate || ""}
                        onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">תאריך סיום</label>
                      <input type="date" value={editForm.endDate || ""}
                        onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">סטטוס</label>
                    <select value={editForm.status || "active"}
                      onChange={e => setEditForm(f => ({ ...f, status: e.target.value as PatientStatus }))}
                      className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors">
                      {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="h-4 shrink-0" />
                </div>
                <div className="p-5 border-t border-white/8 flex gap-3 shrink-0 bg-slate-900/80 backdrop-blur-md">
                  <button onClick={() => setEditPatient(null)} className="flex-1 py-3 bg-white/5 rounded-xl font-bold text-sm hover:bg-white/10 transition-all">ביטול</button>
                  <button onClick={saveEdit} disabled={isSaving}
                    className="flex-1 py-3 bg-blue-600 rounded-xl font-bold text-sm hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "שמור שינויים"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </RoleGuard>
  );
}
