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
      <div dir="rtl" className="flex flex-col h-screen bg-[#020617] text-slate-200 overflow-hidden">

        {/* ── CRM Top Bar ── */}
        <header className="h-16 border-b border-white/[0.05] bg-slate-950/50 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-40">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-white tracking-tight leading-none mb-1">מצבת מטופלים</h1>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                <span>מערכת</span>
                <ChevronLeft className="w-2.5 h-2.5" />
                <span>מטופלים</span>
                <ChevronLeft className="w-2.5 h-2.5" />
                <span className="text-emerald-500">{filtered.length} רשומות</span>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 w-80 focus-within:border-emerald-500/50 focus-within:bg-white/[0.07] transition-all">
              <Search className="w-4 h-4 text-slate-500" />
              <input type="text" placeholder="חיפוש מהיר (שם, ת.ז...)"
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="bg-transparent border-none outline-none text-sm w-full placeholder:text-slate-600" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-lg">
              <button onClick={() => setFilterStatus("all")}
                className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${filterStatus === "all" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>
                הכל
              </button>
              <button onClick={() => setFilterStatus("active")}
                className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${filterStatus === "active" ? "bg-emerald-500/10 text-emerald-400" : "text-slate-500 hover:text-slate-300"}`}>
                פעיל
              </button>
            </div>

            <button onClick={() => window.location.reload()}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            
            <button onClick={() => router.push("/patients/new")}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-emerald-600/20 active:scale-95">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">מטופל חדש</span>
            </button>
          </div>

        {/* ── Filters Bar (Desktop Secondary) ── */}
        <div className="hidden md:flex items-center gap-4 px-6 py-3 border-b border-white/[0.05] bg-slate-900/20 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 whitespace-nowrap">
            <Users className="w-3.5 h-3.5" />
            <span>סינון לפי תוכנית:</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setFilterProgram("all")}
              className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${
                filterProgram === "all" ? "bg-white text-slate-900 border-white" : "border-white/10 text-slate-400 hover:border-white/30"
              }`}>
              הכל
            </button>
            {activePrograms.map(pr => (
              <button key={pr.id} onClick={() => setFilterProgram(pr.id)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${
                  filterProgram === pr.id ? "bg-emerald-500 text-white border-emerald-500" : "border-white/10 text-slate-400 hover:border-white/30"
                }`}>
                {pr.name}
              </button>
            ))}
          </div>

          <div className="mr-auto flex items-center gap-4">
            {isAdmin && (
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${showAll ? "bg-emerald-500" : "bg-slate-700"}`}>
                  <input type="checkbox" className="hidden" checked={showAll} onChange={() => setShowAll(!showAll)} />
                  <div className={`w-3 h-3 bg-white rounded-full transition-transform ${showAll ? "-translate-x-4" : "translate-x-0"}`} />
                </div>
                <span className="text-[11px] font-bold text-slate-500 group-hover:text-slate-300 transition-colors">צפייה בכל המטופלים</span>
              </label>
            )}
          </div>
        </div>
      </header>

        {/* ── Main Content Area ── */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-[#020617]">
          <div className="p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="relative">
                  <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  </div>
                </div>
                <p className="text-slate-400 text-sm font-medium animate-pulse">טוען נתונים מהשרת...</p>
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center py-20 gap-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-rose-500" />
                </div>
                <div className="text-center">
                  <p className="text-white font-bold">שגיאה בטעינת נתונים</p>
                  <p className="text-slate-400 text-sm mt-1">{loadError}</p>
                </div>
                <button onClick={() => { setLoading(true); fetchPatients(); }}
                  className="mt-2 flex items-center gap-2 px-6 py-2 bg-rose-500 text-white rounded-lg text-sm font-bold hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20">
                  <RefreshCw className="w-4 h-4" /> ניסיון חוזר
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-32 gap-4">
                <div className="w-20 h-20 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center">
                  <Users className="w-8 h-8 text-slate-700" />
                </div>
                <div className="text-center">
                  <p className="text-slate-400 font-bold">לא נמצאו רשומות</p>
                  <p className="text-slate-600 text-xs mt-1">נסה לשנות את מסנני החיפוש או להוסיף מטופל חדש</p>
                </div>
              </div>
            ) : (

              <div className="space-y-8">
                {programSections.map(([pid, { program, pal, groupMap }]) => {
                  const total = Array.from(groupMap.values()).reduce((s, g) => s + g.patients.length, 0);
                  const isOpen = !collapsed.has(pid);
                  const label = program?.name ?? "ללא תוכנית";

                  return (
                    <section key={pid} className="space-y-4">
                      {/* Section Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-1 h-5 rounded-full ${pal.text.replace("text-", "bg-")}`} />
                          <h2 className="text-sm font-black text-white uppercase tracking-widest">{label}</h2>
                          <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[10px] font-bold text-slate-500">{total} רשומות</span>
                        </div>
                        <button onClick={() => toggleCollapse(pid)} className="p-1 hover:bg-white/5 rounded transition-colors text-slate-600 hover:text-slate-400">
                          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>

                      {isOpen && (
                        <div className="space-y-6">
                          {/* Desktop Table View */}
                          <div className="hidden lg:block bg-slate-950/40 border border-white/[0.05] rounded-xl overflow-hidden shadow-2xl">
                            <table className="w-full text-right border-collapse">
                              <thead>
                                <tr className="bg-slate-900/40 border-b border-white/[0.05]">
                                  <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/4">שם המטופל</th>
                                  <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">ת.ז</th>
                                  <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">קבוצה</th>
                                  <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">עו״ס מטפל</th>
                                  <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">סטטוס</th>
                                  <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">תאריך התחלה</th>
                                  <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-40">פעולות</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/[0.03]">
                                {Array.from(groupMap.entries()).map(([gid, { group, patients }]) => (
                                  <Fragment key={gid}>
                                    {groupMap.size > 1 && (
                                      <tr className="bg-white/[0.01]">
                                        <td colSpan={7} className="px-5 py-2">
                                          <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded ${pal.bg} ${pal.text}`}>
                                              {group?.name || "ללא קבוצה"}
                                            </span>
                                            <span className="w-1 h-1 rounded-full bg-slate-700" />
                                            <span className="text-[10px] font-bold text-slate-600">{patients.length} רשומות</span>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                    {patients.map(p => (
                                      <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                                        <td className="px-5 py-4">
                                          <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black text-white/90 shadow-lg ${avatarColor(p.firstName)}`}>
                                              {`${p.firstName?.[0] ?? ""}${p.lastName?.[0] ?? ""}`.toUpperCase()}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                              <span className="text-sm font-bold text-white truncate">{p.firstName} {p.lastName}</span>
                                              <span className="text-[10px] text-slate-500 font-medium">{p.hosenType || "כללי"}</span>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-5 py-4 font-mono text-[11px] text-slate-500">{p.idNumber}</td>
                                        <td className="px-5 py-4">
                                          <span className="text-xs font-bold text-slate-400">{group?.name || "—"}</span>
                                        </td>
                                        <td className="px-5 py-4">
                                          <div className="flex items-center gap-2">
                                            <User className="w-3 h-3 text-slate-600" />
                                            <span className="text-xs font-medium text-slate-400">
                                              {socialWorkers.find(w => w.id === p.assignedWorkerId)?.name || "טרם שובץ"}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="px-5 py-4">
                                          <select value={p.status} onChange={e => updateStatus(p.id, e.target.value as PatientStatus)}
                                            className={`border rounded-lg px-2.5 py-1 bg-transparent text-[10px] font-black focus:outline-none cursor-pointer transition-all ${STATUS_META[p.status].pill}`}>
                                            {Object.entries(STATUS_META).map(([v, m]) => (
                                              <option key={v} value={v} className="bg-slate-900 text-white font-bold">{m.label}</option>
                                            ))}
                                          </select>
                                        </td>
                                        <td className="px-5 py-4 text-[11px] font-mono text-slate-500">
                                          {p.startDate ? format(new Date(p.startDate + "T12:00:00"), "dd/MM/yyyy") : "—"}
                                        </td>
                                        <td className="px-5 py-4">
                                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                                            <button onClick={() => fetchHistory(p)} className="p-2 rounded-lg bg-white/5 hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400 transition-all border border-white/5" title="נוכחות">
                                              <Calendar className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => { setEditPatient(p); setEditForm({ firstName: p.firstName, lastName: p.lastName, idNumber: p.idNumber, hosenType: p.hosenType, assignedWorkerId: p.assignedWorkerId, status: p.status, startDate: p.startDate, endDate: p.endDate }); }}
                                              className="p-2 rounded-lg bg-white/5 hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 transition-all border border-white/5" title="עריכה">
                                              <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => router.push(`/patients/${p.id}`)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white transition-all border border-white/5" title="פרופיל">
                                              <ChevronLeft className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Mobile/Small Tablet Cards */}
                          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {Array.from(groupMap.values()).flatMap(g => g.patients).map(p => (
                              <div key={p.id} className="bg-slate-900/40 border border-white/[0.05] rounded-2xl p-4 flex flex-col gap-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white ${avatarColor(p.firstName)}`}>
                                      {`${p.firstName?.[0] ?? ""}${p.lastName?.[0] ?? ""}`.toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-sm font-bold text-white">{p.firstName} {p.lastName}</span>
                                      <span className="text-[10px] text-slate-500 font-mono">{p.idNumber}</span>
                                    </div>
                                  </div>
                                  <select value={p.status} onChange={e => updateStatus(p.id, e.target.value as PatientStatus)}
                                    className={`border rounded-full px-2 py-0.5 bg-transparent text-[9px] font-black focus:outline-none ${STATUS_META[p.status].pill}`}>
                                    {Object.entries(STATUS_META).map(([v, m]) => (
                                      <option key={v} value={v} className="bg-slate-900 text-white">{m.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                                  <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                                    <p className="text-slate-600 mb-0.5 uppercase tracking-tighter">קבוצה</p>
                                    <p className="text-slate-400 truncate">{resolveGroup(p.hosenType)?.name || "—"}</p>
                                  </div>
                                  <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                                    <p className="text-slate-600 mb-0.5 uppercase tracking-tighter">עו״ס</p>
                                    <p className="text-slate-400 truncate">{socialWorkers.find(w => w.id === p.assignedWorkerId)?.name || "—"}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5">
                                  <button onClick={() => fetchHistory(p)} className="flex-1 py-2 rounded-lg bg-white/5 text-[10px] font-black text-slate-400 hover:text-white transition-all uppercase tracking-widest">נוכחות</button>
                                  <button onClick={() => router.push(`/patients/${p.id}`)} className="flex-1 py-2 rounded-lg bg-emerald-600 text-[10px] font-black text-white hover:bg-emerald-500 transition-all uppercase tracking-widest">תיק מטופל</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </main>

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
                        {r.status === "present" ? <><Check className="w-3 h-3" />נוכח</> : <><X className="w-3 h-3" />נעדר</>}
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
