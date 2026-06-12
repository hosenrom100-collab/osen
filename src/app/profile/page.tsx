"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  User, Mail, Shield, Smartphone, Globe, Camera,
  ChevronLeft, Loader2, LogOut, CheckCircle2,
  AlertCircle, Edit2, Save, X, Settings2,
  ChevronRight,
  Check
} from "lucide-react";
import { motion } from "framer-motion";
import { db } from "@/lib/firebase/config";
import { doc, updateDoc, collection, serverTimestamp, getDocs } from "firebase/firestore";
import { updateProfile } from "firebase/auth";

export default function ProfilePage() {
  const { 
    user, logout, role, workSchedule, photoURL,
    preferredProgramIds, preferredGroupIds, setPreferredPrograms, setPreferredGroups,
    signatureTitle: savedSignatureTitle, signatureImage: savedSignatureImage
  } = useAuth();
  const { theme, setTheme, fontSize, setFontSize } = useSettings();
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Digital Signature States
  const [signatureTitle, setLocalSignatureTitle] = useState("");
  const [localSignatureImage, setLocalSignatureImage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (savedSignatureTitle) setLocalSignatureTitle(savedSignatureTitle);
    if (savedSignatureImage) setLocalSignatureImage(savedSignatureImage);
  }, [savedSignatureTitle, savedSignatureImage]);

  // Clear Canvas
  const handleClearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setLocalSignatureImage(null);
  };

  // Start Drawing
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#000000"; // Black signature ink
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Prevent scrolling on touch screens
    if (e.nativeEvent instanceof TouchEvent) {
      e.preventDefault();
    }

    const { x, y } = getCoord(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  // Draw
  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (e.nativeEvent instanceof TouchEvent) {
      e.preventDefault();
    }

    const { x, y } = getCoord(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  // Stop Drawing
  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // Helper to get coordinates relative to canvas bounding rect
  const getCoord = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Support mouse or touch events
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  // Save Signature
  const handleSaveSignature = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const canvas = canvasRef.current;
      let finalSignatureImage = localSignatureImage;
      
      // If canvas is drawn on, save it
      if (canvas) {
        const dataUrl = canvas.toDataURL("image/png");
        // Only override if canvas was actually drawn on (drawn pixel check is simple, or just save the URL)
        finalSignatureImage = dataUrl;
      }

      await updateDoc(doc(db, "users", user.uid), {
        signatureTitle: signatureTitle.trim(),
        signatureImage: finalSignatureImage || "",
        updatedAt: serverTimestamp()
      });

      setMessage({ type: 'success', text: 'החתימה והתואר עודכנו בהצלחה' });
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'שגיאה בעדכון החתימה והתואר' });
    } finally {
      setIsSaving(false);
    }
  };

  // Preferred display items on homepage
  const [allPrograms, setAllPrograms] = useState<{ id: string; name: string }[]>([]);
  const [allGroups, setAllGroups] = useState<{ id: string; name: string; programId: string }[]>([]);

  const userRole = role || "user";
  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase()
    : user?.email?.[0].toUpperCase() || "??";

  useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName);
    if (user) {
      fetchPreferencesData();
    }
  }, [user]);

  const fetchPreferencesData = async () => {
    try {
      const [progSnap, groupSnap] = await Promise.all([
        getDocs(collection(db, "programs")),
        getDocs(collection(db, "groups"))
      ]);
      setAllPrograms(progSnap.docs.map(d => ({ id: d.id, name: d.data().name || "" })));
      setAllGroups(groupSnap.docs.map(d => ({ id: d.id, name: d.data().name || "", programId: d.data().programId || "" })));
    } catch (e) {
      console.error("Error fetching programs/groups for preferences:", e);
    }
  };

  const toggleProgram = async (progId: string) => {
    const current = preferredProgramIds || [];
    const next = current.includes(progId) 
      ? current.filter(id => id !== progId) 
      : [...current, progId];
    await setPreferredPrograms(next);
  };

  const toggleGroup = async (groupId: string) => {
    const current = preferredGroupIds || [];
    const next = current.includes(groupId) 
      ? current.filter(id => id !== groupId) 
      : [...current, groupId];
    await setPreferredGroups(next);
  };

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
        <header className="sticky top-0 z-40 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6 h-16 flex items-center justify-between">
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

        <main className="max-w-5xl mx-auto p-4 md:p-12 pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-12">
            
            {/* Sidebar: Profile Summary */}
            <div className="space-y-4 md:space-y-6">
              <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-3xl md:rounded-[3rem] p-6 md:p-10 text-center shadow-sm">
                <div className="relative inline-block mb-6 md:mb-8">
                  {photoURL ? (
                    <img 
                      src={photoURL} 
                      alt={displayName} 
                      className="w-24 h-24 md:w-32 md:h-32 rounded-2xl md:rounded-[2.5rem] object-cover shadow-2xl shadow-rose-500/30 border-4 border-[var(--card-bg)]"
                    />
                  ) : (
                    <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl md:rounded-[2.5rem] bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center text-3xl md:text-4xl font-black text-white shadow-2xl shadow-rose-500/30">
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

                {/* Work Schedule Card */}
                <div className="bg-[var(--card-bg)] border border-[var(--border)] p-6 md:p-8 rounded-3xl md:rounded-[2.5rem] shadow-sm">
                  <div className="mb-6 md:mb-8">
                    <p className="text-base md:text-lg font-black tracking-tight">לו״ז עבודה שבועי</p>
                    <p className="text-[10px] md:text-xs text-[var(--foreground)]/40 font-bold mt-1">ימי עבודה</p>
                  </div>

                  <div className="grid grid-cols-7 gap-1 md:gap-2">
                    {DAYS.map(d => (
                      <div key={d.id} className="flex flex-col items-center gap-2 md:gap-3">
                        <p className="text-[10px] md:text-sm font-black text-[var(--foreground)]/40">{d.abbr}</p>
                        <div className={`w-full aspect-square rounded-lg md:rounded-2xl border flex items-center justify-center transition-all ${
                          workSchedule?.[d.id]
                            ? 'bg-rose-500 border-rose-500 shadow-lg shadow-rose-500/20 text-white'
                            : 'bg-[var(--foreground)]/[0.03] border-[var(--border)] opacity-20'
                        }`}>
                          {workSchedule?.[d.id] && <Check className="w-3 md:w-4 h-3 md:h-4" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Digital Signature & Certificates Settings */}
              <section className="space-y-6">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/20 mr-2">חתימה דיגיטלית ואישורים רשמיים</h3>
                <div className="bg-[var(--card-bg)] border border-[var(--border)] p-6 md:p-8 rounded-3xl md:rounded-[2.5rem] shadow-sm space-y-6">
                  <div>
                    <p className="text-base md:text-lg font-black tracking-tight">הפקדת חתימה ותואר מקצועי</p>
                    <p className="text-xs text-[var(--foreground)]/40 font-bold mt-1">הגדר את תוארך המקצועי וצייר את חתימתך הפיזית. חתימה זו תוטמע אוטומטית בכל אישורי שהייה והשתתפות שאתה מפיק עבור משתתפי החווה.</p>
                  </div>

                  <div className="space-y-6">
                    {/* Custom Title Input */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/30 mr-1">תואר מקצועי מלווה (למשל: עו״ס MSW)</label>
                      <input 
                        type="text" 
                        value={signatureTitle}
                        onChange={(e) => setLocalSignatureTitle(e.target.value)}
                        placeholder="לדוגמה: עו״ס MSW, רכז שיקום בחווה"
                        className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl px-5 py-4 text-xs font-bold outline-none focus:border-rose-500 transition-all shadow-inner"
                      />
                    </div>

                    {/* Canvas Drawing Pad Container */}
                    <div className="space-y-3.5">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/30 mr-1">ציור חתימה אישית</label>
                      
                      {localSignatureImage && (
                        <div className="border border-[var(--border)] rounded-2xl p-4 bg-white flex flex-col items-center justify-center gap-2 shadow-inner">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">תצוגה מקדימה של החתימה הפעילה שלך:</p>
                          <img src={localSignatureImage} alt="חתימה פעילה" className="max-h-24 object-contain animate-fade-in" />
                        </div>
                      )}

                      <div className="border border-[var(--border)] rounded-2xl bg-white overflow-hidden relative shadow-inner">
                        <canvas
                          ref={canvasRef}
                          width={500}
                          height={180}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawing}
                          onTouchMove={draw}
                          onTouchEnd={stopDrawing}
                          className="w-full h-44 cursor-crosshair touch-none bg-white"
                        />
                        <div className="absolute bottom-3 left-3 flex gap-2">
                          <button
                            type="button"
                            onClick={handleClearSignature}
                            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer border border-rose-100 shadow-sm"
                          >
                            נקה לוח
                          </button>
                        </div>
                      </div>
                      
                      <p className="text-[10px] text-[var(--muted)] font-medium leading-relaxed leading-none mt-1 mr-1">
                        * צייר את החתימה שלך עם העכבר או האצבע בתוך התיבה הלבנה, ולאחר מכן לחץ על "שמור חתימה ותואר".
                      </p>
                    </div>

                    <button
                      onClick={handleSaveSignature}
                      disabled={isSaving}
                      className="w-full bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white py-4.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-rose-600/10 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      שמור חתימה ותואר
                    </button>
                  </div>
                </div>
              </section>

              {/* Interface Settings */}
              <section className="space-y-6">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/20 mr-2">העדפות ממשק ונגישות</h3>
                <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-3xl md:rounded-[2.5rem] divide-y divide-[var(--border)] overflow-hidden shadow-sm">
                  <div className="p-6 md:p-8 flex items-center justify-between hover:bg-[var(--foreground)]/[0.01] transition-colors">
                    <div>
                      <p className="text-base font-black tracking-tight">ערכת נושא</p>
                      <p className="text-xs text-[var(--foreground)]/40 font-bold mt-1">צבעי הממשק</p>
                    </div>
                    <div className="flex items-center gap-3 md:gap-4">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-40 hidden sm:inline">{theme === 'dark' ? 'Dark' : 'Light'}</span>
                      <button 
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
                        className="w-12 h-7 md:w-14 md:h-8 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-full p-1 md:p-1.5 relative transition-colors"
                      >
                        <motion.div 
                          layout
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className={`w-5 h-5 rounded-full shadow-lg flex items-center justify-center ${theme === 'dark' ? 'mr-auto bg-rose-600' : 'bg-emerald-600'}`} 
                        />
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-6 md:p-8 space-y-4 md:space-y-6">
                    <div>
                      <p className="text-base font-black tracking-tight">גודל גופן</p>
                      <p className="text-xs text-[var(--foreground)]/40 font-bold mt-1">שינוי גודל הטקסט</p>
                    </div>
                    <div className="flex gap-2 md:gap-3">
                      {["small", "medium", "large"].map((size) => (
                        <button 
                          key={size} 
                          onClick={() => setFontSize(size as any)}
                          className={`flex-1 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl text-[9px] md:text-[11px] font-black uppercase tracking-widest border transition-all ${
                            fontSize === size 
                              ? 'bg-[var(--foreground)] text-[var(--background)] border-transparent shadow-lg' 
                              : 'bg-[var(--foreground)]/5 border-transparent text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/10'
                          }`}
                        >
                          {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Homepage display settings (preferred programs & groups) */}
              <section className="space-y-6">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/20 mr-2">הגדרות תצוגה בעמוד הבית</h3>
                <div className="bg-[var(--card-bg)] border border-[var(--border)] p-6 md:p-8 rounded-3xl md:rounded-[2.5rem] shadow-sm space-y-6">
                  <div>
                    <p className="text-base font-black tracking-tight">סינון תוכניות וקבוצות כברירת מחדל</p>
                    <p className="text-xs text-[var(--foreground)]/40 font-bold mt-1">בחר אילו תוכניות וקבוצות יוצגו כברירת מחדל בעמוד הבית. השאר ריק כדי להציג את הכל/לפי ההרשאות הרגילות.</p>
                  </div>

                  <div className="space-y-4">
                    {allPrograms.map(prog => {
                      const isProgSelected = preferredProgramIds?.includes(prog.id);
                      const progGroups = allGroups.filter(g => g.programId === prog.id);

                      return (
                        <div key={prog.id} className="border border-[var(--border)] rounded-2xl p-4 md:p-5 space-y-4 bg-[var(--foreground)]/[0.01]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => toggleProgram(prog.id)}
                                className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                                  isProgSelected 
                                    ? 'bg-rose-500 border-rose-500 text-white' 
                                    : 'border-[var(--border)] bg-[var(--background)]'
                                }`}
                              >
                                {isProgSelected && <Check className="w-4 h-4" />}
                              </button>
                              <span className="text-sm font-black text-[var(--foreground)]">תוכנית: {prog.name}</span>
                            </div>
                            <span className="text-[10px] text-[var(--foreground)]/30 font-bold">
                              {progGroups.length} קבוצות
                            </span>
                          </div>

                          {progGroups.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-9">
                              {progGroups.map(group => {
                                const isGroupSelected = preferredGroupIds?.includes(group.id);
                                return (
                                  <div 
                                    key={group.id} 
                                    onClick={() => toggleGroup(group.id)}
                                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                      isGroupSelected || isProgSelected
                                        ? 'bg-rose-500/5 border-rose-500/30 text-rose-500' 
                                        : 'border-[var(--border)] bg-[var(--background)]/50 hover:bg-[var(--foreground)]/[0.02]'
                                    }`}
                                  >
                                    <div
                                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                                        isGroupSelected || isProgSelected
                                          ? 'bg-rose-500 border-rose-500 text-white' 
                                          : 'border-[var(--border)] bg-[var(--background)]'
                                      }`}
                                    >
                                      {(isGroupSelected || isProgSelected) && <Check className="w-3 h-3" />}
                                    </div>
                                    <span className={`text-xs font-semibold ${isProgSelected ? 'opacity-60' : ''}`}>
                                      {group.name}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
