"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { Plus, Loader2, Layers, X, Check, Users, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface Program {
  id: string;
  name: string;
  activeDays: number[];
  status: "active" | "archived";
  groupCount?: number;
}

const DAY_SHORT = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
const DAY_FULL  = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const ALL_DAYS  = [0,1,2,3,4,5,6];

const PROGRAM_COLORS = [
  { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20", dot: "bg-violet-500" },
  { bg: "bg-blue-500/10",   text: "text-blue-400",   border: "border-blue-500/20",   dot: "bg-blue-500"   },
  { bg: "bg-teal-500/10",   text: "text-teal-400",   border: "border-teal-500/20",   dot: "bg-teal-500"   },
  { bg: "bg-rose-500/10",   text: "text-rose-400",   border: "border-rose-500/20",   dot: "bg-rose-500"   },
  { bg: "bg-amber-500/10",  text: "text-amber-400",  border: "border-amber-500/20",  dot: "bg-amber-500"  },
];

export default function ProgramsPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showNew,  setShowNew]  = useState(false);
  const [newName,  setNewName]  = useState("");
  const [newDays,  setNewDays]  = useState<number[]>([0,1,2,3,4]);
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchPrograms(); }, []);

  const fetchPrograms = async () => {
    setLoading(true);
    try {
      const [progSnap, groupSnap] = await Promise.all([
        getDocs(query(collection(db, "programs"), orderBy("createdAt", "desc"))),
        getDocs(collection(db, "groups")),
      ]);
      const cnt: Record<string, number> = {};
      groupSnap.forEach(d => { const p = d.data().programId; if (p) cnt[p] = (cnt[p] || 0) + 1; });
      setPrograms(progSnap.docs.map(d => ({
        id: d.id, name: d.data().name,
        activeDays: d.data().activeDays || [],
        status: d.data().status || "active",
        groupCount: cnt[d.id] || 0,
      })));
    } finally { setLoading(false); }
  };

  const createProgram = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "programs"), {
        name: newName.trim(), activeDays: newDays,
        status: "active", createdAt: serverTimestamp(),
      });
      setShowNew(false); setNewName(""); setNewDays([0,1,2,3,4]);
      router.push(`/admin/programs/${ref.id}`);
    } finally { setCreating(false); }
  };

  const toggleDay = (d: number) =>
    setNewDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());

  const active   = programs.filter(p => p.status === "active");
  const archived = programs.filter(p => p.status === "archived");

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-white/[0.07] px-4 md:px-6">
          <div className="flex items-center gap-3 h-12">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Layers className="w-4 h-4 text-violet-400 shrink-0" />
              <h1 className="text-[14px] font-semibold">ניהול תוכניות</h1>
              {!loading && (
                <span className="text-[11px] text-slate-500 hidden md:inline">
                  {active.length} פעילות{archived.length > 0 ? ` · ${archived.length} בארכיון` : ""}
                </span>
              )}
            </div>
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded text-xs font-semibold transition-colors active:scale-95">
              <Plus className="w-3.5 h-3.5" />
              תוכנית חדשה
            </button>
          </div>
        </header>

        {/* ── Content ── */}
        <div className="px-4 md:px-6 pt-5 pb-20">

          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
            </div>
          ) : programs.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-14 h-14 bg-violet-500/10 text-violet-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Layers className="w-7 h-7" />
              </div>
              <p className="font-semibold text-white mb-1">אין תוכניות עדיין</p>
              <p className="text-slate-500 text-sm mb-6">צור את התוכנית הראשונה</p>
              <button onClick={() => setShowNew(true)}
                className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors">
                + צור תוכנית
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active programs */}
              {active.length > 0 && (
                <section>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-3">
                    תוכניות פעילות — {active.length}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {active.map((prog, i) => (
                      <ProgramCard key={prog.id} prog={prog} idx={i} onClick={() => router.push(`/admin/programs/${prog.id}`)} />
                    ))}
                  </div>
                </section>
              )}

              {/* Archived programs */}
              {archived.length > 0 && (
                <section>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-3">
                    ארכיון — {archived.length}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 opacity-60">
                    {archived.map((prog, i) => (
                      <ProgramCard key={prog.id} prog={prog} idx={i} onClick={() => router.push(`/admin/programs/${prog.id}`)} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* ── New program modal ── */}
        <AnimatePresence>
          {showNew && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowNew(false)}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
              <motion.div
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 26, stiffness: 260 }}
                className="relative bg-slate-900 border-t sm:border border-white/10 w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl"
              >
                <div className="w-8 h-1 bg-white/10 rounded-full mx-auto mt-3 mb-1 sm:hidden" />
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
                  <h2 className="font-semibold text-sm">תוכנית חדשה</h2>
                  <button onClick={() => setShowNew(false)} className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">שם התוכנית</label>
                    <input autoFocus value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && createProgram()}
                      placeholder="חרבות ברזל יום, חוסן עליון..."
                      className="w-full bg-white/5 border border-white/[0.07] rounded-lg p-2.5 text-sm focus:border-violet-500 outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">ימי פעילות</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {ALL_DAYS.map(d => (
                        <button key={d} type="button" onClick={() => toggleDay(d)}
                          className={`w-10 h-10 rounded-lg text-xs font-bold transition-all border ${
                            newDays.includes(d)
                              ? "bg-violet-600 border-violet-500 text-white shadow-sm shadow-violet-600/30"
                              : "bg-white/5 border-white/[0.07] text-slate-500 hover:border-white/20"
                          }`}>
                          {DAY_SHORT[d]}
                        </button>
                      ))}
                    </div>
                    {newDays.length > 0 && (
                      <p className="text-[10px] text-slate-500 mt-2">
                        {newDays.map(d => DAY_FULL[d]).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2.5 p-5 border-t border-white/[0.07]">
                  <button onClick={() => setShowNew(false)}
                    className="flex-1 py-2.5 bg-white/5 rounded-lg font-medium text-sm hover:bg-white/8 transition-all">
                    ביטול
                  </button>
                  <button onClick={createProgram} disabled={!newName.trim() || creating}
                    className="flex-1 py-2.5 bg-violet-600 rounded-lg font-semibold text-sm hover:bg-violet-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />צור תוכנית</>}
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

function ProgramCard({ prog, idx, onClick }: { prog: Program; idx: number; onClick: () => void }) {
  const pal = PROGRAM_COLORS[idx % PROGRAM_COLORS.length];
  const activeDayCount = prog.activeDays.length;

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      onClick={onClick}
      className={`w-full text-right border rounded-xl p-4 transition-all hover:brightness-110 active:scale-[0.98] ${pal.bg} ${pal.border}`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${pal.bg} border ${pal.border}`}>
          <Layers className={`w-4 h-4 ${pal.text}`} />
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          prog.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-500"
        }`}>
          {prog.status === "active" ? "פעיל" : "ארכיון"}
        </span>
      </div>

      {/* Name */}
      <p className={`font-semibold text-sm leading-tight mb-3 ${pal.text}`}>{prog.name}</p>

      {/* Days row — ALL 7 days (0=Sunday through 6=Shabbat) */}
      <div className="flex gap-1 mb-3">
        {ALL_DAYS.map(d => {
          const active = prog.activeDays.includes(d);
          return (
            <div key={d}
              className={`flex-1 h-6 rounded flex items-center justify-center text-[9px] font-bold transition-all ${
                active
                  ? `${pal.dot} text-white opacity-90`
                  : "bg-white/5 text-slate-700"
              }`}>
              {DAY_SHORT[d]}
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          {prog.groupCount} קבוצות
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {activeDayCount} ימים
        </span>
      </div>
    </motion.button>
  );
}
