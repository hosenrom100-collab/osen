"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, Suspense } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, doc, setDoc, orderBy } from "firebase/firestore";
import {
  ClipboardList, ArrowRight, Calendar as CalendarIcon, Search,
  Loader2, Send, CheckCircle, Check, X, ChevronLeft, ChevronRight, Info
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AttendanceItem } from "@/components/admin/attendance/AttendanceItem";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
} from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { sendPush } from "@/lib/notify";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  hosenType: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}
interface Group { id: string; name: string }
interface AttendanceRecord { [patientId: string]: "present" | "absent" | "unset" }

const AVATAR_COLORS = ["bg-blue-600","bg-violet-600","bg-rose-600","bg-amber-600","bg-teal-600","bg-indigo-600"];
const avatarColor  = (n: string) => AVATAR_COLORS[(n?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
const initials     = (p: Patient) => `${p.firstName?.[0] ?? ""}${p.lastName?.[0] ?? ""}`.toUpperCase();

// ─── MiniCalendar ─────────────────────────────────────────────────────────────

function MiniCalendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const sel = new Date(value);
  const [view, setView] = useState(new Date(value));
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(view)), end: endOfWeek(endOfMonth(view)) });
  const WD = ["א","ב","ג","ד","ה","ו","ש"];
  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-white">{format(view, "MMMM yyyy", { locale: he })}</span>
        <div className="flex gap-0.5">
          <button onClick={() => setView(subMonths(view, 1))} className="p-1 rounded hover:bg-white/10 transition-colors"><ChevronRight className="w-3.5 h-3.5 text-slate-400" /></button>
          <button onClick={() => setView(addMonths(view, 1))} className="p-1 rounded hover:bg-white/10 transition-colors"><ChevronLeft className="w-3.5 h-3.5 text-slate-400" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WD.map(d => <div key={d} className="text-[9px] font-bold text-slate-600 text-center py-0.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day, i) => {
          const isSel   = isSameDay(day, sel);
          const isToday = isSameDay(day, new Date());
          const inMonth = isSameMonth(day, view);
          return (
            <button key={i} onClick={() => onChange(format(day, "yyyy-MM-dd"))}
              className={`aspect-square rounded text-[10px] font-bold flex items-center justify-center transition-all ${
                isSel   ? "bg-emerald-600 text-white" :
                isToday ? "bg-white/10 text-emerald-400" :
                inMonth ? "text-slate-300 hover:bg-white/8" : "text-slate-700"
              }`}>
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page content ────────────────────────────────────────────────────────

function AttendancePageContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [groups,        setGroups]        = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>(searchParams.get("group") || "");
  const [patients,      setPatients]      = useState<Patient[]>([]);
  const [attendance,    setAttendance]    = useState<AttendanceRecord>({});
  const [loading,       setLoading]       = useState(true);
  const [searchTerm,    setSearchTerm]    = useState("");
  const [sendingSummary, setSendingSummary] = useState(false);
  const [summarySent,    setSummarySent]    = useState(false);
  const [selectedDate,   setSelectedDate]   = useState(format(new Date(), "yyyy-MM-dd"));

  const today = format(new Date(), "yyyy-MM-dd");

  const fetchData = async (groupId: string, groupName: string, targetDate = selectedDate) => {
    setLoading(true);
    try {
      const pSnap = await getDocs(collection(db, "patients"));
      const list: Patient[] = [];
      pSnap.forEach(d => {
        const data = d.data();
        const ht = data.hosenType || "";
        if (ht === groupId || (groupName && ht === groupName))
          list.push({ id: d.id, ...data } as Patient);
      });
      // Primary sort: alphabetical א-ב by first name
      list.sort((a, b) =>
        (a.firstName || "").localeCompare(b.firstName || "", "he") ||
        (a.lastName  || "").localeCompare(b.lastName  || "", "he")
      );
      setPatients(list);

      const aSnap = await getDocs(query(collection(db, "attendance"), where("date", "==", targetDate)));
      const rec: AttendanceRecord = {};
      aSnap.forEach(d => { const x = d.data(); rec[x.patientId] = x.status; });
      setAttendance(rec);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const snap = await getDocs(query(collection(db, "groups"), orderBy("name")));
        const list: Group[] = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
        setGroups(list);
        if (!list.length) { setLoading(false); return; }
        const urlGroup = searchParams.get("group");
        const target   = list.find(g => g.id === urlGroup) ?? list[0];
        setSelectedGroup(target.id);
        await fetchData(target.id, target.name);
      } catch (e) { console.error(e); setLoading(false); }
    };
    init();
  }, []);

  const handleGroupChange = (id: string) => {
    const g = groups.find(g => g.id === id);
    if (!g) return;
    setSelectedGroup(id);
    fetchData(id, g.name);
  };

  const handleToggle = async (patientId: string, status: "present" | "absent") => {
    setAttendance(prev => ({ ...prev, [patientId]: status }));
    try {
      await setDoc(doc(db, "attendance", `${selectedDate}_${patientId}`), {
        date: selectedDate, patientId, status, hosenType: selectedGroup, updatedAt: new Date(),
      });
    } catch (e) {
      console.error(e);
      const g = groups.find(g => g.id === selectedGroup);
      if (g) fetchData(g.id, g.name);
    }
  };

  const handleMarkAllPresent = async () => {
    const unmarked = displayed.filter(p => !attendance[p.id] || attendance[p.id] === "unset");
    if (!unmarked.length) return;
    const update = { ...attendance };
    unmarked.forEach(p => { update[p.id] = "present"; });
    setAttendance(update);
    await Promise.all(
      unmarked.map(p => setDoc(doc(db, "attendance", `${selectedDate}_${p.id}`), {
        date: selectedDate, patientId: p.id, status: "present",
        hosenType: selectedGroup, updatedAt: new Date(),
      }))
    );
  };

  const handleSendSummary = async () => {
    setSendingSummary(true);
    const name = groups.find(g => g.id === selectedGroup)?.name || selectedGroup;
    await sendPush({
      role: ["admin","manager"],
      title: `סיכום נוכחות – ${name}`,
      body: `${format(new Date(), "dd/MM/yyyy")}: ${stats.present} נוכחים מתוך ${stats.total} (${stats.missing} טרם נסמנו)`,
      link: "/admin/patient-attendance",
    });
    setSendingSummary(false);
    setSummarySent(true);
    setTimeout(() => setSummarySent(false), 3000);
  };

  // Filter: active patients within date range matching search
  const displayed = patients.filter(p => {
    if (p.status && p.status !== "active") return false;
    if (p.startDate && selectedDate < p.startDate) return false;
    if (p.endDate   && selectedDate > p.endDate)   return false;
    return `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase());
  });
  // Already sorted alphabetically by fetchData; keep that order

  const stats = {
    total:   displayed.length,
    present: displayed.filter(p => attendance[p.id] === "present").length,
    absent:  displayed.filter(p => attendance[p.id] === "absent").length,
    missing: displayed.filter(p => !attendance[p.id] || attendance[p.id] === "unset").length,
  };
  const pct    = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
  const allDone = stats.total > 0 && stats.missing === 0;

  return (
    <div dir="rtl" className="flex h-screen bg-[#020617] text-slate-200 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* ── Enterprise Header ── */}
        <header className="h-16 shrink-0 bg-slate-900/40 border-b border-white/[0.05] flex items-center justify-between px-6 backdrop-blur-xl z-30">
          <div className="flex items-center gap-6">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="text-slate-500 hover:text-slate-300 cursor-pointer" onClick={() => router.push("/")}>ראשי</span>
              <ChevronLeft className="w-3 h-3 text-slate-600" />
              <span className="text-white font-bold tracking-tight">ניהול נוכחות</span>
            </div>
            
            <div className="h-4 w-px bg-white/10 mx-2 hidden md:block" />

            {/* Title & Group Switcher */}
            <div className="flex items-center gap-4">
              <h1 className="text-sm font-black text-white uppercase tracking-wider hidden lg:block">מעקב יומי</h1>
              <select 
                value={selectedGroup} 
                onChange={e => handleGroupChange(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all cursor-pointer"
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id} className="bg-slate-900">{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative hidden sm:block">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input 
                type="text" 
                placeholder="חיפוש מהיר..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg pr-9 pl-4 py-1.5 text-xs focus:outline-none focus:border-emerald-500/50 w-48 lg:w-64 transition-all"
              />
            </div>

            <div className="w-px h-6 bg-white/5 mx-1" />

            {/* Actions */}
            <button 
              onClick={handleSendSummary}
              disabled={sendingSummary || stats.total === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-lg ${
                summarySent 
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20"
              }`}
            >
              {sendingSummary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {summarySent ? "נשלח בהצלחה" : "שלח סיכום"}
            </button>
          </div>
        </header>

        {/* ── Sub-header / Filter Bar ── */}
        <div className="h-14 shrink-0 bg-slate-950/40 border-b border-white/[0.03] flex items-center justify-between px-6 z-20">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-bold text-slate-400">
                {format(new Date(selectedDate + "T12:00:00"), "EEEE, d בMMMM yyyy", { locale: he })}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
              <div className="flex -space-x-1 rtl:space-x-reverse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className={`w-5 h-5 rounded-full border-2 border-slate-900 bg-slate-700 flex items-center justify-center text-[8px] font-bold`}>
                    {String.fromCharCode(65 + i)}
                  </div>
                ))}
              </div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stats.total} מטופלים רשומים</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {stats.missing > 0 && !searchTerm && (
              <button 
                onClick={handleMarkAllPresent}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-400 text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                סמן הכל כנוכח
              </button>
            )}
          </div>
        </div>

        {/* ── Main Scrollable Area ── */}
        <main className="flex-1 overflow-y-auto p-6 scrollbar-hide bg-[#020617]">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* Completion Banner */}
            <AnimatePresence>
              {allDone && !searchTerm && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }} 
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">הרישום הושלם בהצלחה</h3>
                      <p className="text-xs text-emerald-400/70 font-medium">כל המטופלים סומנו להיום. ניתן לשלוח סיכום להנהלה.</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black text-white">{pct}%</div>
                    <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">שיעור נוכחות</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="relative">
                  <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                  <div className="absolute inset-0 blur-xl bg-emerald-500/20 animate-pulse" />
                </div>
                <p className="text-sm font-bold text-slate-500 animate-pulse">מסנכרן נתונים מהענן...</p>
              </div>
            ) : displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 gap-6 bg-slate-900/20 border border-dashed border-white/10 rounded-3xl">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                  <Search className="w-8 h-8 text-slate-700" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold text-white mb-1">{searchTerm ? "לא נמצאו תוצאות" : "אין מטופלים בקבוצה"}</h3>
                  <p className="text-sm text-slate-500">נסה לשנות את פרמטרי החיפוש או לבחור קבוצה אחרת.</p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950/40 border border-white/[0.05] rounded-2xl overflow-hidden shadow-2xl">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-900/40 border-b border-white/[0.05]">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-16">#</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">מטופל</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">סטטוס נוכחות</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center w-64">פעולות רישום</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {displayed.map((p, idx) => {
                      const status = attendance[p.id] || "unset";
                      const isPresent = status === "present";
                      const isAbsent = status === "absent";
                      const ini = initials(p);
                      
                      return (
                        <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4 text-xs font-mono text-slate-600">{String(idx + 1).padStart(2, '0')}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black text-white shadow-lg transition-transform group-hover:scale-105 ${
                                status === "unset" ? "bg-slate-800" : avatarColor(p.firstName)
                              }`}>
                                {ini}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-white tracking-tight">{p.firstName} {p.lastName}</span>
                                <span className="text-[10px] text-slate-500 font-medium">{p.hosenType}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-center">
                              <span className={`inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg border transition-all ${
                                isPresent ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                isAbsent ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                                "bg-white/5 text-slate-500 border-white/5"
                              }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                  isPresent ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : 
                                  isAbsent ? "bg-rose-400" : "bg-slate-700"
                                }`} />
                                {isPresent ? "נוכח במרכז" : isAbsent ? "נפקד / חסר" : "טרם דווח"}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => handleToggle(p.id, "present")}
                                className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                  isPresent 
                                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40" 
                                    : "bg-white/5 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-400 border border-white/5"
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" /> נוכח
                              </button>
                              <button 
                                onClick={() => handleToggle(p.id, "absent")}
                                className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                  isAbsent 
                                    ? "bg-rose-600 text-white shadow-lg shadow-rose-900/40" 
                                    : "bg-white/5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 border border-white/5"
                                }`}
                              >
                                <X className="w-3.5 h-3.5" /> נפקד
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                
                {/* Table Footer */}
                <div className="bg-slate-900/40 border-t border-white/[0.05] px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">סה"כ נוכחים</span>
                      <span className="text-sm font-black text-emerald-400">{stats.present}</span>
                    </div>
                    <div className="w-px h-6 bg-white/5" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">סה"כ נפקדים</span>
                      <span className="text-sm font-black text-rose-400">{stats.absent}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col text-left">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">אחוז התייצבות</span>
                      <span className="text-sm font-black text-white">{pct}%</span>
                    </div>
                    <div className="w-12 h-12 relative">
                      <svg className="w-full h-full -rotate-90">
                        <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" className="text-white/5" />
                        <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray={125.6} strokeDashoffset={125.6 - (125.6 * pct / 100)} className="text-emerald-500 transition-all duration-1000" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── CRM Right Sidebar ── */}
      <aside className="w-80 shrink-0 bg-slate-900/20 border-r border-white/[0.05] flex flex-col h-full z-40">
        <div className="p-6 border-b border-white/[0.05]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs font-black text-white uppercase tracking-widest">יומן עזר</h2>
            <button onClick={() => setSelectedDate(today)} className="text-[10px] font-bold text-emerald-400 hover:underline">חזור להיום</button>
          </div>
          
          <div className="bg-slate-950/40 border border-white/10 rounded-2xl p-4 shadow-inner">
            <MiniCalendar 
              value={selectedDate} 
              onChange={(d) => {
                setSelectedDate(d);
                const g = groups.find(g => g.id === selectedGroup);
                if (g) fetchData(selectedGroup, g.name, d);
              }} 
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
          {/* Quick Stats Widget */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">סטטיסטיקה יומית</h3>
            <div className="grid grid-cols-1 gap-3">
              {[
                { label: "נוכחות", value: `${pct}%`, sub: `${stats.present} מתוך ${stats.total}`, color: "emerald" },
                { label: "חסרים", value: stats.missing, sub: "ממתינים לדיווח", color: "blue" },
                { label: "היעדרות", value: stats.absent, sub: "דיווחו על אי הגעה", color: "rose" },
              ].map(s => (
                <div key={s.label} className="bg-white/5 border border-white/5 rounded-2xl p-4 transition-transform hover:scale-[1.02] cursor-default">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{s.label}</span>
                    <div className={`w-1.5 h-1.5 rounded-full bg-${s.color}-500 shadow-[0_0_8px_rgba(0,0,0,0.5)]`} />
                  </div>
                  <div className="text-xl font-black text-white mb-0.5">{s.value}</div>
                  <div className="text-[10px] font-bold text-slate-600">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Guide */}
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">טיפ ניהולי</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
              מומלץ לשלוח סיכום יומי לאחר סיום כלל הדיווחים. הסיכום נשלח אוטומטית למנהלים ולרכזי התוכניות הרלוונטיים.
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-950/40 border-t border-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-500">
              HC
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-white">Hosen-Connect CRM</span>
              <span className="text-[8px] text-slate-600 font-mono">v2.4.0-enterprise</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  return (
    <RoleGuard allowedRoles={["admin","manager","instructor","employee","social_worker","logistics"]} redirectTo="/">
      <Suspense fallback={
        <div className="min-h-screen bg-[#020617] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest animate-pulse">מכין את שולחן העבודה...</span>
          </div>
        </div>
      }>
        <AttendancePageContent />
      </Suspense>
    </RoleGuard>
  );
}
