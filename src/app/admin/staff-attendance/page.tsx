"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, doc, setDoc, deleteDoc, query, where
} from "firebase/firestore";
import { 
  ClipboardList, ArrowRight, Search, Loader2, Check, X, Calendar, User, Clock, ShieldAlert, Plus
} from "lucide-react";
import { formatAbsenceRange, StaffAbsence } from "@/lib/attendance/staffAbsence";
import { addAbsence, loadAbsencesOn, removeAbsenceDay, setAbsenceStatus } from "@/lib/attendance/staffAbsenceData";
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

/** Only "present" is written now; "absent"/"leave" are read from records made before absences moved to absence_requests. */
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
  const [absences, setAbsences] = useState<StaffAbsence[]>([]);
  const [attendance, setAttendance] = useState<Record<string, StaffAttendanceRecord>>({});
  const [programs, setPrograms] = useState<{ id: string; name: string; activeDays?: number[] }[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [newAbsence, setNewAbsence] = useState({ userId: "", startDate: "", endDate: "", reason: "" });
  const [savingAbsence, setSavingAbsence] = useState(false);

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

      // 2. Absences covering the selected date (single days and ranges) — the same source the calendar reads
      setAbsences(await loadAbsencesOn(selectedDate));

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

      // 4. Fetch programs catalog
      const progSnap = await getDocs(collection(db, "programs"));
      setPrograms(progSnap.docs.map(d => ({ id: d.id, name: d.data().name, activeDays: d.data().activeDays || [] })));
    } catch (err) {
      console.error("Error loading staff attendance data:", err);
    } finally {
      setLoading(false);
    }
  };

  const nameOf = (member: StaffProfile) => member.displayName || member.name || "עובד";

  const clearAttendance = async (userId: string) => {
    if (!attendance[userId]) return;
    await deleteDoc(doc(db, "staff_attendance", `${userId}_${selectedDate}`));
    setAttendance(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const handleApproveAbsence = async (req: StaffAbsence) => {
    setActionLoading(req.id);
    try {
      await setAbsenceStatus(req.id, "approved");
      setAbsences(prev => prev.map(a => a.id === req.id ? { ...a, status: "approved" } : a));
    } catch (err) {
      console.error(err);
      alert("שגיאה באישור בקשת ההיעדרות");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectAbsence = async (req: StaffAbsence) => {
    setActionLoading(req.id);
    try {
      await setAbsenceStatus(req.id, "rejected");
      // An older approval also wrote a "leave" attendance record; drop it so the day is not shown as leave.
      if (attendance[req.userId]?.status === "leave") await clearAttendance(req.userId);
      setAbsences(prev => prev.map(a => a.id === req.id ? { ...a, status: "rejected" } : a));
    } catch (err) {
      console.error(err);
      alert("שגיאה בדחיית בקשת ההיעדרות");
    } finally {
      setActionLoading(null);
    }
  };

  /** Takes the selected day out of an approved absence (the rest of its range stays). */
  const handleCancelAbsenceDay = async (abs: StaffAbsence) => {
    if (abs.dates.length > 1 && !confirm(`להסיר את ${selectedDate.split("-").reverse().join(".")} מההיעדרות ${formatAbsenceRange(abs)}? שאר הימים יישארו.`)) return;
    setActionLoading(abs.userId);
    try {
      await removeAbsenceDay(abs, selectedDate);
      await fetchData();
    } catch (err) {
      console.error(err);
      alert("שגיאה בביטול ההיעדרות");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAttendance = async (member: StaffProfile, newStatus: "present" | "absent") => {
    const userId = member.id;
    const current = attendance[userId]?.status;
    setActionLoading(userId);
    try {
      if (newStatus === "absent") {
        if (current === "absent" || current === "leave") {
          // An absence marked by an older version lives only here — clearing it is the toggle off.
          await clearAttendance(userId);
        } else {
          // Absent is an approved one-day absence, so the calendar sees it too.
          await addAbsence({
            userId, userName: nameOf(member), startDate: selectedDate, endDate: selectedDate,
            reason: "סומן כנעדר/ת בנוכחות צוות", status: "approved",
            createdBy: user?.uid, createdByName: user?.displayName || user?.email || "מנהל",
          });
          await clearAttendance(userId);
          setAbsences(await loadAbsencesOn(selectedDate));
        }
      } else if (current === "present") {
        await clearAttendance(userId);
      } else {
        const attId = `${userId}_${selectedDate}`;
        await setDoc(doc(db, "staff_attendance", attId), {
          userId,
          userName: nameOf(member),
          date: selectedDate,
          status: "present",
          updatedAt: new Date().toISOString()
        });
        setAttendance(prev => ({
          ...prev,
          [userId]: { id: attId, userId, userName: nameOf(member), date: selectedDate, status: "present" }
        }));
      }
    } catch (err) {
      console.error(err);
      alert("שגיאה בעדכון הנוכחות");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddRange = async (e: React.FormEvent) => {
    e.preventDefault();
    const member = staff.find(m => m.id === newAbsence.userId);
    if (!member || !newAbsence.startDate) return;
    setSavingAbsence(true);
    try {
      await addAbsence({
        userId: member.id, userName: nameOf(member),
        startDate: newAbsence.startDate, endDate: newAbsence.endDate || newAbsence.startDate,
        reason: newAbsence.reason, status: "approved",
        createdBy: user?.uid, createdByName: user?.displayName || user?.email || "מנהל",
      });
      setNewAbsence({ userId: "", startDate: "", endDate: "", reason: "" });
      await fetchData();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error && /[א-ת]/.test(err.message) ? err.message : "שגיאה בהוספת ההיעדרות");
    } finally {
      setSavingAbsence(false);
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
            <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-violet-500" />
              נוכחות צוות
            </h1>
          </div>
          <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5">
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
              <h2 className="text-sm font-bold text-rose-500 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4.5 h-4.5" />
                היעדרויות בתאריך זה ({absences.length})
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
                          <p className="font-bold text-sm">{req.userName}</p>
                          <p className="text-xs text-[var(--muted)] mt-1 font-bold">
                            {req.dates.length > 1 && <span className="text-violet-500">{formatAbsenceRange(req)} · </span>}
                            סיבה: {req.reason || "ללא"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {req.status === "pending" ? (
                            <>
                              <button 
                                onClick={() => handleApproveAbsence(req)}
                                disabled={actionLoading !== null}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1 active:scale-95 shadow-sm"
                              >
                                {actionLoading === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                אשר היעדרות
                              </button>
                              <button 
                                onClick={() => handleRejectAbsence(req)}
                                disabled={actionLoading !== null}
                                className="px-3.5 py-1.5 rounded-xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-rose-500 text-xs font-bold transition-all flex items-center gap-1 active:scale-95"
                              >
                                דחה
                              </button>
                            </>
                          ) : (
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusBadgeCls}`}>
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

          {/* 2. Add an absence for a day or a range of days */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <Plus className="w-4 h-4 text-violet-500" />
              הוספת היעדרות
            </h2>
            <form onSubmit={handleAddRange} className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-3xl grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <label className="space-y-1 text-right md:col-span-2">
                <span className="block text-[11px] font-bold text-[var(--muted)]">עובד/ת</span>
                <select
                  required
                  value={newAbsence.userId}
                  onChange={e => setNewAbsence(p => ({ ...p, userId: e.target.value }))}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-violet-500"
                >
                  <option value="">בחירה...</option>
                  {staff.map(m => <option key={m.id} value={m.id}>{nameOf(m)}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-right">
                <span className="block text-[11px] font-bold text-[var(--muted)]">מתאריך</span>
                <input
                  type="date" required
                  value={newAbsence.startDate}
                  onChange={e => setNewAbsence(p => ({ ...p, startDate: e.target.value, endDate: p.endDate && p.endDate < e.target.value ? e.target.value : p.endDate }))}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-violet-500"
                />
              </label>
              <label className="space-y-1 text-right">
                <span className="block text-[11px] font-bold text-[var(--muted)]">עד תאריך (כולל)</span>
                <input
                  type="date"
                  min={newAbsence.startDate || undefined}
                  value={newAbsence.endDate}
                  onChange={e => setNewAbsence(p => ({ ...p, endDate: e.target.value }))}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-violet-500"
                />
              </label>
              <label className="space-y-1 text-right">
                <span className="block text-[11px] font-bold text-[var(--muted)]">סיבה</span>
                <input
                  type="text"
                  value={newAbsence.reason}
                  onChange={e => setNewAbsence(p => ({ ...p, reason: e.target.value }))}
                  placeholder="חופשה, מחלה..."
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-violet-500"
                />
              </label>
              <button
                type="submit"
                disabled={savingAbsence}
                className="md:col-span-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                {savingAbsence ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                הוספת היעדרות מאושרת (מופיעה גם ביומן)
              </button>
            </form>
          </section>

          {/* 3. Staff Attendance Console */}
          <section className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight">ניהול נוכחות יומי</h2>
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
              <div className="border-b border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]/50">
                {filteredStaff.map(member => {
                  const schedule = member.workSchedule?.[dayOfWeekStr];
                  const hasSchedule = !!schedule;
                  
                  const att = attendance[member.id];
                  const approved = absences.find(a => a.userId === member.id && a.status === "approved");
                  const isPresent = !approved && att?.status === "present";
                  const isAbsent = !approved && (att?.status === "absent" || att?.status === "leave");

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
                          <p className="font-bold text-sm">{member.displayName || member.name || "עובד"}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            <span className="text-[11px] font-bold text-violet-500 bg-violet-500/5 px-2 py-0.5 rounded-md">
                              {ROLE_HE[member.role || ""] || member.role || "עובד"}
                            </span>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[11px] font-bold text-[var(--muted)]">
                                {hasSchedule ? `לו״ז כללי: ${schedule.start} - ${schedule.end}` : "לא מתוכנן לעבוד היום"}
                              </span>
                              {hasSchedule && (schedule as any).programs && Object.keys((schedule as any).programs).length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-violet-500 font-bold mt-0.5">
                                  <span>פירוט מסגרות:</span>
                                  {Object.entries((schedule as any).programs)
                                    .filter(([progId]: any) => {
                                      const prog = programs.find(p => p.id === progId);
                                      return !prog || !prog.activeDays || prog.activeDays.length === 0 || prog.activeDays.includes(dayOfWeekIndex);
                                    })
                                    .map(([progId, pSched]: any) => {
                                      const progName = programs.find(p => p.id === progId)?.name || progId;
                                      return (
                                        <span key={progId} className="bg-violet-500/5 px-1.5 py-0.5 rounded">
                                          {progName}: {pSched.start} - {pSched.end}
                                        </span>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Presence toggle buttons */}
                      <div className="flex items-center gap-2 justify-end">
                        {approved ? (
                          <div className="flex items-center gap-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-2xl px-4 py-2 text-xs font-bold">
                            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                            <span>בהיעדרות מאושרת</span>
                            {approved.dates.length > 1 && <span className="text-[11px] opacity-75 font-bold">{formatAbsenceRange(approved)}</span>}
                            {approved.reason && <span className="text-[11px] opacity-75 font-bold">({approved.reason})</span>}
                            <button
                              onClick={() => handleCancelAbsenceDay(approved)}
                              disabled={actionLoading !== null}
                              className="mr-1 p-1 rounded-lg hover:bg-amber-500/20 transition-all"
                              title="ביטול ההיעדרות ליום זה"
                              aria-label="ביטול ההיעדרות ליום זה"
                            >
                              {actionLoading === member.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleToggleAttendance(member, "present")}
                              disabled={actionLoading !== null}
                              className={`px-4 py-2 rounded-2xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 ${
                                isPresent 
                                  ? "bg-emerald-600 border-emerald-500 text-white shadow-md font-bold"
                                  : "bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-emerald-500"
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              נוכח
                            </button>
                            <button
                              onClick={() => handleToggleAttendance(member, "absent")}
                              disabled={actionLoading !== null}
                              className={`px-4 py-2 rounded-2xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 ${
                                isAbsent 
                                  ? "bg-rose-600 border-rose-500 text-white shadow-md font-bold"
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
                    <p className="text-xs font-bold">לא נמצאו עובדים רשומים</p>
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
