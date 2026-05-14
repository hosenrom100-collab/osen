"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { 
  collection, query, getDocs, where, doc, 
  updateDoc, orderBy, addDoc, serverTimestamp, getDoc
} from "firebase/firestore";
import { 
  Users, Calendar, Clock, CheckCircle2, XCircle, 
  AlertCircle, Loader2, ChevronRight, UserCheck, 
  History, Filter, Search, Bell
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";
import { he } from "date-fns/locale";

interface AbsenceRequest {
  id: string;
  userId: string;
  userName: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: any;
}

interface StaffAttendance {
  id: string;
  userId: string;
  userName: string;
  date: string;
  status: 'present' | 'absent' | 'leave';
  checkIn?: string;
  checkOut?: string;
}

export default function StaffAttendancePage() {
  const [activeTab, setActiveTab] = useState<'requests' | 'attendance'>('requests');
  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [attendance, setAttendance] = useState<StaffAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const dayOfWeek = new Date().getDay().toString();

      if (activeTab === 'requests') {
        const q = query(collection(db, "absence_requests"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as AbsenceRequest)));
      } else {
        // Fetch current attendance
        const q = query(collection(db, "staff_attendance"), where("date", "==", today));
        let snap = await getDocs(q);
        let currentAtt = snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffAttendance));

        // Auto-initialize if empty
        if (currentAtt.length === 0) {
          const usersSnap = await getDocs(collection(db, "users"));
          const batch: any[] = [];
          
          usersSnap.forEach(uDoc => {
            const userData = uDoc.data();
            if (userData.workSchedule && userData.workSchedule[dayOfWeek]) {
              const sched = userData.workSchedule[dayOfWeek];
              batch.push(addDoc(collection(db, "staff_attendance"), {
                userId: uDoc.id,
                userName: userData.name || userData.email,
                date: today,
                status: 'present',
                checkIn: sched.start,
                checkOut: sched.end,
                createdAt: serverTimestamp()
              }));
            }
          });

          if (batch.length > 0) {
            await Promise.all(batch);
            // Re-fetch
            const reSnap = await getDocs(q);
            currentAtt = reSnap.docs.map(d => ({ id: d.id, ...d.data() } as StaffAttendance));
          }
        }
        setAttendance(currentAtt);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAction = async (requestId: string, userId: string, date: string, action: 'approved' | 'denied') => {
    setActionLoading(requestId);
    try {
      // 1. Update Request
      await updateDoc(doc(db, "absence_requests", requestId), { status: action });
      
      // 2. If approved, update attendance and check for conflicts
      if (action === 'approved') {
        const attQuery = query(
          collection(db, "staff_attendance"), 
          where("userId", "==", userId), 
          where("date", "==", date)
        );
        const attSnap = await getDocs(attQuery);
        if (attSnap.empty) {
          await addDoc(collection(db, "staff_attendance"), {
            userId,
            date,
            status: 'leave',
            approvedBy: 'admin',
            createdAt: serverTimestamp()
          });
        } else {
          await updateDoc(doc(db, "staff_attendance", attSnap.docs[0].id), {
            status: 'leave'
          });
        }

        // 3. Check Conflicts (Duty or Activities)
        const schedSnap = await getDoc(doc(db, "schedules", date));
        if (schedSnap.exists()) {
          const schedData = schedSnap.data();
          const isDuty = (schedData.dutyInstructorId === userId || schedData.dutyId === userId);
          const hasActivities = (schedData.activities || []).some((a: any) => 
            (a.staffIds || []).includes(userId) || a.instructorId === userId
          );

          if (isDuty || hasActivities) {
            // Log a conflict for the manager's dashboard
            await addDoc(collection(db, "schedule_conflicts"), {
              date,
              userId,
              type: isDuty ? 'duty' : 'activity',
              resolved: false,
              createdAt: serverTimestamp()
            });
          }
        }
      }
      
      await fetchData();
    } catch (err) {
      console.error(err);
      alert("שגיאה בביצוע הפעולה");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager"]}>
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <header className="sticky top-0 z-40 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-6">
            <div>
              <h1 className="text-2xl font-black tracking-tight">ניהול נוכחות צוות</h1>
              <p className="text-xs text-[var(--foreground)]/40 font-medium">מעקב אחר ימי עבודה, היעדרויות ואישורי חופשות</p>
            </div>
            
            <div className="flex bg-[var(--foreground)]/5 p-1 rounded-2xl border border-[var(--border)]">
              <button 
                onClick={() => setActiveTab('requests')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'requests' ? 'bg-rose-500 text-white shadow-lg' : 'text-[var(--foreground)]/40 hover:text-[var(--foreground)]'}`}
              >
                בקשות היעדרות
              </button>
              <button 
                onClick={() => setActiveTab('attendance')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'attendance' ? 'bg-rose-500 text-white shadow-lg' : 'text-[var(--foreground)]/40 hover:text-[var(--foreground)]'}`}
              >
                נוכחות יומית
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto p-4 md:p-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
              <p className="text-sm font-bold text-[var(--foreground)]/40">טוען נתונים...</p>
            </div>
          ) : activeTab === 'requests' ? (
            <div className="grid grid-cols-1 gap-4">
              {requests.length === 0 ? (
                <div className="py-24 text-center border-2 border-dashed border-[var(--border)] rounded-[2.5rem]">
                  <Bell className="w-12 h-12 text-[var(--foreground)]/10 mx-auto mb-4" />
                  <p className="text-sm font-bold text-[var(--foreground)]/30">אין בקשות היעדרות ממתינות</p>
                </div>
              ) : (
                requests.map((req) => (
                  <motion.div 
                    layout
                    key={req.id}
                    className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all group"
                  >
                    <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                      <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-black text-[var(--foreground)]">{req.userName}</h3>
                          <span className="text-[10px] text-[var(--foreground)]/20">•</span>
                          <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">
                            {format(new Date(req.date), "dd/MM/yyyy", { locale: he })}
                          </p>
                        </div>
                        <p className="text-sm text-[var(--foreground)]/60 font-medium">{req.reason}</p>
                      </div>

                      <div className="flex items-center gap-2 w-full md:w-auto">
                        {req.status === 'pending' ? (
                          <>
                            <button 
                              onClick={() => handleRequestAction(req.id, req.userId, req.date, 'approved')}
                              disabled={!!actionLoading}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl text-xs font-bold transition-all active:scale-95"
                            >
                              {actionLoading === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                              אשר
                            </button>
                            <button 
                              onClick={() => handleRequestAction(req.id, req.userId, req.date, 'denied')}
                              disabled={!!actionLoading}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-6 py-3 rounded-xl text-xs font-bold transition-all active:scale-95"
                            >
                              <XCircle className="w-4 h-4" />
                              דחה
                            </button>
                          </>
                        ) : (
                          <div className={`px-4 py-2 rounded-xl text-xs font-bold border ${req.status === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
                            {req.status === 'approved' ? 'אושר' : 'נדחה'}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          ) : (
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] overflow-hidden">
               <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--foreground)]/[0.02]">
                 <div className="flex items-center gap-3">
                   <Users className="w-5 h-5 text-rose-500" />
                   <h3 className="font-black">נוכחות צוות להיום ({format(new Date(), "dd/MM")})</h3>
                 </div>
                 <div className="flex gap-2">
                   <div className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-black border border-emerald-500/20">
                     {attendance.filter(a => a.status === 'present').length} נוכחים
                   </div>
                   <div className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 text-[10px] font-black border border-rose-500/20">
                     {attendance.filter(a => a.status === 'absent').length} חסרים
                   </div>
                 </div>
               </div>
               
               <div className="divide-y divide-[var(--border)]">
                 {attendance.length === 0 ? (
                   <div className="p-12 text-center text-sm font-bold text-[var(--foreground)]/30 italic">
                     לא נמצאו נתוני נוכחות להיום
                   </div>
                 ) : (
                   attendance.map(att => (
                     <div key={att.id} className="p-5 flex items-center justify-between hover:bg-[var(--foreground)]/[0.01] transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${att.status === 'present' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                            {att.userName?.[0] || 'U'}
                          </div>
                          <div>
                            <p className="text-sm font-bold">{att.userName}</p>
                            <div className="flex items-center gap-2 text-[10px] text-[var(--foreground)]/40 font-medium">
                              <Clock className="w-3 h-3" />
                              {att.checkIn || '--:--'} - {att.checkOut || '--:--'}
                            </div>
                          </div>
                        </div>
                        
                        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                          att.status === 'present' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                          att.status === 'leave' ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' :
                          'bg-rose-500/10 border-rose-500/20 text-rose-500'
                        }`}>
                          {att.status === 'present' ? 'נוכח' : att.status === 'leave' ? 'חופשה/מחלה' : 'נעדר'}
                        </div>
                     </div>
                   ))
                 )}
               </div>
            </div>
          )}
        </main>
      </div>
    </RoleGuard>
  );
}
