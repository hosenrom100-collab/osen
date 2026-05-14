"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, Suspense } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, doc, setDoc, orderBy } from "firebase/firestore";
import {
  ClipboardList, ArrowRight, Calendar as CalendarIcon, Search,
  Loader2, Send, CheckCircle, Check, X, ChevronLeft, ChevronRight, Info,
  Users, LayoutGrid, Calendar
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AttendanceItem } from "@/components/admin/attendance/AttendanceItem";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
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
    <div className="select-none bg-[var(--foreground)]/[0.02] border border-[var(--border)] rounded-[2rem] p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm font-black text-[var(--foreground)] uppercase tracking-tight">{format(view, "MMMM yyyy", { locale: he })}</span>
        <div className="flex gap-1">
          <button onClick={() => setView(subMonths(view, 1))} className="p-2 rounded-xl hover:bg-[var(--foreground)]/5 transition-colors border border-transparent hover:border-[var(--border)]"><ChevronRight className="w-4 h-4 text-[var(--foreground)]/40" /></button>
          <button onClick={() => setView(addMonths(view, 1))} className="p-2 rounded-xl hover:bg-[var(--foreground)]/5 transition-colors border border-transparent hover:border-[var(--border)]"><ChevronLeft className="w-4 h-4 text-[var(--foreground)]/40" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WD.map(d => <div key={d} className="text-[10px] font-black text-[var(--foreground)]/30 text-center py-1 uppercase tracking-widest">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const isSel   = isSameDay(day, sel);
          const isToday = isSameDay(day, new Date());
          const inMonth = isSameMonth(day, view);
          return (
            <button key={i} onClick={() => onChange(format(day, "yyyy-MM-dd"))}
              className={`aspect-square rounded-xl text-[11px] font-black flex items-center justify-center transition-all ${
                isSel   ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30" :
                isToday ? "bg-[var(--foreground)]/10 text-emerald-600" :
                inMonth ? "text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/10" : "text-[var(--foreground)]/10"
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
  }, [selectedGroup, selectedDate]);

  const fetchData = async (groupId: string, groupName: string, targetDate = selectedDate) => {
    setLoading(true);
    try {
      const pSnap = await getDocs(collection(db, "patients"));
      const list: Patient[] = [];
      pSnap.forEach(d => {
        const data = d.data();
        if (data.hosenType === groupId || data.hosenType === groupName) {
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
      await setDoc(doc(db, "attendance", attId), {
        patientId: pId,
        date: selectedDate,
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (err) { console.error(err); }
  };

  const filteredPatients = patients.filter(p => 
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    present: Object.values(attendance).filter(v => v === "present").length,
    absent:  Object.values(attendance).filter(v => v === "absent").length,
    total:   patients.length
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button onClick={() => router.push("/")} className="w-10 h-10 rounded-2xl bg-[var(--foreground)]/5 border border-[var(--border)] flex items-center justify-center hover:bg-[var(--foreground)]/10 transition-all">
              <ChevronLeft className="w-5 h-5 rotate-180" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-xl font-black tracking-tight leading-none mb-1">נוכחות מטופלים</h1>
              <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest flex items-center gap-2">
                <span>{format(new Date(selectedDate), "dd MMMM yyyy", { locale: he })}</span>
              </p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-3 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl px-4 py-2 w-[400px]">
            <Search className="w-4 h-4 text-[var(--foreground)]/20" />
            <input type="text" placeholder="חיפוש מטופל..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-[var(--foreground)]/20 font-medium" />
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* ── Sidebar: Filters ── */}
          <aside className="lg:col-span-3 space-y-6">
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] p-8 shadow-sm">
               <h3 className="text-sm font-black uppercase tracking-widest text-[var(--foreground)]/40 mb-6 flex items-center gap-2">
                 <LayoutGrid className="w-4 h-4 text-emerald-500" />
                 בחירת קבוצה
               </h3>
               <div className="space-y-2">
                 {groups.map(g => (
                   <button 
                    key={g.id} 
                    onClick={() => setSelectedGroup(g.id)}
                    className={`w-full text-right px-4 py-3 rounded-2xl text-sm font-bold transition-all border ${
                      selectedGroup === g.id 
                        ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-600 shadow-sm' 
                        : 'border-transparent hover:bg-[var(--foreground)]/5 text-[var(--foreground)]/60'
                    }`}
                   >
                     {g.name}
                   </button>
                 ))}
               </div>
            </div>

            <MiniCalendar value={selectedDate} onChange={setSelectedDate} />
          </aside>

          {/* ── Main: Patient Grid ── */}
          <div className="lg:col-span-9 space-y-8">
            
            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-4">
               {[
                 { label: "נוכחים", value: stats.present, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                 { label: "נעדרים", value: stats.absent, color: "text-rose-500", bg: "bg-rose-500/10" },
                 { label: "סה״כ", value: stats.total, color: "text-blue-500", bg: "bg-blue-500/10" },
               ].map((s, i) => (
                 <div key={i} className={`p-6 rounded-[2rem] border border-[var(--border)] bg-[var(--card-bg)] shadow-sm`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/30 mb-1">{s.label}</p>
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                 </div>
               ))}
            </div>

            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[3rem] p-8 min-h-[500px]">
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-32 gap-4">
                    <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                    <p className="text-sm font-black text-[var(--foreground)]/20 uppercase tracking-widest">טוען רשימת מטופלים...</p>
                  </motion.div>
                ) : filteredPatients.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-32 opacity-20 italic">
                    <Users className="w-12 h-12 mb-4" />
                    <p>לא נמצאו מטופלים בקבוצה זו</p>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
          </div>
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
