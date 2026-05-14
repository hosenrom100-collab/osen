"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, Suspense } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, doc, setDoc, orderBy } from "firebase/firestore";
import {
  ClipboardList, ArrowRight, Calendar as CalendarIcon, Search,
  Loader2, Send, CheckCircle, Check, X, ChevronLeft, ChevronRight,
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
    <div dir="rtl" className="min-h-screen bg-slate-950 text-white">

      {/* ══ HEADER ══════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-white/[0.07]">

        {/* Row 1: title + stats */}
        <div className="px-4 md:px-5 flex items-center gap-3 h-12">

          {/* Back — mobile only */}
          <button onClick={() => router.push("/")} aria-label="חזרה"
            className="md:hidden p-2 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all shrink-0">
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Title */}
          <div className="flex items-center gap-2 shrink-0">
            <ClipboardList className="w-4 h-4 text-emerald-400" />
            <h1 className="text-[14px] font-semibold">נוכחות מטופלים</h1>
            <span className="text-[11px] text-slate-500 hidden md:inline">
              {format(new Date(selectedDate + "T12:00:00"), "EEEE, d בMMMM", { locale: he })}
            </span>
          </div>

          {/* Desktop inline stats */}
          {stats.total > 0 && (
            <div className="hidden md:flex items-center gap-3 text-xs font-semibold mr-4">
              <span className="text-slate-400">{stats.total} סה"כ</span>
              <span className="text-emerald-400">✓ {stats.present} נוכחים</span>
              <span className="text-rose-400">✗ {stats.absent} נעדרים</span>
              {stats.missing > 0 && <span className="text-blue-400">○ {stats.missing} נותרו</span>}
            </div>
          )}

          {/* Send summary */}
          <button onClick={handleSendSummary} disabled={sendingSummary || stats.total === 0}
            className={`mr-auto flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all border shrink-0 ${
              summarySent
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-white/5 border-white/[0.07] text-slate-400 disabled:opacity-40"
            }`}>
            {sendingSummary ? <Loader2 className="w-3 h-3 animate-spin" />
             : summarySent   ? <CheckCircle className="w-3 h-3" />
             :                 <Send className="w-3 h-3" />}
            {summarySent ? "נשלח" : "שלח סיכום"}
          </button>
        </div>

        {/* Progress + mobile stats */}
        {stats.total > 0 && (
          <div className="px-4 md:px-5 pb-1">
            {/* Mobile stats grid */}
            <div className="grid grid-cols-4 gap-1.5 mb-2 md:hidden">
              {[
                { label: "סה״כ",   value: stats.total,   cls: "text-white",       bg: "bg-white/5" },
                { label: "נוכחים", value: stats.present, cls: "text-emerald-400", bg: "bg-emerald-500/5" },
                { label: "נעדרים", value: stats.absent,  cls: "text-rose-400",    bg: "bg-rose-500/5" },
                { label: "נותרו",  value: stats.missing, cls: "text-blue-400",    bg: "bg-blue-500/5" },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-xl py-1.5 text-center`}>
                  <div className={`text-lg font-black ${s.cls}`}>{s.value}</div>
                  <div className="text-[9px] text-slate-500 font-bold uppercase">{s.label}</div>
                </div>
              ))}
            </div>
            {/* Progress bar */}
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div className="h-full bg-emerald-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
            <div className="flex justify-between mt-0.5 md:hidden">
              <span className="text-[9px] text-slate-600 font-semibold">{pct}% נוכחות</span>
              {stats.missing > 0 && <span className="text-[9px] text-blue-500 font-semibold">{stats.missing} נותרו</span>}
            </div>
          </div>
        )}

        {/* Group chips + search + mark all */}
        <div className="px-4 md:px-5 pb-2 flex flex-wrap items-center gap-2">
          {/* Group chips */}
          {groups.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              {groups.map(g => (
                <button key={g.id} onClick={() => handleGroupChange(g.id)}
                  className={`shrink-0 px-3 py-1.5 rounded text-xs font-semibold transition-all border ${
                    selectedGroup === g.id
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-white/5 border-white/[0.07] text-slate-400 hover:border-white/20"
                  }`}>
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input type="text" placeholder="חיפוש מטופל..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/[0.07] rounded py-1.5 pr-8 pl-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Mark all present */}
          {stats.missing > 0 && !searchTerm && (
            <button onClick={handleMarkAllPresent}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/10 border border-emerald-500/20 rounded text-xs font-semibold text-emerald-400 hover:bg-emerald-600/15 transition-all">
              <CheckCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">סמן הכל נוכחים</span>
              <span className="sm:hidden">הכל</span>
            </button>
          )}

          {/* Date — desktop compact */}
          <span className="hidden md:inline text-[11px] text-slate-600 mr-auto">
            {selectedDate === today ? "היום" : format(new Date(selectedDate + "T12:00:00"), "dd/MM/yyyy")}
          </span>
        </div>
      </header>

      {/* ══ CONTENT ═════════════════════════════════════════════════════════════ */}
      <div className="flex max-w-[1400px] mx-auto w-full px-4 md:px-5 gap-6 pt-4 pb-28">

        {/* ── Main area ── */}
        <main className="flex-1 min-w-0">

          {/* Completion banner */}
          <AnimatePresence>
            {allDone && !searchTerm && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mb-4 flex items-center justify-center gap-2 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm font-semibold text-emerald-400">
                <CheckCircle className="w-4 h-4" />
                הנוכחות הושלמה · {stats.present} נוכחים, {stats.absent} נעדרים
              </motion.div>
            )}
          </AnimatePresence>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
              <p className="text-slate-500 text-sm">טוען מטופלים...</p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <ClipboardList className="w-10 h-10 text-slate-700" />
              <p className="text-slate-500 text-sm">{searchTerm ? "לא נמצאו תוצאות" : "לא נמצאו מטופלים בקבוצה זו"}</p>
            </div>
          ) : (
            <>
              {/* ── Desktop table ── */}
              <div className="hidden md:block border border-white/[0.07] rounded-lg overflow-hidden">
                <table className="w-full text-right">
                  <thead>
                    <tr className="border-b border-white/[0.07] bg-white/[0.02]">
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-8">#</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">שם מטופל</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center w-28">סטטוס</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center w-24">נוכח</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center w-24">נפקד</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((p, idx) => {
                      const status    = attendance[p.id] || "unset";
                      const isPresent = status === "present";
                      const isAbsent  = status === "absent";
                      const ini       = initials(p);
                      return (
                        <tr key={p.id}
                          className={`border-b border-white/[0.04] transition-colors ${
                            isPresent ? "bg-emerald-500/[0.03] hover:bg-emerald-500/[0.05]" :
                            isAbsent  ? "bg-rose-500/[0.03]    hover:bg-rose-500/[0.05]" :
                                        "hover:bg-white/[0.02]"
                          }`}>
                          {/* # */}
                          <td className="px-3 py-2 text-[11px] text-slate-600 font-mono">{idx + 1}</td>

                          {/* Name */}
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded shrink-0 flex items-center justify-center text-[10px] font-black text-white ${
                                status === "unset" ? "bg-slate-700" : avatarColor(p.firstName)
                              }`}>{ini}</div>
                              <span className="text-sm font-medium">{p.firstName} {p.lastName}</span>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded ${
                              isPresent ? "text-emerald-400 bg-emerald-500/10" :
                              isAbsent  ? "text-rose-400 bg-rose-500/10" :
                                          "text-slate-600 bg-white/5"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                isPresent ? "bg-emerald-400" : isAbsent ? "bg-rose-400" : "bg-slate-700"
                              }`} />
                              {isPresent ? "נוכח" : isAbsent ? "נפקד" : "טרם נסמן"}
                            </span>
                          </td>

                          {/* Present btn */}
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => handleToggle(p.id, "present")}
                              className={`inline-flex items-center gap-1 px-3 h-7 rounded text-[11px] font-semibold transition-all ${
                                isPresent
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white/5 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                              }`}>
                              <Check className="w-3 h-3" /> נוכח
                            </button>
                          </td>

                          {/* Absent btn */}
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => handleToggle(p.id, "absent")}
                              className={`inline-flex items-center gap-1 px-3 h-7 rounded text-[11px] font-semibold transition-all ${
                                isAbsent
                                  ? "bg-rose-600 text-white"
                                  : "bg-white/5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                              }`}>
                              <X className="w-3 h-3" /> נפקד
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Table footer summary */}
                {displayed.length > 0 && (
                  <div className="px-4 py-2 bg-white/[0.015] border-t border-white/[0.05] flex items-center gap-4 text-[11px] text-slate-500">
                    <span>{stats.total} מטופלים</span>
                    <span className="text-emerald-500">{stats.present} נוכחים</span>
                    <span className="text-rose-500">{stats.absent} נעדרים</span>
                    {stats.missing > 0 && <span className="text-blue-500">{stats.missing} טרם נסמנו</span>}
                    <span className="mr-auto font-semibold text-white">{pct}%</span>
                  </div>
                )}
              </div>

              {/* ── Mobile cards ── */}
              <div className="md:hidden space-y-2">
                <AnimatePresence mode="popLayout">
                  {displayed.map(p => (
                    <motion.div key={p.id} layout="position"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: attendance[p.id] === "present" ? 0.75 : 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.15 }}>
                      <AttendanceItem
                        patient={p}
                        status={attendance[p.id] || "unset"}
                        onToggle={s => handleToggle(p.id, s)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </main>

        {/* ── Calendar sidebar — desktop only ── */}
        <aside className="hidden lg:block w-60 shrink-0 pt-0">
          <div className="sticky top-[130px] bg-white/[0.03] border border-white/[0.07] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-300">בחר תאריך</span>
            </div>
            <MiniCalendar
              value={selectedDate}
              onChange={(d) => {
                setSelectedDate(d);
                const g = groups.find(g => g.id === selectedGroup);
                if (g) fetchData(selectedGroup, g.name, d);
              }}
            />
            <div className="mt-3 pt-3 border-t border-white/[0.07]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-600 font-semibold uppercase">סטטוס</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  selectedDate === today
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-blue-500/10 text-blue-400"
                }`}>
                  {selectedDate === today ? "היום" : "היסטוריה"}
                </span>
              </div>
              <p className="mt-2 text-[10px] text-slate-600 leading-relaxed">
                נתוני {format(new Date(selectedDate + "T12:00:00"), "d בMMMM", { locale: he })}.
                שינויים נשמרים אוטומטית.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  return (
    <RoleGuard allowedRoles={["admin","manager","instructor","employee","social_worker","logistics"]} redirectTo="/">
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
