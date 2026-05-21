"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, Suspense } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, doc, setDoc, deleteDoc } from "firebase/firestore";
import {
  Search, Loader2, ChevronLeft, ChevronRight,
  Calendar as CalendarIcon, Users, CheckCircle,
  ClipboardList, Filter, Check, X, Share2
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AttendanceItem } from "@/components/admin/attendance/AttendanceItem";
import { useAuth } from "@/context/AuthContext";
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
interface Group { id: string; name: string; programId?: string }
interface SelectionItem { id: string; name: string; type: 'program' | 'group' }
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
  const { preferredProgramIds, preferredGroupIds } = useAuth();

  const [selectionItems, setSelectionItems] = useState<SelectionItem[]>([]);
  const [selectedId,     setSelectedId]     = useState<string>(searchParams.get("group") || "");
  const [patients,       setPatients]       = useState<Patient[]>([]);
  const [attendance,     setAttendance]     = useState<AttendanceRecord>({});
  const [loading,        setLoading]        = useState(true);
  const [searchTerm,     setSearchTerm]     = useState("");
  const [selectedDate,   setSelectedDate]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [showCalendar,   setShowCalendar]   = useState(false);
  const [copied,         setCopied]         = useState(false);

  const copyAttendanceToClipboard = () => {
    const activeSelection = selectionItems.find(item => item.id === selectedId);
    const programName = activeSelection ? activeSelection.name : "כללי";
    const presentList = filteredPatients.filter(p => attendance[p.id] === "present");

    const dateStr = format(parseISO(selectedDate), "dd/MM/yyyy");
    const dayName = format(parseISO(selectedDate), "EEEE", { locale: he });

    let text = `*דוח נוכחות - ${programName}*\n`;
    text += `יום ${dayName} (${dateStr})\n\n`;
    text += `*נוכחים:* \n`;
    
    if (presentList.length === 0) {
      text += `אין נוכחים רשומים.`;
    } else {
      presentList.forEach((p, idx) => {
        text += `• ${p.firstName} ${p.lastName}\n`;
      });
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error("Failed to copy text: ", err);
    });
  };

  // Local persistent display filters
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempPrefPrograms, setTempPrefPrograms] = useState<string[]>([]);
  const [tempPrefGroups, setTempPrefGroups] = useState<string[]>([]);
  const [allProgramsForModal, setAllProgramsForModal] = useState<{ id: string, name: string }[]>([]);
  const [allGroupsForModal, setAllGroupsForModal] = useState<{ id: string, name: string, programId: string }[]>([]);

  const openFilterModal = async () => {
    let savedProgs: string[] = [];
    let savedGroups: string[] = [];
    let hasLocal = false;
    if (typeof window !== "undefined") {
      const sp = localStorage.getItem("hosen_attendance_pref_programs");
      const sg = localStorage.getItem("hosen_attendance_pref_groups");
      if (sp) {
        savedProgs = JSON.parse(sp);
        hasLocal = true;
      }
      if (sg) {
        savedGroups = JSON.parse(sg);
        hasLocal = true;
      }
    }

    let progsList: any[] = [];
    let groupsList: any[] = [];
    try {
      const [progSnap, groupSnap] = await Promise.all([
        getDocs(collection(db, "programs")),
        getDocs(collection(db, "groups"))
      ]);
      progsList = progSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
      groupsList = groupSnap.docs.map(d => ({ id: d.id, name: d.data().name, programId: d.data().programId }));
      
      setAllProgramsForModal(progsList);
      setAllGroupsForModal(groupsList);
    } catch (err) {
      console.error("Error loading programs/groups for modal filter:", err);
    }

    if (hasLocal) {
      setTempPrefPrograms(savedProgs);
      setTempPrefGroups(savedGroups);
    } else {
      // Pre-check all programs and groups by default on first load
      setTempPrefPrograms(progsList.map(p => p.id));
      setTempPrefGroups(groupsList.map(g => g.id));
    }
    setShowFilterModal(true);
  };

  const saveFilters = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("hosen_attendance_pref_programs", JSON.stringify(tempPrefPrograms));
      localStorage.setItem("hosen_attendance_pref_groups", JSON.stringify(tempPrefGroups));
    }
    setShowFilterModal(false);
    setReloadTrigger(prev => prev + 1);
  };

  const toggleModalProgram = (progId: string) => {
    setTempPrefPrograms(prev => 
      prev.includes(progId) ? prev.filter(id => id !== progId) : [...prev, progId]
    );
  };

  const toggleModalGroup = (groupId: string) => {
    setTempPrefGroups(prev => 
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  useEffect(() => {
    const loadSelections = async () => {
      const [progSnap, groupSnap] = await Promise.all([
        getDocs(collection(db, "programs")),
        getDocs(collection(db, "groups"))
      ]);
      
      const progs = progSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
      const groups = groupSnap.docs.map(d => ({ id: d.id, name: d.data().name, programId: d.data().programId }));
      
      const items: SelectionItem[] = [];
      progs.forEach(p => {
        const pGroups = groups.filter(g => g.programId === p.id);
        if (pGroups.length === 0) {
          items.push({ id: p.id, name: p.name, type: 'program' });
        } else {
          pGroups.forEach(g => {
            items.push({ id: g.id, name: `${p.name} - ${g.name}`, type: 'group' });
          });
        }
      });
      
      // Filter selections based on user preferences in localStorage (or show all by default)
      let savedProgs: string[] = [];
      let savedGroups: string[] = [];
      let hasLocalPrefs = false;
      if (typeof window !== "undefined") {
        const sp = localStorage.getItem("hosen_attendance_pref_programs");
        const sg = localStorage.getItem("hosen_attendance_pref_groups");
        if (sp) {
          savedProgs = JSON.parse(sp);
          hasLocalPrefs = true;
        }
        if (sg) {
          savedGroups = JSON.parse(sg);
          hasLocalPrefs = true;
        }
      }

      let filteredItems = items;
      if (hasLocalPrefs) {
        filteredItems = items.filter(item => {
          if (item.type === 'program') {
            return savedProgs.includes(item.id);
          } else {
            const groupDoc = groups.find(g => g.id === item.id);
            const inPrefGroup = savedGroups.includes(item.id);
            const inPrefProgram = groupDoc?.programId ? savedProgs.includes(groupDoc.programId) : false;
            return inPrefGroup || inPrefProgram;
          }
        });
      }
      
      setSelectionItems(filteredItems);
      
      const urlGroup = searchParams.get("group");
      if (urlGroup) {
        setSelectedId(urlGroup);
      } else if (!selectedId && filteredItems.length > 0) {
        setSelectedId(filteredItems[0].id);
      }
    };
    loadSelections();
  }, [preferredProgramIds, preferredGroupIds, reloadTrigger]);

  useEffect(() => {
    if (selectedId && selectionItems.length > 0) {
      const selection = selectionItems.find(item => item.id === selectedId);
      if (selection) {
        fetchData(selection);
      }
    }
  }, [selectedId, selectedDate, selectionItems]);

  const fetchData = async (selection: SelectionItem) => {
    setLoading(true);
    try {
      const pSnap = await getDocs(collection(db, "patients"));
      const list: Patient[] = [];
      pSnap.forEach(d => {
        const data = d.data();
        if (data.status === "active") {
          const isMatch = selection.type === 'group'
            ? (data.hosenType === selection.id || (Array.isArray(data.groupIds) && data.groupIds.includes(selection.id)))
            : (data.programId === selection.id || (Array.isArray(data.programIds) && data.programIds.includes(selection.id)));
            
          if (isMatch) {
            list.push({ id: d.id, ...data } as Patient);
          }
        }
      });
      list.sort((a, b) => {
        const lnA = a.lastName || "";
        const lnB = b.lastName || "";
        const cmp = lnA.localeCompare(lnB, 'he');
        if (cmp !== 0) return cmp;
        return (a.firstName || "").localeCompare(b.firstName || "", 'he');
      });
      setPatients(list);

      const attSnap = await getDocs(query(collection(db, "attendance"), where("date", "==", selectedDate)));
      const record: AttendanceRecord = {};
      list.forEach(p => record[p.id] = "unset");
      attSnap.forEach(d => {
        const data = d.data();
        if (data.patientId && record[data.patientId] !== undefined) {
          if (!data.contextId || data.contextId === selectedId || data.programId === selectedId || data.groupId === selectedId) {
            record[data.patientId] = data.status;
          }
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
      const attId = `${pId}_${selectedId}_${selectedDate}`;
      if (newStatus === "unset") {
        await deleteDoc(doc(db, "attendance", attId));
      } else {
        await setDoc(doc(db, "attendance", attId), {
          patientId: pId,
          date: selectedDate,
          status: newStatus,
          contextId: selectedId,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) { console.error(err); }
  };

  const markAllPresent = async () => {
    const newAtt = { ...attendance };
    const updates = filteredPatients
      .filter(p => attendance[p.id] === "unset")
      .map(p => {
        newAtt[p.id] = "present";
        return setDoc(doc(db, "attendance", `${p.id}_${selectedId}_${selectedDate}`), {
          patientId: p.id,
          date: selectedDate,
          status: "present",
          contextId: selectedId,
          updatedAt: new Date().toISOString(),
        });
      });
    setAttendance(newAtt);
    await Promise.all(updates);
  };

  const changeDate = (days: number) => {
    const next = addDays(parseISO(selectedDate), days);
    setSelectedDate(format(next, "yyyy-MM-dd"));
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
            
            <button 
              onClick={openFilterModal}
              title="סינון תוכניות וקבוצות"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-all active:scale-90"
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>

          {/* Desktop: calendar toggle button */}
          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => router.push("/admin/attendance-matrix")}
              className="flex items-center gap-2 px-4 h-9 bg-violet-500/10 border border-violet-500/20 rounded-xl text-xs font-black text-violet-400 hover:bg-violet-500/20 transition-colors">
              <ClipboardList className="w-3.5 h-3.5" />
              מבט טבלאי (אקסל)
            </button>
            <button onClick={() => setShowCalendar(!showCalendar)}
              className="flex items-center gap-2 px-4 h-9 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl text-xs font-black hover:bg-[var(--foreground)]/10 transition-colors">
              <CalendarIcon className="w-3.5 h-3.5 text-emerald-500" />
              {dayLabel} · {dateLabel}
            </button>
          </div>
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

        {/* Selection selector */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 pb-3">
          {selectionItems.map(item => (
            <button key={item.id} onClick={() => setSelectedId(item.id)}
              className={`whitespace-nowrap px-4 h-8 rounded-xl text-[11px] font-black transition-all shrink-0 ${
                selectedId === item.id
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "bg-[var(--foreground)]/5 text-[var(--muted)] hover:bg-[var(--foreground)]/10"
              }`}>
              {item.name}
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
            <div className="flex items-center gap-4">
              <button
                onClick={copyAttendanceToClipboard}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-black transition-all ${
                  copied
                    ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                    : "bg-[var(--foreground)]/5 border-[var(--border)] hover:bg-[var(--foreground)]/10 text-[var(--foreground)] active:scale-95 shadow-sm"
                }`}
                title="העתק רשימת נוכחים לוואטסאפ"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5 text-emerald-500" />}
                <span>{copied ? "הועתק!" : "העתק לוואטסאפ"}</span>
              </button>

              <div className="text-left">
                <p className="text-2xl font-black leading-none">{pct}<span className="text-sm font-bold text-[var(--muted)]">%</span></p>
                <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mt-0.5">נוכחות</p>
              </div>
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
            placeholder="חיפוש משתתף..."
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
                <p className="text-sm font-bold italic">אין משתתפים להצגה</p>
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

      {/* ── Filter Modal ── */}
      <AnimatePresence>
        {showFilterModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowFilterModal(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 bottom-4 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md z-50 bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-2xl p-6 overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500">
                    <Filter className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-black">הגדרת תוכניות וקבוצות לתצוגה</h3>
                </div>
                <button 
                  onClick={() => setShowFilterModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--foreground)]/5 text-[var(--muted)] hover:bg-[var(--foreground)]/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1 text-right">
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  סמן את התוכניות והקבוצות שברצונך לראות בסרגל הנוכחות העליון. הגדרה זו תישמר בדפדפן ותשמש אותך בכל כניסה.
                </p>

                {allProgramsForModal.length === 0 ? (
                  <div className="flex items-center justify-center py-8 opacity-40 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                    <span className="text-xs font-bold">טוען רשימה...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {allProgramsForModal.map(prog => {
                      const progGroups = allGroupsForModal.filter(g => g.programId === prog.id);
                      const isProgChecked = tempPrefPrograms.includes(prog.id);

                      return (
                        <div key={prog.id} className="bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl p-4 space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isProgChecked}
                              onChange={() => toggleModalProgram(prog.id)}
                              className="sr-only"
                            />
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                              isProgChecked 
                                ? "bg-rose-500 border-rose-500 text-white" 
                                : "border-[var(--border)] bg-[var(--surface)]"
                            }`}>
                              {isProgChecked && <Check className="w-3.5 h-3.5" />}
                            </div>
                            <span className="text-xs font-black">{prog.name}</span>
                          </label>

                          {progGroups.length > 0 && (
                            <div className="grid grid-cols-1 gap-2 pr-6 border-r border-[var(--border)] mr-2.5">
                              {progGroups.map(group => {
                                const isGroupChecked = tempPrefGroups.includes(group.id);
                                return (
                                  <label key={group.id} className="flex items-center gap-3 cursor-pointer select-none py-1">
                                    <input
                                      type="checkbox"
                                      checked={isGroupChecked}
                                      onChange={() => toggleModalGroup(group.id)}
                                      className="sr-only"
                                    />
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                      isGroupChecked 
                                        ? "bg-rose-500 border-rose-500 text-white" 
                                        : "border-[var(--border)] bg-[var(--surface)]"
                                    }`}>
                                      {isGroupChecked && <Check className="w-3 h-3" />}
                                    </div>
                                    <span className="text-[11px] font-bold text-[var(--muted)]">{group.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-[var(--border)] flex items-center gap-3">
                <button
                  onClick={saveFilters}
                  className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
                >
                  שמור סינון
                </button>
                <button
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      localStorage.removeItem("hosen_attendance_pref_programs");
                      localStorage.removeItem("hosen_attendance_pref_groups");
                    }
                    setShowFilterModal(false);
                    setReloadTrigger(prev => prev + 1);
                  }}
                  className="px-4 py-3 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] rounded-2xl text-xs font-black active:scale-95 transition-all"
                >
                  איפוס
                </button>
              </div>
            </motion.div>
          </>
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
