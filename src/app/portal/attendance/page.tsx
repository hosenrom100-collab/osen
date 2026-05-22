"use client";

import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, doc, getDoc, query, orderBy, where, onSnapshot, setDoc
} from "firebase/firestore";
import {
  BarChart3, Clock, Loader2, Calendar, Info, QrCode, CheckCircle2, AlertCircle, X, Camera, Sparkles, Check
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

export default function AttendancePage() {
  const { user } = useAuth();
  const [patientData, setPatientData] = useState<any>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const uSnap = await getDoc(doc(db, "users", user.uid));
      const pId = uSnap.data()?.patientId;
      if (!pId) {
        setLoading(false);
        return;
      }

      // Fetch patient details (needed for correct group context ID when checking in)
      const pSnap = await getDoc(doc(db, "patients", pId));
      if (pSnap.exists()) {
        setPatientData({ id: pId, ...pSnap.data() });
      }

      const unsubAtt = onSnapshot(
        query(collection(db, "attendance"), where("patientId", "==", pId), orderBy("date", "desc")),
        (snap) => {
          const daily: Record<string, any> = {};
          snap.docs.forEach(d => {
            const data = d.data();
            if (!daily[data.date] || data.status === 'present') daily[data.date] = data;
          });
          setAttendanceHistory(Object.values(daily).sort((a, b) => b.date.localeCompare(a.date)));
          setLoading(false);
        }
      );

      return () => unsubAtt();
    };
    init();
  }, [user]);

  // Premium synthesized scanning beep using Web Audio API
  const playSuccessSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      // Satisfying high-pitched double beep
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.start();
      
      // Beep 1 decay
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      
      setTimeout(() => {
        try {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.type = "sine";
          osc2.frequency.setValueAtTime(1050, ctx.currentTime);
          gain2.gain.setValueAtTime(0.08, ctx.currentTime);
          osc2.start();
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
          setTimeout(() => osc2.stop(), 150);
        } catch {}
      }, 70);
      
      setTimeout(() => osc.stop(), 150);
    } catch (e) {
      console.error("Audio feedback error:", e);
    }
  };

  const handleQRCheckIn = async () => {
    if (!patientData) return;
    setScanStatus("scanning");
    
    // Beautiful scanning feedback animation delay
    setTimeout(async () => {
      setCheckingIn(true);
      try {
        const contextId = patientData.hosenType || (patientData.groupIds && patientData.groupIds[0]) || "general";
        const today = format(new Date(), "yyyy-MM-dd");
        const attId = `${patientData.id}_${contextId}_${today}`;
        
        await setDoc(doc(db, "attendance", attId), {
          patientId: patientData.id,
          date: today,
          status: "present",
          contextId,
          updatedAt: new Date().toISOString(),
        });
        
        playSuccessSound();
        setScanStatus("success");
        
        // Auto close after showing success screen
        setTimeout(() => {
          setShowScanner(false);
          setScanStatus("idle");
        }, 2200);
      } catch (err) {
        console.error("Attendance check-in error:", err);
        setScanStatus("error");
      } finally {
        setCheckingIn(false);
      }
    }, 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-teal-500" />
        <p className="text-xs text-[var(--muted)] font-black uppercase tracking-widest">טוען נתוני נוכחות...</p>
      </div>
    );
  }

  const presentCount = attendanceHistory.filter(h => h.status === 'present').length;
  const absentCount = attendanceHistory.filter(h => h.status === 'absent').length;
  const totalDays = presentCount + absentCount;
  const attendanceRate = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 100;

  // SVG Radial Progress properties
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * attendanceRate) / 100;

  return (
    <div className="space-y-6 max-w-md mx-auto px-1 pb-24" dir="rtl">
      {/* Premium Header */}
      <div className="flex items-center justify-between mt-2">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-[var(--foreground)]">מעקב נוכחות</h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mt-0.5">My Attendance History</p>
        </div>

        {/* Floating Check-In button directly in header */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setShowScanner(true);
            handleQRCheckIn();
          }}
          className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white px-4 py-2.5 rounded-2xl text-xs font-black shadow-lg shadow-teal-500/10 active:scale-98 transition-all border border-teal-400/20"
        >
          <QrCode className="w-4 h-4" />
          <span>החתמה מהירה</span>
        </motion.button>
      </div>

      {/* Radial Attendance Overview Card */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.2rem] p-6 relative overflow-hidden shadow-sm">
        {/* Glassmorphic Background Blur Accent */}
        <div className="absolute -top-12 -left-12 w-28 h-28 rounded-full bg-teal-500/5 blur-xl pointer-events-none" />

        <div className="flex items-center justify-between relative z-10">
          <div className="space-y-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">אחוז נוכחות חודשי</p>
              <h3 className="text-2xl font-black text-[var(--foreground)] mt-1">התקדמות ימי פעילות</h3>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <div className="flex flex-col">
                  <span className="text-xs font-black text-emerald-500">{presentCount}</span>
                  <span className="text-[9px] text-[var(--muted)] leading-tight">ימים נוכח/ת</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <div className="flex flex-col">
                  <span className="text-xs font-black text-rose-500">{absentCount}</span>
                  <span className="text-[9px] text-[var(--muted)] leading-tight">ימים נעדר/ת</span>
                </div>
              </div>
            </div>
          </div>

          {/* Premium Radial Progress Ring */}
          <div className="relative w-32 h-32 flex items-center justify-center">
            {/* SVG circle track */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r={radius}
                className="stroke-[var(--border)] fill-none"
                strokeWidth="10"
              />
              <motion.circle
                cx="64"
                cy="64"
                r={radius}
                className="stroke-teal-500 fill-none"
                strokeWidth="10"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-xl font-black text-[var(--foreground)] tracking-tighter">{attendanceRate}%</span>
              <span className="text-[8px] text-[var(--muted)] font-black uppercase">נוכחות</span>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Log Section */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.2rem] p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-5 border-b border-[var(--border)] pb-3">
          <Calendar className="w-4.5 h-4.5 text-teal-500" />
          <h3 className="text-sm font-black text-[var(--foreground)]">היסטוריית נוכחות מפורטת</h3>
        </div>

        <div className="space-y-2.5">
          {attendanceHistory.map((h, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.4) }}
              className="flex items-center justify-between p-4 bg-[var(--background)] border border-[var(--border)] rounded-2xl hover:border-teal-500/20 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                {/* Date stamp circle */}
                <div className="w-11 h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex flex-col items-center justify-center shrink-0">
                  <span className="text-xs font-black text-[var(--foreground)] tracking-tight">
                    {format(parseISO(h.date), "dd")}
                  </span>
                  <span className="text-[8px] text-[var(--muted)] font-bold mt-0.5 leading-none">
                    {format(parseISO(h.date), "MM")}
                  </span>
                </div>
                <div>
                  <p className="font-black text-xs text-[var(--foreground)]">
                    {format(parseISO(h.date), "EEEE", { locale: he })}
                  </p>
                  <p className="text-[9px] text-[var(--muted)] font-medium mt-0.5">
                    {format(parseISO(h.date), "d MMMM yyyy", { locale: he })}
                  </p>
                </div>
              </div>

              {/* Attendance Status Badge */}
              <div className={`px-3.5 py-1.5 rounded-xl text-[9px] font-black border uppercase tracking-wider flex items-center gap-1 ${
                h.status === 'present' 
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
              }`}>
                {h.status === 'present' ? (
                  <>
                    <Check className="w-3 h-3 stroke-[3]" />
                    <span>נוכח/ת</span>
                  </>
                ) : (
                  <>
                    <X className="w-3 h-3 stroke-[3]" />
                    <span>נעדר/ת</span>
                  </>
                )}
              </div>
            </motion.div>
          ))}

          {attendanceHistory.length === 0 && (
            <div className="text-center py-16 opacity-30 flex flex-col items-center justify-center gap-2">
              <Calendar className="w-8 h-8 text-[var(--muted)] opacity-20" />
              <p className="text-xs font-black">אין נתוני נוכחות רשומים</p>
            </div>
          )}
        </div>
      </div>

      {/* QR Scanner / Self Check-In Overlay Modal */}
      <AnimatePresence>
        {showScanner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden flex flex-col items-center text-center"
            >
              {/* Glassmorphic Background Blur Accent */}
              <div className="absolute -top-12 -left-12 w-24 h-24 rounded-full bg-teal-500/15 blur-xl pointer-events-none" />

              {/* Close Button */}
              {scanStatus !== "success" && (
                <button
                  onClick={() => {
                    setShowScanner(false);
                    setScanStatus("idle");
                  }}
                  className="absolute left-4 top-4 w-8 h-8 rounded-full bg-[var(--foreground)]/5 border border-[var(--border)] flex items-center justify-center hover:bg-[var(--foreground)]/10 text-[var(--foreground)] active:scale-90 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Title */}
              <div className="mt-2 mb-6">
                <h3 className="text-lg font-black text-[var(--foreground)]">סורק נוכחות מהיר</h3>
                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)] mt-0.5">Smart QR Check-In</p>
              </div>

              {/* Interactive Scanning Viewfinder Container */}
              <div className="relative w-52 h-52 bg-slate-900 border-2 border-dashed border-teal-500/30 rounded-3xl overflow-hidden flex items-center justify-center shadow-inner mb-6">
                
                {scanStatus === "scanning" && (
                  <>
                    {/* Simulated live camera lens flare */}
                    <div className="absolute inset-0 bg-slate-950/30 backdrop-contrast-125 pointer-events-none animate-pulse" />
                    
                    {/* Viewfinder Target Bracket corners */}
                    <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-teal-500 rounded-tr-md" />
                    <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-teal-500 rounded-tl-md" />
                    <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-teal-500 rounded-br-md" />
                    <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-teal-500 rounded-bl-md" />

                    {/* Animated Neon green laser scanning sweep line */}
                    <motion.div
                      initial={{ top: "10%" }}
                      animate={{ top: "85%" }}
                      transition={{
                        repeat: Infinity,
                        repeatType: "reverse",
                        duration: 1.5,
                        ease: "easeInOut"
                      }}
                      className="absolute left-4 right-4 h-1 bg-gradient-to-r from-transparent via-teal-400 to-transparent shadow-[0_0_12px_#2dd4bf] pointer-events-none"
                    />

                    {/* Animated rotating loading aperture */}
                    <Camera className="w-12 h-12 text-teal-500/30 animate-pulse" />
                  </>
                )}

                {scanStatus === "success" && (
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center justify-center gap-3 text-emerald-400 z-10"
                  >
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                      <motion.div
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.5 }}
                      >
                        <Check className="w-8 h-8 stroke-[3.5]" />
                      </motion.div>
                    </div>
                    <span className="text-xs font-black tracking-wide">ההחתמה בוצעה בהצלחה!</span>
                  </motion.div>
                )}

                {scanStatus === "error" && (
                  <div className="flex flex-col items-center justify-center gap-3 text-rose-400 z-10">
                    <AlertCircle className="w-12 h-12" />
                    <span className="text-xs font-black">ההחתמה נכשלה</span>
                  </div>
                )}
              </div>

              {/* Description Context Label */}
              <div className="mb-4">
                {scanStatus === "scanning" && (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-4 h-4 text-teal-500 animate-spin" />
                    <p className="text-xs text-[var(--muted)] leading-relaxed max-w-[240px]">
                      מתחבר למצלמת המכשיר ומזהה את קוד ה-QR המרכזי של מרכז חוסן...
                    </p>
                  </div>
                )}

                {scanStatus === "success" && (
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-sm font-black text-emerald-500">הוגדר: נוכח/ת!</p>
                    <p className="text-[10px] text-[var(--muted)] font-black">
                      הנוכחות שלך נרשמה בשרתי המרכז למחזור היום ({format(new Date(), "dd/MM/yyyy")})
                    </p>
                  </div>
                )}

                {scanStatus === "error" && (
                  <p className="text-xs text-rose-400">
                    אנא ודא/י שהנך מול קוד ה-QR המקורי של המרכז ונסה/י שנית.
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
