"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { 
  doc, updateDoc, collection, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp 
} from "firebase/firestore";
import { 
  User, Phone, Mail, Calendar, Clock, CheckCircle2, AlertCircle, 
  ChevronLeft, Loader2, LogOut, Save, Send, MapPin, Power
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { sendPush } from "@/lib/notify";

const DAYS = [
  { id: 0, name: "ראשון" },
  { id: 1, name: "שני" },
  { id: 2, name: "שלישי" },
  { id: 3, name: "רביעי" },
  { id: 4, name: "חמישי" },
  { id: 5, name: "שישי" },
  { id: 6, name: "שבת" },
];

export default function ProfilePage() {
  const { user, role, logout, phoneNumber, workDays } = useAuth();
  const router = useRouter();

  const [phone, setPhone] = useState(phoneNumber || "");
  const [selectedDays, setSelectedDays] = useState<number[]>(workDays || []);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Leave request state
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [leaveSuccess, setLeaveSuccess] = useState(false);

  // Attendance state
  const [lastAction, setLastAction] = useState<any>(null);
  const [isActing, setIsActing] = useState(false);

  useEffect(() => {
    if (user) fetchLastAttendance();
  }, [user]);

  const fetchLastAttendance = async () => {
    if (!user) return;
    const q = query(
      collection(db, "employee_attendance"),
      where("userId", "==", user.uid),
      orderBy("timestamp", "desc"),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      setLastAction(snap.docs[0].data());
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        phone,
        workDays: selectedDays,
        updatedAt: serverTimestamp(),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDay = (dayId: number) => {
    setSelectedDays(prev => 
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
    );
  };

  const submitLeaveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !leaveDate) return;
    setIsSubmittingLeave(true);
    try {
      await addDoc(collection(db, "absences"), {
        userId: user.uid,
        userName: user.displayName || user.email,
        date: leaveDate,
        reason: leaveReason,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      // Notify managers
      await sendPush({
        role: ["admin", "manager"],
        title: "📄 בקשת היעדרות חדשה",
        body: `${user.displayName || "עובד"} מבקש להיעדר ב-${leaveDate}`,
        link: "/admin/leaves"
      });

      setLeaveSuccess(true);
      setLeaveDate("");
      setLeaveReason("");
      setTimeout(() => setLeaveSuccess(false), 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const toggleAttendance = async () => {
    if (!user) return;
    const type = lastAction?.type === "in" ? "out" : "in";
    setIsActing(true);
    try {
      const payload = {
        userId: user.uid,
        userName: user.displayName || user.email,
        type,
        timestamp: serverTimestamp(),
        date: format(new Date(), "yyyy-MM-dd"),
        time: format(new Date(), "HH:mm"),
      };
      await addDoc(collection(db, "employee_attendance"), payload);
      setLastAction(payload);
    } catch (error) {
      console.error(error);
    } finally {
      setIsActing(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/login">
      <div className="min-h-screen bg-slate-950 text-white pb-32" dir="rtl">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-white/5 px-4 py-4">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <User className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold">אזור אישי</h1>
                <p className="text-[11px] text-slate-500">{user?.displayName || user?.email}</p>
              </div>
            </div>
            <button onClick={logout} className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-rose-500/10 hover:text-rose-400 transition-all">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="max-w-xl mx-auto px-4 pt-6 space-y-6">
          
          {/* Quick Attendance */}
          <section className="bg-white/[0.03] border border-white/8 rounded-[2rem] p-6 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-colors ${
                lastAction?.type === "in" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/10 text-slate-400"
              }`}>
                <Power className={`w-8 h-8 ${isActing ? "animate-pulse" : ""}`} />
              </div>
              <div>
                <h2 className="text-xl font-bold">נוכחות עובד</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {lastAction?.type === "in" 
                    ? `נכנסת ב-${lastAction.time}` 
                    : lastAction?.type === "out" 
                      ? `יצאת ב-${lastAction.time}`
                      : "טרם נרשמה נוכחות היום"}
                </p>
              </div>
              <button 
                onClick={toggleAttendance}
                disabled={isActing}
                className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95 flex items-center justify-center gap-3 shadow-xl ${
                  lastAction?.type === "in" 
                    ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20" 
                    : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
                }`}
              >
                {isActing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
                {lastAction?.type === "in" ? "יציאה מהעבודה" : "כניסה לעבודה"}
              </button>
            </div>
          </section>

          {/* Personal Info */}
          <section className="bg-white/[0.03] border border-white/8 rounded-[2rem] p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Phone className="w-4 h-4 text-blue-400" />
              </div>
              <h3 className="font-bold text-base text-blue-100">פרטי קשר</h3>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 mr-2">מספר טלפון</label>
                <input 
                  type="tel" 
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="05x-xxxxxxx"
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5 opacity-60">
                <label className="text-[11px] font-bold text-slate-500 mr-2">אימייל (לקריאה בלבד)</label>
                <div className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm text-slate-400">
                  {user?.email}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-[11px] font-bold text-slate-500 mr-2">ימי עבודה קבועים</label>
              <div className="grid grid-cols-4 gap-2">
                {DAYS.map(day => {
                  const isSelected = selectedDays.includes(day.id);
                  return (
                    <button
                      key={day.id}
                      onClick={() => toggleDay(day.id)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all border ${
                        isSelected 
                          ? "bg-blue-600 border-blue-500 text-white" 
                          : "bg-white/5 border-white/10 text-slate-500 hover:border-white/20"
                      }`}
                    >
                      {day.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <button 
              onClick={saveProfile}
              disabled={isSaving}
              className="w-full py-3.5 bg-white text-slate-950 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Save className="w-4 h-4" />}
              {success ? "נשמר בהצלחה!" : "שמור שינויים"}
            </button>
          </section>

          {/* Leave Request */}
          <section className="bg-white/[0.03] border border-white/8 rounded-[2rem] p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-rose-500/10 rounded-lg flex items-center justify-center">
                <Calendar className="w-4 h-4 text-rose-400" />
              </div>
              <h3 className="font-bold text-base text-rose-100">בקשת היעדרות</h3>
            </div>

            <form onSubmit={submitLeaveRequest} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 mr-2">תאריך</label>
                <input 
                  type="date" 
                  value={leaveDate}
                  onChange={e => setLeaveDate(e.target.value)}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm focus:border-rose-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 mr-2">סיבה</label>
                <textarea 
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  placeholder="סיבת ההיעדרות..."
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm focus:border-rose-500 outline-none transition-all resize-none"
                />
              </div>

              <button 
                type="submit"
                disabled={isSubmittingLeave || !leaveDate}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                {isSubmittingLeave ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {leaveSuccess ? "הבקשה נשלחה!" : "שלח בקשה למנהל"}
              </button>
            </form>
          </section>

        </main>
      </div>
    </RoleGuard>
  );
}
