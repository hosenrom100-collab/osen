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
  ChevronLeft, Loader2, LogOut, Save, Send, MapPin, Power, Edit3, Check
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { sendPush } from "@/lib/notify";

import { useSettings } from "@/context/SettingsContext";

const DAYS = [
  { id: 0, name: "ראשון" },
  { id: 1, name: "שני" },
  { id: 2, name: "שלישי" },
  { id: 3, name: "רביעי" },
  { id: 4, name: "חמישי" },
  { id: 5, name: "שישי" },
  { id: 6, name: "שבת" },
];

const FONT_SIZES = [
  { id: "small", label: "קטן", icon: "A" },
  { id: "medium", label: "בינוני", icon: "A" },
  { id: "large", label: "גדול", icon: "A" },
];

export default function ProfilePage() {
  const { user, role, logout, phoneNumber, workDays } = useAuth();
  const { theme, fontSize, setTheme, setFontSize } = useSettings();
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

  useEffect(() => {
    // No attendance needed as per request
  }, []);

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



  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/login">
      <div className="min-h-screen bg-background text-foreground pb-32 transition-colors duration-300" dir="rtl">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border px-4 py-4">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-12 h-12 rounded-2xl border-2 border-blue-500/20" />
              ) : (
                <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
                  <User className="w-6 h-6 text-blue-400" />
                </div>
              )}
              <div>
                <h1 className="text-lg font-bold">אזור אישי</h1>
                <p className="text-[11px] opacity-60">{user?.displayName || user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-2.5 rounded-xl bg-card-bg border border-border hover:bg-white/5 transition-all"
              >
                {theme === "dark" ? "🌙" : "☀️"}
              </button>
              <button onClick={logout} className="p-2.5 rounded-xl bg-card-bg border border-border hover:bg-rose-500/10 hover:text-rose-400 transition-all">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-xl mx-auto px-4 pt-6 space-y-6">
          
          {/* Leave Request - Main priority */}
          <section className="bg-rose-500/5 border border-rose-500/10 rounded-[2rem] p-6 space-y-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-rose-500/10 rounded-lg flex items-center justify-center">
                <Calendar className="w-4 h-4 text-rose-400" />
              </div>
              <h3 className="font-bold text-base text-rose-100">דיווח היעדרות (לצורך שיבוץ)</h3>
            </div>

            <form onSubmit={submitLeaveRequest} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 mr-2">תאריך ההיעדרות</label>
                <input 
                  type="date" 
                  value={leaveDate}
                  onChange={e => setLeaveDate(e.target.value)}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm focus:border-rose-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 mr-2">סיבה (אופציונלי)</label>
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
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
              >
                {isSubmittingLeave ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {leaveSuccess ? "הדיווח נשלח!" : "דווח על היעדרות"}
              </button>
            </form>
          </section>

          {/* Personal Info */}
          <section className="bg-card-bg border border-border rounded-[2rem] p-6 space-y-5 shadow-sm">
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

          {/* Settings Section */}
          <section className="bg-card-bg border border-border rounded-[2rem] p-6 space-y-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <Edit3 className="w-4 h-4 text-purple-400" />
              </div>
              <h3 className="font-bold text-base">הגדרות תצוגה</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">גודל גופן</span>
                <div className="flex bg-background border border-border p-1 rounded-xl">
                  {FONT_SIZES.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setFontSize(f.id as any)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        fontSize === f.id ? "bg-purple-600 text-white shadow-lg" : "text-slate-500 hover:text-foreground"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

        </main>
      </div>
    </RoleGuard>
  );
}
