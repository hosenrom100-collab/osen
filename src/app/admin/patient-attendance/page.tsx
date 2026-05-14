"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, doc, setDoc, orderBy } from "firebase/firestore";
import { ClipboardList, ArrowRight, Calendar as CalendarIcon, Search, Loader2, Send, CheckCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AttendanceItem } from "@/components/admin/attendance/AttendanceItem";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { sendPush } from "@/lib/notify";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  hosenType: string;
}

interface Group {
  id: string;
  name: string;
}

interface AttendanceRecord {
  [patientId: string]: "present" | "absent" | "unset";
}

import { Suspense } from "react";

function AttendancePageContent() {
  const searchParams = useSearchParams();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>(searchParams.get("group") || "");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sendingSummary, setSendingSummary] = useState(false);
  const [summarySent, setSummarySent] = useState(false);
  const router = useRouter();
  
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const today = format(new Date(), "yyyy-MM-dd");

  // Fetch patients and attendance for a given group — params passed explicitly to avoid stale closures
  const fetchData = async (groupId: string, groupName: string, targetDate: string = selectedDate) => {
    setLoading(true);
    try {
      const patientsSnap = await getDocs(collection(db, "patients"));
      const patientsList: Patient[] = [];

      patientsSnap.forEach(docSnap => {
        const data = docSnap.data();
        const ht = data.hosenType || "";
        // Match by ID or by name — handles both storage conventions
        if (ht === groupId || (groupName && ht === groupName)) {
          patientsList.push({ id: docSnap.id, ...data } as Patient);
        }
      });

      patientsList.sort((a, b) =>
        (a.firstName || "").localeCompare(b.firstName || "", "he")
      );
      setPatients(patientsList);

      const attendanceSnap = await getDocs(
        query(collection(db, "attendance"), where("date", "==", targetDate))
      );
      const records: AttendanceRecord = {};
      attendanceSnap.forEach(docSnap => {
        const data = docSnap.data();
        records[data.patientId] = data.status;
      });
      setAttendance(records);
    } catch (error) {
      console.error("Error fetching attendance data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load groups on mount; then trigger fetchData with fresh data (no useEffect dependency on groups)
  useEffect(() => {
    const init = async () => {
      try {
        const groupsSnap = await getDocs(query(collection(db, "groups"), orderBy("name")));
        const groupList: Group[] = [];
        groupsSnap.forEach(docSnap =>
          groupList.push({ id: docSnap.id, name: docSnap.data().name })
        );
        setGroups(groupList);

        if (groupList.length === 0) { setLoading(false); return; }

        // Respect URL param or pick first group
        const urlGroup = searchParams.get("group");
        const target = groupList.find(g => g.id === urlGroup) ?? groupList[0];
        setSelectedGroup(target.id);
        await fetchData(target.id, target.name);   // ← called with fresh data, not from closure
      } catch (err) {
        console.error("Error loading groups:", err);
        setLoading(false);
      }
    };
    init();
  }, []); // runs once on mount

  // When user switches group chip — groups state is guaranteed loaded at this point
  const handleGroupChange = (groupId: string) => {
    const g = groups.find(g => g.id === groupId);
    if (!g) return;
    setSelectedGroup(groupId);
    fetchData(groupId, g.name);
  };

  const handleToggleAttendance = async (patientId: string, status: "present" | "absent") => {
    try {
      // Optimistic update for better UX
      setAttendance(prev => ({ ...prev, [patientId]: status }));

      const docId = `${selectedDate}_${patientId}`;
      await setDoc(doc(db, "attendance", docId), {
        date: selectedDate,
        patientId,
        status,
        hosenType: selectedGroup,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error("Error updating attendance:", error);
      // Revert on error — re-fetch with current group
      const g = groups.find(g => g.id === selectedGroup);
      if (g) fetchData(g.id, g.name);
    }
  };

  const filteredPatients = patients.filter(p =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: patients.length,
    present: patients.filter(p => attendance[p.id] === "present").length,
    absent: patients.filter(p => attendance[p.id] === "absent").length,
    missing: patients.filter(p => !attendance[p.id] || attendance[p.id] === "unset").length
  };

  const handleMarkAllPresent = async () => {
    const unmarked = patients.filter(p => !attendance[p.id] || attendance[p.id] === "unset");
    if (unmarked.length === 0) return;

    // Optimistic update first
    const update: AttendanceRecord = { ...attendance };
    unmarked.forEach(p => { update[p.id] = "present"; });
    setAttendance(update);

    await Promise.all(
      unmarked.map(p =>
        setDoc(doc(db, "attendance", `${selectedDate}_${p.id}`), {
          date: selectedDate,
          patientId: p.id,
          status: "present",
          hosenType: selectedGroup,
          updatedAt: new Date(),
        })
      )
    );
  };

  const handleSendSummary = async () => {
    setSendingSummary(true);
    const groupName = groups.find(g => g.id === selectedGroup)?.name || selectedGroup;
    const dateStr = format(new Date(), "d/M/yyyy");
    await sendPush({
      role: ["admin", "manager"],
      title: `סיכום נוכחות – ${groupName}`,
      body: `${dateStr}: ${stats.present} נוכחים מתוך ${stats.total} (${stats.missing} טרם נסמנו)`,
      link: "/admin/patient-attendance",
    });
    setSendingSummary(false);
    setSummarySent(true);
    setTimeout(() => setSummarySent(false), 3000);
  };

  const pct = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
  const allDone = stats.total > 0 && stats.missing === 0;

  // Unset first → absent → present; alphabetical within each group
  const sortOrder = { unset: 0, absent: 1, present: 2 } as const;
  const sortedPatients = [...filteredPatients].sort((a, b) => {
    const aS = (attendance[a.id] || "unset") as keyof typeof sortOrder;
    const bS = (attendance[b.id] || "unset") as keyof typeof sortOrder;
    if (sortOrder[aS] !== sortOrder[bS]) return sortOrder[aS] - sortOrder[bS];
    return (a.firstName || "").localeCompare(b.firstName || "", "he");
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3 space-y-3">

          {/* Row 1: back · title · send */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all flex-shrink-0"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[17px] font-bold leading-tight">נוכחות מטופלים</h1>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {format(new Date(), "EEEE, d בMMMM", { locale: he })}
              </p>
            </div>
            <button
              onClick={handleSendSummary}
              disabled={sendingSummary || stats.total === 0}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all flex-shrink-0 border ${
                summarySent
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : "bg-white/5 border-white/10 text-slate-400 disabled:opacity-40"
              }`}
            >
              {sendingSummary ? <Loader2 className="w-3 h-3 animate-spin" /> :
               summarySent    ? <CheckCircle className="w-3 h-3" /> :
                               <Send className="w-3 h-3" />}
              {summarySent ? "נשלח" : "שלח סיכום"}
            </button>
          </div>

          {/* Row 2: stats */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: "סה״כ",    value: stats.total,   cls: "text-white",        bg: "bg-white/5 border-white/5" },
              { label: "נוכחים",  value: stats.present, cls: "text-emerald-400",  bg: "bg-emerald-500/5 border-emerald-500/10" },
              { label: "נעדרים",  value: stats.absent,  cls: "text-rose-400",     bg: "bg-rose-500/5 border-rose-500/10" },
              { label: "נותרו",   value: stats.missing, cls: "text-blue-400",     bg: "bg-blue-500/5 border-blue-500/10" },
            ].map(s => (
              <div key={s.label} className={`${s.bg} border rounded-xl py-2 px-1 text-center`}>
                <div className={`text-xl font-black ${s.cls}`}>{s.value}</div>
                <div className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Row 3: progress bar */}
          {stats.total > 0 && (
            <div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-emerald-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-slate-600 font-bold">{pct}% נוכחות</span>
                {stats.missing > 0 && (
                  <span className="text-[10px] text-blue-500 font-bold">{stats.missing} נותרו</span>
                )}
              </div>
            </div>
          )}

          {/* Row 4: group tabs */}
          {groups.length > 1 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => handleGroupChange(g.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                    selectedGroup === g.id
                      ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/25"
                      : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {/* Row 5: search + mark all */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="חיפוש מטופל..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pr-10 pl-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            {stats.missing > 0 && !searchTerm && (
              <button
                onClick={handleMarkAllPresent}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-3 bg-emerald-600/15 border border-emerald-500/30 rounded-xl text-[11px] font-bold text-emerald-400 active:bg-emerald-600/25 transition-all"
              >
                <CheckCircle className="w-4 h-4" />
                <span className="hidden sm:inline">סמן הכל נוכחים</span>
                <span className="sm:hidden">הכל</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* ── Content Area with Sidebar ── */}
      <div className="flex-1 flex max-w-[1440px] mx-auto w-full px-4 lg:px-8 gap-8">
        {/* Sidebar - Desktop Only */}
        <aside className="hidden lg:block w-72 pt-8 sticky top-20 h-[calc(100vh-80px)] overflow-y-auto no-scrollbar">
          <div className="bg-white/5 border border-white/10 rounded-[2rem] p-5 shadow-xl">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-emerald-400" />
              בחר תאריך
            </h3>
            <MiniCalendar 
              value={selectedDate} 
              onChange={(d) => {
                setSelectedDate(d);
                const g = groups.find(g => g.id === selectedGroup);
                if (g) fetchData(selectedGroup, g.name, d);
              }} 
            />
            
            <div className="mt-6 pt-6 border-t border-white/5">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">סטטוס יום</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedDate === today ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"}`}>
                    {selectedDate === today ? "היום" : "היסטוריה"}
                  </span>
                </div>
                <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    מציג נתוני נוכחות עבור {format(new Date(selectedDate), "d בMMMM", { locale: he })}. שינויים נשמרים אוטומטית.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 py-8 pb-28">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-slate-500 text-sm">טוען מטופלים...</p>
            </div>
          ) : sortedPatients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <ClipboardList className="w-10 h-10 text-slate-700" />
              <p className="text-slate-500 text-sm">
                {searchTerm ? "לא נמצאו תוצאות" : "לא נמצאו מטופלים בקבוצה זו"}
              </p>
            </div>
          ) : (
            <>
              {/* Completion banner */}
              <AnimatePresence>
                {allDone && !searchTerm && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mb-6 flex items-center justify-center gap-2 py-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl"
                  >
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-bold text-sm">
                      הנוכחות הושלמה · {stats.present} נוכחים, {stats.absent} נעדרים
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {/* Grid container - responsive columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">
                  {sortedPatients.map(patient => (
                    <motion.div
                      key={patient.id}
                      layout="position"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{
                        opacity: attendance[patient.id] === "present" ? 0.7 : 1,
                        y: 0
                      }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.2 }}
                    >
                      <AttendanceItem
                        patient={patient}
                        status={attendance[patient.id] || "unset"}
                        onToggle={s => handleToggleAttendance(patient.id, s)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── MiniCalendar Component ──────────────────────────────────────────────────

import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

function MiniCalendar({ value, onChange }: { value: string, onChange: (d: string) => void }) {
  const selectedDate = new Date(value);
  const [viewDate, setViewDate] = useState(new Date(value));
  
  const start = startOfWeek(startOfMonth(viewDate));
  const end = endOfWeek(endOfMonth(viewDate));
  const days = eachDayOfInterval({ start, end });

  const weekDays = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-4 px-1">
        <span className="text-xs font-black text-white">
          {format(viewDate, "MMMM yyyy", { locale: he })}
        </span>
        <div className="flex gap-1">
          <button 
            onClick={() => setViewDate(subMonths(viewDate, 1))}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
          <button 
            onClick={() => setViewDate(addMonths(viewDate, 1))}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map(d => (
          <div key={d} className="text-[10px] font-black text-slate-600 text-center py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, viewDate);
          
          return (
            <button
              key={i}
              onClick={() => onChange(format(day, "yyyy-MM-dd"))}
              className={`
                aspect-square rounded-lg text-[10px] font-bold flex items-center justify-center transition-all
                ${isSelected ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" : 
                  isToday ? "bg-white/10 text-emerald-400" :
                  isCurrentMonth ? "text-slate-300 hover:bg-white/5" : "text-slate-700 hover:bg-white/5"}
              `}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AttendancePage() {
  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "employee", "social_worker", "logistics"]} redirectTo="/">
      <Suspense fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        </div>
      }>
        <AttendancePageContent />
      </Suspense>
    </RoleGuard>
  );
}
