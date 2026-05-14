"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  User, Mail, Shield, Smartphone, Globe, Camera, 
  ChevronLeft, Loader2, LogOut, CheckCircle2,
  AlertCircle, Edit2, Save, X, Settings2,
  Calendar, Clock, AlertTriangle, Send, ChevronRight,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/firebase/config";
import { doc, updateDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { format } from "date-fns";
import { he } from "date-fns/locale";

export default function ProfilePage() {
  const { user, logout, role, workSchedule, photoURL } = useAuth();
  const { theme, setTheme, fontSize, setFontSize } = useSettings();
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Work Schedule
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [tempSchedule, setTempSchedule] = useState<Record<string, { start: string, end: string }>>(workSchedule || {});

  // Absence Reporting
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [absenceDate, setAbsenceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [absenceReason, setAbsenceReason] = useState("");
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState(false);

  const userRole = role || "user";
  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase()
    : user?.email?.[0].toUpperCase() || "??";

  useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName);
    if (workSchedule) setTempSchedule(workSchedule);
  }, [user, workSchedule]);

  const handleSaveName = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateProfile(user, { displayName });
      await updateDoc(doc(db, "users", user.uid), { displayName, updatedAt: new Date() });
      setIsEditing(false);
      setMessage({ type: 'success', text: 'הפרופיל עודכן בהצלחה' });
    } catch (e) {
      setMessage({ type: 'error', text: 'שגיאה בעדכון הפרופיל' });
    } finally { setIsSaving(false); }
  };

  const handleSaveSchedule = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        workSchedule: tempSchedule,
        onboardingComplete: true
      });
      setIsEditingSchedule(false);
      setMessage({ type: 'success', text: 'לו״ז העבודה עודכן בהצלחה' });
    } catch (e) {
      setMessage({ type: 'error', text: 'שגיאה בעדכון הלו״ז' });
    } finally { setIsSaving(false); }
  };

  const handleReportAbsence = async () => {
    if (!user || !absenceReason) return;
    setIsSubmittingAbsence(true);
    try {
      await addDoc(collection(db, "absence_requests"), {
        userId: user.uid,
        userName: user.displayName || user.email,
        date: absenceDate,
        reason: absenceReason,
        status: "pending",
        createdAt: serverTimestamp()
      });
      setShowAbsenceModal(false);
      setAbsenceReason("");
      setMessage({ type: 'success', text: 'דיווח ההיעדרות נשלח' });
    } catch (e) {
      setMessage({ type: 'error', text: 'שגיאה בשליחת הדיווח' });
    } finally { setIsSubmittingAbsence(false); }
  };

  const DAYS = [
    { id: "0", label: "ראשון", abbr: "א" }, 
    { id: "1", label: "שני", abbr: "ב" }, 
    { id: "2", label: "שלישי", abbr: "ג" },
    { id: "3", label: "רביעי", abbr: "ד" }, 
    { id: "4", label: "חמישי", abbr: "ה" }, 
    { id: "5", label: "שישי", abbr: "ו" },
    { id: "6", label: "שבת", abbr: "ש" }
  ];

  const ROLE_HE: Record<string, string> = {
    admin: "מנהל מערכת", manager: "מנהל", instructor: "מדריך",
    social_worker: 'עו"ס', employee: "עובד", logistics: "לוגיסטיקה"
  };

  return (
    <RoleGuard allowedRoles={["admin","manager","instructor","social_worker","employee","logistics"]} redirectTo="/login">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        
        {/* Header */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/")} className="p-2 hover:bg-[var(--foreground)]/5 rounded-xl transition-all">
              <ChevronRight className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-black tracking-tight">פרופיל אישי</h1>
          </div>
          <button onClick={() => logout()} className="text-rose-500 hover:bg-rose-500/10 px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2">
            <LogOut className="w-4 h-4" />
            התנתק
          </button>
        </header>

        <main className="max-w-5xl mx-auto p-6 md:p-12 pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            
            {/* Sidebar: Profile Summary */}
            <div className="space-y-6">
              <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[3rem] p-10 text-center shadow-sm">
                <div className="relative inline-block mb-8">
                  {photoURL ? (
                    <img 
                      src={photoURL} 
                      alt={displayName} 
                      className="w-32 h-32 rounded-[2.5rem] object-cover shadow-2xl shadow-rose-500/30 border-4 border-[var(--card-bg)]"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-[2.5rem] bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center text-4xl font-black text-white shadow-2xl shadow-rose-500/30">
                      {initials}
                    </div>
                  )}
                  <button className="absolute -bottom-2 -left-2 w-10 h-10 rounded-2xl bg-[var(--foreground)] text-[var(--background)] flex items-center justify-center border-4 border-[var(--card-bg)] hover:scale-110 transition-transform">
                    <Camera className="w-5 h-5" />
                  </button>
                </div>
                
                {isEditing ? (
                  <div className="space-y-4">
                    <input 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl px-4 py-3 text-center font-black text-lg outline-none focus:border-rose-500"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSaveName} className="flex-1 bg-rose-600 text-white py-3 rounded-xl text-xs font-black">שמור</button>
                      <button onClick={() => setIsEditing(false)} className="flex-1 bg-[var(--foreground)]/5 py-3 rounded-xl text-xs font-black">ביטול</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-2xl font-black flex items-center justify-center gap-3">
                      {displayName || "משתמש"}
                      <button onClick={() => setIsEditing(true)} className="text-[var(--foreground)]/10 hover:text-rose-500 transition-colors">
                        <Edit2 className="w-5 h-5" />
                      </button>
                    </h2>
                    <p className="text-sm font-bold text-[var(--foreground)]/30 mt-2">{user?.email}</p>
                    <div className="mt-6 inline-block px-4 py-2 rounded-2xl bg-rose-500/10 text-rose-500 text-[11px] font-black uppercase tracking-widest border border-rose-500/5">
                      {ROLE_HE[userRole] || userRole}
                    </div>
                  </div>
                )}
              </div>

              {message && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
                  className={`p-5 rounded-[2rem] border text-sm font-black flex items-center gap-4 ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
                  {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  {message.text}
                </motion.div>
              )}
            </div>

            {/* Main Content: Settings */}
            <div className="lg:col-span-2 space-y-12">
              
              {/* Work & Attendance */}
              <section className="space-y-6">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/20 mr-2">ניהול עבודה ונוכחות</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  
                  {/* Work Schedule Card */}
                  <div className="bg-[var(--card-bg)] border border-[var(--border)] p-8 rounded-[2.5rem] shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <p className="text-lg font-black tracking-tight">לו״ז עבודה שבועי</p>
                        <p className="text-xs text-[var(--foreground)]/40 font-bold mt-1">ימי עבודה והגדרות שעות</p>
                      </div>
                      <button 
                        onClick={() => setIsEditingSchedule(true)} 
                        className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all active:scale-90"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-2">
                      {DAYS.map(d => (
                        <div key={d.id} className="flex flex-col items-center gap-3">
                          <p className="text-sm font-black text-[var(--foreground)]/40">{d.abbr}</p>
                          <div className={`w-full aspect-square rounded-2xl border flex items-center justify-center transition-all ${
                            workSchedule?.[d.id] 
                              ? 'bg-rose-500 border-rose-500 shadow-lg shadow-rose-500/20 text-white' 
                              : 'bg-[var(--foreground)]/[0.03] border-[var(--border)] opacity-20'
                          }`}>
                            {workSchedule?.[d.id] && <Check className="w-4 h-4" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={() => setShowAbsenceModal(true)} 
                    className="bg-orange-500/5 border border-orange-500/20 p-8 rounded-[2.5rem] flex flex-col justify-center items-center text-center hover:bg-orange-500/10 transition-all group shadow-sm"
                  >
                    <div className="w-16 h-16 rounded-[2rem] bg-orange-500/10 flex items-center justify-center text-orange-600 mb-4 group-hover:scale-110 transition-transform shadow-inner">
                      <AlertTriangle className="w-7 h-7" />
                    </div>
                    <p className="text-lg font-black text-orange-700 tracking-tight">דיווח היעדרות</p>
                    <p className="text-[11px] text-orange-500/60 font-black uppercase tracking-widest mt-1">חופשה · מחלה · אחר</p>
                  </button>
                </div>
              </section>

              {/* Interface Settings */}
              <section className="space-y-6">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/20 mr-2">העדפות ממשק ונגישות</h3>
                <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] divide-y divide-[var(--border)] overflow-hidden shadow-sm">
                  <div className="p-8 flex items-center justify-between hover:bg-[var(--foreground)]/[0.01] transition-colors">
                    <div>
                      <p className="text-base font-black tracking-tight">ערכת נושא</p>
                      <p className="text-xs text-[var(--foreground)]/40 font-bold mt-1">התאמת צבעי הממשק לפי העדפה אישית</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{theme === 'dark' ? 'Dark' : 'Light'}</span>
                      <button 
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
                        className="w-14 h-8 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-full p-1.5 relative transition-colors hover:border-[var(--foreground)]/20"
                      >
                        <motion.div 
                          layout
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className={`w-5 h-5 rounded-full shadow-lg flex items-center justify-center ${theme === 'dark' ? 'mr-auto bg-rose-600' : 'bg-emerald-600'}`} 
                        />
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-8 space-y-6">
                    <div>
                      <p className="text-base font-black tracking-tight">גודל גופן</p>
                      <p className="text-xs text-[var(--foreground)]/40 font-bold mt-1">שינוי גודל הטקסט בכל חלקי האפליקציה</p>
                    </div>
                    <div className="flex gap-3">
                      {["small", "medium", "large"].map((size) => (
                        <button 
                          key={size} 
                          onClick={() => setFontSize(size as any)}
                          className={`flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] border transition-all ${
                            fontSize === size 
                              ? 'bg-[var(--foreground)] text-[var(--background)] border-transparent shadow-xl' 
                              : 'bg-[var(--foreground)]/5 border-transparent text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/10'
                          }`}
                        >
                          {size === 'small' ? 'Small' : size === 'medium' ? 'Normal' : 'Large'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>

        {/* Absence Modal */}
        <AnimatePresence>
          {showAbsenceModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[3rem] w-full max-w-lg p-10 shadow-2xl relative"
              >
                <div className="flex items-center justify-between mb-10">
                  <h3 className="text-2xl font-black tracking-tight">דיווח היעדרות</h3>
                  <button onClick={() => setShowAbsenceModal(false)} className="p-2.5 hover:bg-[var(--foreground)]/5 rounded-2xl transition-all"><X className="w-6 h-6" /></button>
                </div>
                <div className="space-y-8">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/30 mb-3 mr-2">תאריך היעדרות</label>
                    <input type="date" value={absenceDate} onChange={(e) => setAbsenceDate(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl px-5 py-4 text-sm font-black outline-none focus:border-orange-500 transition-all shadow-inner" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/30 mb-3 mr-2">פירוט וסיבת ההיעדרות</label>
                    <textarea value={absenceReason} onChange={(e) => setAbsenceReason(e.target.value)} placeholder="פרט כאן את סיבת ההיעדרות..." rows={4}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl px-5 py-4 text-sm font-medium outline-none resize-none focus:border-orange-500 transition-all shadow-inner" />
                  </div>
                  <button 
                    onClick={handleReportAbsence} 
                    disabled={isSubmittingAbsence || !absenceReason}
                    className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-2xl shadow-orange-600/30 active:scale-95"
                  >
                    {isSubmittingAbsence ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "שלח דיווח לאישור"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Schedule Modal */}
          {isEditingSchedule && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[3rem] w-full max-w-2xl p-10 shadow-2xl"
              >
                <div className="flex items-center justify-between mb-10">
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">עדכון לו״ז עבודה</h3>
                    <p className="text-xs text-[var(--foreground)]/40 font-bold mt-1">בחר את ימי העבודה והגדר את שעות התחילה והסיום</p>
                  </div>
                  <button onClick={() => setIsEditingSchedule(false)} className="p-2.5 hover:bg-[var(--foreground)]/5 rounded-2xl transition-all"><X className="w-6 h-6" /></button>
                </div>
                <div className="space-y-4 max-h-[50vh] overflow-y-auto no-scrollbar pr-2">
                  {DAYS.map(day => (
                    <div 
                      key={day.id} 
                      className={`p-6 rounded-[2rem] border flex flex-col md:flex-row md:items-center justify-between transition-all gap-4 ${
                        tempSchedule[day.id] ? 'bg-rose-500/5 border-rose-500/30 ring-1 ring-rose-500/10' : 'border-[var(--border)] opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => {
                            const next = { ...tempSchedule };
                            if (next[day.id]) delete next[day.id];
                            else next[day.id] = { start: "08:00", end: "16:00" };
                            setTempSchedule(next);
                          }} 
                          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                            tempSchedule[day.id] ? 'bg-rose-500 border-rose-500 text-white' : 'border-[var(--border)]'
                          }`}
                        >
                          {tempSchedule[day.id] && <Check className="w-4 h-4" />}
                        </button>
                        <span className="text-base font-black">יום {day.label}</span>
                      </div>
                      
                      {tempSchedule[day.id] && (
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1 mr-1">התחלה</span>
                            <input type="time" value={tempSchedule[day.id].start} onChange={(e) => setTempSchedule({...tempSchedule, [day.id]: {...tempSchedule[day.id], start: e.target.value}})}
                              className="bg-[var(--background)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm font-black outline-none focus:border-rose-500" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1 mr-1">סיום</span>
                            <input type="time" value={tempSchedule[day.id].end} onChange={(e) => setTempSchedule({...tempSchedule, [day.id]: {...tempSchedule[day.id], end: e.target.value}})}
                              className="bg-[var(--background)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm font-black outline-none focus:border-rose-500" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button 
                  onClick={handleSaveSchedule} 
                  className="w-full mt-10 bg-rose-600 hover:bg-rose-500 text-white py-5 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-rose-600/30 transition-all active:scale-95"
                >
                  שמור לו״ז עבודה מעודכן
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </RoleGuard>
  );
}
