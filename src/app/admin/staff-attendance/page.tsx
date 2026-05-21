"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { 
  collection, query, getDocs, where, doc, 
  updateDoc, orderBy, addDoc, serverTimestamp, getDoc, setDoc
} from "firebase/firestore";
import { 
  Users, Calendar, Clock, CheckCircle2, XCircle, 
  AlertCircle, Loader2, ChevronRight, UserCheck, 
  History, Filter, Search, Bell
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";
import { he } from "date-fns/locale";
import { sendPush } from "@/lib/notify";

interface AbsenceRequest {
  id: string;
  userId: string;
  userName: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'rejected';
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

const WEEKDAYS = [
  { id: "0", name: "ראשון" },
  { id: "1", name: "שני" },
  { id: "2", name: "שלישי" },
  { id: "3", name: "רביעי" },
  { id: "4", name: "חמישי" },
  { id: "5", name: "שישי" },
  { id: "6", name: "שבת" }
];

export default function StaffAttendancePage() {
  const [activeTab, setActiveTab] = useState<'requests' | 'attendance' | 'schedules'>('requests');
  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [attendance, setAttendance] = useState<StaffAttendance[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [tempSchedule, setTempSchedule] = useState<Record<string, { start: string, end: string }>>({});
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const openEditSchedule = (user: any) => {
    setEditingUser(user);
    setTempSchedule(user.workSchedule || {});
  };

  const handleToggleDay = (dayId: string) => {
    setTempSchedule(prev => {
      const next = { ...prev };
      if (next[dayId]) {
        delete next[dayId];
      } else {
        next[dayId] = { start: "08:00", end: "16:00" };
      }
      return next;
    });
  };

  const handleTimeChange = (dayId: string, type: 'start' | 'end', val: string) => {
    setTempSchedule(prev => {
      const next = { ...prev };
      if (!next[dayId]) {
        next[dayId] = { start: "08:00", end: "16:00" };
      }
      next[dayId] = { ...next[dayId], [type]: val };
      return next;
    });
  };

  const saveUserSchedule = async () => {
    if (!editingUser) return;
    setSavingSchedule(true);
    try {
      await updateDoc(doc(db, "users", editingUser.id), {
        workSchedule: tempSchedule
      });
      setUsersList(prev => prev.map(u => u.id === editingUser.id ? { ...u, workSchedule: tempSchedule } : u));
      setEditingUser(null);
    } catch (err) {
      console.error(err);
      alert("שגיאה בעדכון סידור העבודה");
    } finally {
      setSavingSchedule(false);
    }
  };

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
      } else if (activeTab === 'attendance') {
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
            const roles = userData.roles || (userData.role ? [userData.role] : []);
            const isStaff = !roles.includes("participant") && userData.role !== "participant";
            if (isStaff && userData.workSchedule && userData.workSchedule[dayOfWeek]) {
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
      } else if (activeTab === 'schedules') {
        const snap = await getDocs(collection(db, "users"));
        const uList = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((u: any) => {
          const roles = u.roles || (u.role ? [u.role] : []);
          return !roles.includes("participant") && u.role !== "participant";
        });
        uList.sort((a: any, b: any) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));
        setUsersList(uList);
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
      const dbStatus = action === 'approved' ? 'approved' : 'rejected';
      
      // 1. Update Request
      await updateDoc(doc(db, "absence_requests", requestId), { status: dbStatus });
      
      // 2. If approved, update attendance, check for conflicts, and add schedule activity
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

        // Get request details for schedule activity title and notification
        const reqDoc = await getDoc(doc(db, "absence_requests", requestId));
        const reqData = reqDoc.data();
        const userName = reqData?.userName || "איש צוות";
        const reason = reqData?.reason || "היעדרות מאושרת";

        // Add to schedule
        const schedRef = doc(db, "schedules", date);
        const schedSnap = await getDoc(schedRef);
        
        const newActivity = {
          id: Math.random().toString(36).slice(2, 9),
          title: `היעדרות: ${userName}`,
          startTime: "08:00",
          endTime: "16:00",
          locationId: "office",
          staffIds: [],
          groupId: "staff_only",
          notes: reason
        };

        if (schedSnap.exists()) {
          const current = schedSnap.data().activities || [];
          await updateDoc(schedRef, {
            activities: [...current, newActivity]
          });
        } else {
          await setDoc(schedRef, {
            activities: [newActivity],
            dutyInstructorId: ""
          });
        }

        // Check Conflicts (Duty or Activities)
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

        // Send Push Notification
        await sendPush({
          userId: userId,
          title: "✅ בקשת ההיעדרות אושרה",
          body: `בקשתך ליום ${date} אושרה ונוספה ללו"ז.`,
          link: "/profile"
        });
      } else {
        // Send Push Notification on rejection
        await sendPush({
          userId: userId,
          title: "❌ בקשת ההיעדרות נדחתה",
          body: `בקשתך ליום ${date} נדחתה.`,
          link: "/profile"
        });
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
              <button 
                onClick={() => setActiveTab('schedules')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'schedules' ? 'bg-rose-500 text-white shadow-lg' : 'text-[var(--foreground)]/40 hover:text-[var(--foreground)]'}`}
              >
                סידורי עבודה שבועיים
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
          ) : activeTab === 'attendance' ? (
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
          ) : (
            <div className="space-y-6">
              <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] overflow-hidden shadow-sm">
                {/* Desktop View Table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full border-collapse text-right" dir="rtl">
                    <thead>
                      <tr className="bg-[var(--foreground)]/[0.02] border-b border-[var(--border)]">
                        <th className="p-5 font-black text-xs text-[var(--foreground)]/60">שם עובד/ת</th>
                        {WEEKDAYS.map(day => (
                          <th key={day.id} className="p-5 font-black text-xs text-[var(--foreground)]/60 text-center">{day.name}</th>
                        ))}
                        <th className="p-5 font-black text-xs text-[var(--foreground)]/60 text-center">פעולות</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {usersList.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-12 text-center text-sm font-bold text-[var(--foreground)]/30 italic">
                            לא נמצאו משתמשים במערכת
                          </td>
                        </tr>
                      ) : (
                        usersList.map(u => (
                          <tr key={u.id} className="hover:bg-[var(--foreground)]/[0.01] transition-colors">
                            <td className="p-5">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0">
                                  {u.name?.[0] || u.email?.[0] || 'U'}
                                </div>
                                <div>
                                  <p className="text-sm font-bold">{u.name || u.email}</p>
                                  <p className="text-[10px] text-[var(--foreground)]/40 font-semibold">
                                    {u.role === 'admin' ? 'מנהל מערכת' : u.role === 'manager' ? 'מנהלת חוסן' : u.role === 'instructor' ? 'מדריך' : u.role === 'social_worker' ? 'עו״ס' : u.role === 'logistics' ? 'לוגיסטיקה' : 'איש צוות'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            {WEEKDAYS.map(day => {
                              const sched = u.workSchedule?.[day.id];
                              return (
                                <td key={day.id} className="p-5 text-center">
                                  {sched ? (
                                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-black">
                                      <Clock className="w-3.5 h-3.5" />
                                      <span>{sched.start} - {sched.end}</span>
                                    </div>
                                  ) : (
                                    <span className="text-[var(--foreground)]/30 text-xs font-medium">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="p-5 text-center">
                              <button
                                onClick={() => openEditSchedule(u)}
                                className="px-4 py-2 rounded-xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] text-xs font-bold transition-all active:scale-95 text-[var(--foreground)]"
                              >
                                ערוך סידור
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View Cards */}
                <div className="lg:hidden divide-y divide-[var(--border)]">
                  {usersList.length === 0 ? (
                    <div className="p-12 text-center text-sm font-bold text-[var(--foreground)]/30 italic">
                      לא נמצאו משתמשים במערכת
                    </div>
                  ) : (
                    usersList.map(u => (
                      <div key={u.id} className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0">
                              {u.name?.[0] || u.email?.[0] || 'U'}
                            </div>
                            <div>
                              <p className="text-sm font-bold">{u.name || u.email}</p>
                              <p className="text-[10px] text-[var(--foreground)]/40 font-semibold">
                                {u.role === 'admin' ? 'מנהל מערכת' : u.role === 'manager' ? 'מנהלת חוסן' : u.role === 'instructor' ? 'מדריך' : u.role === 'social_worker' ? 'עו״ס' : u.role === 'logistics' ? 'לוגיסטיקה' : 'איש צוות'}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => openEditSchedule(u)}
                            className="px-3.5 py-1.5 rounded-lg bg-[var(--foreground)]/5 border border-[var(--border)] text-xs font-bold transition-all active:scale-95 text-[var(--foreground)]"
                          >
                            ערוך סידור
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {WEEKDAYS.map(day => {
                            const sched = u.workSchedule?.[day.id];
                            return (
                              <div key={day.id} className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--foreground)]/[0.01] flex flex-col items-center justify-center text-center gap-1">
                                <span className="text-[10px] font-black text-[var(--foreground)]/40">{day.name}</span>
                                {sched ? (
                                  <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{sched.start}-{sched.end}</span>
                                ) : (
                                  <span className="text-[var(--foreground)]/30 text-xs font-medium">—</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Beautiful Weekly Schedule Edit Modal */}
        <AnimatePresence>
          {editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setEditingUser(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-2xl bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] p-6 md:p-8 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col text-right"
                dir="rtl"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-4 mb-6 shrink-0">
                  <div>
                    <h3 className="text-xl font-black">עריכת סידור עבודה שבועי</h3>
                    <p className="text-xs text-[var(--foreground)]/40 font-medium">עבור {editingUser.name || editingUser.email}</p>
                  </div>
                  <button
                    onClick={() => setEditingUser(null)}
                    className="w-10 h-10 rounded-xl bg-[var(--foreground)]/5 flex items-center justify-center border border-[var(--border)] hover:bg-[var(--foreground)]/10 transition-all text-[var(--foreground)]"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                {/* Content - Scrollable Form */}
                <div className="flex-1 overflow-y-auto pr-1 pl-1 space-y-4 no-scrollbar">
                  {WEEKDAYS.map(day => {
                    const sched = tempSchedule[day.id];
                    const isWorking = !!sched;
                    return (
                      <div key={day.id} className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--foreground)]/[0.01] hover:bg-[var(--foreground)]/[0.02] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center justify-between md:justify-start gap-4">
                          <span className="w-20 font-black text-sm text-[var(--foreground)]">{day.name}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleDay(day.id)}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
                              isWorking 
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                                : 'bg-[var(--foreground)]/5 border-[var(--border)] text-[var(--foreground)]/40'
                            }`}
                          >
                            {isWorking ? 'יום עבודה' : 'יום מנוחה'}
                          </button>
                        </div>

                        {isWorking && (
                          <div className="flex items-center gap-3 justify-end">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-[var(--foreground)]/40 font-medium">התחלה:</span>
                              <input
                                type="time"
                                value={sched.start || "08:00"}
                                onChange={(e) => handleTimeChange(day.id, 'start', e.target.value)}
                                className="bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-lg px-2 py-1 text-xs outline-none focus:border-rose-500"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-[var(--foreground)]/40 font-medium">סיום:</span>
                              <input
                                type="time"
                                value={sched.end || "16:00"}
                                onChange={(e) => handleTimeChange(day.id, 'end', e.target.value)}
                                className="bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-lg px-2 py-1 text-xs outline-none focus:border-rose-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Actions */}
                <div className="border-t border-[var(--border)] pt-4 mt-6 flex gap-3 shrink-0">
                  <button
                    onClick={saveUserSchedule}
                    disabled={savingSchedule}
                    className="flex-1 py-3.5 bg-rose-500 text-white rounded-2xl font-black text-sm shadow-lg shadow-rose-500/15 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {savingSchedule ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    שמור שינויים
                  </button>
                  <button
                    onClick={() => setEditingUser(null)}
                    className="flex-1 py-3.5 bg-[var(--foreground)]/5 text-[var(--foreground)]/60 border border-[var(--border)] rounded-2xl font-black text-sm active:scale-95 transition-all"
                  >
                    ביטול
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </RoleGuard>
  );
}
