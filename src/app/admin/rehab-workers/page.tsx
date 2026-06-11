"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { 
  collection, getDocs, addDoc, deleteDoc, 
  doc, query, orderBy, updateDoc 
} from "firebase/firestore";
import { 
  Briefcase, Plus, Trash2, ArrowRight, 
  Loader2, Mail, Phone, Check, X,
  Search, Edit3
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";

interface RehabWorker {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export default function RehabWorkersManagementPage() {
  const { isManager, isAdmin } = useAuth();
  const canWrite = isManager || isAdmin;

  const [workers, setWorkers] = useState<RehabWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Form states (Add/Edit)
  const [workerName, setWorkerName] = useState("");
  const [workerEmail, setWorkerEmail] = useState("");
  const [workerPhone, setWorkerPhone] = useState("");
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "rehab_workers"), orderBy("name"));
      const snap = await getDocs(q);
      setWorkers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RehabWorker)));
    } catch (error) {
      console.error("Error fetching rehab workers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerName.trim() || !workerEmail.trim() || !workerPhone.trim()) return;

    setAdding(true);
    try {
      if (editingWorkerId) {
        // Edit mode
        await updateDoc(doc(db, "rehab_workers", editingWorkerId), {
          name: workerName.trim(),
          email: workerEmail.trim(),
          phone: workerPhone.trim(),
          updatedAt: new Date().toISOString()
        });
        
        setWorkers(prev => prev.map(w => w.id === editingWorkerId ? {
          id: editingWorkerId,
          name: workerName.trim(),
          email: workerEmail.trim(),
          phone: workerPhone.trim()
        } : w).sort((a, b) => a.name.localeCompare(b.name)));
        
        setEditingWorkerId(null);
      } else {
        // Add mode
        const docRef = await addDoc(collection(db, "rehab_workers"), {
          name: workerName.trim(),
          email: workerEmail.trim(),
          phone: workerPhone.trim(),
          createdAt: new Date().toISOString()
        });
        
        setWorkers(prev => [...prev, { 
          id: docRef.id, 
          name: workerName.trim(),
          email: workerEmail.trim(),
          phone: workerPhone.trim()
        }].sort((a, b) => a.name.localeCompare(b.name)));
      }

      // Reset form
      setWorkerName("");
      setWorkerEmail("");
      setWorkerPhone("");
    } catch (error) {
      console.error("Error saving rehab worker:", error);
      alert("שגיאה בשמירת פרטי העו״ס");
    } finally {
      setAdding(false);
    }
  };

  const removeWorker = async (id: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק עו״ס שיקום זה מהמאגר?")) return;
    try {
      await deleteDoc(doc(db, "rehab_workers", id));
      setWorkers(prev => prev.filter(w => w.id !== id));
      if (editingWorkerId === id) {
        setEditingWorkerId(null);
        setWorkerName("");
        setWorkerEmail("");
        setWorkerPhone("");
      }
    } catch (error) {
      console.error("Error deleting rehab worker:", error);
      alert("שגיאה במחיקת העו״ס");
    }
  };

  const startEdit = (worker: RehabWorker) => {
    setEditingWorkerId(worker.id);
    setWorkerName(worker.name);
    setWorkerEmail(worker.email);
    setWorkerPhone(worker.phone);
  };

  const cancelEdit = () => {
    setEditingWorkerId(null);
    setWorkerName("");
    setWorkerEmail("");
    setWorkerPhone("");
  };

  const filteredWorkers = workers.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.phone.includes(searchTerm)
  );

  return (
    <RoleGuard allowedRoles={["admin", "manager", "social_worker"]} redirectTo="/">
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-12" dir="rtl">
        <header className="max-w-4xl mx-auto flex items-center gap-6 mb-16">
          <button 
            onClick={() => router.push("/admin")}
            className="p-3 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl hover:bg-[var(--foreground)]/10 transition-colors"
            title="חזור לממשק ניהול"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <Briefcase className="w-8 h-8 text-teal-500" />
              ניהול עו״ס שיקום משרד הביטחון
            </h1>
            <p className="text-[var(--foreground)]/40 text-xs font-bold uppercase tracking-widest mt-1">
              ניהול מאגר העובדים הסוציאליים לשיקום עבור משתתפי המרכז
            </p>
          </div>
        </header>

        <div className="max-w-4xl mx-auto space-y-12">
          
          {/* Add/Edit Form */}
          {canWrite ? (
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] p-6 md:p-8 shadow-xl shadow-black/5">
              <h2 className="text-sm font-black text-teal-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {editingWorkerId ? "עריכת עו״ס שיקום" : "הוספת עו״ס שיקום חדש למאגר"}
              </h2>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/40 mr-1">שם מלא</label>
                  <input
                    required
                    type="text"
                    placeholder="ישראל ישראלי"
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl px-4 py-3.5 text-sm font-bold outline-none focus:border-teal-500/50 transition-all text-[var(--foreground)]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/40 mr-1">כתובת מייל</label>
                  <input
                    required
                    type="email"
                    placeholder="worker@mod.gov.il"
                    value={workerEmail}
                    onChange={(e) => setWorkerEmail(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl px-4 py-3.5 text-sm font-bold outline-none focus:border-teal-500/50 transition-all text-[var(--foreground)]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/40 mr-1">מספר טלפון</label>
                  <input
                    required
                    type="text"
                    placeholder="050-0000000"
                    value={workerPhone}
                    onChange={(e) => setWorkerPhone(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl px-4 py-3.5 text-sm font-bold outline-none focus:border-teal-500/50 transition-all text-[var(--foreground)]"
                  />
                </div>
                <div className="md:col-span-3 flex justify-end gap-3 pt-4">
                  {editingWorkerId && (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                    >
                      ביטול
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={adding}
                    className="px-8 py-3.5 bg-teal-600 hover:bg-teal-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-teal-600/20 disabled:opacity-50"
                  >
                    {adding ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : editingWorkerId ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    {editingWorkerId ? "עדכן עו״ס" : "הוסף עו״ס"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-5 text-sm text-amber-600 font-bold">
              שים לב: רק מנהלי מערכת יכולים להוסיף, לערוך או למחוק אנשי קשר במאגר זה.
            </div>
          )}

          {/* Search box & list */}
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-xl font-black tracking-tight">רשימת עו״ס שיקום במאגר ({filteredWorkers.length})</h2>
              <div className="relative w-full sm:w-72">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground)]/20" />
                <input
                  type="text"
                  placeholder="חיפוש לפי שם, מייל או טלפון..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl pr-11 pl-4 py-2.5 text-xs font-bold outline-none focus:border-teal-500/30 transition-all"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-40 gap-4 opacity-20">
                <Loader2 className="w-10 h-10 animate-spin text-teal-500" />
                <p className="text-xs font-black uppercase tracking-widest">טוען עו״סים מלווים...</p>
              </div>
            ) : filteredWorkers.length === 0 ? (
              <div className="text-center py-32 bg-[var(--card-bg)] border border-dashed border-[var(--border)] rounded-[3rem] opacity-25">
                <Briefcase className="w-12 h-12 text-[var(--foreground)]/10 mx-auto mb-4" />
                <p className="text-sm font-black italic">לא נמצאו עו״סים מלווים במאגר</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <AnimatePresence>
                  {filteredWorkers.map((w, index) => (
                    <motion.div
                      key={w.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={`bg-[var(--card-bg)] border border-[var(--border)] rounded-[2rem] p-6 md:p-8 flex items-center justify-between hover:border-[var(--border-strong)] transition-all ${
                        editingWorkerId === w.id ? 'ring-2 ring-teal-500/30 border-teal-500/50' : ''
                      }`}
                    >
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-lg font-black text-slate-800 leading-none">{w.name}</h3>
                          <p className="text-[10px] text-teal-600 font-bold uppercase tracking-widest mt-1">אגף השיקום משרד הביטחון</p>
                        </div>
                        <div className="space-y-1.5 text-xs text-[var(--foreground)]/70">
                          <a href={`mailto:${w.email}`} className="flex items-center gap-2 hover:text-teal-500 transition-colors">
                            <Mail className="w-3.5 h-3.5 text-[var(--foreground)]/30 shrink-0" />
                            <span className="font-mono text-left block" dir="ltr">{w.email}</span>
                          </a>
                          <a href={`tel:${w.phone}`} className="flex items-center gap-2 hover:text-teal-500 transition-colors">
                            <Phone className="w-3.5 h-3.5 text-[var(--foreground)]/30 shrink-0" />
                            <span className="font-mono">{w.phone}</span>
                          </a>
                        </div>
                      </div>

                      {canWrite && (
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => startEdit(w)}
                            className="p-2.5 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--foreground)]/50 hover:text-teal-600 rounded-xl transition-all"
                            title="ערוך עו״ס שיקום"
                          >
                            <Edit3 className="w-4.5 h-4.5" />
                          </button>
                          <button
                            onClick={() => removeWorker(w.id)}
                            className="p-2.5 text-[var(--foreground)]/20 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                            title="מחק מהמאגר"
                          >
                            <Trash2 className="w-4.5 h-4.5" />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </main>
    </RoleGuard>
  );
}
