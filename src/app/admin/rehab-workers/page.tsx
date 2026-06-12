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
  Search, Edit3, MapPin
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface RehabWorker {
  id: string;
  name: string;
  email: string;
  phone: string;
  district?: string;
}

export default function RehabWorkersManagementPage() {
  const { isManager, isAdmin } = useAuth();
  const canWrite = isManager || isAdmin;

  const [workers, setWorkers] = useState<RehabWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Inline edit states
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editDistrict, setEditDistrict] = useState("");

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

  const handleAddNew = () => {
    if (editingWorkerId) return;

    const tempNewWorker: RehabWorker = {
      id: "new-temp",
      name: "",
      email: "",
      phone: "",
      district: ""
    };
    
    setWorkers(prev => [tempNewWorker, ...prev]);
    setEditingWorkerId("new-temp");
    setEditName("");
    setEditEmail("");
    setEditPhone("");
    setEditDistrict("");
  };

  const startEdit = (worker: RehabWorker) => {
    setEditingWorkerId(worker.id);
    setEditName(worker.name);
    setEditEmail(worker.email);
    setEditPhone(worker.phone);
    setEditDistrict(worker.district || "");
  };

  const cancelEdit = () => {
    if (editingWorkerId === "new-temp") {
      setWorkers(prev => prev.filter(w => w.id !== "new-temp"));
    }
    setEditingWorkerId(null);
    setEditName("");
    setEditEmail("");
    setEditPhone("");
    setEditDistrict("");
  };

  const handleSaveInline = async (id: string) => {
    if (!editName.trim() || !editEmail.trim() || !editPhone.trim()) {
      alert("אנא מלא את שדות החובה (שם מלא, כתובת מייל, ומספר טלפון)");
      return;
    }

    setAdding(true);
    try {
      const workerData = {
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        district: editDistrict.trim() || "",
        updatedAt: new Date().toISOString()
      };

      if (id === "new-temp") {
        // Add mode
        const docRef = await addDoc(collection(db, "rehab_workers"), {
          ...workerData,
          createdAt: new Date().toISOString()
        });
        
        setWorkers(prev => {
          const filtered = prev.filter(w => w.id !== "new-temp");
          return [...filtered, { id: docRef.id, ...workerData }];
        });
      } else {
        // Edit mode
        await updateDoc(doc(db, "rehab_workers", id), workerData);
        
        setWorkers(prev => prev.map(w => w.id === id ? { id, ...workerData } : w));
      }
      
      setEditingWorkerId(null);
      setEditName("");
      setEditEmail("");
      setEditPhone("");
      setEditDistrict("");
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
        cancelEdit();
      }
    } catch (error) {
      console.error("Error deleting rehab worker:", error);
      alert("שגיאה במחיקת העו״ס");
    }
  };

  const filteredWorkers = workers.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.phone.includes(searchTerm) ||
    (w.district && w.district.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Sorting logic:
  // 1. New temp row always at the top
  // 2. Those with a district come first, sorted by district (Hebrew localeCompare)
  // 3. Those without a district come last, sorted by name
  const sortedWorkers = [...filteredWorkers].sort((a, b) => {
    if (a.id === "new-temp") return -1;
    if (b.id === "new-temp") return 1;

    const distA = a.district?.trim() || "";
    const distB = b.district?.trim() || "";

    if (distA && !distB) return -1;
    if (!distA && distB) return 1;

    if (distA && distB && distA !== distB) {
      return distA.localeCompare(distB, "he");
    }

    return a.name.localeCompare(b.name, "he");
  });

  return (
    <RoleGuard allowedRoles={["admin", "manager", "social_worker"]} redirectTo="/">
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-12 animate-fade-in" dir="rtl">
        <header className="max-w-6xl mx-auto flex items-center gap-6 mb-12">
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

        <div className="max-w-6xl mx-auto space-y-8">
          {/* Controls Bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap bg-[var(--card-bg)] border border-[var(--border)] rounded-3xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-black tracking-tight">
                רשימת עו״ס במאגר ({filteredWorkers.length})
              </h2>
              {canWrite && (
                <button
                  onClick={handleAddNew}
                  disabled={!!editingWorkerId}
                  className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5 shadow-lg shadow-teal-600/20"
                >
                  <Plus className="w-4 h-4" />
                  הוסף עו״ס חדש
                </button>
              )}
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground)]/30" />
              <input
                type="text"
                placeholder="חיפוש לפי שם, מחוז, מייל או טלפון..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl pr-11 pl-4 py-2.5 text-xs font-bold outline-none focus:border-teal-500/30 transition-all"
              />
            </div>
          </div>

          {/* Table Container */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4 opacity-30">
              <Loader2 className="w-10 h-10 animate-spin text-teal-500" />
              <p className="text-xs font-black uppercase tracking-widest">טוען עו״סים מלווים...</p>
            </div>
          ) : sortedWorkers.length === 0 ? (
            <div className="text-center py-32 bg-[var(--card-bg)] border border-dashed border-[var(--border)] rounded-[3rem] opacity-30">
              <Briefcase className="w-12 h-12 text-[var(--foreground)]/15 mx-auto mb-4" />
              <p className="text-sm font-black italic">לא נמצאו עו״סים מלווים במאגר</p>
            </div>
          ) : (
            <div className="overflow-hidden border border-[var(--border)] rounded-[2.5rem] bg-[var(--card-bg)] shadow-xl shadow-black/5">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--foreground)]/[0.02] backdrop-blur">
                      <th className="px-6 py-4.5 text-xs font-black uppercase tracking-widest text-[var(--foreground)]/50">שם מלא</th>
                      <th className="px-6 py-4.5 text-xs font-black uppercase tracking-widest text-[var(--foreground)]/50">מחוז</th>
                      <th className="px-6 py-4.5 text-xs font-black uppercase tracking-widest text-[var(--foreground)]/50">כתובת מייל</th>
                      <th className="px-6 py-4.5 text-xs font-black uppercase tracking-widest text-[var(--foreground)]/50">מספר טלפון</th>
                      {canWrite && (
                        <th className="px-6 py-4.5 text-xs font-black uppercase tracking-widest text-[var(--foreground)]/50 text-left w-32">פעולות</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {sortedWorkers.map((w) => {
                      const isEditing = editingWorkerId === w.id;
                      
                      return (
                        <tr 
                          key={w.id} 
                          className={`hover:bg-[var(--foreground)]/[0.01] transition-colors ${
                            isEditing ? "bg-teal-500/[0.02]" : ""
                          }`}
                        >
                          {/* Name Field */}
                          <td className="px-6 py-4 text-sm font-bold text-slate-800">
                            {isEditing ? (
                              <input
                                required
                                type="text"
                                placeholder="שם מלא (שדה חובה)"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-teal-500/50 transition-all"
                              />
                            ) : (
                              <span>{w.name}</span>
                            )}
                          </td>

                          {/* District Field */}
                          <td className="px-6 py-4 text-sm">
                            {isEditing ? (
                              <input
                                type="text"
                                placeholder="מחוז (אופציונלי)"
                                value={editDistrict}
                                onChange={(e) => setEditDistrict(e.target.value)}
                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-teal-500/50 transition-all"
                              />
                            ) : w.district ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black bg-teal-500/10 text-teal-600 tracking-wider">
                                <MapPin className="w-3 h-3 shrink-0" />
                                {w.district}
                              </span>
                            ) : (
                              <span className="text-[var(--foreground)]/25 text-xs italic font-semibold">ללא מחוז</span>
                            )}
                          </td>

                          {/* Email Field */}
                          <td className="px-6 py-4 text-xs font-mono text-[var(--foreground)]/80">
                            {isEditing ? (
                              <input
                                required
                                type="email"
                                placeholder="אימייל (שדה חובה)"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-teal-500/50 transition-all text-left font-mono"
                                dir="ltr"
                              />
                            ) : (
                              <a href={`mailto:${w.email}`} className="inline-flex items-center gap-1.5 hover:text-teal-500 transition-colors">
                                <Mail className="w-3.5 h-3.5 text-[var(--foreground)]/30 shrink-0" />
                                <span className="text-left" dir="ltr">{w.email}</span>
                              </a>
                            )}
                          </td>

                          {/* Phone Field */}
                          <td className="px-6 py-4 text-xs font-mono text-[var(--foreground)]/80">
                            {isEditing ? (
                              <input
                                required
                                type="text"
                                placeholder="מספר טלפון (שדה חובה)"
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-teal-500/50 transition-all text-left font-mono"
                                dir="ltr"
                              />
                            ) : (
                              <a href={`tel:${w.phone}`} className="inline-flex items-center gap-1.5 hover:text-teal-500 transition-colors">
                                <Phone className="w-3.5 h-3.5 text-[var(--foreground)]/30 shrink-0" />
                                <span>{w.phone}</span>
                              </a>
                            )}
                          </td>

                          {/* Actions Field */}
                          {canWrite && (
                            <td className="px-6 py-4 text-left">
                              {isEditing ? (
                                <div className="flex justify-start gap-2">
                                  <button
                                    onClick={() => handleSaveInline(w.id)}
                                    disabled={adding}
                                    className="p-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl transition-all shadow-md shadow-teal-600/10 flex items-center justify-center disabled:opacity-50"
                                    title="שמור שינויים"
                                  >
                                    {adding ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Check className="w-4 h-4" />
                                    )}
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-all flex items-center justify-center"
                                    title="ביטול"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex justify-start gap-2">
                                  <button
                                    onClick={() => startEdit(w)}
                                    disabled={!!editingWorkerId}
                                    className="p-2 hover:bg-[var(--foreground)]/5 text-[var(--foreground)]/50 hover:text-teal-600 rounded-xl transition-all disabled:opacity-30"
                                    title="ערוך עו״ס שיקום"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => removeWorker(w.id)}
                                    disabled={!!editingWorkerId}
                                    className="p-2 hover:bg-rose-500/10 text-[var(--foreground)]/20 hover:text-rose-500 rounded-xl transition-all disabled:opacity-30"
                                    title="מחק מהמאגר"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {!canWrite && (
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-5 text-sm text-amber-600 font-bold">
              שים לב: רק מנהלי מערכת יכולים להוסיף, לערוך או למחוק אנשי קשר במאגר זה.
            </div>
          )}
        </div>
      </main>
    </RoleGuard>
  );
}
