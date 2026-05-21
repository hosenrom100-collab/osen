"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { doc, getDoc, updateDoc, collection, addDoc, query, where, orderBy, getDocs } from "firebase/firestore";
import { Shield, Calendar, Clock, CheckCircle, XCircle, AlertCircle, Save, Loader2, ArrowRight, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const DAYS = [
  { id: "sunday", label: "ראשון" },
  { id: "monday", label: "שני" },
  { id: "tuesday", label: "שלישי" },
  { id: "wednesday", label: "רביעי" },
  { id: "thursday", label: "חמישי" },
  { id: "friday", label: "שישי" },
];

export default function StaffHubPage() {
  const { user } = useAuth();
  const [workingDays, setWorkingDays] = useState<string[]>([]);
  const [assignedComplex, setAssignedComplex] = useState<string>("lower");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [absenceDate, setAbsenceDate] = useState("");
  const [absenceReason, setAbsenceReason] = useState("");
  const [submittingAbsence, setSubmittingAbsence] = useState(false);
  const [absences, setAbsences] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      fetchUserData();
      fetchAbsences();
    }
  }, [user]);

  const fetchUserData = async () => {
    if (!user) return;
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setWorkingDays(data.workingDays || []);
        setAssignedComplex(data.assignedComplex || "lower");
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAbsences = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "absence_requests"),
        where("userId", "==", user.uid),
        orderBy("date", "desc")
      );
      const querySnapshot = await getDocs(q);
      const list: any[] = [];
      querySnapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setAbsences(list);
    } catch (error) {
      console.error("Error fetching absences:", error);
    }
  };

  const saveSettings = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        workingDays,
        assignedComplex
      });
      alert("ההגדרות נשמרו בהצלחה!");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("שגיאה בשמירת ההגדרות");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (dayId: string) => {
    setWorkingDays(prev => 
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
    );
  };

  const submitAbsenceRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !absenceDate) return;
    
    setSubmittingAbsence(true);
    try {
      await addDoc(collection(db, "absence_requests"), {
        userId: user.uid,
        userName: user.displayName || user.email,
        date: absenceDate,
        reason: absenceReason,
        status: "pending",
        createdAt: new Date().toISOString()
      });
      setAbsenceDate("");
      setAbsenceReason("");
      fetchAbsences();
      alert("בקשת ההיעדרות נשלחה למנהלת!");
    } catch (error) {
      console.error("Error submitting absence:", error);
      alert("שגיאה בשליחת הבקשה");
    } finally {
      setSubmittingAbsence(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "employee", "social_worker"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white p-6 pb-24">
        <header className="flex items-center gap-4 mb-10">
          <button 
            onClick={() => router.push("/")}
            className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Shield className="w-6 h-6 text-orange-400" />
              צוות המרכז
            </h1>
            <p className="text-slate-400 text-sm">ניהול ימי עבודה, היעדרויות ופרופיל אישי</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Section 1: Working Days & Complex */}
          <section className="bg-white/5 border border-white/10 rounded-[2rem] p-8 h-fit">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-orange-400" />
              הגדרות עבודה קבועות
            </h2>
            
            <div className="space-y-8">
              <div>
                <label className="block text-sm text-slate-400 mb-4">מתחם עבודה עיקרי:</label>
                <div className="flex gap-3">
                  {["upper", "lower"].map((type) => (
                    <button
                      key={type}
                      onClick={() => setAssignedComplex(type)}
                      className={`flex-1 py-3 rounded-2xl border transition-all font-bold text-sm ${
                        assignedComplex === type 
                          ? "bg-orange-500 border-orange-400 text-white" 
                          : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                      }`}
                    >
                      {type === "upper" ? "חוסן עליון" : "חוסן תחתון"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-4">ימי עבודה קבועים:</label>
                <div className="grid grid-cols-3 gap-2">
                  {DAYS.map((day) => (
                    <button
                      key={day.id}
                      onClick={() => toggleDay(day.id)}
                      className={`py-3 rounded-xl border transition-all text-xs font-bold ${
                        workingDays.includes(day.id)
                          ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                          : "bg-white/5 border-white/10 text-slate-500 hover:bg-white/10"
                      }`}
                    >
                      יום {day.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={saveSettings}
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                שמור הגדרות
              </button>
            </div>
          </section>

          {/* Section 2: Absence Request */}
          <section className="space-y-8">
            <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-400" />
                דיווח על היעדרות
              </h2>
              
              <form onSubmit={submitAbsenceRequest} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">תאריך היעדרות:</label>
                  <input
                    type="date"
                    required
                    value={absenceDate}
                    onChange={(e) => setAbsenceDate(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">סיבה / הערה למנהלת:</label>
                  <textarea
                    rows={3}
                    placeholder="פרט את סיבת ההיעדרות..."
                    value={absenceReason}
                    onChange={(e) => setAbsenceReason(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-orange-500 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingAbsence}
                  className="w-full bg-rose-600 hover:bg-rose-500 text-white py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
                >
                  {submittingAbsence ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageSquare className="w-5 h-5" />}
                  שלח בקשת היעדרות
                </button>
              </form>
            </div>

            {/* Absence History */}
            <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8">
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-400" />
                בקשות קודמות
              </h2>
              
              <div className="space-y-3">
                {absences.map((abs) => (
                  <div key={abs.id} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm">{abs.date}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[150px]">{abs.reason || "ללא הערה"}</div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                      abs.status === "approved" 
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                        : abs.status === "rejected"
                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}>
                      {abs.status === "approved" && <CheckCircle className="w-3 h-3" />}
                      {abs.status === "rejected" && <XCircle className="w-3 h-3" />}
                      {abs.status === "pending" && <Clock className="w-3 h-3" />}
                      {abs.status === "approved" ? "אושר" : abs.status === "rejected" ? "לא אושר" : "ממתין"}
                    </div>
                  </div>
                ))}
                {absences.length === 0 && (
                  <p className="text-center text-slate-500 text-sm py-4">אין בקשות היעדרות קודמות</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </RoleGuard>
  );
}
