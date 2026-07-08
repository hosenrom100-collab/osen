"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, doc, updateDoc, setDoc, deleteDoc, query, where, getDoc
} from "firebase/firestore";
import { 
  ClipboardList, ArrowRight, Search, Loader2, Check, X, Calendar, User, Clock, CheckCircle2, ShieldAlert
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format, getDay, parseISO } from "date-fns";

interface StaffProfile {
  id: string;
  email: string;
  displayName?: string;
  name?: string;
  role?: string;
  roles?: string[];
  workSchedule?: Record<string, { start: string; end: string }>;
}

interface AbsenceRequest {
  id: string;
  userId: string;
  userName: string;
  date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
}

interface StaffAttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  date: string;
  status: "present" | "absent" | "leave" | "unset";
  reason?: string;
}

const ROLE_HE: Record<string, string> = {
  admin: "מנהל מערכת",
  manager: "מנהל/ת חוסן",
  social_worker: "עו״ס",
  instructor: "מדריך/ה",
  logistics: "לוגיסטיקה",
  employee: "עובד/ת"
};

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export default function StaffAttendancePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [absences, setAbsences] = useState<AbsenceRequest[]>([]);
  const [attendance, setAttendance] = useState<Record<string, StaffAttendanceRecord>>({});
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch all active/approved staff members
      const uSnap = await getDocs(collection(db, "users"));
      const staffList: StaffProfile[] = [];
      uSnap.forEach(d => {
        const data = d.data();
        if (data.status === "approved" || data.status === "active") {
          staffList.push({ id: d.id, ...data } as StaffProfile);
        }
      });
      staffList.sort((a, b) => (a.displayName || a.name || "").localeCompare(b.displayName || b.name || "", 'he'));
      setStaff(staffList);

      // 2. Fetch absence requests for the selected date
      const absSnap = await getDocs(
        query(collection(db, "absence_requests"), where("date", "==", selectedDate))
      );
      const absList: AbsenceRequest[] = [];
      absSnap.forEach(d => {
        absList.push({ id: d.id, ...d.data() } as AbsenceRequest);
      });
      setAbsences(absList);

      // 3. Fetch staff attendance for the selected date
      const attSnap = await getDocs(
        query(collection(db, "staff_attendance"), where("date", "==", selectedDate))
      );
      const attRecord: Record<string, StaffAttendanceRecord> = {};
      attSnap.forEach(d => {
        const data = d.data();
        attRecord[data.userId] = { id: d.id, ...data } as StaffAttendanceRecord;
      });
      setAttendance(attRecord);
    } catch (err) {
      console.error("Error loading staff attendance data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAbsence = async (req: AbsenceRequest) => {
    setActionLoading(req.id);
    try {
      // Update absence request status
      await updateDoc(doc(db, "absence_requests", req.id), { status: "approved" });
      
      // Auto-set staff attendance to 'leave'
      const attId = `${req.userId}_${selectedDate}`;
      await setDoc(doc(db, "staff_attendance", attId), {
        userId: req.userId,
        userName: req.userName,
        date: selectedDate,
        status: "leave",
        reason: req.reason,
        updatedAt: new Date().toISOString()
      });

      // Update local state
      setAbsences(prev => prev.map(a => a.id === req.id ? { ...a, status: "approved" } : a));
      setAttendance(prev => ({
        ...prev,
        [req.userId]: {
          id: attId,
          userId: req.userId,
          userName: req.userName,
          date: selectedDate,
          status: "leave",
          reason: req.reason
        }
      }));
    } catch (err) {
      console.error(err);
      alert("שגיאה באapproval בקשת ההיעדרות");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectAbsence = async (req: AbsenceRequest) => {
    setActionLoading(req.id);
    try {
      // Update absence request status
      await updateDoc(doc(db, "absence_requests", req.id), { status: "rejected" });
      
      // If there was a leave record, delete it or set to unset
      const attId = `${req.userId}_${selectedDate}`;
      if (attendance[req.userId]?.status === "leave") {
        await deleteDoc(doc(db, "staff_attendance", attId));
        setAttendance(prev => {
          const next = { ...prev };
          delete next[req.userId];
          return next;
        });
      }

      setAbsences(prev => prev.map(a => a.id === req.id ? { ...a, status: "rejected" } : a));
    } catch (err) {
      console.error(err);
      alert("שגיאה בדחיית בקשת ההיעדרות");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAttendance = async (member: StaffProfile, newStatus: "present" | "absent") => {
    const userId = member.id;
    const current = attendance[userId]?.status;
    const nextStatus = current === newStatus ? "unset" : newStatus;
    const attId = `${userId}_${selectedDate}`;
    
    setActionLoading(userId);
    try {
      if (nextStatus === "unset") {
        await deleteDoc(doc(db, "staff_attendance", attId));
        setAttendance(prev => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      } else {
        await setDoc(doc(db, "staff_attendance", attId), {
          userId,
          userName: member.displayName || member.name || "עובד",
          date: selectedDate,
          status: nextStatus,
          updatedAt: new Date().toISOString()
        });
        setAttendance(prev => ({
          ...prev,
          [userId]: {
            id: attId,
            userId,
            userName: member.displayName || member.name || "עובד",
            date: selectedDate,
            status: nextStatus
          }
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  // Filter staff list
  const filteredStaff = staff.filter(member => {
    const nameMatch = (member.displayName || member.name || "").toLowerCase().includes(searchTerm.toLowerCase());
    const emailMatch = member.email.toLowerCase().includes(searchTerm.toLowerCase());
    return nameMatch || emailMatch;
  });

  const dayOfWeekIndex = getDay(parseISO(selectedDate));
  const dayOfWeekStr = String(dayOfWeekIndex);

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]" dir="rtl">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/90 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/admin")} className="p-2 hover:bg-[var(--foreground)]/5 rounded-xl transition-all">
              <ArrowRight className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-violet-500" />
              נוכחות צוות
            </h1>
          </div>
          <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-3 py-1.5 shadow-sm">
            <Calendar className="w-4 h-4 text-violet-500" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold focus:outline-none text-right border-none p-0 cursor-pointer"
            />
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 pb-32">
          {/* 1. Pending Absences Section */}
          {absences.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-black text-rose-500 uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-4.5 h-4.5" />
                בקשות היעדרות לתאריך זה ({absences.length})
              </h2>
              <div className="grid gap-3">
                <AnimatePresence mode="popLayout">
                  {absences.map(req => {
                    const statusText = 
                      req.status === "approved" ? "אושר" :
                      req.status === "rejected" ? "נדחה" :
                      "ממתין לאישור";
                    const statusBadgeCls = 
                      req.status === "approved" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" :
                      req.status === "rejected" ? "text-rose-500 bg-rose-500/10 border-rose-500/20" :
                      "text-amber-500 bg-amber-500/10 border-amber-500/20";

                    return (
                      <motion.div 
                        key={req.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-3xl flex items-center justify-between shadow-sm gap-4"
                      >
                        <div className="text-right">
                          <p className="font-black text-sm">{req.userName}</p>
                          <p className="text-xs text-[var(--muted)] mt-1 font-bold">סיבה: {req.reason}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {req.status === "pending" ? (
                            <>
                              <button 
                                onClick={() => handleApproveAbsence(req)}
                                disabled={actionLoading !== null}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all flex items-center gap-1 active:scale-95 shadow-sm"
                              >
                                {actionLoading === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                אשר היעדרות
                              </button>
                              <button 
                                onClick={() => handleRejectAbsence(req)}
                                disabled={actionLoading !== null}
                                className="px-3.5 py-1.5 rounded-xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-rose-500 text-xs font-black transition-all flex items-center gap-1 active:scale-95"
                              >
                                דחה
                              </button>
                            </>
                          ) : (
                            <span className={`px-3 py-1 rounded-full text-xs font-black border ${statusBadgeCls}`}>
                              {statusText}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </section>
          )}

          {/* 2. Staff Attendance Console */}
          <section className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-black tracking-tight">ניהול נוכחות יומי</h2>
                <p className="text-xs text-[var(--muted)] font-bold mt-1">יום {DAYS_HE[dayOfWeekIndex]} • {selectedDate.split("-").reverse().join(".")}</p>
              </div>

              {/* Search */}
              <div className="relative w-full md:w-72">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]/50" />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="חיפוש עובד..."
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl py-2.5 pr-10 pl-4 text-xs font-bold focus:outline-none focus:border-violet-500 transition-all text-right"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                <p className="text-xs font-bold text-[var(--muted)]">טוען את נתוני הצוות...</p>
              </div>
            ) : (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden divide-y divide-[var(--border)]/50 shadow-sm">
                {filteredStaff.map(member => {
                  const schedule = member.workSchedule?.[dayOfWeekStr];
                  const hasSchedule = !!schedule;
                  
                  const att = attendance[member.id];
                  const isPresent = att?.status === "present";
                  const isAbsent = att?.status === "absent";
                  const isLeave = att?.status === "leave";

                  return (
                    <div 
                      key={member.id}
                      className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-right hover:bg-[var(--foreground)]/[0.01] transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center border border-violet-500/20 shrink-0">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-black text-sm">{member.displayName || member.name || "עובד"}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            <span className="text-[10px] font-black text-violet-500 bg-violet-500/5 px-2 py-0.5 rounded-md">
                              {ROLE_HE[member.role || ""] || member.role || "עובד"}
                            </span>
                            <span className="text-[10px] font-bold text-[var(--muted)]">
                              {hasSchedule ? `לו״ז: ${schedule.start} - ${schedule.end}` : "לא מתוכנן לעבוד היום"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Presence toggle buttons */}
                      <div className="flex items-center gap-2 justify-end">
                        {isLeave ? (
                          <div className="flex items-center gap-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-2xl px-4 py-2 text-xs font-black">
                            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                            <span>בחופשה / היעדרות מאושרת</span>
                            {att.reason && <span className="text-[10px] opacity-75 font-bold">({att.reason})</span>}
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleToggleAttendance(member, "present")}
                              disabled={actionLoading !== null}
                              className={`px-4 py-2 rounded-2xl text-xs font-black border transition-all active:scale-95 flex items-center gap-1.5 ${
                                isPresent 
                                  ? "bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/15 font-black"
                                  : "bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-emerald-500"
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              נוכח
                            </button>
                            <button
                              onClick={() => handleToggleAttendance(member, "absent")}
                              disabled={actionLoading !== null}
                              className={`px-4 py-2 rounded-2xl text-xs font-black border transition-all active:scale-95 flex items-center gap-1.5 ${
                                isAbsent 
                                  ? "bg-rose-600 border-rose-500 text-white shadow-md shadow-rose-600/15 font-black"
                                  : "bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-rose-400"
                              }`}
                            >
                              <X className="w-3.5 h-3.5 stroke-[3]" />
                              נעדר
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {filteredStaff.length === 0 && (
                  <div className="py-20 text-center opacity-30 flex flex-col items-center gap-4">
                    <User className="w-10 h-10 text-[var(--muted)]" />
                    <p className="text-xs font-black">לא נמצאו עובדים רשומים</p>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </RoleGuard>
  );
}
