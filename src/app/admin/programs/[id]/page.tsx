"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase/config";
import {
  doc, getDoc, updateDoc, collection, getDocs,
  addDoc, deleteDoc, query, orderBy, where
} from "firebase/firestore";
import {
  ArrowRight, Save, Trash2, Plus, Loader2, Calendar,
  Users, Edit3, Check, X, ChevronLeft, Layers
} from "lucide-react";
import { useAutoSave } from "@/hooks/useAutoSave";
import { AutoSaveIndicator } from "@/components/ui/AutoSaveIndicator";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface Program {
  id: string;
  name: string;
  activeDays: number[];
  status: "active" | "archived";
}

interface Group {
  id: string;
  name: string;
  programId: string;
}

const DAY_SHORT = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
const DAY_FULL  = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];

const AVATAR_COLORS = [
  "bg-violet-600","bg-blue-600","bg-teal-600","bg-rose-600","bg-amber-600","bg-indigo-600"
];

export default function ProgramDetailPage() {
  const router  = useRouter();
  const params  = useParams();
  const progId  = params.id as string;

  const [program,    setProgram]    = useState<Program | null>(null);
  const [groups,     setGroups]     = useState<Group[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);

  // Editing program fields
  const [editName,   setEditName]   = useState("");
  const [editDays,   setEditDays]   = useState<number[]>([]);

  // Refs for the auto-save closure (avoids stale state reads)
  const editNameRef = useRef(editName);
  const editDaysRef = useRef(editDays);
  useEffect(() => { editNameRef.current = editName; }, [editName]);
  useEffect(() => { editDaysRef.current = editDays; }, [editDays]);

  const autoSave = useAutoSave(async () => {
    const name = editNameRef.current.trim();
    if (!name || !progId) return;
    await updateDoc(doc(db, "programs", progId), {
      name,
      activeDays: editDaysRef.current,
    });
    setProgram(p => p ? { ...p, name, activeDays: editDaysRef.current } : p);
  }, 1200);

  // New group
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup,  setAddingGroup]  = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);

  // Edit group inline
  const [editGroupId,   setEditGroupId]   = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");

  useEffect(() => {
    fetchAll();
  }, [progId]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [progSnap, groupsSnap] = await Promise.all([
        getDoc(doc(db, "programs", progId)),
        getDocs(query(collection(db, "groups"), where("programId", "==", progId), orderBy("name"))),
      ]);

      if (!progSnap.exists()) { router.push("/admin/programs"); return; }

      const prog = { id: progSnap.id, ...progSnap.data() } as Program;
      setProgram(prog);
      setEditName(prog.name);
      setEditDays(prog.activeDays || []);

      setGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Group)));
    } finally {
      setLoading(false);
    }
  };

  const saveProgram = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "programs", progId), {
        name:       editName.trim(),
        activeDays: editDays,
      });
      setProgram(p => p ? { ...p, name: editName.trim(), activeDays: editDays } : p);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const addGroup = async () => {
    if (!newGroupName.trim()) return;
    setAddingGroup(true);
    try {
      const ref = await addDoc(collection(db, "groups"), {
        name:      newGroupName.trim(),
        programId: progId,
      });
      setGroups(g => [...g, { id: ref.id, name: newGroupName.trim(), programId: progId }]);
      setNewGroupName("");
      setShowNewGroup(false);
    } finally {
      setAddingGroup(false);
    }
  };

  const saveGroupName = async (id: string) => {
    if (!editGroupName.trim()) return;
    await updateDoc(doc(db, "groups", id), { name: editGroupName.trim() });
    setGroups(gs => gs.map(g => g.id === id ? { ...g, name: editGroupName.trim() } : g));
    setEditGroupId(null);
  };

  const deleteGroup = async (id: string) => {
    await deleteDoc(doc(db, "groups", id));
    setGroups(gs => gs.filter(g => g.id !== id));
  };

  const toggleDay = (d: number) => {
    setEditDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
    autoSave.trigger();
  };

  const isDirty = program && (editName !== program.name || JSON.stringify(editDays) !== JSON.stringify(program.activeDays));

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

        {/* ── Sticky header ── */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 py-3.5">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button onClick={() => router.push("/admin/programs")}
              className="w-9 h-9 rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] active:scale-95 transition-all flex items-center justify-center text-[var(--foreground)]">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0 text-right">
              <h1 className="text-sm font-black leading-tight truncate">{program?.name}</h1>
              <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest mt-0.5">Program Details</p>
            </div>
            <div className="flex items-center gap-2">
              <AutoSaveIndicator
                status={autoSave.status}
                error={autoSave.error}
                onRetry={autoSave.saveNow}
              />
              <button
                onClick={autoSave.saveNow}
                disabled={autoSave.status === "saving" || !isDirty}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                  autoSave.status === "saved" || saved
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-500"
                    : isDirty
                    ? "bg-[var(--primary)] border-[var(--primary)] text-white shadow-md shadow-[var(--primary)]/10 hover:opacity-90"
                    : "bg-[var(--foreground)]/5 border-[var(--border)] text-[var(--foreground)]/30 cursor-not-allowed"
                } disabled:opacity-50`}
              >
                {autoSave.status === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                שמור
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 pt-6 pb-28 space-y-6">

          {/* ── Program name ── */}
          <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2rem] p-6 space-y-5 shadow-sm">
            <div className="text-right">
              <label className="text-[10px] font-black text-[var(--foreground)]/40 uppercase block mb-1.5">שם התוכנית</label>
              <input
                value={editName}
                onChange={e => { setEditName(e.target.value); autoSave.trigger(); }}
                className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl p-3 text-xs font-bold text-[var(--foreground)] focus:border-[var(--primary)] outline-none transition-colors"
              />
            </div>

            {/* Active days */}
            <div className="text-right">
              <label className="text-[10px] font-black text-[var(--foreground)]/40 uppercase block mb-2">ימי פעילות</label>
              <div className="flex gap-2 flex-wrap">
                {[0,1,2,3,4,5,6].map(d => (
                  <button key={d} type="button" onClick={() => toggleDay(d)}
                    className={`relative w-10 h-10 rounded-xl text-[12px] font-black transition-all border ${
                      editDays.includes(d)
                        ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-600/20"
                        : "bg-[var(--foreground)]/5 border-[var(--border)] text-[var(--foreground)]/40 hover:border-[var(--foreground)]/20"
                    }`}>
                    {DAY_SHORT[d]}
                  </button>
                ))}
              </div>
              {editDays.length > 0 && (
                <p className="text-[10px] text-[var(--foreground)]/40 font-bold mt-2">
                  פעיל בימי {editDays.map(d => DAY_FULL[d]).join(", ")}
                </p>
              )}
            </div>
          </section>

          {/* ── Groups section ── */}
          <section className="text-right">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[12px] font-black text-[var(--foreground)]/40 flex items-center gap-2 uppercase tracking-wider">
                <Users className="w-4 h-4 text-violet-500" />
                קבוצות ({groups.length})
              </h2>
              <button onClick={() => setShowNewGroup(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/15 border border-violet-500/30 rounded-xl text-[10px] font-black text-violet-500 hover:bg-violet-600/25 transition-all active:scale-95">
                <Plus className="w-3.5 h-3.5" /> הוסף קבוצה
              </button>
            </div>

            {/* New group form (inline) */}
            <AnimatePresence>
              {showNewGroup && (
                <motion.div
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -6, height: 0 }}
                  className="overflow-hidden mb-3"
                >
                  <div className="bg-violet-500/8 border border-violet-500/20 rounded-2xl p-4">
                    <label className="text-[10px] font-black text-[var(--foreground)]/40 uppercase block mb-2">שם הקבוצה החדשה</label>
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={newGroupName}
                        onChange={e => setNewGroupName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addGroup()}
                        placeholder="למשל: חוסן עליון, קבוצה א׳..."
                        className="flex-1 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl p-3 text-xs font-bold text-[var(--foreground)] focus:border-violet-500 outline-none transition-colors"
                      />
                      <button onClick={addGroup} disabled={!newGroupName.trim() || addingGroup}
                        className="px-4 py-3 bg-violet-600 rounded-xl font-bold text-xs text-white hover:bg-violet-500 transition-all disabled:opacity-40 flex items-center gap-1.5">
                        {addingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button onClick={() => { setShowNewGroup(false); setNewGroupName(""); }}
                        className="px-3 py-3 bg-[var(--foreground)]/5 rounded-xl hover:bg-[var(--foreground)]/10 border border-[var(--border)] transition-all text-[var(--foreground)]/40">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Groups list */}
            {groups.length === 0 && !showNewGroup ? (
              <button onClick={() => setShowNewGroup(true)}
                className="w-full py-8 border border-dashed border-[var(--border)] rounded-[2rem] text-[var(--foreground)]/30 text-xs font-bold flex flex-col items-center gap-2 hover:border-violet-500/30 hover:text-violet-500 transition-all bg-[var(--card-bg)]">
                <Users className="w-6 h-6" />
                לחץ להוספת קבוצה ראשונה
              </button>
            ) : (
              <div className="space-y-2">
                {groups.map((group, idx) => (
                  <motion.div
                    key={group.id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm"
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xs flex-shrink-0 ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}>
                        {group.name[0]}
                      </div>

                      {/* Name / edit inline */}
                      <div className="flex-1 min-w-0">
                        {editGroupId === group.id ? (
                          <div className="flex gap-2">
                            <input
                              autoFocus
                              value={editGroupName}
                              onChange={e => setEditGroupName(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveGroupName(group.id); if (e.key === "Escape") setEditGroupId(null); }}
                              className="flex-1 bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-lg px-2 py-1.5 text-xs font-bold focus:border-violet-500 outline-none"
                            />
                            <button onClick={() => saveGroupName(group.id)} className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-500"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditGroupId(null)} className="p-1.5 rounded-lg bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)]/40"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <p className="font-black text-xs leading-tight">{group.name}</p>
                        )}
                      </div>

                      {/* Actions */}
                      {editGroupId !== group.id && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => router.push(`/admin/schedule?group=${group.id}`)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/10 text-rose-500 text-[10px] font-black hover:bg-rose-500/20 transition-colors"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">לוז</span>
                            <ChevronLeft className="w-3 h-3" />
                          </button>
                          <button onClick={() => { setEditGroupId(group.id); setEditGroupName(group.name); }}
                            className="p-1.5 rounded-lg hover:bg-[var(--foreground)]/5 text-[var(--foreground)]/40 hover:text-blue-500 transition-colors">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteGroup(group.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-500/10 text-[var(--foreground)]/40 hover:text-rose-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          {/* ── Schedule quick access ── */}
          {groups.length > 0 && (
            <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2rem] p-6 shadow-sm text-right">
              <h3 className="text-[10px] font-black text-[var(--foreground)]/40 uppercase mb-3 tracking-wider">גישה מהירה ללוז</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => router.push("/admin/schedule")}
                  className="flex items-center gap-3 px-4 py-3 bg-rose-500/5 border border-rose-500/20 rounded-2xl hover:bg-rose-500/10 transition-all active:scale-95 text-right"
                >
                  <Calendar className="w-4 h-4 text-rose-500 flex-shrink-0" />
                  <div>
                    <p className="font-black text-xs text-rose-500">לוז משולב</p>
                    <p className="text-[9px] text-[var(--foreground)]/40 font-bold">כל הקבוצות ביחד</p>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 text-[var(--foreground)]/30 mr-auto" />
                </button>

                {groups.map(g => (
                  <button key={g.id}
                    onClick={() => router.push(`/admin/schedule?group=${g.id}`)}
                    className="flex items-center gap-3 px-4 py-3 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl hover:bg-[var(--foreground)]/10 transition-all active:scale-95 text-right"
                  >
                    <Layers className="w-4 h-4 text-violet-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-xs truncate">{g.name}</p>
                      <p className="text-[9px] text-[var(--foreground)]/40 font-bold">לוז קבוצה</p>
                    </div>
                    <ChevronLeft className="w-3.5 h-3.5 text-[var(--foreground)]/30" />
                  </button>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </RoleGuard>
  );
}

