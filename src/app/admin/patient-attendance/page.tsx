"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, Suspense } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, doc, setDoc, orderBy, deleteDoc } from "firebase/firestore";
import {
  ClipboardList, ArrowRight, Calendar as CalendarIcon, Search,
  Loader2, Send, CheckCircle, Check, X, ChevronLeft, ChevronRight, Info,
  Users, LayoutGrid, Calendar as LucideCalendar
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AttendanceItem } from "@/components/admin/attendance/AttendanceItem";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
  addDays, subDays, parseISO
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
  const WD = ["א","ב","ג","ד","ה","ו","ש"];
  return (
    <div className="select-none bg-[var(--surface-raised)] border border-[var(--border)] rounded-[2rem] p-6 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm font-black text-[var(--foreground)] uppercase tracking-tight">{format(view, "MMMM yyyy", { locale: he })}</span>
        <div className="flex gap-1">
          <button onClick={() => setView(subMonths(view, 1))} className="p-2 rounded-xl hover:bg-[var(--foreground)]/5 transition-colors border border-transparent hover:border-[var(--border)]"><ChevronRight className="w-4 h-4 text-[var(--muted)]" /></button>
          <button onClick={() => setView(addMonths(view, 1))} className="p-2 rounded-xl hover:bg-[var(--foreground)]/5 transition-colors border border-transparent hover:border-[var(--border)]"><ChevronLeft className="w-4 h-4 text-[var(--muted)]" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WD.map(d => <div key={d} className="text-[10px] font-black text-[var(--muted)]/50 text-center py-1 uppercase tracking-widest">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const isSel   = isSameDay(day, sel);
          const isToday = isSameDay(day, new Date());
          const inMonth = isSameMonth(day, view);
          return (
            <button key={i} onClick={() => onChange(format(day, "yyyy-MM-dd"))}
              className={`aspect-square rounded-xl text-[11px] font-black flex items-center justify-center transition-all ${
                isSel   ? "bg-[var(--foreground)] text-[var(--background)] shadow-lg" :
                isToday ? "bg-[var(--primary)]/10 text-[var(--primary)]" :
                inMonth ? "text-[var(--foreground)] hover:bg-[var(--foreground)]/5" : "text-[var(--muted)]/20"
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
  const [selectedDate,   setSelectedDate]   = useState(format(new Date(), "yyyy-MM-dd"));
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

  const fetchData = async (groupId: string, groupName: string, targetDate = selectedDate) => {
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

      const attSnap = await getDocs(
        query(collection(db, "attendance"), where("date", "==", targetDate))
      );
      const record: AttendanceRecord = {};
      list.forEach(p => record[p.id] = "unset");
      attSnap.forEach(d => {
        const data = d.data();
        if (record[data.patientId] !== undefined) {
          record[data.patientId] = data.status;
        }
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
          patientId: pId,
          date: selectedDate,
          status: newStatus,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) { console.error(err); }
  };

  const changeDate = (days: number) => {
    const current = parseISO(selectedDate);
    const next = addDays(current, days);
    setSelectedDate(format(next, "yyyy-MM-dd"));
  };

  const markAllPresent = async () => {
    const newAttendance = { ...attendance };
    const updates = filteredPatients
      .filter(p => attendance[p.id] === "unset")
      .map(p => {
        newAttendance[p.id] = "present";
        return setDoc(doc(db, "attendance", `${p.id}_${selectedDate}`), {
          patientId: p.id,
          date: selectedDate,
          status: "present",
          updatedAt: new Date().toISOString()
        });
      });
    setAttendance(newAttendance);
    await Promise.all(updates);
  };

  const filteredPatients = patients.filter(p => 
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  const stats = {
    present: Object.values(attendance).filter(v => v === "present").length,
    absent:  Object.values(attendance).filter(v => v === "absent").length,
    total:   patients.length
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pb-32">
      
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/")} className="w-10 h-10 flex items-center justify-center bg-[var(--foreground)]/5 rounded-xl text-[var(--muted)]">
              <ChevronRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-black text-[var(--foreground)] leading-none">נוכחות</h1>
              <p className="text-[10px] text-[var(--muted)] font-bold mt-1 uppercase tracking-widest">Attendance Check</p>
            </div>
          </div>

          {/* Mobile Date Switcher: Compact arrows */}
          <div className="flex md:hidden items-center bg-[var(--foreground)]/5 rounded-xl p-1 border border-[var(--border)]">
            <button onClick={() => changeDate(-1)} className="p-2 text-[var(--muted)]">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-black text-[var(--foreground)] px-2 min-w-[70px] text-center">
              {isSameDay(parseISO(selectedDate), new Date()) ? "היום" : format(parseISO(selectedDate), "d/MM")}
            </span>
            <button onClick={() => changeDate(1)} className="p-2 text-[var(--muted)]">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Desktop Calendar Toggle */}
          <button 
            onClick={() => setShowCalendar(!showCalendar)}
            className="hidden md:flex items-center gap-2 px-4 h-10 bg-[var(--foreground)] rounded-xl text-xs font-black text-[var(--background)] shadow-lg shadow-[var(--foreground)]/10 transition-all"
          >
            <LucideCalendar className="w-4 h-4" />
            {format(parseISO(selectedDate), "d בMMMM", { locale: he })}
          </button>
        </div>

        {/* Group Selector - Clean Horizontal Pill Scroll */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {groups.map(g => (
            <button 
              key={g.id} 
              onClick={() => setSelectedGroup(g.id)}
              className={`whitespace-nowrap px-4 h-8 rounded-xl text-[10px] font-black transition-all ${
                selectedGroup === g.id 
                  ? 'bg-[var(--foreground)] text-[var(--background)]' 
                  : 'text-[var(--muted)]'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>

        {/* Calendar Dropdown - Desktop Only Overlay */}
        <AnimatePresence>
          {showCalendar && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="hidden md:block absolute top-full left-0 right-0 bg-[var(--background)] border-b border-[var(--border)] shadow-2xl z-50 p-4"
            >
              <div className="max-w-sm mx-auto">
                <MiniCalendar value={selectedDate} onChange={(d) => { setSelectedDate(d); setShowCalendar(false); }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-6">
        
        {/* Quick Stats & Search */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]/50" />
              <input 
                type="text" 
                placeholder="חפש מטופל..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-2xl pr-10 pl-4 h-12 text-[11px] font-black outline-none focus:border-[var(--primary)]"
              />
            </div>
            {stats.total > stats.present + stats.absent && (
              <button 
                onClick={markAllPresent}
                className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20"
                title="סמן הכל כנוכח"
              >
                <CheckCircle className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between px-2">
            <div className="flex gap-4">
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-[var(--muted)]/50 uppercase tracking-widest">נוכחות</span>
                <span className="text-sm font-black text-[var(--foreground)]">{stats.present} / {stats.total}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-[var(--muted)]/50 uppercase tracking-widest">היעדרות</span>
                <span className="text-sm font-black text-rose-500">{stats.absent}</span>
              </div>
            </div>
            <div className="h-1 flex-1 max-w-[100px] bg-[var(--foreground)]/5 rounded-full mx-4 overflow-hidden">
              <div 
                className="h-full bg-[var(--foreground)] transition-all duration-500" 
                style={{ width: `${(stats.present / stats.total) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Patient List - Unified Card */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-xl">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-8 h-8 text-[var(--muted)]/20 animate-spin" />
              </motion.div>
            ) : filteredPatients.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-[var(--muted)]/40 italic text-xs gap-3">
                <Users className="w-8 h-8 opacity-20" />
                <p>אין מטופלים להצגה</p>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="divide-y divide-[var(--border-subtle)]">
                {filteredPatients.map((p) => (
                  <AttendanceItem 
                    key={p.id} 
                    patient={p} 
                    status={attendance[p.id] || "unset"} 
                    onToggle={(s) => handleToggle(p.id, s)} 
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
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
