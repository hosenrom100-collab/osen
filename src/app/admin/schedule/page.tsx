"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, setDoc, doc, query, orderBy, getDoc } from "firebase/firestore";
import {
  MapPin, Users, Plus, Trash2, Save, Copy, Clock, Search, CheckCircle,
  Loader2, ChevronLeft, ChevronRight, Edit3, X, Check, Calendar, CopyPlus,
  AlertCircle,
} from "lucide-react";
import { useAutoSave } from "@/hooks/useAutoSave";
import { AutoSaveIndicator } from "@/components/ui/AutoSaveIndicator";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  format, addDays, subDays, parseISO, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isSameMonth,
  addMonths, subMonths, startOfWeek as soW,
} from "date-fns";
import { he } from "date-fns/locale";
import { Suspense } from "react";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface Activity {
  id: string; title: string; startTime: string; endTime: string;
  locationId: string; staffIds: string[]; groupId: string; notes?: string;
}
interface DaySchedule { dutyInstructorId: string; activities: Activity[] }
interface Program  { id: string; name: string }
interface Group    { id: string; name: string; programId?: string }
interface Person   { id: string; name: string }
interface Location { id: string; name: string; permanentStaffIds?: string[] }

// groupId semantics:
//   program.id  → shared within that program (e.g. "חרבות ברזל יום")
//   group.id    → specific group within a program
//   "staff_only"→ staff-only activity
//   "all"       → legacy global (kept for backward compat)

const EMPTY: DaySchedule = { dutyInstructorId: "", activities: [] };
const DAY_NAMES = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const uid = () => Math.random().toString(36).slice(2, 9);

const migrate = (a: any): Activity => ({
  id:         a.id         || uid(),
  title:      a.title      || a.activityType || "",
  startTime:  a.startTime  || "09:00",
  endTime:    a.endTime    || "10:00",
  locationId: a.locationId || "",
  staffIds:   a.staffIds   || (a.instructorId ? [a.instructorId] : []),
  groupId:    a.groupId    || a.hosenType || "all",
  notes:      a.notes      || "",
});

// Group color palette — index 0 = "all", then groups, last = staff_only
const PALETTE = [
  { dot: "bg-blue-500",   border: "border-blue-500/40",   bg: "bg-blue-500/8",   text: "text-blue-400",   chip: "bg-blue-500/10 text-blue-400"   },
  { dot: "bg-violet-500", border: "border-violet-500/40", bg: "bg-violet-500/8", text: "text-violet-400", chip: "bg-violet-500/10 text-violet-400" },
  { dot: "bg-teal-500",   border: "border-teal-500/40",   bg: "bg-teal-500/8",   text: "text-teal-400",   chip: "bg-teal-500/10 text-teal-400"   },
  { dot: "bg-amber-500",  border: "border-amber-500/40",  bg: "bg-amber-500/8",  text: "text-amber-400",  chip: "bg-amber-500/10 text-amber-400"  },
  { dot: "bg-rose-500",   border: "border-rose-500/40",   bg: "bg-rose-500/8",   text: "text-rose-400",   chip: "bg-rose-500/10 text-rose-400"   },
  { dot: "bg-slate-500",  border: "border-slate-500/40",  bg: "bg-slate-500/8",  text: "text-slate-400",  chip: "bg-slate-500/10 text-slate-400"  },
];

/* ─── Mini Calendar ─────────────────────────────────────────────────────── */

function MiniCal({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const sel  = parseISO(value);
  const [view, setView] = useState(new Date(value));
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(view)), end: endOfWeek(endOfMonth(view)) });
  const WD   = ["א","ב","ג","ד","ה","ו","ש"];
  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-xs font-semibold text-slate-300">{format(view, "MMMM yyyy", { locale: he })}</span>
        <div className="flex gap-0.5">
          <button onClick={() => setView(subMonths(view, 1))} className="p-1 rounded hover:bg-white/8 transition-colors"><ChevronRight className="w-3.5 h-3.5 text-slate-500" /></button>
          <button onClick={() => setView(addMonths(view, 1))} className="p-1 rounded hover:bg-white/8 transition-colors"><ChevronLeft  className="w-3.5 h-3.5 text-slate-500" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {WD.map(d => <div key={d} className="text-[9px] font-bold text-slate-600 text-center py-0.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day, i) => {
          const isSel   = isSameDay(day, sel);
          const isToday = isSameDay(day, new Date());
          const inM     = isSameMonth(day, view);
          return (
            <button key={i} onClick={() => onChange(format(day, "yyyy-MM-dd"))}
              className={`aspect-square rounded text-[10px] font-bold flex items-center justify-center transition-all ${
                isSel   ? "bg-rose-600 text-white shadow-sm" :
                isToday ? "ring-1 ring-rose-500/50 text-rose-400" :
                inM     ? "text-slate-300 hover:bg-white/8" : "text-slate-700 hover:bg-white/5"
              }`}>
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Week Strip ────────────────────────────────────────────────────────── */

function WeekStrip({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const sel  = parseISO(date);
  const week = eachDayOfInterval({ start: soW(sel), end: addDays(soW(sel), 6) });
  const HE_SHORT = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
  return (
    <div className="flex gap-1">
      {week.map((day, i) => {
        const isSel   = isSameDay(day, sel);
        const isToday = isSameDay(day, new Date());
        return (
          <button key={i} onClick={() => onChange(format(day, "yyyy-MM-dd"))}
            className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all ${
              isSel
                ? "bg-rose-600 text-white"
                : isToday
                ? "bg-white/5 ring-1 ring-rose-500/30 text-rose-400"
                : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
            }`}>
            <span className={`text-[9px] font-bold uppercase ${isSel ? "text-rose-200" : ""}`}>{HE_SHORT[i]}</span>
            <span className="text-sm font-black mt-0.5">{format(day, "d")}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Activity Card (timeline) ──────────────────────────────────────────── */

function ActivityCard({
  activity, palIdx, groupLabel, onEdit, onDelete, onDuplicate, nameOf, locName,
}: {
  activity: Activity; palIdx: number; groupLabel: string;
  onEdit: () => void; onDelete: () => void; onDuplicate: () => void;
  nameOf: (id: string) => string; locName: (id: string) => string;
}) {
  const pal = PALETTE[palIdx] ?? PALETTE[0];
  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 px-3 py-2.5 rounded-lg border ${pal.border} ${pal.bg} group transition-colors`}>
      {/* Left stripe */}
      <div className={`w-0.5 rounded-full shrink-0 ${pal.dot}`} />
      {/* Time */}
      <div className="shrink-0 text-right w-14">
        <span className={`text-xs font-black ${pal.text}`}>{activity.startTime}</span>
        <p className="text-[9px] text-slate-600 leading-none mt-0.5">{activity.endTime}</p>
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm leading-tight truncate text-white">
            {activity.title || <span className="text-slate-600 italic text-xs">ללא שם</span>}
          </p>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${pal.chip}`}>{groupLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
          {activity.locationId && (
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <MapPin className="w-2.5 h-2.5" />{locName(activity.locationId)}
            </span>
          )}
          {activity.staffIds.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <Users className="w-2.5 h-2.5" />{activity.staffIds.map(nameOf).join(", ")}
            </span>
          )}
          {activity.notes && (
            <span className="text-[10px] text-slate-600 truncate max-w-[200px]">{activity.notes}</span>
          )}
        </div>
      </div>
      {/* Actions — visible on hover */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit}      className="p-1.5 rounded hover:bg-blue-500/15 text-slate-600 hover:text-blue-400 transition-colors"   title="ערוך"><Edit3    className="w-3 h-3" /></button>
        <button onClick={onDuplicate} className="p-1.5 rounded hover:bg-emerald-500/15 text-slate-600 hover:text-emerald-400 transition-colors" title="שכפל"><CopyPlus className="w-3 h-3" /></button>
        <button onClick={onDelete}    className="p-1.5 rounded hover:bg-rose-500/15 text-slate-600 hover:text-rose-400 transition-colors"   title="מחק"><Trash2   className="w-3 h-3" /></button>
      </div>
    </motion.div>
  );
}

/* ─── InlineSection ─────────────────────────────────────────────────────── */

function InlineSection({ label, acts, pi, onAdd, onEdit, onDelete, onDuplicate, nameOf, locName, resolveLabel }: {
  label: string; acts: Activity[]; pi: number;
  onAdd: () => void;
  onEdit: (a: Activity) => void;
  onDelete: (id: string) => void;
  onDuplicate: (a: Activity) => void;
  nameOf: (id: string) => string;
  locName: (id: string) => string;
  resolveLabel: (gid: string) => string;
}) {
  const pal = PALETTE[pi] ?? PALETTE[0];
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-sm border border-current opacity-50 shrink-0 ${pal.text}`} />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${pal.text} opacity-80`}>{label}</span>
        {acts.length > 0 && <span className={`text-[9px] opacity-50 ${pal.text}`}>{acts.length}</span>}
        <div className="flex-1" />
        <button onClick={onAdd}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${pal.chip} hover:opacity-80 transition-opacity`}>
          <Plus className="w-2 h-2" /> הוסף
        </button>
      </div>
      {acts.length === 0 ? (
        <button onClick={onAdd}
          className="w-full py-3 border border-dashed border-white/[0.06] rounded-lg text-slate-700 text-[11px] flex items-center justify-center gap-1.5 hover:border-white/12 hover:text-slate-500 transition-all">
          <Plus className="w-3 h-3" /> הוסף פעילות ל{label}
        </button>
      ) : (
        <div className="space-y-1">
          <AnimatePresence>
            {acts.map(a => (
              <ActivityCard key={a.id} activity={a} palIdx={pi}
                groupLabel={resolveLabel(a.groupId)}
                onEdit={() => onEdit(a)} onDelete={() => onDelete(a.id)}
                onDuplicate={() => onDuplicate(a)}
                nameOf={nameOf} locName={locName} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ─── Activity Modal ────────────────────────────────────────────────────── */

function ActivityModal({
  initial, programs, groups, staff, locations, onSave, onClose, contextId,
}: {
  initial: Activity; programs: Program[]; groups: Group[]; staff: Person[]; locations: Location[];
  onSave: (a: Activity) => void; onClose: () => void; contextId?: string;
}) {
  const [form,  setForm]  = useState<Activity>(initial);
  const [search, setSrch] = useState("");
  const set = (p: Partial<Activity>) => setForm(f => ({ ...f, ...p }));
  const toggleStaff = (id: string) =>
    set({ staffIds: form.staffIds.includes(id) ? form.staffIds.filter(x => x !== id) : [...form.staffIds, id] });

  // Build program-hierarchical group options
  type GroupOption = { id: string; label: string; programLabel?: string; pi: number };
  const groupOptions: GroupOption[] = [
    ...programs.flatMap((prog, pi) => {
      const progGroups = groups.filter(g => g.programId === prog.id);
      return [
        { id: prog.id,  label: `משותף — ${prog.name}`, programLabel: prog.name, pi: pi % (PALETTE.length - 2) + 1 },
        ...progGroups.map(g => ({ id: g.id, label: g.name, programLabel: prog.name, pi: pi % (PALETTE.length - 2) + 1 })),
      ];
    }),
    ...groups.filter(g => !programs.some(p => p.id === g.programId)).map(g => ({ id: g.id, label: g.name, pi: 0 })),
    { id: "staff_only", label: "צוות בלבד", pi: PALETTE.length - 1 },
  ];

  const filteredStaff = staff.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  // Auto-set group if we have a contextId and it's a valid target
  useEffect(() => {
    if (contextId && contextId !== "show_all" && !initial.title) {
      set({ groupId: contextId });
    }
  }, [contextId]);

  // Auto-populate staff if location has permanent staff members
  useEffect(() => {
    if (!form.locationId) return;
    const loc = locations.find(l => l.id === form.locationId);
    if (loc?.permanentStaffIds && loc.permanentStaffIds.length > 0) {
      // Only auto-populate if we are creating a new activity or if staff list is currently empty
      if (!initial.id || form.staffIds.length === 0) {
        set({ staffIds: loc.permanentStaffIds });
      }
    }
  }, [form.locationId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 md:p-12">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      
      <motion.div
        initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="relative bg-slate-900 border-t sm:border border-white/10 w-full max-w-5xl rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-10 py-6 border-b border-white/5 bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-5">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${initial.title ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-400"}`}>
              {initial.title ? <Edit3 className="w-7 h-7" /> : <Plus className="w-7 h-7" />}
            </div>
            <div>
              <h2 className="font-black text-xl tracking-tight text-white">{initial.title ? "עריכת פעילות בלו״ז" : "הוספת פעילות חדשה"}</h2>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">ניהול שיבוצים ומשימות יומיומיות • {contextId === "show_all" ? "כללי" : "קבוצתי"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 rounded-2xl text-slate-500 hover:text-white hover:bg-white/5 transition-all active:scale-90">
            <X className="w-7 h-7" />
          </button>
        </div>

        {/* Body - 2 Column Grid on Desktop */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
            
            {/* Right Column: Main Details */}
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-4">פרטי הפעילות</h3>
                
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 pr-1">שם הפעילות / סוג שיעור</label>
                  <input value={form.title} onChange={e => set({ title: e.target.value })}
                    placeholder="פסיכודרמה, אמנות, ישיבת צוות..."
                    autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-base font-bold text-white focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all placeholder:text-slate-700" />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 pr-1">שעת התחלה</label>
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
                      <input type="time" value={form.startTime} onChange={e => set({ startTime: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-4 pr-12 py-4 text-base font-black text-white focus:border-emerald-500/50 outline-none transition-all" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 pr-1">שעת סיום</label>
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
                      <input type="time" value={form.endTime} onChange={e => set({ endTime: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-4 pr-12 py-4 text-base font-black text-white focus:border-emerald-500/50 outline-none transition-all" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[var(--foreground)]/50 pr-1">מיקום</label>
                  <div className="relative">
                    <MapPin className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground)]/20" />
                    <select value={form.locationId} onChange={e => set({ locationId: e.target.value })}
                      className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl pr-12 pl-4 py-3.5 text-sm font-bold focus:border-rose-500/50 outline-none transition-all appearance-none">
                      <option value="" className="bg-[var(--card-bg)]">בחר מיקום...</option>
                      {locations.map(l => <option key={l.id} value={l.id} className="bg-[var(--card-bg)]">{l.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="block text-xs font-bold text-[var(--foreground)]/50 pr-1">הערות נוספות</label>
                  <textarea value={form.notes || ""} onChange={e => set({ notes: e.target.value })}
                    placeholder="פרטים חשובים, ציוד נדרש..." rows={3}
                    className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl px-5 py-4 text-sm font-medium focus:border-rose-500/50 outline-none transition-all resize-none" />
                </div>
              </div>
            </div>

            {/* Left Column: Audience & Staff */}
            <div className="space-y-8">
              {/* Audience Section */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">קהל יעד וקבוצות</h3>
                
                <div className="bg-[var(--foreground)]/[0.02] border border-[var(--border)] rounded-[2rem] p-4 space-y-5">
                  {programs
                    .filter(prog => {
                      if (!contextId || contextId === "show_all") return true;
                      return contextId === prog.id || groups.some(g => g.id === contextId && g.programId === prog.id);
                    })
                    .map((prog, pi) => {
                      const piReal = pi % (PALETTE.length - 2) + 1;
                      const pal    = PALETTE[piReal] ?? PALETTE[0];
                      const opts   = groupOptions.filter(g => g.programLabel === prog.name);
                      
                      return (
                        <div key={prog.id} className="space-y-2">
                          <div className="flex items-center gap-2 mb-1 px-1">
                            <div className={`w-1.5 h-1.5 rounded-full ${pal.dot}`} />
                            <p className={`text-[10px] font-black uppercase tracking-wider ${pal.text}`}>{prog.name}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {opts.map(g => (
                              <button key={g.id} type="button" onClick={() => set({ groupId: g.id })}
                                className={`px-4 py-2 rounded-xl text-xs font-black border transition-all active:scale-95 ${
                                  form.groupId === g.id
                                    ? `${pal.bg} ${pal.border} ${pal.text} shadow-sm ring-2 ring-inset ring-white/5`
                                    : "bg-[var(--foreground)]/5 border-transparent text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/10"
                                }`}>
                                {g.id === prog.id ? "משותף לתוכנית" : g.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                  {/* Staff Only Option - Only show if not filtered or if filtered to staff */}
                  {(!contextId || contextId === "show_all" || contextId === "staff_only") && (
                    <div className="pt-2 border-t border-[var(--border)]">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">ניהול פנימי</p>
                      </div>
                      <button type="button" onClick={() => set({ groupId: "staff_only" })}
                        className={`px-4 py-2 rounded-xl text-xs font-black border transition-all active:scale-95 ${
                          form.groupId === "staff_only"
                            ? "bg-slate-500/10 border-slate-500/30 text-slate-400 shadow-sm"
                            : "bg-[var(--foreground)]/5 border-transparent text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/10"
                        }`}>
                        צוות בלבד
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Staff Selection Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-[10px] font-black text-violet-500 uppercase tracking-[0.2em]">אנשי צוות משובצים</h3>
                  {form.staffIds.length > 0 && <span className="text-[10px] font-black bg-violet-500/10 text-violet-500 px-2 py-0.5 rounded-full">{form.staffIds.length} נבחרו</span>}
                </div>
                
                <div className="bg-[var(--foreground)]/[0.02] border border-[var(--border)] rounded-[2rem] p-4 space-y-4">
                  <div className="relative">
                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground)]/20" />
                    <input value={search} onChange={e => setSrch(e.target.value)} placeholder="חפש איש צוות..."
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl pr-11 pl-4 py-3 text-xs font-bold outline-none focus:border-violet-500/50 transition-all" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto no-scrollbar pr-1">
                    {filteredStaff.map(p => {
                      const isSelected = form.staffIds.includes(p.id);
                      return (
                        <button key={p.id} type="button" onClick={() => toggleStaff(p.id)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                            isSelected
                              ? "bg-violet-600/10 border-violet-500/30 text-violet-500"
                              : "bg-[var(--background)] border-transparent text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/5 hover:text-[var(--foreground)]"
                          }`}>
                          <div className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border transition-all ${isSelected ? "bg-violet-600 border-violet-500 scale-110" : "border-[var(--foreground)]/20"}`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className="truncate">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-4 px-8 py-6 border-t border-[var(--border)] bg-[var(--foreground)]/[0.02] shrink-0">
          <button onClick={onClose} className="flex-1 py-4 bg-[var(--foreground)]/5 rounded-2xl font-black text-sm text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/10 hover:text-[var(--foreground)] transition-all active:scale-95">ביטול</button>
          <button onClick={() => onSave(form)} disabled={!form.title.trim()}
            className="flex-[1.5] py-4 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-500 shadow-xl shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-40 disabled:grayscale">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle className="w-5 h-5" />
              <span>שמור פעילות ללו״ז</span>
            </div>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────── */

function SchedulePageInner() {
  const searchParams = useSearchParams();

  const [date,      setDate]      = useState(format(new Date(), "yyyy-MM-dd"));
  const [schedule,  setSchedule]  = useState<DaySchedule>(EMPTY);
  const [staff,     setStaff]     = useState<Person[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [groups,    setGroups]    = useState<Group[]>([]);
  const [programs,  setPrograms]  = useState<Program[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [viewFilter, setViewFilter] = useState(searchParams.get("group") || "show_all");
  const [editingActivity, setEditingActivity] = useState<Activity | null | "new">(null);
  const [newActivityGroup, setNewActivityGroup] = useState("");

  // ── Auto-save refs — always hold the latest values without stale closures
  const scheduleRef = useRef(schedule);
  const dateRef     = useRef(date);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);
  useEffect(() => { dateRef.current = date; },         [date]);

  const autoSave = useAutoSave(async () => {
    await setDoc(doc(db, "schedules", dateRef.current), scheduleRef.current);
  });

  // Cancel any pending save when the selected date changes (prevents
  // writing yesterday's activities into today's slot)
  useEffect(() => { autoSave.reset(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Load reference data once ── */
  useEffect(() => {
    (async () => {
      const [u, l, g, p] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "locations")),
        getDocs(query(collection(db, "groups"), orderBy("name"))),
        getDocs(query(collection(db, "programs"), orderBy("name"))),
      ]);
      setStaff(u.docs.map(d => ({ id: d.id, name: d.data().name || d.data().email })));
      setLocations(l.docs.map(d => ({ 
        id: d.id, 
        name: d.data().name,
        permanentStaffIds: d.data().permanentStaffIds || []
      })));
      setGroups(g.docs.map(d => ({ id: d.id, name: d.data().name, programId: d.data().programId })));
      setPrograms(p.docs.map(d => ({ id: d.id, name: d.data().name })));
    })();
  }, []);

  /* ── Load schedule for selected date ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "schedules", date));
        if (snap.exists()) {
          const d = snap.data();
          setSchedule({ dutyInstructorId: d.dutyInstructorId || d.dutyId || "", activities: (d.activities || []).map(migrate) });
        } else {
          const dow = new Date(date).getDay();
          const tpl = await getDoc(doc(db, "scheduleTemplates", String(dow)));
          if (tpl.exists()) {
            const d = tpl.data();
            setSchedule({ dutyInstructorId: d.dutyInstructorId || d.dutyId || "", activities: (d.activities || []).map(migrate) });
          } else { setSchedule(EMPTY); }
        }
      } finally { setLoading(false); }
    })();
  }, [date]);

  /* ── Derived ── */
  const nameOf  = (id: string) => staff.find(s => s.id === id)?.name     || id;
  const locName = (id: string) => locations.find(l => l.id === id)?.name || "—";

  // Palette index: same program → same color
  const programPalIdx = (programId: string) => {
    const i = programs.findIndex(p => p.id === programId);
    return i >= 0 ? (i % (PALETTE.length - 2)) + 1 : 0;
  };
  const palIdx = (gid: string): number => {
    if (gid === "staff_only") return PALETTE.length - 1;
    if (gid === "all") return 0; // legacy
    const prog = programs.find(p => p.id === gid);
    if (prog) return programPalIdx(prog.id);          // program-joint activity
    const grp  = groups.find(g => g.id === gid);
    if (grp?.programId) return programPalIdx(grp.programId); // group activity
    return 0;
  };

  const groupLabel = (gid: string): string => {
    if (gid === "staff_only") return "צוות";
    if (gid === "all")        return "משותף";
    const prog = programs.find(p => p.id === gid);
    if (prog) return `משותף — ${prog.name}`;
    return groups.find(g => g.id === gid)?.name || gid;
  };

  // program-hierarchical sections for the "show_all" view
  const programSections = useMemo(() =>
    programs.map(prog => ({
      program: prog,
      pi:      programPalIdx(prog.id),
      jointId: prog.id,                                     // groupId for "joint within program"
      groups:  groups.filter(g => g.programId === prog.id),
    })),
    [programs, groups]
  );
  // Groups not linked to any loaded program
  const orphanGroups = useMemo(() =>
    groups.filter(g => !programs.some(p => p.id === g.programId)),
    [groups, programs]
  );

  // Flat sections for mobile tabs / single-filter mode
  const sections = useMemo(() => [
    ...programs.flatMap((prog, i) => {
      const pi = i % (PALETTE.length - 2) + 1;
      return [
        { id: prog.id, label: `משותף — ${prog.name}`, palIdx: pi },
        ...groups.filter(g => g.programId === prog.id).map(g => ({ id: g.id, label: g.name, palIdx: pi })),
      ];
    }),
    ...orphanGroups.map(g => ({ id: g.id, label: g.name, palIdx: 0 })),
    { id: "staff_only", label: "צוות בלבד", palIdx: PALETTE.length - 1 },
  ], [programs, groups, orphanGroups]);

  // Activities for the current filter, sorted by time
  const visibleActivities = useMemo(() => {
    const acts = schedule.activities;
    return acts
      .filter(a => {
        if (viewFilter === "show_all") return true;
        if (a.groupId === viewFilter) return true;
        // When filtering by program.id, also show groups belonging to that program
        const progGroupIds = groups.filter(g => g.programId === viewFilter).map(g => g.id);
        return progGroupIds.includes(a.groupId);
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [schedule.activities, viewFilter, groups]);

  // Activity count for a specific groupId (exact match)
  const countFor = (id: string) => schedule.activities.filter(a => a.groupId === id).length;
  // Activity count for an entire program (joint + all its groups)
  const countProgram = (progId: string) => {
    const gids = groups.filter(g => g.programId === progId).map(g => g.id);
    return schedule.activities.filter(a => a.groupId === progId || gids.includes(a.groupId)).length;
  };

  /* ── Mutations ── */
  const upsertActivity = (a: Activity) => {
    setSchedule(s => ({
      ...s,
      activities: s.activities.some(x => x.id === a.id)
        ? s.activities.map(x => x.id === a.id ? a : x)
        : [...s.activities, a],
    }));
    setEditingActivity(null);
    autoSave.trigger();
  };
  const deleteActivity = (id: string) => {
    setSchedule(s => ({ ...s, activities: s.activities.filter(a => a.id !== id) }));
    autoSave.trigger();
  };

  const duplicateActivity = (a: Activity) => {
    setSchedule(s => ({ ...s, activities: [...s.activities, { ...a, id: uid() }] }));
    autoSave.trigger();
  };

  const copyFromPrevDay = async () => {
    const prevDate = format(subDays(dateObj, 1), "yyyy-MM-dd");
    const snap = await getDoc(doc(db, "schedules", prevDate));
    if (!snap.exists()) { alert("לא נמצא לוז לאתמול"); return; }
    const d = snap.data();
    if (!window.confirm(`להחליף את לוז היום בלוז מ-${format(subDays(dateObj,1), "dd/MM", { locale: he })}?`)) return;
    setSchedule(prev => ({
      ...prev,
      activities: (d.activities || []).map((x: Activity) => migrate({ ...x, id: uid() })),
    }));
    autoSave.trigger();
  };

  const saveAsTemplate = async () => {
    const dow = new Date(date).getDay();
    setSaving(true);
    try {
      await setDoc(doc(db, "scheduleTemplates", String(dow)), schedule);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };
  // Smart default for openNew: prefer program-joint if known, else first program
  const openNew = (groupId?: string) => {
    const defaultId = groupId ?? (
      viewFilter !== "show_all" ? viewFilter :
      programs[0]?.id ?? "staff_only"
    );
    setNewActivityGroup(defaultId);
    setEditingActivity("new");
  };

  const dateObj  = parseISO(date);
  const dateLabel = format(dateObj, "EEEE, d בMMMM", { locale: he });
  const isToday  = date === format(new Date(), "yyyy-MM-dd");

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-background text-foreground flex flex-col">

        {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border px-4 md:px-5">
          <div className="flex items-center gap-3 h-12">
            {/* Title */}
            <div className="flex items-center gap-2 shrink-0">
              <Calendar className="w-4 h-4 text-rose-400" />
              <h1 className="text-[14px] font-semibold">ניהול לו״ז</h1>
            </div>

            {/* Mobile date nav */}
            <div className="md:hidden flex items-center gap-1 mr-auto">
              <button onClick={() => setDate(format(subDays(dateObj, 1), "yyyy-MM-dd"))}
                className="p-1.5 rounded hover:bg-white/5 text-slate-500 transition-colors"><ChevronRight className="w-4 h-4" /></button>
              <span className="text-xs font-medium text-slate-300 whitespace-nowrap">{dateLabel}</span>
              <button onClick={() => setDate(format(addDays(dateObj, 1), "yyyy-MM-dd"))}
                className="p-1.5 rounded hover:bg-white/5 text-slate-500 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            </div>

            {/* Save actions — desktop inline */}
            <div className="hidden md:flex items-center gap-2 mr-auto">
              <AutoSaveIndicator
                status={autoSave.status}
                error={autoSave.error}
                onRetry={autoSave.saveNow}
              />
              <button onClick={copyFromPrevDay} disabled={saving || autoSave.status === "saving"}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/[0.07] rounded text-xs font-medium text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/8 transition-colors disabled:opacity-40">
                <CopyPlus className="w-3.5 h-3.5" />
                העתק מאתמול
              </button>
              <button onClick={saveAsTemplate} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/[0.07] rounded text-xs font-medium text-slate-400 hover:text-white hover:bg-white/8 transition-colors disabled:opacity-40">
                <Copy className="w-3.5 h-3.5" />
                שמור כתבנית ל{DAY_NAMES[new Date(date).getDay()]}
              </button>
              <button onClick={autoSave.saveNow} disabled={autoSave.status === "saving"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all disabled:opacity-40 ${
                  saved || autoSave.status === "saved"
                    ? "bg-emerald-600 text-white"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}>
                <Save className="w-3.5 h-3.5" />
                שמור
              </button>
            </div>

            {/* Mobile: add button */}
            <button onClick={() => openNew()} className="md:hidden p-2 rounded-lg bg-rose-600 text-white transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ══ BODY ════════════════════════════════════════════════════════════ */}
        <div className="flex flex-1 min-h-0">

          {/* ── LEFT SIDEBAR (desktop only) ── */}
          <aside className="hidden md:flex w-56 shrink-0 flex-col border-l border-border bg-sidebar-bg">
            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              {/* Mini calendar */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">תאריך</p>
                <MiniCal value={date} onChange={setDate} />
                {/* Today link */}
                {!isToday && (
                  <button onClick={() => setDate(format(new Date(), "yyyy-MM-dd"))}
                    className="mt-2 w-full text-center text-[10px] text-rose-400 hover:text-rose-300 font-medium transition-colors">
                    → חזור להיום
                  </button>
                )}
              </div>

              {/* Duty instructor */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">מדריך תורן</p>
                <select
                  value={schedule.dutyInstructorId}
                  onChange={e => {
                    setSchedule(s => ({ ...s, dutyInstructorId: e.target.value }));
                    autoSave.trigger();
                  }}
                  className="w-full bg-white/5 border border-white/[0.07] rounded-lg px-2.5 py-2 text-xs font-medium focus:outline-none focus:border-rose-500 transition-colors appearance-none">
                  <option value="" className="bg-slate-900 text-slate-400">ללא מדריך תורן</option>
                  {staff.map(p => <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>)}
                </select>
              </div>

              {/* Section/group filters — program-hierarchical */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">סינון</p>
                <div className="space-y-0.5">
                  <button onClick={() => setViewFilter("show_all")}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium transition-all ${
                      viewFilter === "show_all" ? "bg-white/8 text-white" : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
                    }`}>
                    <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" />
                    <span className="flex-1 text-right">כל הפעילויות</span>
                    <span className="text-[9px] text-slate-600 shrink-0">{schedule.activities.length}</span>
                  </button>

                  {programSections.map((ps: any) => {
                    const pal = PALETTE[ps.pi] ?? PALETTE[0];
                    return (
                      <div key={ps.program.id} className="pt-1.5">
                        <button onClick={() => setViewFilter(ps.program.id)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                            viewFilter === ps.program.id ? `${pal.bg} ${pal.text}` : "text-slate-500 hover:text-slate-300"
                          }`}>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${pal.dot}`} />
                          <span className="flex-1 text-right">{ps.program.name}</span>
                          {countProgram(ps.program.id) > 0 && <span className="text-[9px] shrink-0">{countProgram(ps.program.id)}</span>}
                        </button>
                        <button onClick={() => setViewFilter(ps.jointId)}
                          className={`w-full flex items-center gap-2 pr-5 pl-2.5 py-1 rounded text-[10px] font-medium transition-all ${
                            viewFilter === ps.jointId ? `${pal.bg} ${pal.text}` : "text-slate-600 hover:text-slate-400"
                          }`}>
                          <span className="w-1.5 h-1.5 border border-current rounded-sm shrink-0 opacity-60" />
                          <span className="flex-1 text-right">משותף לתוכנית</span>
                          {countFor(ps.jointId) > 0 && <span className="text-[9px] shrink-0">{countFor(ps.jointId)}</span>}
                        </button>
                        {ps.groups.map((g: any) => (
                          <button key={g.id} onClick={() => setViewFilter(g.id)}
                            className={`w-full flex items-center gap-2 pr-5 pl-2.5 py-1 rounded text-[10px] font-medium transition-all ${
                              viewFilter === g.id ? `${pal.bg} ${pal.text}` : "text-slate-600 hover:text-slate-400"
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pal.dot} opacity-60`} />
                            <span className="flex-1 text-right">{g.name}</span>
                            {countFor(g.id) > 0 && <span className="text-[9px] shrink-0">{countFor(g.id)}</span>}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                  {[...orphanGroups.map((g: any) => ({ id: g.id, label: g.name, pi: 0 })), { id: "staff_only", label: "צוות בלבד", pi: PALETTE.length - 1 }].map((sec: any) => {
                    const pal = PALETTE[sec.pi] ?? PALETTE[0];
                    return (
                      <button key={sec.id} onClick={() => setViewFilter(sec.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium mt-0.5 transition-all ${
                          viewFilter === sec.id ? `${pal.bg} ${pal.text}` : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
                        }`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${pal.dot}`} />
                        <span className="flex-1 text-right">{sec.label}</span>
                        {countFor(sec.id) > 0 && <span className="text-[9px] shrink-0">{countFor(sec.id)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sidebar footer: save actions (desktop already in header, this is extra hint) */}
            <div className="p-3 border-t border-white/[0.06] shrink-0">
              <p className="text-[9px] text-slate-700 text-center leading-relaxed">
                שינויים נשמרים ידנית בלחיצה על "שמור"
              </p>
            </div>
          </aside>

          {/* ── MAIN CONTENT ── */}
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

            {/* Week strip + date header */}
            <div className="px-4 md:px-5 pt-3 pb-0 border-b border-border bg-background/30 shrink-0">
              {/* Week navigation */}
              <WeekStrip date={date} onChange={setDate} />

              {/* Date label + add button row */}
              <div className="flex items-center justify-between py-2 mt-1">
                <div className="flex items-center gap-2">
                  <button onClick={() => setDate(format(subDays(dateObj, 1), "yyyy-MM-dd"))}
                    className="p-1 rounded hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <span className={`text-sm font-semibold ${isToday ? "text-rose-400" : "text-slate-300"}`}>
                    {dateLabel}
                    {isToday && <span className="text-[10px] text-rose-500 font-bold mr-1.5">• היום</span>}
                  </span>
                  <button onClick={() => setDate(format(addDays(dateObj, 1), "yyyy-MM-dd"))}
                    className="p-1 rounded hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button onClick={() => openNew()}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/10 border border-rose-500/20 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-600/15 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> הוסף פעילות
                </button>
              </div>

              {/* Mobile: section tabs (flat) */}
              <div className="md:hidden flex gap-1.5 overflow-x-auto no-scrollbar pb-2">
                <button onClick={() => setViewFilter("show_all")}
                  className={`shrink-0 px-3 py-1 rounded text-[11px] font-semibold border transition-all ${viewFilter === "show_all" ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/[0.07] text-slate-500"}`}>
                  הכל
                </button>
                {sections.map(sec => {
                  const pal = PALETTE[sec.palIdx] ?? PALETTE[0];
                  return (
                    <button key={sec.id} onClick={() => setViewFilter(sec.id)}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold border transition-all ${
                        viewFilter === sec.id ? `${pal.bg} ${pal.border} ${pal.text}` : "bg-white/5 border-white/[0.07] text-slate-500"
                      }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${pal.dot}`} />
                      {sec.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Activities list */}
            <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4 pb-28 md:pb-8">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-6 h-6 text-rose-400 animate-spin" />
                  <p className="text-slate-500 text-sm">טוען לו״ז...</p>
                </div>
              ) : viewFilter === "show_all" ? (
                /* Program-hierarchical view */
                <div className="space-y-5">
                  {programSections.map(ps => {
                    const pal       = PALETTE[ps.pi] ?? PALETTE[0];
                    const jointActs = schedule.activities.filter(a => a.groupId === ps.jointId).sort((a,b) => a.startTime.localeCompare(b.startTime));
                    return (
                      <div key={ps.program.id} className={`rounded-xl border ${pal.border} overflow-hidden`}>
                        {/* Program banner */}
                        <div className={`flex items-center gap-2 px-4 py-2 ${pal.bg} border-b ${pal.border}`}>
                          <span className={`w-2.5 h-2.5 rounded-full ${pal.dot}`} />
                          <span className={`text-xs font-bold ${pal.text}`}>{ps.program.name}</span>
                          {countProgram(ps.program.id) > 0 && (
                            <span className={`text-[10px] opacity-60 ${pal.text}`}>{countProgram(ps.program.id)} פעילויות</span>
                          )}
                        </div>
                        <div className="p-3 space-y-4">
                          {/* Joint section */}
                          <InlineSection label="משותף לתוכנית" acts={jointActs} pi={ps.pi}
                            onAdd={() => openNew(ps.jointId)}
                            onEdit={setEditingActivity} onDelete={deleteActivity}
                            onDuplicate={duplicateActivity}
                            nameOf={nameOf} locName={locName} resolveLabel={groupLabel} />
                          {/* Per-group sections */}
                          {ps.groups.map(g => {
                            const gActs = schedule.activities.filter(a => a.groupId === g.id).sort((a,b) => a.startTime.localeCompare(b.startTime));
                            return (
                              <InlineSection key={g.id} label={g.name} acts={gActs} pi={ps.pi}
                                onAdd={() => openNew(g.id)}
                                onEdit={setEditingActivity} onDelete={deleteActivity}
                                onDuplicate={duplicateActivity}
                                nameOf={nameOf} locName={locName} resolveLabel={groupLabel} />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {/* Orphan groups + staff */}
                  {[...orphanGroups.map(g => ({ id: g.id, label: g.name, pi: 0 as number })), { id: "staff_only", label: "צוות בלבד", pi: PALETTE.length - 1 }].map(sec => {
                    const acts = schedule.activities.filter(a => a.groupId === sec.id).sort((a,b) => a.startTime.localeCompare(b.startTime));
                    return (
                      <InlineSection key={sec.id} label={sec.label} acts={acts} pi={sec.pi}
                        onAdd={() => openNew(sec.id)}
                        onEdit={setEditingActivity} onDelete={deleteActivity}
                        onDuplicate={duplicateActivity}
                        nameOf={nameOf} locName={locName} resolveLabel={groupLabel} />
                    );
                  })}
                </div>
              ) : (
                /* Single section */
                <div>
                  {visibleActivities.length === 0 ? (
                    <button onClick={() => openNew()}
                      className="w-full py-16 border border-dashed border-white/[0.07] rounded-xl text-slate-600 text-sm flex flex-col items-center justify-center gap-2 hover:border-white/15 hover:text-slate-400 transition-all">
                      <Plus className="w-5 h-5" />
                      אין פעילויות — לחץ להוספה
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <AnimatePresence>
                        {visibleActivities.map((a: any) => (
                          <ActivityCard key={a.id}
                            activity={a}
                            palIdx={palIdx(a.groupId)}
                            groupLabel={groupLabel(a.groupId)}
                            onEdit={() => setEditingActivity(a)}
                            onDelete={() => deleteActivity(a.id)}
                            onDuplicate={() => duplicateActivity(a)}
                            nameOf={nameOf}
                            locName={locName}
                          />
                        ))}
                      </AnimatePresence>
                      <button onClick={() => openNew()}
                        className="w-full mt-2 py-3 border border-dashed border-white/[0.07] rounded-lg text-slate-600 text-xs flex items-center justify-center gap-1.5 hover:border-white/15 hover:text-slate-400 transition-all">
                        <Plus className="w-3.5 h-3.5" /> הוסף פעילות נוספת
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Mobile save bar */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-xl border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2">
            <AutoSaveIndicator status={autoSave.status} error={autoSave.error} onRetry={autoSave.saveNow} />
            <div className="flex gap-2 mr-auto">
              <button onClick={saveAsTemplate} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-white/5 border border-white/[0.07] rounded-xl text-xs font-medium text-slate-400 hover:bg-white/8 transition-colors shrink-0 disabled:opacity-40">
                <Copy className="w-3.5 h-3.5" />
                תבנית
              </button>
              <button onClick={autoSave.saveNow} disabled={autoSave.status === "saving"}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 ${
                  autoSave.status === "saved" ? "bg-emerald-600 text-white" : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}>
                <Save className="w-4 h-4" />
                שמור
              </button>
            </div>
          </div>
        </div>

        {/* Activity Modal */}
        <AnimatePresence>
          {editingActivity !== null && (
            <ActivityModal
              initial={editingActivity === "new"
                ? { id: uid(), title: "", startTime: "09:00", endTime: "10:00", locationId: "", staffIds: [], groupId: newActivityGroup, notes: "" }
                : editingActivity}
              groups={groups} programs={programs} staff={staff} locations={locations}
              onSave={upsertActivity} onClose={() => setEditingActivity(null)}
              contextId={viewFilter}
            />
          )}
        </AnimatePresence>
      </div>
    </RoleGuard>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-rose-400 animate-spin" />
      </div>
    }>
      <SchedulePageInner />
    </Suspense>
  );
}
