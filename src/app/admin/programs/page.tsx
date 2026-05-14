"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, addDoc, query, orderBy,
  serverTimestamp, where
} from "firebase/firestore";
import { ArrowRight, Plus, ChevronLeft, Loader2, Layers, X, Check, Users } from "lucide-react";
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

export default function ProgramsPage() {
  const router = useRouter();
  const [programs,  setPrograms]  = useState<Program[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showNew,   setShowNew]   = useState(false);
  const [newName,   setNewName]   = useState("");
  const [newDays,   setNewDays]   = useState<number[]>([1, 2, 3]);
  const [creating,  setCreating]  = useState(false);

  useEffect(() => { fetchPrograms(); }, []);

  const fetchPrograms = async () => {
    setLoading(true);
    try {
      const progSnap  = await getDocs(query(collection(db, "programs"), orderBy("createdAt", "desc")));
      const groupSnap = await getDocs(collection(db, "groups"));

      const groupCountByProgram: Record<string, number> = {};
      groupSnap.forEach(d => {
        const pid = d.data().programId;
        if (pid) groupCountByProgram[pid] = (groupCountByProgram[pid] || 0) + 1;
      });

      setPrograms(progSnap.docs.map(d => ({
        id:         d.id,
        name:       d.data().name,
        activeDays: d.data().activeDays || [],
        status:     d.data().status || "active",
        groupCount: groupCountByProgram[d.id] || 0,
      })));
    } finally {
      setLoading(false);
    }
  };

  const createProgram = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "programs"), {
        name:       newName.trim(),
        activeDays: newDays,
        status:     "active",
        createdAt:  serverTimestamp(),
      });
      setShowNew(false);
      setNewName("");
      router.push(`/admin/programs/${ref.id}`);
    } finally {
      setCreating(false);
    }
  };

  const toggleDay = (d: number) =>
    setNewDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div className="min-h-screen bg-slate-950 text-white">

        {/* Header */}
        <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-white/5 px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button onClick={() => router.push("/admin")}
              className="p-2 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all flex-shrink-0">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex-1">
              <h1 className="text-[17px] font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-400" /> ניהול תוכניות
              </h1>
              <p className="text-[11px] text-slate-500 mt-0.5">הגדרת תוכניות, קבוצות ולוחות זמנים</p>
            </div>
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 bg-violet-600 text-white px-3 py-2 rounded-xl text-sm font-bold active:scale-95 transition-all shadow-lg shadow-violet-600/20">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">תוכנית חדשה</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-28">
          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
            </div>
          ) : programs.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="text-center py-20"
            >
              <div className="w-16 h-16 bg-violet-500/10 text-violet-400 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Layers className="w-8 h-8" />
              </div>
              <p className="font-bold text-white mb-1">אין תוכניות עדיין</p>
              <p className="text-slate-500 text-sm mb-6">צור את התוכנית הראשונה שלך</p>
              <button onClick={() => setShowNew(true)}
                className="bg-violet-600 text-white px-6 py-3 rounded-2xl font-bold active:scale-95 transition-all">
                + צור תוכנית
              </button>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {programs.map((prog, i) => (
                <motion.button
                  key={prog.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => router.push(`/admin/programs/${prog.id}`)}
                  className="w-full bg-white/[0.03] border border-white/8 rounded-2xl p-4 text-right hover:bg-white/[0.06] active:bg-white/[0.08] transition-colors flex items-center gap-4"
                >
                  <div className="w-11 h-11 bg-violet-500/15 text-violet-400 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[15px] leading-tight">{prog.name}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {/* Active days */}
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map(d => (
                          <span key={d} className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center ${
                            prog.activeDays.includes(d)
                              ? "bg-violet-500/20 text-violet-300"
                              : "bg-white/5 text-slate-700"
                          }`}>{DAY_SHORT[d]}</span>
                        ))}
                      </div>
                      {/* Groups count */}
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Users className="w-3 h-3" />{prog.groupCount} קבוצות
                      </span>
                      {/* Status */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        prog.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-slate-500/10 text-slate-500"
                      }`}>
                        {prog.status === "active" ? "פעיל" : "ארכיון"}
                      </span>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-slate-600 flex-shrink-0" />
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {/* New program modal */}
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
                <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-3 mb-1 sm:hidden" />
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                  <h2 className="font-bold text-base">תוכנית חדשה</h2>
                  <button onClick={() => setShowNew(false)} className="p-2 rounded-xl hover:bg-white/5 text-slate-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  {/* Name */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">שם התוכנית</label>
                    <input
                      autoFocus
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && createProgram()}
                      placeholder="למשל: חרבות ברזל יום, חירום לאומי..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-violet-500 outline-none transition-colors"
                    />
                  </div>

                  {/* Active days */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">ימי פעילות</label>
                    <div className="flex gap-2 flex-wrap">
                      {[0,1,2,3,4,5,6].map(d => (
                        <button key={d} type="button" onClick={() => toggleDay(d)}
                          className={`w-10 h-10 rounded-xl text-[12px] font-black transition-all border ${
                            newDays.includes(d)
                              ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-600/20"
                              : "bg-white/5 border-white/10 text-slate-500 hover:border-white/20"
                          }`}>
                          {DAY_SHORT[d]}
                        </button>
                      ))}
                    </div>
                    {newDays.length > 0 && (
                      <p className="text-[11px] text-slate-500 mt-2">
                        פעילות בימי: {newDays.map(d => DAY_FULL[d]).join(", ")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 p-5 border-t border-white/8">
                  <button onClick={() => setShowNew(false)}
                    className="flex-1 py-3 bg-white/5 rounded-xl font-bold text-sm hover:bg-white/10 transition-all">
                    ביטול
                  </button>
                  <button onClick={createProgram} disabled={!newName.trim() || creating}
                    className="flex-1 py-3 bg-violet-600 rounded-xl font-bold text-sm hover:bg-violet-500 transition-all shadow-lg shadow-violet-600/20 disabled:opacity-40 flex items-center justify-center gap-2">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> צור תוכנית</>}
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
