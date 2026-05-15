"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, Suspense } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, doc, setDoc, deleteDoc } from "firebase/firestore";
import {
  Search, Loader2, ChevronLeft, ChevronRight,
  Calendar as CalendarIcon, Users, CheckCircle,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AttendanceItem } from "@/components/admin/attendance/AttendanceItem";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
  addDays, parseISO,
} from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  hosenType: string;
  status?: string;
  fullName?: string;
}
interface Group { id: string; name: string }
interface AttendanceRecord { [patientId: string]: "present" | "absent" | "unset" }

function MiniCalendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const sel = new Date(value);
  const [view, setView] = useState(new Date(value));
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(view)), end: endOfWeek(endOfMonth(view)) });
  const WD = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
  return (
    <div className="select-none p-4">
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-black">{format(view, "MMMM yyyy", { locale: he })}</span>
        <div className="flex gap-1">
          <button onClick={() => setView(subMonths(view, 1))}
            className="p-2 rounded-xl hover:bg-[var(--foreground)]/5 border border-transparent hover:border-[var(--border)]">
            <ChevronRight className="w-4 h-4 text-[var(--muted)]" />
          </button>
          <button onClick={() => setView(addMonths(view, 1))}
            className="p-2 rounded-xl hover:bg-[var(--foreground)]/5 border border-transparent hover:border-[var(--border)]">
            <ChevronLeft className="w-4 h-4 text-[var(--muted)]" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WD.map(d => (
          <div key={d} className="text-[10px] font-black text-[var(--muted)]/50 text-center py-1 uppercase tracking-widest">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const isSel   = isSameDay(day, sel);
          const isToday = isSameDay(day, new Date());
          const inMonth = isSameMonth(day, view);
          return (
            <button key={i} onClick={() => onChange(format(day, "yyyy-MM-dd"))}
              className={`aspect-square rounded-xl text-[13px] font-black flex items-center justify-center transition-all active:scale-90 ${
                isSel   ? "bg-[var(--foreground)] text-[var(--background)] shadow-lg" :
                isToday ? "bg-emerald-500/15 text-emerald-500" :
                inMonth ? "text-[var(--foreground)] hover:bg-[var(--foreground)]/8" : "text-[var(--muted)]/20"
              }`}>
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AttendancePageContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [groups,        setGroups]        = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>(searchParams.get("group") || "");
  const [patients,      setPatients]      = useState<Patient[]>([]);
  const [attendance,    setAttendance]    = useState<AttendanceRecord>({});
  const [loading,       setLoading]       = useState(true);
  const [searchTerm,    setSearchTerm]    = useState("");
  const [selectedDate,  setSelectedDate]  = useState(format(new Date(), "yyyy-MM-dd"));
  const [showCalendar,  setShowCalendar]  = useState(false);

  useEffect(() => {
    getDocs(collection(db, "groups")).then(snap => {
      const gList = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
      setGroups(gList);
      if (!selectedGroup && gList.length > 0) setSelectedGroup(gList[0].id);
    });
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      const gName = groups.find(g => g.id === selectedGroup)?.name || "";
      fetchData(selectedGroup, gName);
    }
  }, [selectedGroup, selectedDate, groups]);

  const fetchData = async (groupId: string, groupName: string) => {
    setLoading(true);
    try {
      const pSnap = await getDocs(collection(db, "patients"));
      const list: Patient[] = [];
      pSnap.forEach(d => {
        const data = d.data();
        if (data.status === "active" && (data.hosenType === groupId || data.hosenType === groupName)) {
          list.push({ id: d.id, ...data } as Patient);
        }
      });
      setPatients(list);

      const attSnap = await getDocs(query(collection(db, "attendance"), where("date", "==", selectedDate)));
      const record: AttendanceRecord = {};
      list.forEach(p => record[p.id] = "unset");
      attSnap.forEach(d => {
        const data = d.data();
        if (record[data.patientId] !== undefined) record[data.patientId] = data.status;
      });
      setAttendance(record);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleToggle = async (pId: string, status: "present" | "absent") => {
    const newStatus = attendance[pId] === status ? "unset" : status;
    setAttendance(prev => ({ ...prev, [pId]: newStatus }));
    try {
      const attId = `${pId}_${selectedDate}`;
      if (newStatus === "unset") {
        await deleteDoc(doc(db, "attendance", attId));
      } else {
        await setDoc(doc(db, "attendance", attId), {
          patientId: pId, date: selectedDate, status: newStatus, updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) { console.error(err); }
  };

  const changeDate = (days: number) => {
    const next = addDays(parseISO(selectedDate), days);
    setSelectedDate(format(next, "yyyy-MM-dd"));
  };

  const markAllPresent = async () => {
    const newAtt = { ...attendance };
    const updates = filteredPatients
      .filter(p => attendance[p.id] === "unset")
      .map(p => {
        newAtt[p.id] = "present";
        return setDoc(doc(db, "attendance", `${p.id}_${selectedDate}`), {
          patientId: p.id, date: selectedDate, status: "present", updatedAt: new Date().toISOString(),
        });
      });
    setAttendance(newAtt);
    await Promise.all(updates);
  };

  const handleDateChange = (d: string) => {
    setSelectedDate(d);
    setShowCalendar(false);
  };

  const filteredPatients = patients
    .filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  const stats = {
    present: Object.values(attendance).filter(v => v === "present").length,
    absent:  Object.values(attendance).filter(v => v === "absent").length,
    unset:   Object.values(attendance).filter(v => v === "unset").length,
    total:   patients.length,
  };

  const isToday  = isSameDay(parseISO(selectedDate), new Date());
  const dayLabel = isToday ? "היום" : format(parseISO(selectedDate), "EEEE", { locale: he });
  const dateLabel = format(parseISO(selectedDate), "d בMMMM", { locale: he });
  const pct = stats.total ? Math.round((stats.present / stats.total) * 100) : 0;
  const hasUnset = stats.unset > 0 && filteredPatients.some(p => attendance[p.id] === "unset");

  return (
    <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pb-36">

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)]">

        {/* Top row */}
        <div className="flex items-center justify-between px-4 h-12">
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/")}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--foreground)]/5 text-[var(--muted)]">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-sm font-black">נוכחות</span>
          </div>

          {/* Desktop: calendar toggle button */}
          <button onClick={() => setShowCalendar(!showCalendar)}
            className="hidden md:flex items-center gap-2 px-4 h-9 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl text-xs font-black hover:bg-[var(--foreground)]/10 transition-colors">
            <CalendarIcon className="w-3.5 h-3.5 text-emerald-500" />
            {dayLabel} · {dateLabel}
          </button>
        </div>

        {/* Mobile: prominent date navigation bar */}
        <div className="md:hidden flex items-center gap-2 px-4 pb-3">
          <button onClick={() => changeDate(-1)}
            className="w-11 h-11 rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] flex items-center justify-center text-[var(--muted)] active:scale-90 transition-transform shrink-0">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button onClick={() => setShowCalendar(!showCalendar)}
            className="flex-1 h-11 rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] flex flex-col items-center justify-center active:bg-[var(--foreground)]/10 transition-colors">
            <span className={`text-[10px] font-black uppercase tracking-widest leading-none ${isToday ? "text-emerald-500" : "text-[var(--muted)]/60"}`}>
              {dayLabel}
            </span>
            <span className="text-sm font-black leading-tight mt-0.5">{dateLabel}</span>
          </button>
          <button onClick={() => changeDate(1)}
            className="w-11 h-11 rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] flex items-center justify-center text-[var(--muted)] active:scale-90 transition-transform shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Group selector */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 pb-3">
          {groups.map(g => (
            <button key={g.id} onClick={() => setSelectedGroup(g.id)}
              className={`whitespace-nowrap px-4 h-8 rounded-xl text-[11px] font-black transition-all shrink-0 ${
                selectedGroup === g.id
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "bg-[var(--foreground)]/5 text-[var(--muted)] hover:bg-[var(--foreground)]/10"
              }`}>
              {g.name}
            </button>
          ))}
        </div>

        {/* Desktop calendar dropdown */}
        <AnimatePresence>
          {showCalendar && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="hidden md:block absolute top-full left-0 right-0 bg-[var(--background)] border-b border-[var(--border)] z-50 p-4">
              <div className="max-w-sm mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                <MiniCalendar value={selectedDate} onChange={handleDateChange} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Mobile calendar — bottom sheet */}
      <AnimatePresence>
        {showCalendar && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowCalendar(false)}
              className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)] border-t border-[var(--border)] rounded-t-3xl shadow-2xl">
              <div className="w-10 h-1 rounded-full bg-[var(--border)] mx-auto mt-3 mb-1" />
              <MiniCalendar value={selectedDate} onChange={handleDateChange} />
              <div className="px-4 pb-8">
                <button
                  onClick={() => { setSelectedDate(format(new Date(), "yyyy-MM-dd")); setShowCalendar(false); }}
                  className="w-full py-3.5 bg-emerald-500 text-white rounded-2xl text-sm font-black">
                  קפוץ להיום
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Stats card */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="text-center">
                <p className="text-xl font-black text-emerald-500 leading-none">{stats.present}</p>
                <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mt-0.5">נוכחים</p>
              </div>
              <div className="w-px h-8 bg-[var(--border)]" />
              <div className="text-center">
                <p className="text-xl font-black text-rose-500 leading-none">{stats.absent}</p>
                <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mt-0.5">נעדרים</p>
              </div>
              <div className="w-px h-8 bg-[var(--border)]" />
              <div className="text-center">
                <p className="text-xl font-black text-[var(--muted)]/40 leading-none">{stats.unset}</p>
                <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mt-0.5">ממתינים</p>
              </div>
            </div>
            <div className="text-left">
              <p className="text-2xl font-black leading-none">{pct}<span className="text-sm font-bold text-[var(--muted)]">%</span></p>
              <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mt-0.5">נוכחות</p>
            </div>
          </div>

          {/* Split progress bar */}
          <div className="h-2 bg-[var(--foreground)]/5 rounded-full overflow-hidden flex">
            {stats.total > 0 && (
              <>
                <div className="bg-emerald-500 rounded-r-full transition-all duration-500"
                  style={{ width: `${(stats.present / stats.total) * 100}%` }} />
                <div className="bg-rose-500 transition-all duration-500"
                  style={{ width: `${(stats.absent / stats.total) * 100}%` }} />
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]/40" />
          <input
            type="text"
            placeholder="חיפוש מטופל..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] rounded-xl pr-11 pl-4 h-11 text-sm font-bold outline-none focus:border-[var(--muted)]/40 transition-all"
          />
        </div>

        {/* Patient list */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-center justify-center py-20">
                <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
              </motion.div>
            ) : filteredPatients.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 opacity-30 gap-3">
                <Users className="w-10 h-10" />
                <p className="text-sm font-bold italic">אין מטופלים להצגה</p>
              </motion.div>
            ) : (
              <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="divide-y divide-[var(--border)]">
                {filteredPatients.map(p => (
                  <AttendanceItem
                    key={p.id}
                    patient={p}
                    status={attendance[p.id] || "unset"}
                    onToggle={s => handleToggle(p.id, s)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ── FAB: Mark All Present ── */}
      <AnimatePresence>
        {hasUnset && !loading && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-20 inset-x-4 z-40 max-w-2xl mx-auto left-0 right-0"
          >
            <button onClick={markAllPresent}
              className="w-full flex items-center justify-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-emerald-500/30 active:scale-[0.97] transition-all">
              <CheckCircle className="w-5 h-5" />
              סמן {stats.unset} ממתינים כנוכחים
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AdminPatientAttendancePage() {
  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee"]}>
      <Suspense fallback={<div className="min-h-screen bg-[var(--background)]" />}>
        <AttendancePageContent />
      </Suspense>
    </RoleGuard>
  );
}
