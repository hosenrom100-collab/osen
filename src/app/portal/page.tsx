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
  ChevronLeft, FileText
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
}
interface Announcement {
  id: string; title: string; content: string;
  type: 'news' | 'event' | 'alert'; createdAt: any;
}

export default function PortalDashboard() {
  const { user, assignedGroups, preferredProgramIds, onboardingComplete } = useAuth();
  const router = useRouter();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [patientData, setPatientData] = useState<any>(null);
  const [swData, setSwData] = useState<any>(null);
  const [showRenewalPrompt, setShowRenewalPrompt] = useState(false);
  const [renewalBusy, setRenewalBusy] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const myGroupId = assignedGroups[0] ?? null;

  useEffect(() => {
    if (!user || !onboardingComplete) return;

    const init = async () => {
      const uSnap = await getDoc(doc(db, "users", user.uid));
      const pId = uSnap.data()?.patientId;
      if (!pId) return;

      // Announcements
      const unsubAnn = onSnapshot(
        query(collection(db, "announcements"), where("active", "==", true), orderBy("createdAt", "desc")),
        (snap) => setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)))
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
      });

      // Attendance
      const unsubAtt = onSnapshot(
        query(collection(db, "attendance"), where("patientId", "==", pId), orderBy("date", "desc"), limit(5)),
        (snap) => setAttendanceHistory(snap.docs.map(d => d.data()))
      );

      // Today's schedule
      const unsubSched = onSnapshot(doc(db, "schedules", today), (snap) => {
        if (snap.exists()) {
          const acts = (snap.data().activities || []) as Activity[];
          setActivities(acts.filter(a => a.groupId === myGroupId || a.groupId === "all").slice(0, 3));
        }
        setLoading(false);
      });

      return () => { unsubAnn(); unsubPatient(); unsubAtt(); unsubSched(); };
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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-teal-500" /></div>;

  return (
    <div className="space-y-8 pb-20">
      
      {/* Welcome & Stats Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-teal-500 to-emerald-600 p-10 text-white shadow-2xl shadow-teal-500/20">
          <div className="relative z-10">
            <h2 className="text-4xl font-black mb-4 leading-tight">שלום, {user?.displayName?.split(" ")[0] || "חבר/ה"} ✨</h2>
            <p className="text-teal-50/80 text-lg max-w-md leading-relaxed mb-8">אנחנו שמחים לראות אותך שוב. הנה מה שקורה היום במרכז חוסן.</p>
            
            <div className="flex flex-wrap gap-4">
               <button onClick={() => router.push("/portal/schedule")} className="px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl font-bold text-sm transition-all flex items-center gap-2">
                 <Calendar className="w-4 h-4" /> לוח פעילויות
               </button>
               <button onClick={() => router.push("/portal/docs")} className="px-6 py-3 bg-white text-teal-600 hover:bg-teal-50 rounded-2xl font-bold text-sm transition-all flex items-center gap-2">
                 <FileText className="w-4 h-4" /> הפקת מסמכים
               </button>
            </div>
          </div>
          {/* Decorative shapes */}
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-teal-400/20 rounded-full blur-3xl" />
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-8 flex flex-col justify-between shadow-sm">
           <div>
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)] mb-1">סטטוס נוכחות</p>
             <h3 className="text-3xl font-black">{attendanceHistory.filter(h => h.status === 'present').length}</h3>
             <p className="text-xs text-[var(--muted)] mt-1">ימי נוכחות מצטברים</p>
           </div>
           <div className="mt-8 pt-8 border-t border-[var(--border)]">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)] mb-4">נוכחות אחרונה</p>
              <div className="space-y-3">
                {attendanceHistory.slice(0, 3).map((h, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--muted)]">{format(parseISO(h.date), "dd/MM")}</span>
                    <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${h.status === 'present' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                      {h.status === 'present' ? 'נוכח/ת' : 'נעדר/ת'}
                    </span>
                  </div>
                ))}
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Today's Activities */}
        <section className="space-y-4">
           <div className="flex items-center justify-between px-2">
             <h3 className="text-lg font-black">פעילויות להיום</h3>
             <button onClick={() => router.push("/portal/schedule")} className="text-xs font-bold text-teal-500 flex items-center gap-1 hover:underline">
               הכל <ArrowLeft className="w-3 h-3" />
             </button>
           </div>
           <div className="space-y-4">
             {activities.length > 0 ? activities.map((a) => (
               <div key={a.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 flex items-center justify-between group hover:border-teal-500/30 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-500 flex items-center justify-center font-black text-xs shrink-0">
                      {a.startTime}
                    </div>
                    <div>
                      <h4 className="font-bold text-[var(--foreground)] group-hover:text-teal-500 transition-colors">{a.title}</h4>
                      <p className="text-xs text-[var(--muted)] flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" /> מרכז חוסן
                      </p>
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-[var(--border)] group-hover:text-teal-500 transition-all" />
               </div>
             )) : (
               <div className="p-10 text-center border-2 border-dashed border-[var(--border)] rounded-[2rem] opacity-40">
                 <Calendar className="w-8 h-8 mx-auto mb-2" />
                 <p className="text-sm">אין פעילויות רשומות להיום</p>
               </div>
             )}
           </div>
        </section>

        {/* Announcements & Updates */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
             <h3 className="text-lg font-black">עדכונים וחדשות</h3>
             <Globe className="w-4 h-4 text-teal-500" />
           </div>
           <div className="space-y-4">
             {announcements.slice(0, 3).map((a) => (
               <div key={a.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 relative overflow-hidden">
                 <div className="flex items-center gap-3 mb-3">
                    <span className={`w-2 h-2 rounded-full ${a.type === 'alert' ? 'bg-rose-500 shadow-lg shadow-rose-500/50' : a.type === 'event' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">{a.type === 'alert' ? 'התראה' : 'עדכון'}</span>
                 </div>
                 <h4 className="font-black mb-2">{a.title}</h4>
                 <p className="text-sm text-[var(--muted)] leading-relaxed">{a.content}</p>
                 {a.type === 'alert' && <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 blur-3xl rounded-full" />}
               </div>
             ))}
             {announcements.length === 0 && (
                <div className="p-10 text-center border-2 border-dashed border-[var(--border)] rounded-[2rem] opacity-40">
                  <p className="text-sm">אין עדכונים חדשים</p>
                </div>
             )}
           </div>
        </section>
      </div>

      {/* Renewal Prompt */}
      <AnimatePresence>
        {showRenewalPrompt && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-amber-500/5 border border-amber-500/20 rounded-[2.5rem] p-10 flex flex-col md:flex-row items-center gap-8"
          >
            <div className="w-20 h-20 rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
               <Clock className="w-10 h-10" />
            </div>
            <div className="flex-1 text-center md:text-right">
               <h3 className="text-xl font-black mb-2">תקופת ההשתתפות מסתיימת בקרוב</h3>
               <p className="text-[var(--muted)] text-sm leading-relaxed max-w-xl">היי, שמנו לב שאת/ה מתקרב/ת לסוף 3 החודשים הראשונים שלך. נשמח מאוד להאריך את ההשתתפות שלך ב-3 חודשים נוספים. מה דעתך?</p>
            </div>
            <div className="flex gap-4 shrink-0">
               <button onClick={requestExtension} disabled={renewalBusy} className="px-8 py-4 bg-amber-500 text-white rounded-2xl font-black text-sm shadow-xl shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50">
                 {renewalBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : "כן, אשמח להאריך!"}
               </button>
               <button onClick={() => setShowRenewalPrompt(false)} className="px-8 py-4 bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] font-black text-sm rounded-2xl hover:bg-[var(--foreground)]/5 transition-all">
                 אולי אחר כך
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat */}
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
