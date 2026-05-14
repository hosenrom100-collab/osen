"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState } from "react";
import { db } from "@/lib/firebase/config";
import { 
  doc, updateDoc, collection, addDoc, serverTimestamp 
} from "firebase/firestore";
import { 
  User, Phone, Calendar, CheckCircle2, 
  ChevronLeft, Loader2, LogOut, Save, Send, Edit3, Check, Settings
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
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
  { id: "small", label: "קטן" },
  { id: "medium", label: "בינוני" },
  { id: "large", label: "גדול" },
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
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        
        {/* ── CRM Header ── */}
        <header className="h-16 shrink-0 border-b border-border bg-card-bg/40 backdrop-blur-md flex items-center justify-between px-8 z-30">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                <span onClick={() => router.push("/")} className="hover:text-blue-500 cursor-pointer transition-colors">בית</span>
                <ChevronLeft className="w-2.5 h-2.5 opacity-30" />
                <span className="text-foreground/60">אזור אישי</span>
              </div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" />
                פרופיל משתמש
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-foreground/5 transition-all"
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </button>
            <div className="w-px h-6 bg-border mx-1" />
            <button onClick={logout} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:bg-rose-500/10 hover:text-rose-400 transition-all text-sm font-bold">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">התנתקות</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar bg-background">
          <div className="max-w-4xl mx-auto space-y-8 pb-20">
            
            <div className="grid md:grid-cols-[300px_1fr] gap-8">
              
              {/* Sidebar Info */}
              <aside className="space-y-6">
                <div className="bg-card-bg border border-border rounded-3xl p-6 text-center">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4 relative group">
                    {user?.photoURL ? (
                      <img src={user.photoURL} className="w-full h-full rounded-2xl object-cover" alt="" />
                    ) : (
                      <User className="w-10 h-10 text-blue-500" />
                    )}
                    <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                      <Edit3 className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <h2 className="text-xl font-bold">{user?.displayName || "משתמש חוסן"}</h2>
                  <p className="text-xs text-slate-500 font-medium mt-1">{user?.email}</p>
                  
                  <div className="mt-6 pt-6 border-t border-border flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-500">תפקיד:</span>
                      <span className="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-lg">{role === "admin" ? "מנהל מערכת" : role === "manager" ? "מנהל" : "איש צוות"}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-500">סטטוס:</span>
                      <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> מחובר</span>
                    </div>
                  </div>
                </div>

                {/* Display Settings */}
                <div className="bg-card-bg border border-border rounded-3xl p-6 space-y-6">
                   <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                     <Settings className="w-3 h-3" /> הגדרות תצוגה
                   </h3>
                   <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-400">גודל גופן</p>
                        <div className="flex p-1 bg-background border border-border rounded-xl">
                          {FONT_SIZES.map(f => (
                            <button key={f.id} onClick={() => setFontSize(f.id as any)}
                              className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                                fontSize === f.id ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-foreground"
                              }`}>
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </div>
                   </div>
                </div>
              </aside>

              {/* Main Content Areas */}
              <div className="space-y-6">
                
                {/* 1. Leave Reporting - CRM Style */}
                <div className="bg-card-bg border border-border rounded-3xl overflow-hidden shadow-xl">
                   <div className="px-6 py-5 border-b border-border bg-foreground/[0.02] flex items-center justify-between">
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        דיווח היעדרות ושיבוץ
                      </h3>
                   </div>
                   <div className="p-6">
                      <form onSubmit={submitLeaveRequest} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1">תאריך ההיעדרות</label>
                          <div className="relative">
                            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} required
                              className="w-full bg-background border border-border rounded-xl py-2.5 pr-9 pl-4 text-sm focus:border-blue-500/50 focus:outline-none transition-all" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1">סיבת ההיעדרות</label>
                          <input type="text" value={leaveReason} onChange={e => setLeaveReason(e.target.value)} placeholder="מחלה, מילואים, חופשה..."
                            className="w-full bg-background border border-border rounded-xl py-2.5 px-4 text-sm focus:border-blue-500/50 focus:outline-none transition-all" />
                        </div>
                        <div className="sm:col-span-2 pt-2">
                           <button type="submit" disabled={isSubmittingLeave || !leaveDate}
                             className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                               leaveSuccess ? "bg-emerald-500 text-white" : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
                             }`}>
                             {isSubmittingLeave ? <Loader2 className="w-4 h-4 animate-spin" /> : leaveSuccess ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                             {leaveSuccess ? "הבקשה נשלחה!" : "הגש בקשת היעדרות"}
                           </button>
                        </div>
                      </form>
                   </div>
                </div>

                {/* 2. Personal Details */}
                <div className="bg-card-bg border border-border rounded-3xl overflow-hidden shadow-xl">
                   <div className="px-6 py-5 border-b border-border bg-foreground/[0.02]">
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Phone className="w-4 h-4 text-blue-500" />
                        פרטים אישיים וימי עבודה
                      </h3>
                   </div>
                   <div className="p-6 space-y-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1">מספר טלפון ליצירת קשר</label>
                        <div className="relative">
                          <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="05x-xxxxxxx"
                            className="w-full bg-background border border-border rounded-xl py-2.5 pr-9 pl-4 text-sm focus:border-blue-500/50 focus:outline-none transition-all" />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1">ימי עבודה קבועים בשבוע</label>
                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                          {DAYS.map(day => {
                            const isSelected = selectedDays.includes(day.id);
                            return (
                              <button key={day.id} onClick={() => toggleDay(day.id)}
                                className={`py-2 rounded-xl text-[10px] font-black transition-all border ${
                                  isSelected 
                                    ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/20" 
                                    : "bg-background border-border text-slate-500 hover:border-slate-400"
                                }`}>
                                {day.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-border">
                         <button onClick={saveProfile} disabled={isSaving}
                           className="w-full py-3 bg-foreground text-background rounded-xl font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2">
                           {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : success ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                           {success ? "השינויים נשמרו!" : "שמור הגדרות פרופיל"}
                         </button>
                      </div>
                   </div>
                </div>

              </div>
            </div>
          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
