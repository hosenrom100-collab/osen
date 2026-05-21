"use client";

import { useAuth } from "@/context/AuthContext";
import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, doc, getDoc, updateDoc, setDoc,
  query, orderBy, where, limit, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove
} from "firebase/firestore";
import {
  Calendar, MapPin, Users, Check, X, Clock, Loader2,
  Plus, Shield, Info, Coffee, Utensils, ArrowLeftRight,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

interface Activity {
  id: string; title: string;
  startTime: string; endTime: string;
  locationId: string; staffIds: string[]; groupId: string;
  type?: 'activity' | 'break' | 'meal' | 'swap' | 'custom';
}

export default function SchedulePage() {
  const { user, assignedGroups, preferredProgramIds } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [signups, setSignups] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "error" | "info" }[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [dutyName, setDutyName] = useState<string>("");

  const today = format(new Date(), "yyyy-MM-dd");
  const todayLabel = format(new Date(), "EEEE, d בMMMM", { locale: he });
  const myGroupId = assignedGroups[0] ?? null;

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      const lSnap = await getDocs(collection(db, "locations"));
      setLocations(lSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));

      return onSnapshot(doc(db, "schedules", today), async (snap) => {
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
          setActivities(acts);
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
      });
    };
    
    loadData();
  }, [user, today]);

  const signUp = async (activityId: string) => {
    if (!user) return;
    if (inFlight.has(activityId)) return;

    setInFlight(prev => {
      const next = new Set(prev);
      next.add(activityId);
      return next;
    });

    const previousSignups = { ...signups };

    // Optimistic Update
    setSignups(prev => ({
      ...prev,
      [activityId]: [...(prev[activityId] ?? []), user.uid]
    }));

    const timeoutId = setTimeout(() => {
      showToast("נראה שחיבור האינטרנט קצת איטי... נעדכן אותך כשהרישום יושלם.", "info");
    }, 3500);

    try {
      await setDoc(doc(db, "schedules", today), {
        [`signups.${activityId}`]: arrayUnion(user.uid),
      }, { merge: true });
      
      clearTimeout(timeoutId);
      showToast("נרשמת בהצלחה לפעילות! נתראה בקרוב.", "success");
    } catch (e) {
      clearTimeout(timeoutId);
      console.error(e);
      // Rollback
      setSignups(previousSignups);
      showToast("אופס! חל קושי קטן ברישום. נסה שוב בעוד רגע.", "error");
    } finally {
      setInFlight(prev => {
        const next = new Set(prev);
        next.delete(activityId);
        return next;
      });
    }
  };

  const cancelSignup = async (activityId: string) => {
    if (!user) return;
    if (inFlight.has(activityId)) return;

    setInFlight(prev => {
      const next = new Set(prev);
      next.add(activityId);
      return next;
    });

    const previousSignups = { ...signups };

    // Optimistic Update
    setSignups(prev => ({
      ...prev,
      [activityId]: (prev[activityId] ?? []).filter(uid => uid !== user.uid)
    }));

    const timeoutId = setTimeout(() => {
      showToast("נראה שחיבור האינטרנט קצת איטי... נעדכן אותך כשהביטול יושלם.", "info");
    }, 3500);

    try {
      await updateDoc(doc(db, "schedules", today), {
        [`signups.${activityId}`]: arrayRemove(user.uid),
      });
      
      clearTimeout(timeoutId);
      showToast("הרישום לפעילות בוטל בהצלחה.", "success");
    } catch (e) {
      clearTimeout(timeoutId);
      console.error(e);
      // Rollback
      setSignups(previousSignups);
      showToast("אופס! חל קושי קטן בביטול הרישום. נסה שוב בעוד רגע.", "error");
    } finally {
      setInFlight(prev => {
        const next = new Set(prev);
        next.delete(activityId);
        return next;
      });
    }
  };

  const myActivities = useMemo(() => {
    return activities
      .filter(a => a.groupId === myGroupId || a.groupId === "all")
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [activities, myGroupId]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-teal-500" /></div>;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black mb-2">לוח פעילויות</h2>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[var(--muted)] flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-teal-500" /> {todayLabel}
            </p>
            {dutyName && (
              <span className="flex items-center gap-1.5 text-[10px] font-black text-rose-500 bg-rose-500/10 rounded-lg border border-rose-500/20 px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                מדריך תורן: {dutyName}
              </span>
            )}
          </div>
        </div>
        {myActivities.length > 0 && (
           <div className="bg-teal-500/10 border border-teal-500/20 px-4 py-2 rounded-2xl">
             <span className="text-xs font-black text-teal-500">
               {Object.values(signups).filter(uids => uids.includes(user?.uid ?? "")).length} הרשמות היום
             </span>
           </div>
        )}
      </div>

      <div className="bg-sky-500/5 border border-sky-500/10 rounded-[2rem] p-6 flex gap-4 items-start">
         <Info className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
         <div className="text-sm text-sky-700/80 leading-relaxed">
            הרשמה לפעילויות עוזרת לנו להיערך נכון עבורכם. ניתן לבטל הרשמה עד תחילת הפעילות.
         </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {myActivities.length > 0 ? myActivities.map((a, i) => {
          const isSignedUp = (signups[a.id] ?? []).includes(user?.uid ?? "");
          const isBusy = busy === a.id;
          const locName = locations.find(l => l.id === a.locationId)?.name || "מרכז חוסן";
          const now = format(new Date(), "HH:mm");
          const isPast = a.endTime < now;
          let borderStyle = "";
          let timeStyle = "";
          let Icon = null;
          const isCustomType = a.type === "break" || a.type === "meal" || a.type === "swap";

          if (a.type === "break") {
            borderStyle = "border-slate-500/20 bg-slate-500/[0.02] hover:border-slate-500/30";
            timeStyle = "bg-slate-100 text-slate-500 border border-slate-500/25";
            Icon = Coffee;
          } else if (a.type === "meal") {
            borderStyle = "border-amber-500/20 bg-amber-500/[0.02] hover:border-amber-500/30";
            timeStyle = "bg-amber-100 text-amber-600 border border-amber-500/25";
            Icon = Utensils;
          } else if (a.type === "swap") {
            borderStyle = "border-indigo-500/20 bg-indigo-500/[0.02] hover:border-indigo-500/30";
            timeStyle = "bg-indigo-100 text-indigo-600 border border-indigo-500/25";
            Icon = ArrowLeftRight;
          } else {
            borderStyle = isSignedUp ? 'border-teal-500/30 bg-teal-500/[0.02]' : 'border-[var(--border)] hover:border-[var(--border-strong)]';
            timeStyle = isSignedUp ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20' : 'bg-[var(--background)] text-[var(--muted)] border border-[var(--border)]';
          }

          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`bg-[var(--surface)] border-2 rounded-[2rem] p-8 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 ${borderStyle} ${isPast ? 'opacity-50 grayscale shadow-none' : 'shadow-sm'}`}
            >
              <div className="flex items-center gap-6">
                <div className={`w-16 h-16 rounded-3xl flex flex-col items-center justify-center font-black ${timeStyle}`}>
                   <span className="text-sm leading-none mb-1">{a.startTime}</span>
                   <span className="text-[10px] opacity-60 font-bold">{a.endTime}</span>
                </div>
                <div>
                  <h4 className="text-xl font-black mb-1 flex items-center gap-2">
                    {Icon && <Icon className={`w-5 h-5 shrink-0 ${a.type === 'break' ? 'text-slate-400' : a.type === 'meal' ? 'text-amber-500' : 'text-indigo-500'}`} />}
                    {a.title}
                  </h4>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-[var(--muted)] flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {locName}
                    </span>
                    {!isCustomType && (
                      <span className="text-xs text-[var(--muted)] flex items-center gap-1">
                        <Users className="w-3 h-3" /> {(signups[a.id] ?? []).length} רשומים
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!isPast && !isCustomType && (
                <button
                  onClick={() => isSignedUp ? cancelSignup(a.id) : signUp(a.id)}
                  disabled={inFlight.has(a.id)}
                  className={`px-8 py-4 rounded-2xl font-black text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    isSignedUp 
                    ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20' 
                    : 'bg-teal-500 text-white hover:bg-teal-600 shadow-lg shadow-teal-500/20'
                  }`}
                >
                  {inFlight.has(a.id) ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : isSignedUp ? (
                    <>
                      <X className="w-4 h-4" /> ביטול הרשמה
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> הרשמה לפעילות
                    </>
                  )}
                </button>
              )}
              {isPast && !isCustomType && (
                <div className="px-6 py-3 bg-[var(--background)] border border-[var(--border)] rounded-xl text-[var(--muted)] text-xs font-bold">
                   הסתיים
                </div>
              )}
            </motion.div>
          );
        }) : (
          <div className="py-20 text-center border-2 border-dashed border-[var(--border)] rounded-[3rem] opacity-30">
             <Calendar className="w-12 h-12 mx-auto mb-4" />
             <p className="font-black">אין פעילויות מתוכננות להיום</p>
          </div>
        )}
      </div>

      {/* ─── Premium Glassmorphic Toasts Container ─── */}
      <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-3 max-w-sm pointer-events-none" dir="rtl">
        <AnimatePresence>
          {toasts.map(t => {
            let bgColor = "bg-slate-900/90 border-slate-700/50";
            let Icon = Info;
            let iconColor = "text-sky-400";
            if (t.type === "success") {
              bgColor = "bg-emerald-950/90 border-emerald-800/50";
              Icon = Check;
              iconColor = "text-emerald-400";
            } else if (t.type === "error") {
              bgColor = "bg-rose-950/90 border-rose-800/50";
              Icon = AlertTriangle;
              iconColor = "text-rose-400";
            }
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
                className={`flex items-center gap-3 px-5 py-4 rounded-[1.25rem] border backdrop-blur-md shadow-xl text-white text-sm font-black pointer-events-auto ${bgColor}`}
              >
                <div className={`p-1.5 rounded-lg bg-white/5 ${iconColor} shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="leading-snug">{t.message}</div>
                <button
                  onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                  className="mr-auto p-1 hover:bg-white/5 rounded-lg opacity-50 hover:opacity-100 transition-all shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
