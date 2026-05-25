"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db } from "@/lib/firebase/config";
import { 
  collection, getDocs, query, where, addDoc, 
  updateDoc, deleteDoc, doc, serverTimestamp, orderBy 
} from "firebase/firestore";
import { 
  CheckCircle, Circle, Trash2, Calendar, User, 
  Plus, Search, Loader2, ClipboardCheck, X, Check,
  ChevronLeft, AlertCircle
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO, isValid } from "date-fns";
import { he } from "date-fns/locale";

interface PersonalTask {
  id: string;
  userId: string;
  title: string;
  completed: boolean;
  patientId?: string | null;
  dueDate?: string | null;
  createdAt: any;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
}

export default function PersonalTasksPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // Form states
  const [newTitle, setNewTitle] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");

  // Filter/Search states
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (user?.uid) {
      fetchTasks();
      fetchPatients();
    }
  }, [user?.uid]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "personal_tasks"),
        where("userId", "==", user!.uid),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const list: PersonalTask[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          title: data.title,
          completed: !!data.completed,
          patientId: data.patientId || null,
          dueDate: data.dueDate || null,
          createdAt: data.createdAt,
        };
      });
      setTasks(list);
    } catch (err) {
      console.error("Error fetching personal tasks:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPatients = async () => {
    try {
      const snap = await getDocs(query(collection(db, "patients"), where("status", "==", "active")));
      const list = snap.docs.map(d => ({
        id: d.id,
        firstName: d.data().firstName || "",
        lastName: d.data().lastName || "",
        status: d.data().status || "active"
      }));
      list.sort((a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName, 'he'));
      setPatients(list);
    } catch (err) {
      console.error("Error fetching active patients:", err);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !user?.uid) return;
    setAdding(true);
    try {
      const docRef = await addDoc(collection(db, "personal_tasks"), {
        userId: user.uid,
        title: newTitle.trim(),
        completed: false,
        patientId: selectedPatientId || null,
        dueDate: dueDate || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const newTask: PersonalTask = {
        id: docRef.id,
        userId: user.uid,
        title: newTitle.trim(),
        completed: false,
        patientId: selectedPatientId || null,
        dueDate: dueDate || null,
        createdAt: new Date(),
      };

      setTasks(prev => [newTask, ...prev]);

      // Reset form
      setNewTitle("");
      setSelectedPatientId("");
      setDueDate("");
    } catch (err) {
      console.error("Error creating personal task:", err);
      alert("שגיאה ביצירת המשימה");
    } finally {
      setAdding(false);
    }
  };

  const handleToggleTask = async (taskId: string, currentCompleted: boolean) => {
    try {
      await updateDoc(doc(db, "personal_tasks", taskId), {
        completed: !currentCompleted,
        updatedAt: serverTimestamp()
      });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !currentCompleted } : t));
    } catch (err) {
      console.error("Error toggling task:", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, "personal_tasks", taskId));
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error("Error deleting task:", err);
    }
  };

  const getPatientName = (pId?: string | null) => {
    if (!pId) return "";
    const p = patients.find(x => x.id === pId);
    return p ? `${p.firstName} ${p.lastName}` : "משתתף כללי";
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchesFilter = 
        filter === "all" || 
        (filter === "pending" && !t.completed) || 
        (filter === "completed" && t.completed);

      const patientName = getPatientName(t.patientId);
      const matchesSearch = 
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patientName.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesFilter && matchesSearch;
    });
  }, [tasks, filter, searchTerm, patients]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, percent };
  }, [tasks]);

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pb-24">
        
        {/* Ambient background glows */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-indigo-500/3 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-emerald-500/3 rounded-full blur-[100px]" />
        </div>

        {/* Sticky Header */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6">
          <div className="max-w-4xl mx-auto flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => router.push("/")}
                className="p-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:bg-[var(--foreground)]/5 transition-colors shrink-0"
                title="חזרה לדף הבית"
              >
                <ChevronLeft className="w-4 h-4 text-[var(--muted)] rotate-180" />
              </button>
              <div>
                <h1 className="text-sm font-black flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-indigo-400" />
                  משימות ותזכורות אישיות
                </h1>
                <p className="text-[9px] text-[var(--muted)] font-black uppercase tracking-wider leading-none mt-0.5">
                  הפינה האישית שלך לניהול משימות ומעקב
                </p>
              </div>
            </div>
            {stats.pending > 0 && (
              <span className="flex items-center gap-1.5 text-[9px] font-black text-rose-400 bg-rose-500/8 border border-rose-500/15 px-2.5 py-1 rounded-full">
                {stats.pending} משימות בביצוע
              </span>
            )}
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-6 relative">
          
          {/* Stats & Search row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Quick stats panel */}
            <div className="md:col-span-7 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-2xl font-black text-indigo-500 leading-none">{stats.pending}</p>
                  <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mt-1">בביצוע</p>
                </div>
                <div className="w-px h-8 bg-[var(--border)] shrink-0" />
                <div className="text-right">
                  <p className="text-2xl font-black text-emerald-500 leading-none">{stats.completed}</p>
                  <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mt-1">הושלמו</p>
                </div>
                <div className="w-px h-8 bg-[var(--border)] shrink-0" />
                <div className="text-right">
                  <p className="text-2xl font-black text-[var(--foreground)]/40 leading-none">{stats.total}</p>
                  <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mt-1">סה"כ</p>
                </div>
              </div>
              
              <div className="text-left shrink-0">
                <p className="text-xl font-black leading-none">{stats.percent}<span className="text-xs font-bold text-[var(--muted)]">%</span></p>
                <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mt-1">התקדמות</p>
              </div>
            </div>

            {/* Search Input */}
            <div className="md:col-span-5 relative flex items-center">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]/40" />
              <input
                type="text"
                placeholder="חיפוש משימה או שם משתתף..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] rounded-2xl pr-10 pl-4 h-12 text-xs font-bold outline-none focus:border-indigo-500/30 transition-all placeholder:text-[var(--foreground)]/30"
              />
            </div>
          </div>

          {/* Quick Add Task Form */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-[var(--foreground)]/80 uppercase tracking-widest flex items-center gap-1.5 mr-1">
              <Plus className="w-4 h-4 text-emerald-500" />
              הוספת משימה / תזכורת חדשה
            </h3>
            
            <form onSubmit={handleAddTask} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* Title Input */}
              <div className="md:col-span-5 space-y-1.5">
                <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-wider mr-1">מה המשימה?</label>
                <input
                  type="text"
                  required
                  placeholder="למשל: שיחת מעקב חצי שנתית, כתיבת דו״ח שיקומי..."
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl px-4 h-10 text-xs font-bold outline-none focus:border-indigo-500/30 transition-all placeholder:text-[var(--foreground)]/30"
                />
              </div>

              {/* Patient Selector */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-wider mr-1">שיוך למשתתף (אופציונלי)</label>
                <div className="relative">
                  <select
                    value={selectedPatientId}
                    onChange={e => setSelectedPatientId(e.target.value)}
                    className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl px-4 h-10 text-xs font-bold outline-none focus:border-indigo-500/30 transition-all appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-[var(--card-bg)] text-[var(--foreground)]">-- ללא שיוך --</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id} className="bg-[var(--card-bg)] text-[var(--foreground)]">
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]/30 pointer-events-none" />
                </div>
              </div>

              {/* Due Date Picker */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-wider mr-1">תאריך יעד (אופציונלי)</label>
                <div className="relative">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl px-4 h-10 text-xs font-bold outline-none focus:border-indigo-500/30 transition-all cursor-pointer"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={adding || !newTitle.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-10 text-xs font-black shadow-md shadow-indigo-600/10 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  הוסף
                </button>
              </div>
            </form>
          </div>

          {/* Filters & Tasks List Wrapper */}
          <div className="space-y-4">
            {/* Tabs filter */}
            <div className="flex bg-[var(--foreground)]/5 p-1 rounded-xl border border-[var(--border)] w-fit gap-1">
              {[
                { id: "all", label: "כל המשימות", count: stats.total },
                { id: "pending", label: "בביצוע", count: stats.pending, color: "text-rose-400" },
                { id: "completed", label: "הושלמו", count: stats.completed, color: "text-emerald-400" },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id as any)}
                  className={`px-4 h-8 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    filter === t.id
                      ? "bg-[var(--card-bg)] text-indigo-500 border border-[var(--border)] shadow-sm font-extrabold"
                      : "text-[var(--foreground)]/50 hover:text-[var(--foreground)]"
                  }`}
                >
                  {t.label}
                  <span className={`text-[10px] opacity-75 font-mono ${t.color || ""}`}>{t.count}</span>
                </button>
              ))}
            </div>

            {/* Tasks Container */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-sm">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-30">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  <p className="text-[10px] font-black uppercase tracking-widest">טוען משימות...</p>
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                  <ClipboardCheck className="w-12 h-12 text-[var(--foreground)]/30 animate-pulse" />
                  <p className="text-xs font-black italic">אין משימות להצגה</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  <AnimatePresence initial={false}>
                    {filteredTasks.map(t => {
                      const hasDue = !!t.dueDate;
                      const parsedDue = hasDue ? parseISO(t.dueDate!) : null;
                      const isDueValid = parsedDue ? isValid(parsedDue) : false;
                      const dueFormatted = isDueValid ? format(parsedDue!, "dd/MM/yyyy") : "";
                      const hasPatient = !!t.patientId;
                      const patientName = hasPatient ? getPatientName(t.patientId) : "";

                      return (
                        <motion.div
                          key={t.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className={`p-4 md:p-5 flex items-center justify-between gap-4 hover:bg-[var(--foreground)]/[0.005] transition-colors ${
                            t.completed ? "bg-[var(--foreground)]/[0.015]" : ""
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Toggle checkbox */}
                            <button
                              onClick={() => handleToggleTask(t.id, t.completed)}
                              className="shrink-0 text-indigo-500 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                            >
                              {t.completed ? (
                                <CheckCircle className="w-5.5 h-5.5 text-emerald-500 fill-emerald-500/10" />
                              ) : (
                                <Circle className="w-5.5 h-5.5 text-[var(--muted)]/40 hover:text-indigo-400" />
                              )}
                            </button>

                            <div className="min-w-0">
                              {/* Task Title */}
                              <p className={`text-xs font-bold leading-relaxed break-words text-[var(--foreground)] ${
                                t.completed ? "line-through opacity-40 font-medium" : ""
                              }`}>
                                {t.title}
                              </p>

                              {/* Badges row */}
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">
                                {/* Participant badge */}
                                {hasPatient && (
                                  <button
                                    onClick={() => router.push(`/patients/${t.patientId}`)}
                                    className="flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/25 px-2 py-0.5 rounded-md hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer"
                                    title="פתח תיק משתתף"
                                  >
                                    <User className="w-3 h-3 fill-emerald-600/10" />
                                    <span>{patientName}</span>
                                  </button>
                                )}

                                {hasPatient && hasDue && <span className="text-[var(--border-strong)]/40">•</span>}

                                {/* Due date badge */}
                                {hasDue && (
                                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md border shrink-0 ${
                                    t.completed 
                                      ? "bg-[var(--foreground)]/5 border-[var(--border)] text-[var(--muted)]/50" 
                                      : "bg-indigo-500/8 border-indigo-500/15 text-indigo-500"
                                  }`}>
                                    <Calendar className="w-3 h-3" />
                                    <span>יעד: {dueFormatted}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Delete button */}
                          <button
                            onClick={() => handleDeleteTask(t.id)}
                            className="p-2 text-[var(--muted)]/40 hover:text-rose-500 hover:bg-rose-500/5 rounded-xl transition-all cursor-pointer shrink-0"
                            title="מחק משימה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

        </main>
      </div>
    </RoleGuard>
  );
}
