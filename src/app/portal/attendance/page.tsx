"use client";

import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, doc, getDoc, query, orderBy, where, onSnapshot
} from "firebase/firestore";
import {
  BarChart3, Clock, Loader2, Calendar, Info
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { he } from "date-fns/locale";
import { motion } from "framer-motion";

export default function AttendancePage() {
  const { user } = useAuth();
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const uSnap = await getDoc(doc(db, "users", user.uid));
      const pId = uSnap.data()?.patientId;
      if (!pId) return;

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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-teal-500" /></div>;

  const presentCount = attendanceHistory.filter(h => h.status === 'present').length;
  const absentCount = attendanceHistory.filter(h => h.status === 'absent').length;

  return (
    <div className="space-y-10 max-w-4xl">
      <div>
        <h2 className="text-3xl font-black mb-2">מעקב נוכחות</h2>
        <p className="text-[var(--muted)]">היסטוריית נוכחות וסיכום ימי השתתפות</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-10 flex items-center gap-8 shadow-sm">
           <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <BarChart3 className="w-10 h-10" />
           </div>
           <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">סה״כ נוכחות</p>
              <h3 className="text-4xl font-black text-emerald-500">{presentCount}</h3>
              <p className="text-xs text-[var(--muted)] mt-1">ימים במרכז</p>
           </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-10 flex items-center gap-8 shadow-sm">
           <div className="w-20 h-20 rounded-3xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
              <Clock className="w-10 h-10" />
           </div>
           <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">סה״כ היעדרות</p>
              <h3 className="text-4xl font-black text-rose-500">{absentCount}</h3>
              <p className="text-xs text-[var(--muted)] mt-1">ימים שלא הגעת</p>
           </div>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-10 shadow-sm">
         <div className="flex items-center gap-3 mb-8">
            <Calendar className="w-5 h-5 text-teal-500" />
            <h3 className="text-xl font-black">היסטוריית נוכחות מפורטת</h3>
         </div>

         <div className="space-y-3">
            {attendanceHistory.map((h, i) => (
               <motion.div 
                 key={i}
                 initial={{ opacity: 0, x: 10 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: i * 0.03 }}
                 className="flex items-center justify-between p-5 bg-[var(--background)] border border-[var(--border)] rounded-2xl hover:border-teal-500/30 transition-all"
               >
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-xl bg-[var(--surface)] flex items-center justify-center text-[var(--muted)] font-black text-[10px]">
                        {format(parseISO(h.date), "dd/MM")}
                     </div>
                     <div>
                        <p className="font-bold text-sm">{format(parseISO(h.date), "EEEE", { locale: he })}</p>
                        <p className="text-[10px] text-[var(--muted)]">{format(parseISO(h.date), "dd MMMM yyyy", { locale: he })}</p>
                     </div>
                  </div>
                  <div className={`px-4 py-2 rounded-xl text-[10px] font-black ${
                     h.status === 'present' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                  }`}>
                     {h.status === 'present' ? 'נוכח/ת' : 'נעדר/ת'}
                  </div>
               </motion.div>
            ))}
            {attendanceHistory.length === 0 && (
               <div className="text-center py-20 opacity-20">
                  <p className="font-black">אין נתוני נוכחות רשומים</p>
               </div>
            )}
         </div>
      </div>
    </div>
  );
}
