"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, query, where, orderBy
} from "firebase/firestore";
import {
  ArrowRight, Loader2, CheckCircle, Users, ChevronDown,
  ClipboardList, RefreshCw, Layers, Share2, Check
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface Program { id: string; name: string }
interface Group   { id: string; name: string; programId?: string }
interface Patient { id: string; firstName: string; lastName: string; hosenType?: string; programId?: string }

interface GroupData {
  group:   Group;
  total:   number;
  present: number;
  absent:  number;
  missing: number;
  presentNames: string[];
  absentNames:  string[];
}

interface ProgramData {
  program: Program;
  groups:  GroupData[];
  total:   number;
  present: number;
}

export default function AttendanceOverviewPage() {
  const router = useRouter();

  const [data,     setData]     = useState<ProgramData[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const today = format(new Date(), "yyyy-MM-dd");

  const handleCopyGroup = (groupName: string, programName: string, presentNames: string[], groupId: string) => {
    const text = presentNames.map(name => name.split(" ")[0]).filter(Boolean).join("\n");
    
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedId(groupId);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch(err => console.error("Failed to copy text: ", err));
  };

  const handleCopyAll = () => {
    const allPresentNames: string[] = [];
    data.forEach(progData => {
      progData.groups.forEach(gd => {
        gd.presentNames.forEach(name => {
          const first = name.split(" ")[0];
          if (first) allPresentNames.push(first);
        });
      });
    });
    
    const text = allPresentNames.join("\n");
    
    navigator.clipboard.writeText(text.trim())
      .then(() => {
        setCopiedId("all");
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch(err => console.error("Failed to copy text: ", err));
  };

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [progSnap, groupSnap, patientSnap, attSnap] = await Promise.all([
        getDocs(query(collection(db, "programs"), orderBy("name"))),
        getDocs(query(collection(db, "groups"),   orderBy("name"))),
        getDocs(query(collection(db, "patients"), where("status", "==", "active"))),
        getDocs(query(collection(db, "attendance"), where("date", "==", today))),
      ]);

      const programs: Program[] = progSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
      const groups:   Group[]   = groupSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const patients: Patient[] = patientSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      const attMap: Record<string, "present" | "absent"> = {};
      attSnap.forEach(d => { attMap[d.data().patientId] = d.data().status; });

      // Patients by group
      const patsByGroup: Record<string, Patient[]> = {};
      patients.forEach(p => {
        const ht  = p.hosenType || "";
        const gId = groups.find(g => g.id === ht || g.name === ht)?.id;
        if (gId) {
          if (!patsByGroup[gId]) patsByGroup[gId] = [];
          patsByGroup[gId].push(p);
        }
      });

      // Build per-program data
      const result: ProgramData[] = programs.map(prog => {
        const programGroups = groups.filter(g => g.programId === prog.id);
        const groupData: GroupData[] = programGroups.map(g => {
          const pats = patsByGroup[g.id] || [];
          const presentPats = pats.filter(p => attMap[p.id] === "present");
          const absentPats  = pats.filter(p => attMap[p.id] === "absent");
          return {
            group:        g,
            total:        pats.length,
            present:      presentPats.length,
            absent:       absentPats.length,
            missing:      pats.length - presentPats.length - absentPats.length,
            presentNames: presentPats.map(p => `${p.firstName} ${p.lastName}`),
            absentNames:  absentPats.map(p => `${p.firstName} ${p.lastName}`),
          };
        });

        return {
          program: prog,
          groups:  groupData,
          total:   groupData.reduce((n, g) => n + g.total, 0),
          present: groupData.reduce((n, g) => n + g.present, 0),
        };
      });

      // Also handle groups not tied to any program
      const ungroupedGroups = groups.filter(g => !g.programId);
      if (ungroupedGroups.length > 0) {
        const groupData: GroupData[] = ungroupedGroups.map(g => {
          const pats = patsByGroup[g.id] || [];
          const presentPats = pats.filter(p => attMap[p.id] === "present");
          const absentPats  = pats.filter(p => attMap[p.id] === "absent");
          return {
            group:        g,
            total:        pats.length,
            present:      presentPats.length,
            absent:       absentPats.length,
            missing:      pats.length - presentPats.length - absentPats.length,
            presentNames: presentPats.map(p => `${p.firstName} ${p.lastName}`),
            absentNames:  absentPats.map(p => `${p.firstName} ${p.lastName}`),
          };
        });
        result.push({
          program: { id: "__other__", name: "קבוצות ללא תוכנית" },
          groups:  groupData,
          total:   groupData.reduce((n, g) => n + g.total, 0),
          present: groupData.reduce((n, g) => n + g.present, 0),
        });
      }

      setData(result.filter(p => p.total > 0));

      // Auto-expand all programs
      setExpanded(new Set(result.map(p => p.program.id)));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const grandTotal   = data.reduce((n, p) => n + p.total, 0);
  const grandPresent = data.reduce((n, p) => n + p.present, 0);
  const grandPct     = grandTotal > 0 ? Math.round((grandPresent / grandTotal) * 100) : 0;

  return (
    <RoleGuard allowedRoles={["admin","manager"]} redirectTo="/">
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

        {/* Header */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button onClick={() => router.push("/")}
              className="p-2 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all flex-shrink-0">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex-1">
              <h1 className="text-[17px] font-bold flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-emerald-400" /> מבט כולל — נוכחות
              </h1>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {format(new Date(), "EEEE, d בMMMM yyyy", { locale: he })}
              </p>
            </div>
            <button onClick={fetchAll} disabled={loading}
              className="p-2 rounded-xl bg-white/5 border border-white/10 disabled:opacity-40 active:scale-95 transition-all">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 space-y-4">
          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
            </div>
          ) : (
            <>
              {/* Grand total summary */}
              <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-sm text-emerald-300">סה״כ נוכחות היום</span>
                  </div>
                  <span className="text-emerald-400 font-black text-lg">{grandPresent}/{grandTotal}</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-emerald-500 rounded-full"
                    initial={{ width: 0 }} animate={{ width: `${grandPct}%` }} transition={{ duration: 0.6 }} />
                </div>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-emerald-500/10">
                  <p className="text-[11px] text-emerald-500/70 font-bold">{grandPct}% נוכחות</p>
                  <button
                    onClick={handleCopyAll}
                    className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 active:scale-95 transition-all text-[11px] font-bold text-emerald-300"
                  >
                    {copiedId === "all" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                        <span>הועתק!</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5" />
                        <span>העתק דוח מלא</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Per program */}
              {data.map(progData => {
                const isOpen = expanded.has(progData.program.id);
                const progPct = progData.total > 0 ? Math.round((progData.present / progData.total) * 100) : 0;

                return (
                  <div key={progData.program.id} className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
                    {/* Program header */}
                    <button onClick={() => toggle(progData.program.id)}
                      className="w-full flex items-center gap-3 px-4 py-4">
                      <div className="w-9 h-9 bg-violet-500/15 text-violet-400 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div className="flex-1 text-right">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[14px]">{progData.program.name}</span>
                          <span className="text-[11px] text-emerald-400 font-bold">
                            {progData.present}/{progData.total}
                          </span>
                          <span className="text-[10px] text-slate-600">({progPct}%)</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden mt-1.5">
                          <motion.div className="h-full bg-violet-500 rounded-full"
                            initial={{ width: 0 }} animate={{ width: `${progPct}%` }} transition={{ duration: 0.4 }} />
                        </div>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-600 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>

                    {/* Groups within program */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="border-t border-white/5 space-y-0">
                            {progData.groups.map((gd, gi) => (
                              <div key={gd.group.id} className={`${gi > 0 ? "border-t border-white/[0.04]" : ""}`}>
                                {/* Group row */}
                                <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-white/[0.02] min-w-0">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div className="w-1 h-7 rounded-full bg-blue-500/50 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                        <span className="font-bold text-[13px] text-white truncate max-w-[90px] sm:max-w-none">{gd.group.name}</span>
                                        <span className="text-[11px] text-emerald-400 font-bold flex-shrink-0">{gd.present}/{gd.total}</span>
                                        {gd.absent > 0 && (
                                          <span className="text-[10px] text-rose-400 font-bold flex-shrink-0">· {gd.absent} נעדרים</span>
                                        )}
                                        {gd.missing > 0 && (
                                          <span className="text-[10px] text-blue-400 font-bold flex-shrink-0">· {gd.missing} לא סומנו</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button
                                      onClick={() => router.push(`/admin/patient-attendance?group=${gd.group.id}`)}
                                      className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg hover:bg-emerald-500/20 transition-colors flex-shrink-0">
                                      סמן
                                    </button>
                                    <button
                                      onClick={() => handleCopyGroup(gd.group.name, progData.program.name, gd.presentNames, gd.group.id)}
                                      className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-slate-200 active:scale-95 transition-all flex-shrink-0 flex items-center justify-center"
                                      title="העתק נוכחות לוואטסאפ"
                                    >
                                      {copiedId === gd.group.id ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Share2 className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                {/* Present names */}
                                {gd.presentNames.length > 0 && (
                                  <div className="px-5 pb-3 pt-2">
                                    <p className="text-[10px] text-emerald-500 font-bold uppercase mb-1.5">נוכחים</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {gd.presentNames.map((name, i) => (
                                        <span key={i} className="text-[11px] bg-emerald-500/8 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/15">
                                          {name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Absent names */}
                                {gd.absentNames.length > 0 && (
                                  <div className="px-5 pb-3">
                                    <p className="text-[10px] text-rose-500 font-bold uppercase mb-1.5">נעדרים</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {gd.absentNames.map((name, i) => (
                                        <span key={i} className="text-[11px] bg-rose-500/8 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/15">
                                          {name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {data.length === 0 && (
                <div className="text-center py-20">
                  <Users className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">אין נתוני נוכחות להיום</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
