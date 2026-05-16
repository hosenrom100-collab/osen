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
  Plus, Shield, Info
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { motion } from "framer-motion";

interface Activity {
  id: string; title: string;
  startTime: string; endTime: string;
  locationId: string; staffIds: string[]; groupId: string;
}

export default function SchedulePage() {
  const { user, assignedGroups, preferredProgramIds } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [signups, setSignups] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [locations, setLocations] = useState<any[]>([]);

  const today = format(new Date(), "yyyy-MM-dd");
  const todayLabel = format(new Date(), "EEEE, d בMMMM", { locale: he });
  const myGroupId = assignedGroups[0] ?? null;

  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      const lSnap = await getDocs(collection(db, "locations"));
      setLocations(lSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      return onSnapshot(doc(db, "schedules", today), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setActivities((data.activities || []) as Activity[]);
          setSignups((data.signups || {}) as Record<string, string[]>);
        }
        setLoading(false);
      });
    };
    
    loadData();
  }, [user, today]);

  const signUp = async (activityId: string) => {
    if (!user) return;
    setBusy(activityId);
    try {
      await setDoc(doc(db, "schedules", today), {
        [`signups.${activityId}`]: arrayUnion(user.uid),
      }, { merge: true });
    } catch (e) { console.error(e); }
    finally { setBusy(null); }
  };

  const cancelSignup = async (activityId: string) => {
    if (!user) return;
    setBusy(activityId);
    try {
      await updateDoc(doc(db, "schedules", today), {
        [`signups.${activityId}`]: arrayRemove(user.uid),
      });
    } catch (e) { console.error(e); }
    finally { setBusy(null); }
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
          <p className="text-[var(--muted)] flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-500" /> {todayLabel}
          </p>
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

          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`bg-[var(--surface)] border-2 rounded-[2rem] p-8 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 ${
                isSignedUp ? 'border-teal-500/30 bg-teal-500/[0.02]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'
              } ${isPast ? 'opacity-50 grayscale shadow-none' : 'shadow-sm'}`}
            >
              <div className="flex items-center gap-6">
                <div className={`w-16 h-16 rounded-3xl flex flex-col items-center justify-center font-black ${
                   isSignedUp ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20' : 'bg-[var(--background)] text-[var(--muted)] border border-[var(--border)]'
                }`}>
                   <span className="text-sm leading-none mb-1">{a.startTime}</span>
                   <span className="text-[10px] opacity-60 font-bold">{a.endTime}</span>
                </div>
                <div>
                  <h4 className="text-xl font-black mb-1">{a.title}</h4>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-[var(--muted)] flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {locName}
                    </span>
                    <span className="text-xs text-[var(--muted)] flex items-center gap-1">
                      <Users className="w-3 h-3" /> {(signups[a.id] ?? []).length} רשומים
                    </span>
                  </div>
                </div>
              </div>

              {!isPast && (
                <button
                  onClick={() => isSignedUp ? cancelSignup(a.id) : signUp(a.id)}
                  disabled={isBusy}
                  className={`px-8 py-4 rounded-2xl font-black text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    isSignedUp 
                    ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20' 
                    : 'bg-teal-500 text-white hover:bg-teal-600 shadow-lg shadow-teal-500/20'
                  }`}
                >
                  {isBusy ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : isSignedUp ? (
                    <><X className="w-4 h-4" /> ביטול הרשמה</>
                  ) : (
                    <><Plus className="w-4 h-4" /> הצטרפות</>
                  )}
                </button>
              )}
              {isPast && (
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
    </div>
  );
}
