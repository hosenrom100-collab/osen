"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  User, Mail, Shield, Smartphone, Globe, Camera, 
  ChevronLeft, Loader2, LogOut, CheckCircle2,
  AlertCircle, Edit2, Save, X, Settings2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/firebase/config";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { theme, setTheme, fontSize, setFontSize } = useSettings();
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Stats / Metadata
  const userRole = (user as any)?.role || "user";
  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase()
    : user?.email?.[0].toUpperCase() || "??";

  useEffect(() => {
    if (user?.displayName) {
      setDisplayName(user.displayName);
    }
  }, [user]);

  const handleSaveName = async () => {
    if (!user) return;
    setIsSaving(true);
    setMessage(null);
    try {
      // 1. Update Firebase Auth Profile
      await updateProfile(user, { displayName });
      
      // 2. Update Firestore User Document
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { 
        displayName,
        updatedAt: new Date()
      });

      setIsEditing(false);
      setMessage({ type: 'success', text: 'הפרופיל עודכן בהצלחה' });
    } catch (error) {
      console.error("Error updating profile:", error);
      setMessage({ type: 'error', text: 'שגיאה בעדכון הפרופיל. נסה שוב.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/login");
    } catch (e) {
      console.error(e);
    }
  };

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <RoleGuard allowedRoles={["admin","manager","instructor","social_worker","employee","logistics"]} redirectTo="/login">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6">
          <div className="flex items-center gap-3 h-14 md:h-16">
            <button onClick={() => router.push("/")} className="p-2 rounded-xl text-[var(--foreground)]/50 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-all active:scale-95">
              <ChevronLeft className="w-5 h-5 rotate-180" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold tracking-tight">אזור אישי</h1>
              <p className="text-[10px] text-[var(--foreground)]/40 font-medium hidden md:block">ניהול הגדרות חשבון והעדפות</p>
            </div>
            <div className="mr-auto">
              <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 text-xs font-bold transition-all">
                <LogOut className="w-3.5 h-3.5" />
                <span>התנתק</span>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-4 md:p-8 pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* ── Left Column: Profile Card ── */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-xl shadow-black/5">
                {/* Hero Section */}
                <div className="h-24 bg-gradient-to-br from-rose-500/20 to-blue-500/20" />
                <div className="px-6 pb-8 -mt-12">
                  <div className="relative inline-block group">
                    <div className="w-24 h-24 rounded-3xl bg-[var(--background)] border-4 border-[var(--card-bg)] shadow-lg flex items-center justify-center text-3xl font-black text-[var(--foreground)] overflow-hidden">
                      {initials}
                    </div>
                    <button className="absolute bottom-1 -right-1 p-2 rounded-xl bg-rose-600 text-white shadow-lg hover:scale-110 transition-transform active:scale-95">
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="min-w-0">
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <input 
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="bg-[var(--background)] border border-rose-500/30 rounded-lg px-3 py-1 text-lg font-bold outline-none focus:border-rose-500 transition-all w-full"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button onClick={handleSaveName} disabled={isSaving} className="px-3 py-1 bg-rose-600 text-white rounded-md text-xs font-bold flex items-center gap-1">
                              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                              שמור
                            </button>
                            <button onClick={() => setIsEditing(false)} className="px-3 py-1 bg-[var(--foreground)]/5 text-[var(--foreground)]/60 rounded-md text-xs font-bold">
                              ביטול
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                            {displayName || "משתמש"}
                            <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-lg hover:bg-[var(--foreground)]/5 text-[var(--foreground)]/30 hover:text-rose-500 transition-all">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </h2>
                        </>
                      )}
                      <p className="text-sm text-[var(--foreground)]/40 font-medium flex items-center gap-1.5 mt-1">
                        <Mail className="w-3.5 h-3.5" />
                        {user?.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-6">
                    <div className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-widest border border-rose-500/20">
                      {userRole}
                    </div>
                    <div className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-black uppercase tracking-widest border border-blue-500/20">
                      Active
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Message */}
              <AnimatePresence>
                {message && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`p-4 rounded-2xl border flex items-center gap-3 ${
                      message.type === 'success' 
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                    }`}
                  >
                    {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    <span className="text-sm font-bold">{message.text}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Right Column: Settings ── */}
            <div className="lg:col-span-7 space-y-8">
              {/* Account Security */}
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-blue-500" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-wider">אבטחה והגדרות חשבון</h3>
                </div>
                
                <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-3xl divide-y divide-[var(--border)] overflow-hidden shadow-sm">
                  <div className="p-5 flex items-center justify-between hover:bg-[var(--foreground)]/[0.02] transition-colors cursor-pointer group">
                    <div className="flex gap-4 items-center">
                      <div className="w-10 h-10 rounded-xl bg-[var(--foreground)]/5 flex items-center justify-center text-[var(--foreground)]/40 group-hover:bg-rose-500/10 group-hover:text-rose-500 transition-all">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">אימות דו-שלבי</p>
                        <p className="text-[11px] text-[var(--foreground)]/40 font-medium">הגנה נוספת על החשבון שלך</p>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-[var(--foreground)]/20" />
                  </div>

                  <div className="p-5 flex items-center justify-between hover:bg-[var(--foreground)]/[0.02] transition-colors cursor-pointer group">
                    <div className="flex gap-4 items-center">
                      <div className="w-10 h-10 rounded-xl bg-[var(--foreground)]/5 flex items-center justify-center text-[var(--foreground)]/40 group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-all">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">שפה ואזור</p>
                        <p className="text-[11px] text-[var(--foreground)]/40 font-medium">עברית (ישראל)</p>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-[var(--foreground)]/20" />
                  </div>
                </div>
              </section>

              {/* Interface Settings */}
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
                    <Settings2 className="w-4 h-4 text-violet-500" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-wider">העדפות ממשק</h3>
                </div>

                <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-3xl p-6 shadow-sm space-y-8">
                  {/* Theme Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">ערכת נושא</p>
                      <p className="text-[11px] text-[var(--foreground)]/40 font-medium">החלף בין מצב בהיר למצב כהה</p>
                    </div>
                    <button 
                      onClick={toggleTheme}
                      className="relative w-14 h-7 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-full p-1 transition-colors hover:border-[var(--foreground)]/20"
                    >
                      <motion.div 
                        animate={{ x: theme === "dark" ? -28 : 0 }}
                        className="w-5 h-5 bg-rose-600 rounded-full shadow-lg flex items-center justify-center"
                      />
                    </button>
                  </div>

                  {/* Font Size Selector */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">גודל גופן</p>
                      <span className="text-xs font-black text-rose-500 uppercase">{fontSize}</span>
                    </div>
                    <div className="flex gap-2">
                      {["small", "medium", "large"].map((size) => (
                        <button
                          key={size}
                          onClick={() => setFontSize(size as any)}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                            fontSize === size 
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-500 shadow-sm' 
                              : 'bg-[var(--foreground)]/5 border-transparent text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/10'
                          }`}
                        >
                          {size === 'small' ? 'קטן' : size === 'medium' ? 'בינוני' : 'גדול'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>

        <footer className="max-w-4xl mx-auto px-4 py-8 border-t border-[var(--border)] mb-12">
          <p className="text-center text-[10px] text-[var(--foreground)]/20 font-mono tracking-widest uppercase">
            מרכז חוסן | חוות רום · Secure Profile Management · v2.4.0
          </p>
        </footer>

      </div>
    </RoleGuard>
  );
}
