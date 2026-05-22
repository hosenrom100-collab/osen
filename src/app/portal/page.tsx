"use client";

import { useAuth } from "@/context/AuthContext";
import { useState, useEffect, useMemo, Fragment, useRef } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, doc, getDoc, updateDoc, setDoc,
  query, orderBy, where, limit, onSnapshot, serverTimestamp
} from "firebase/firestore";
import {
  Calendar, MapPin, Users, Check, X, Clock, Loader2,
  Plus, MessageCircle, BarChart3, Shield, Globe, ArrowLeft, ArrowRight,
  ChevronLeft, FileText, Coffee, Utensils, ArrowLeftRight, AlertTriangle
} from "lucide-react";
import { format, parseISO, differenceInDays, addMonths } from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { FloatingChat } from "@/components/chat/FloatingChat";

interface Activity {
  id: string; title: string;
  startTime: string; endTime: string;
  locationId: string; staffIds: string[]; groupId: string;
  type?: 'activity' | 'break' | 'meal' | 'swap' | 'custom';
}
interface Announcement {
  id: string; title: string; content: string;
  type: 'news' | 'event' | 'alert'; createdAt: any;
}

export default function PortalDashboard() {
  const { user, assignedGroups, preferredProgramIds, onboardingComplete } = useAuth();
  const router = useRouter();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [signups, setSignups] = useState<Record<string, string[]>>({});
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [patientData, setPatientData] = useState<any>(null);
  const [swData, setSwData] = useState<any>(null);
  const [docRequests, setDocRequests] = useState<any[]>([]);
  const [showRenewalPrompt, setShowRenewalPrompt] = useState(false);
  const [renewalBusy, setRenewalBusy] = useState(false);
  const [dutyName, setDutyName] = useState<string>("");
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const activeAndNextActivity = useMemo(() => {
    if (activities.length === 0) {
      return { 
        active: null as Activity | null, 
        next: null as Activity | null, 
        timeRemaining: null as number | null 
      };
    }
    const currentHours = currentTime.getHours();
    const currentMinutes = currentTime.getMinutes();
    const currentTotalMinutes = currentHours * 60 + currentMinutes;

    let active: Activity | null = null;
    let next: Activity | null = null;
    let minDiff = Infinity;
    let timeRemaining: number | null = null;

    activities.forEach(a => {
      const [startH, startM] = a.startTime.split(":").map(Number);
      const [endH, endM] = a.endTime.split(":").map(Number);
      
      if (isNaN(startH) || isNaN(endH)) return;

      const startTotal = startH * 60 + startM;
      const endTotal = endH * 60 + endM;

      if (currentTotalMinutes >= startTotal && currentTotalMinutes < endTotal) {
        const isSignedUp = (signups[a.id] ?? []).includes(user?.uid ?? "");
        if (!active || isSignedUp) {
          active = a;
          timeRemaining = endTotal - currentTotalMinutes;
        }
      } else if (startTotal > currentTotalMinutes) {
        const diff = startTotal - currentTotalMinutes;
        if (diff < minDiff) {
          minDiff = diff;
          next = a;
        }
      }
    });

    return { active, next, timeRemaining };
  }, [activities, signups, user, currentTime]);

  const today = format(new Date(), "yyyy-MM-dd");
  const myGroupId = assignedGroups[0] ?? null;

  const todaySlots = useMemo(() => {
    const slots: Record<string, Activity[]> = {};
    activities.forEach(a => {
      const key = `${a.startTime}-${a.endTime}`;
      if (!slots[key]) slots[key] = [];
      slots[key].push(a);
    });
    return Object.entries(slots)
      .map(([key, items]) => {
        const [startTime, endTime] = key.split("-");
        return {
          key,
          startTime,
          endTime,
          items: items.sort((a, b) => a.title.localeCompare(b.title)),
        };
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [activities]);

  useEffect(() => {
    if (!user) return;
    if (!onboardingComplete) {
      setLoading(false);
      return;
    }

    const init = async () => {
      try {
        const uSnap = await getDoc(doc(db, "users", user.uid));
        const pId = uSnap.data()?.patientId;
        if (!pId) {
          setLoading(false);
          return;
        }

        // Announcements
        const unsubAnn = onSnapshot(
          query(collection(db, "announcements"), where("active", "==", true), orderBy("createdAt", "desc")),
          (snap) => setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement))),
          (err) => console.error("Announcements error:", err)
        );

        // Patient & SW
        const unsubPatient = onSnapshot(doc(db, "patients", pId), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setPatientData({ id: snap.id, ...data });
            if (data.startDate) {
              const end = data.endDate ? parseISO(data.endDate) : addMonths(parseISO(data.startDate), 3);
              setShowRenewalPrompt(differenceInDays(end, new Date()) <= 14);
            }
            if (data.assignedWorkerId) {
               getDoc(doc(db, "users", data.assignedWorkerId)).then(s => s.exists() && setSwData({id: s.id, ...(s.data() as any)}));
            }
          }
        }, (err) => console.error("Patient error:", err));

        // Attendance
        const unsubAtt = onSnapshot(
          query(collection(db, "attendance"), where("patientId", "==", pId), orderBy("date", "desc"), limit(5)),
          (snap) => setAttendanceHistory(snap.docs.map(d => d.data())),
          (err) => console.error("Attendance error:", err)
        );

        // Today's schedule
        const unsubSched = onSnapshot(doc(db, "schedules", today), async (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const acts: Activity[] = (data.activities || []).map((a: any) => ({
              id: a.id || "",
              title: a.title || "",
              startTime: a.startTime || "",
              endTime: a.endTime || "",
              locationId: a.locationId || "",
              staffIds: a.staffIds || [],
              groupId: a.groupId || "",
              type: a.type || "activity",
            }));
            setActivities(acts.filter(a => a.groupId === myGroupId || a.groupId === "all"));
            setSignups((data.signups || {}) as Record<string, string[]>);
            
            const dId = data.dutyInstructorId || data.dutyId;
            if (dId) {
              const uDoc = await getDoc(doc(db, "users", dId));
              if (uDoc.exists()) {
                setDutyName(uDoc.data()?.name || "מדריך");
              } else {
                setDutyName("");
              }
            } else {
              setDutyName("");
            }
          } else {
            setDutyName("");
          }
          setLoading(false);
        }, (err) => {
          console.error("Schedule error:", err);
          setLoading(false);
        });

        // Document Requests
        const unsubDocRequests = onSnapshot(
          query(collection(db, "document_requests"), where("patientId", "==", pId), orderBy("createdAt", "desc"), limit(3)),
          (snap) => setDocRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
          (err) => console.error("Doc Requests error:", err)
        );

        return () => { unsubAnn(); unsubPatient(); unsubAtt(); unsubSched(); unsubDocRequests(); };
      } catch (err) {
        console.error("init error:", err);
        setLoading(false);
      }
    };

    init();
  }, [user, onboardingComplete, myGroupId, today]);

  const requestExtension = async () => {
    if (!user || !patientData || !swData) return;
    setRenewalBusy(true);
    try {
      await setDoc(doc(collection(db, "messages")), {
        participants: [user.uid, swData.id],
        senderId: user.uid,
        text: `שלום, אני מעוניין/ת להאריך את ההשתתפות שלי ב-3 חודשים נוספים.`,
        timestamp: serverTimestamp(),
        isRequest: true,
      });
      await updateDoc(doc(db, "patients", patientData.id), { extensionRequested: true });
      setShowRenewalPrompt(false);
      alert("בקשתך נשלחה בהצלחה!");
    } catch (e) { console.error(e); }
    finally { setRenewalBusy(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#0055D4]" /></div>;

  // Custom Inline SVGs for Quick Action Buttons
  const HeartHandIcon = () => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5.5 h-5.5">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );

  const CalendarPlusIcon = () => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5.5 h-5.5">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="12" y1="13" x2="12" y2="19" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  );

  const CalendarEditIcon = () => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5.5 h-5.5">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="M11 15h3M12 13h1" />
      <path d="M14.5 13.5l2.5 2.5-1.5 1.5-2.5-2.5z" />
    </svg>
  );

  const TestTubesIcon = () => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5.5 h-5.5">
      <path d="M5 3h4M7 3v12a2 2 0 0 0 4 0V3M9 3h4" />
      <path d="M13 3h4M15 3v12a2 2 0 0 0 4 0V3h-4" />
      <path d="M7 11h4M15 11h4" />
    </svg>
  );

  const DoctorIcon = () => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5.5 h-5.5">
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M14 9h4v2a2 2 0 0 1-2 2h-2" />
      <path d="M18 11v2a3 3 0 0 1-6 0" />
    </svg>
  );

  // Time-based Hebrew greeting helper
  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 5) return "לילה טוב";
    if (hours < 12) return "בוקר טוב";
    if (hours < 17) return "צהריים טובים";
    if (hours < 21) return "ערב טוב";
    return "לילה טוב";
  };

  return (
    <div className="min-h-screen bg-[#F4F6F9] -mx-4 -mt-4 px-4 pt-4 pb-28 text-right font-sans" dir="rtl">
      <div className="max-w-6xl mx-auto">
        
        {/* ── 1. Top Header (Greeting + Left Icons) ── */}
        <div className="flex items-center justify-between mb-6 px-1">
          <h2 className="text-xl md:text-2xl font-black text-[#002244]">
            {getGreeting()}, {user?.displayName?.split(" ")[0] || "עמיר"}
          </h2>
          <div className="flex items-center gap-3">
            {/* Messages icon */}
            <button 
              onClick={() => router.push("/portal/chat")}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#0055D4] shadow-sm border border-slate-100 hover:bg-slate-50 transition-transform active:scale-95 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>

            {/* Notifications / Bell icon with Red '1' Badge */}
            <button 
              onClick={() => router.push("/portal/notifications")}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#FF4A70] shadow-sm border border-slate-100 hover:bg-slate-50 relative transition-transform active:scale-95 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="absolute -top-0.5 -left-0.5 w-4.5 h-4.5 bg-[#FF4A70] text-white text-[9px] font-black rounded-full flex items-center justify-center border border-white">
                1
              </span>
            </button>
          </div>
        </div>

        {/* Responsive Grid layout for Mobile vs. Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* ── Column 1 & 2: Main Dashboard Content (2/3 width on desktop) ── */}
          <div className="lg:col-span-2 space-y-7">
            
            {/* ── 1.5 Dynamic Now/Next Active Card (Premium Mobile Companion) ── */}
            {(activeAndNextActivity.active || activeAndNextActivity.next) && (
              <div className="bg-gradient-to-br from-teal-500 via-teal-600 to-[#0055D4] rounded-[1.8rem] p-6 text-white shadow-[0_12px_30px_rgba(0,85,212,0.15)] relative overflow-hidden">
                <div className="absolute top-0 left-0 w-32 h-32 bg-white/5 rounded-full -translate-x-10 -translate-y-10 blur-xl pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-40 h-40 bg-teal-300/10 rounded-full translate-x-10 translate-y-10 blur-2xl pointer-events-none" />
                
                {activeAndNextActivity.active ? (
                  <div className="relative z-10 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest bg-white/25 text-white px-3 py-1 rounded-full uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        פעילות פעילה עכשיו
                      </span>
                      {activeAndNextActivity.timeRemaining !== null && (
                        <span className="text-[11px] font-extrabold bg-black/15 px-2.5 py-1 rounded-lg flex items-center gap-1 font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          נותרו {activeAndNextActivity.timeRemaining} דק'
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xl md:text-2xl font-black">{activeAndNextActivity.active.title}</h3>
                      <p className="text-xs text-white/90 font-bold mt-1.5 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-teal-200" />
                        שעות: {activeAndNextActivity.active.startTime} - {activeAndNextActivity.active.endTime} • מרכז חוסן, חוות רום
                      </p>
                    </div>
                    {activeAndNextActivity.next && (
                      <div className="border-t border-white/10 mt-3 pt-3 flex items-center justify-between text-xs text-white/90 font-bold">
                        <span>הבא בתור: {activeAndNextActivity.next.title}</span>
                        <span className="font-mono opacity-80">{activeAndNextActivity.next.startTime}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  activeAndNextActivity.next && (
                    <div className="relative z-10 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black tracking-widest bg-white/25 text-white px-3 py-1 rounded-full uppercase">
                          הפעילות הבאה שלך היום
                        </span>
                        <span className="text-[11px] font-extrabold bg-black/15 px-2.5 py-1 rounded-lg flex items-center gap-1 font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          מתחילה ב-{activeAndNextActivity.next.startTime}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-xl md:text-2xl font-black">{activeAndNextActivity.next.title}</h3>
                        <p className="text-xs text-white/95 font-bold mt-1.5 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 shrink-0 text-teal-200" />
                          שעות: {activeAndNextActivity.next.startTime} - {activeAndNextActivity.next.endTime} • מרכז חוסן, חוות רום
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
            
            {/* ── 2. Quick Actions circular row ── */}
            <div className="bg-white rounded-[1.8rem] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.012)] border border-slate-100/50">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#8FA2B8] mb-4">קישורים מהירים</h3>
              <div className="flex items-start justify-between gap-2 overflow-x-auto no-scrollbar py-1" dir="rtl">
                {[
                  { label: "הכול לנפש", icon: HeartHandIcon, action: () => router.push("/portal/schedule") },
                  { label: "תיאום מפגש", icon: CalendarPlusIcon, action: () => router.push("/portal/schedule") },
                  { label: "עדכון הרשמה", icon: CalendarEditIcon, action: () => router.push("/portal/schedule") },
                  { label: "אישורי נוכחות", icon: TestTubesIcon, action: () => router.push("/portal/docs") },
                  { label: "פנייה לעו״ס", icon: DoctorIcon, action: () => router.push("/portal/chat") },
                ].map((item, i) => (
                  <button 
                    key={i} 
                    onClick={item.action}
                    className="flex-1 flex flex-col items-center select-none cursor-pointer focus:outline-none group"
                  >
                    <div className="w-13 h-13 md:w-14 md:h-14 rounded-full bg-[#0055D4] text-white flex items-center justify-center shadow-[0_6px_18px_rgba(0,85,212,0.18)] active:scale-95 hover:bg-[#0047B3] transition-all duration-150">
                      <item.icon />
                    </div>
                    <span className="text-[11px] font-extrabold text-[#002244] text-center mt-2.5 leading-tight max-w-[80px] block group-hover:text-[#0055D4] transition-colors">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── 3. Updates for You ("עדכונים עבורך") ── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[14.5px] font-black text-[#002244]">עדכונים עבורך</h3>
                <button 
                  onClick={() => router.push("/portal/notifications")} 
                  className="text-xs font-bold text-[#0055D4] hover:underline"
                >
                  הכול
                </button>
              </div>

              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-3 px-0.5" dir="rtl">
                {/* Dynamic Document Requests */}
                {docRequests.map((req) => {
                  const docTypeLabel = req.type === 'stay' ? 'אישור שהייה' : req.type === 'attendance' ? 'דוח נוכחות' : (req.customType || 'מסמך מיוחד');
                  const isReady = req.status === 'approved' || req.status === 'completed';
                  const stripeBg = req.status === 'pending' ? 'bg-amber-400' : isReady ? 'bg-emerald-500' : 'bg-[#FF4A70]';
                  const titleText = isReady 
                    ? `אישור ה${docTypeLabel} שלך מוכן להורדה!` 
                    : `בקשתך ל${docTypeLabel} בטיפול אצל עו״ס ${swData?.name || "מלווה"}`;
                  const dateText = req.createdAt && typeof req.createdAt.toDate === 'function'
                    ? format(req.createdAt.toDate(), "dd/MM/yyyy") 
                    : "לאחרונה";
                  
                  return (
                    <div 
                      key={req.id}
                      onClick={() => router.push("/portal/docs")}
                      className="relative min-w-[290px] md:min-w-[345px] bg-white rounded-[1.5rem] p-5 shadow-[0_8px_30px_rgba(0,85,212,0.018)] border border-slate-100/60 flex items-center justify-between text-right cursor-pointer hover:border-slate-200 transition-all group shrink-0"
                    >
                      <div className={`absolute right-0 top-5 bottom-5 w-1 ${stripeBg} rounded-l-full`} />
                      <div className="flex items-center gap-3.5 pr-2">
                        <div className="w-11 h-11 rounded-full bg-slate-50 flex items-center justify-center text-[#0055D4] shrink-0 border border-slate-100">
                          <FileText className="w-5 h-5 text-[#0055D4]" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[13px] md:text-[13.5px] font-black text-[#002244] leading-snug group-hover:text-[#0055D4] transition-colors line-clamp-2 max-w-[220px]">
                            {titleText}
                          </span>
                          <span className="text-[10px] font-bold text-[#8FA2B8] mt-1 font-mono">
                            {dateText}
                          </span>
                        </div>
                      </div>
                      <ChevronLeft className="w-5 h-5 text-[#B6C5D6] group-hover:translate-x-[-3px] transition-transform shrink-0 ml-1" />
                    </div>
                  );
                })}

                {/* Dynamic Announcements from Firestore rendered in matching format */}
                {announcements.slice(0, 3).map((a) => {
                  const dateText = a.createdAt && typeof a.createdAt.toDate === 'function'
                    ? format(a.createdAt.toDate(), "dd/MM/yyyy") 
                    : "לאחרונה";

                  return (
                    <div 
                      key={a.id}
                      onClick={() => router.push("/portal/notifications")}
                      className="relative min-w-[290px] md:min-w-[345px] bg-white rounded-[1.5rem] p-5 shadow-[0_8px_30px_rgba(0,85,212,0.018)] border border-slate-100/60 flex items-center justify-between text-right cursor-pointer hover:border-slate-200 transition-all group shrink-0"
                    >
                      {/* Colored Vertical Stripe depending on type */}
                      <div className={`absolute right-0 top-5 bottom-5 w-1 rounded-l-full ${
                        a.type === 'alert' ? 'bg-[#FF4A70]' : a.type === 'event' ? 'bg-amber-400' : 'bg-emerald-400'
                      }`} />
                      
                      <div className="flex items-center gap-3.5 pr-2">
                        <div className="w-11 h-11 rounded-full bg-slate-50 flex items-center justify-center text-[#0055D4] shrink-0 border border-slate-100">
                          <Globe className="w-4.5 h-4.5 text-[#0055D4]" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[13px] md:text-[13.5px] font-black text-[#002244] leading-snug group-hover:text-[#0055D4] transition-colors line-clamp-1 max-w-[220px]">
                            {a.title}
                          </span>
                          <span className="text-[11px] text-[#53687E] line-clamp-1 mt-0.5">
                            {a.content}
                          </span>
                          <span className="text-[9px] font-bold text-[#8FA2B8] mt-1 font-mono">
                            {dateText}
                          </span>
                        </div>
                      </div>
                      <ChevronLeft className="w-5 h-5 text-[#B6C5D6] group-hover:translate-x-[-3px] transition-transform shrink-0 ml-1" />
                    </div>
                  );
                })}

                {docRequests.length === 0 && announcements.length === 0 && (
                  <div className="relative min-w-[290px] md:min-w-[345px] bg-white rounded-[1.5rem] p-5 shadow-[0_8px_30px_rgba(0,85,212,0.018)] border border-slate-100/60 flex items-center justify-between text-right shrink-0">
                    <div className="absolute right-0 top-5 bottom-5 w-1 bg-teal-500 rounded-l-full" />
                    <div className="flex items-center gap-3.5 pr-2">
                      <div className="w-11 h-11 rounded-full bg-slate-50 flex items-center justify-center text-teal-500 shrink-0 border border-slate-100">
                        <Check className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[13.5px] font-black text-[#002244] leading-snug">
                          אין עדכונים חדשים כרגע
                        </span>
                        <span className="text-[10.5px] font-bold text-[#8FA2B8] mt-1">
                          הכול מעודכן ותקין
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Desktop only: Welcome panel with program details */}
            <div className="hidden lg:block bg-gradient-to-l from-[#0055D4] to-[#003B99] rounded-[1.8rem] p-8 text-white shadow-[0_12px_36px_rgba(0,85,212,0.22)] relative overflow-hidden">
              <div className="absolute left-[-20px] bottom-[-20px] w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
              <div className="relative z-10 max-w-lg">
                <span className="text-[10px] font-black tracking-[0.2em] bg-white/15 px-3 py-1 rounded-full uppercase">מרכז חוסן חוות רום</span>
                <h3 className="text-2xl font-black mt-4 mb-2">ברוך שובך לתוכנית הליווי האישית</h3>
                <p className="text-white/80 text-sm leading-relaxed font-medium">
                  אנחנו שמחים ללוות אותך בדרך לחיזוק והתעצמות אישית. כאן בפורטל תוכל להתעדכן בסדר היום שלך, לתאם מפגשים עם העו״ס המלווה, להפיק אישורי השתתפות ולעקוב אחר הנוכחות בסדנאות.
                </p>
              </div>
            </div>

          </div>

          {/* ── Column 3: Secondary Desktop Side Deck (1/3 width on desktop) ── */}
          <div className="space-y-6">
            
            {/* A: Attendance Stats Card (adapted to screenshot brand aesthetic) */}
            <div className="bg-white rounded-[1.8rem] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.012)] border border-slate-100/50 relative overflow-hidden">
              <div className="absolute right-0 top-6 bottom-6 w-1 bg-[#0055D4] rounded-l-full" />
              <div className="pr-3">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-[#8FA2B8]">סטטוס נוכחות החודש</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-black text-[#002244] font-mono">
                    {attendanceHistory.filter(h => h.status === 'present').length}
                  </span>
                  <span className="text-sm font-bold text-[#8FA2B8]">ימי נוכחות</span>
                </div>
                <p className="text-xs font-semibold text-[#53687E] mt-2 leading-relaxed">
                  הנוכחות שלך בסדנאות ובפעילויות השונות רשומה ומעודכנת במערכת בזמן אמת.
                </p>
              </div>
            </div>

            {/* B: Future Appointments ("תורים עתידיים") */}
            <div className="space-y-2.5">
              <h3 className="text-[14.5px] font-black text-[#002244] px-1">מפגשים ותורים</h3>
              {/* Baby Blue Box matching screenshot */}
              <div className="bg-[#EBF3FF] border border-[#0055D4]/5 rounded-[1.5rem] p-5 flex items-center justify-start gap-4 text-right shadow-[0_4px_18px_rgba(0,85,212,0.02)]">
                <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-[#0055D4] shrink-0 shadow-sm border border-[#0055D4]/10">
                  <Calendar className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[13.5px] font-black text-[#0055D4]">
                    אין לך מפגשים עתידיים
                  </span>
                  <span className="text-[11.5px] text-[#0055D4]/75 mt-0.5 font-medium leading-relaxed">
                    בכל פעם שיתואם לך מפגש חדש, הוא יופיע כאן
                  </span>
                </div>
              </div>
            </div>

            {/* C: Ongoing Treatment ("להמשך טיפול") */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[14.5px] font-black text-[#002244]">סדר היום והמשך טיפול</h3>
                {dutyName && (
                  <span className="flex items-center gap-1.5 text-[10px] font-black text-rose-500 bg-rose-500/10 rounded-lg border border-rose-500/20 px-2.5 py-1 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    תורן היום: {dutyName}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {todaySlots.length > 0 ? (
                  todaySlots.map((slot) => {
                    const hasMultiple = slot.items.length > 1;
                    const registerableItems = slot.items.filter(item => item.type !== "break" && item.type !== "meal" && item.type !== "swap" && item.type !== "custom");
                    const isAlternativeSlot = hasMultiple && registerableItems.length > 1;

                    if (isAlternativeSlot) {
                      const chosenItem = registerableItems.find(a => (signups[a.id] ?? []).includes(user?.uid ?? ""));

                      if (chosenItem) {
                        const accentBar = "bg-teal-500";
                        const bubbleBg = "bg-teal-500 text-white shadow-lg shadow-teal-500/20";
                        const iconColor = "text-teal-500";

                        return (
                          <div 
                            key={chosenItem.id} 
                            onClick={() => router.push("/portal/schedule")}
                            className="relative bg-white rounded-[1.5rem] p-5 shadow-[0_8px_30px_rgba(0,85,212,0.018)] border border-teal-500/30 flex items-center justify-between text-right cursor-pointer hover:border-slate-200 transition-all group"
                          >
                            <div className={`absolute right-0 top-5 bottom-5 w-1 ${accentBar} rounded-l-full`} />
                            <div className="flex items-center gap-3.5 pr-2">
                              <div className={`w-11 h-11 rounded-full ${bubbleBg} flex items-center justify-center font-black text-xs shrink-0`}>
                                {chosenItem.startTime}
                              </div>
                              <div>
                                <h4 className="font-extrabold text-[13.5px] text-[#002244] group-hover:text-[#0055D4] transition-colors flex items-center gap-1.5 flex-wrap">
                                  {chosenItem.title}
                                  <span className="bg-teal-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm">
                                    <Check className="w-2.5 h-2.5" /> הבחירה שלך
                                  </span>
                                </h4>
                                <p className="text-[10.5px] text-[#53687E] flex items-center gap-1 mt-1 font-semibold">
                                  <MapPin className={`w-3 h-3 ${iconColor}`} /> מרכז חוסן, חוות רום
                                </p>
                              </div>
                            </div>
                            <ChevronLeft className="w-5 h-5 text-[#B6C5D6] group-hover:translate-x-[-3px] transition-transform shrink-0" />
                          </div>
                        );
                      } else {
                        const alternativesList = registerableItems.map(item => item.title).join(" או ");
                        return (
                          <motion.div 
                            key={slot.key} 
                            onClick={() => router.push("/portal/schedule")}
                            animate={{ scale: [1, 1.015, 1] }}
                            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                            className="relative bg-amber-500/[0.03] rounded-[1.5rem] p-5 shadow-[0_8px_30px_rgba(245,158,11,0.03)] border-2 border-amber-400/50 flex items-center justify-between text-right cursor-pointer hover:border-amber-500/80 transition-all group"
                          >
                            <div className="absolute right-0 top-5 bottom-5 w-1 bg-amber-500 rounded-l-full" />
                            <div className="flex items-center gap-3.5 pr-2">
                              <div className="w-11 h-11 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 flex flex-col items-center justify-center font-black text-[10px] shrink-0">
                                <span>{slot.startTime}</span>
                                <span className="text-[8px] opacity-60 leading-none">{slot.endTime}</span>
                              </div>
                              <div>
                                <h4 className="font-extrabold text-[13.5px] text-amber-700 group-hover:text-amber-800 transition-colors flex items-center gap-1.5">
                                  <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
                                  נדרשת בחירת פעילות
                                </h4>
                                <p className="text-[10.5px] text-slate-500 font-semibold mt-0.5 line-clamp-1 max-w-[210px] md:max-w-none">
                                  {alternativesList}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] font-bold text-amber-600 shrink-0">
                              <span>לבחירה</span>
                              <ChevronLeft className="w-4 h-4 text-amber-500 group-hover:translate-x-[-3px] transition-transform" />
                            </div>
                          </motion.div>
                        );
                      }
                    } else {
                      const a = slot.items[0];
                      const isSignedUp = (signups[a.id] ?? []).includes(user?.uid ?? "");
                      let accentBar = "bg-[#0055D4]";
                      let bubbleBg = "bg-[#EBF3FF] text-[#0055D4]";
                      let iconColor = "text-[#0055D4]";
                      let Icon = null;
                      const isCustomType = a.type === "break" || a.type === "meal" || a.type === "swap" || a.type === "custom";

                      if (a.type === "break") {
                        accentBar = "bg-slate-400";
                        bubbleBg = "bg-slate-100 text-slate-500";
                        iconColor = "text-slate-400";
                        Icon = Coffee;
                      } else if (a.type === "meal") {
                        accentBar = "bg-amber-400";
                        bubbleBg = "bg-amber-100 text-amber-600";
                        iconColor = "text-amber-500";
                        Icon = Utensils;
                      } else if (a.type === "swap") {
                        accentBar = "bg-indigo-400";
                        bubbleBg = "bg-indigo-100 text-indigo-600";
                        iconColor = "text-indigo-500";
                        Icon = ArrowLeftRight;
                      } else {
                        if (isSignedUp) {
                          accentBar = "bg-teal-500";
                          bubbleBg = "bg-teal-500 text-white shadow-lg shadow-teal-500/20";
                          iconColor = "text-teal-500";
                        } else {
                          accentBar = "bg-[#0055D4]/40";
                          bubbleBg = "bg-slate-100 text-slate-500 border border-slate-200";
                          iconColor = "text-slate-400";
                        }
                      }

                      return (
                        <div 
                          key={a.id} 
                          onClick={() => router.push("/portal/schedule")}
                          className={`relative bg-white rounded-[1.5rem] p-5 shadow-[0_8px_30px_rgba(0,85,212,0.018)] border flex items-center justify-between text-right cursor-pointer hover:border-slate-200 transition-all group ${
                            isSignedUp && !isCustomType ? 'border-teal-500/30' : 'border-slate-100/60'
                          }`}
                        >
                          <div className={`absolute right-0 top-5 bottom-5 w-1 ${accentBar} rounded-l-full`} />
                          <div className="flex items-center gap-3.5 pr-2">
                            <div className={`w-11 h-11 rounded-full ${bubbleBg} flex items-center justify-center font-black text-xs shrink-0`}>
                              {a.startTime}
                            </div>
                            <div>
                              <h4 className="font-extrabold text-[13.5px] text-[#002244] group-hover:text-[#0055D4] transition-colors flex items-center gap-1.5 flex-wrap">
                                {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />}
                                {a.title}
                                {isSignedUp && !isCustomType && (
                                  <span className="bg-teal-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm">
                                    <Check className="w-2.5 h-2.5" /> רשום/ה
                                  </span>
                                )}
                              </h4>
                              <p className="text-[10.5px] text-[#53687E] flex items-center gap-1 mt-1 font-semibold">
                                <MapPin className={`w-3 h-3 ${iconColor}`} /> מרכז חוסן, חוות רום
                              </p>
                            </div>
                          </div>
                          <ChevronLeft className="w-5 h-5 text-[#B6C5D6] group-hover:translate-x-[-3px] transition-transform shrink-0" />
                        </div>
                      );
                    }
                  })
                ) : (
                  /* Elegant continue treatment block */
                  <div 
                    onClick={() => router.push("/portal/docs")}
                    className="relative bg-white rounded-[1.5rem] p-5 shadow-[0_8px_30px_rgba(0,85,212,0.018)] border border-slate-100/60 flex items-center justify-between text-right cursor-pointer hover:border-slate-200 transition-all group"
                  >
                    {/* Blue accent border on right */}
                    <div className="absolute right-0 top-5 bottom-5 w-1 bg-[#0055D4] rounded-l-full" />
                    
                    <div className="flex items-center gap-3.5 pr-2">
                      <div className="w-11 h-11 rounded-full bg-slate-50 flex items-center justify-center text-[#0055D4] shrink-0 border border-slate-100">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[13.5px] font-black text-[#002244] leading-snug group-hover:text-[#0055D4] transition-colors">
                          בקשה להארכת תקופת השתתפות במרכז חוסן
                        </span>
                        <span className="text-[10.5px] font-bold text-[#8FA2B8] mt-1">
                          {swData?.name || "עו״ס מטפל"} • בטיפול
                        </span>
                      </div>
                    </div>
                    <ChevronLeft className="w-5 h-5 text-[#B6C5D6] group-hover:translate-x-[-3px] transition-transform shrink-0 ml-1" />
                  </div>
                )}
              </div>
            </div>

            {/* D: Renewal Prompt Inline (Framer Motion) */}
            <AnimatePresence>
              {showRenewalPrompt && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-amber-500/5 border border-amber-500/20 rounded-[1.8rem] p-6 flex flex-col items-center gap-4 text-center md:text-right"
                >
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                     <Clock className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                     <h3 className="text-base font-black text-[#002244] mb-1">תקופת ההשתתפות מסתיימת בקרוב</h3>
                     <p className="text-[#53687E] text-[12px] leading-relaxed">היי, שמנו לב שאת/ה מתקרב/ת לסוף 3 החודשים הראשונים שלך. נשמח מאוד להאריך את ההשתתפות שלך ב-3 חודשים נוספים.</p>
                  </div>
                  <div className="flex gap-3 w-full justify-center mt-2">
                     <button 
                       onClick={requestExtension} 
                       disabled={renewalBusy} 
                       className="flex-1 max-w-[150px] py-2.5 bg-amber-500 text-white rounded-xl font-bold text-xs shadow-md shadow-amber-500/15 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center"
                     >
                       {renewalBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "כן, אשמח להאריך!"}
                     </button>
                     <button 
                       onClick={() => setShowRenewalPrompt(false)} 
                       className="flex-1 max-w-[150px] py-2.5 bg-white border border-slate-200 text-[#53687E] font-bold text-xs rounded-xl hover:bg-slate-50 transition-all active:scale-95"
                     >
                       אולי אחר כך
                     </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

        </div>

      </div>

      {/* ── 7. Real-time floating chat widget ── */}
      {user && swData && (
        <FloatingChat 
          senderId={user.uid}
          senderName={patientData ? `${patientData.firstName} ${patientData.lastName}` : (user.displayName || "משתתף")}
          recipientId={swData.id}
          recipientName={swData.name}
          patientId={patientData?.id}
        />
      )}

    </div>
  );
}
