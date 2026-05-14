"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, setDoc, doc, query, orderBy, getDoc } from "firebase/firestore";
import {
  Clock, MapPin, Users, User, Plus, Trash2, Save, Copy,
  Loader2, ChevronLeft, ChevronRight, Edit3, X, Check, Calendar,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
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
interface Group    { id: string; name: string }
interface Person   { id: string; name: string }
interface Location { id: string; name: string }

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
  activity, palIdx, groupLabel, onEdit, onDelete, nameOf, locName,
}: {
  activity: Activity; palIdx: number; groupLabel: string;
  onEdit: () => void; onDelete: () => void;
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
        <button onClick={onEdit}   className="p-1.5 rounded hover:bg-blue-500/15 text-slate-600 hover:text-blue-400 transition-colors"><Edit3  className="w-3 h-3" /></button>
        <button onClick={onDelete} className="p-1.5 rounded hover:bg-rose-500/15 text-slate-600 hover:text-rose-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
      </div>
    </motion.div>
  );
}

/* ─── Activity Modal ────────────────────────────────────────────────────── */

function ActivityModal({
  initial, groups, staff, locations, onSave, onClose,
}: {
  initial: Activity; groups: Group[]; staff: Person[]; locations: Location[];
  onSave: (a: Activity) => void; onClose: () => void;
}) {
  const [form,  setForm]  = useState<Activity>(initial);
  const [search, setSrch] = useState("");
  const set = (p: Partial<Activity>) => setForm(f => ({ ...f, ...p }));
  const toggleStaff = (id: string) =>
    set({ staffIds: form.staffIds.includes(id) ? form.staffIds.filter(x => x !== id) : [...form.staffIds, id] });

  const groupOptions = [
    { id: "all",        label: "משותף לכל" },
    ...groups.map(g => ({ id: g.id, label: g.name })),
    { id: "staff_only", label: "צוות בלבד" },
  ];
  const filteredStaff = staff.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="relative bg-slate-900 border-t sm:border border-white/10 w-full max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh]">
        <div className="w-8 h-1 bg-white/10 rounded-full mx-auto mt-3 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] shrink-0">
          <h2 className="font-semibold text-sm">{initial.title ? "עריכת פעילות" : "פעילות חדשה"}</h2>
          <button onClick={onClose} className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-white/5 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">

          {/* Title */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">שם הפעילות *</label>
            <input value={form.title} onChange={e => set({ title: e.target.value })}
              placeholder="פסיכודרמה, אמנות, ישיבת צוות..."
              autoFocus
              className="w-full bg-white/5 border border-white/[0.07] rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-colors" />
          </div>

          {/* Time */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">שעות</label>
            <div className="flex items-center gap-2">
              <input type="time" value={form.startTime} onChange={e => set({ startTime: e.target.value })}
                className="flex-1 bg-white/5 border border-white/[0.07] rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-colors" />
              <span className="text-slate-600 text-xs font-medium shrink-0">עד</span>
              <input type="time" value={form.endTime} onChange={e => set({ endTime: e.target.value })}
                className="flex-1 bg-white/5 border border-white/[0.07] rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-colors" />
            </div>
          </div>

          {/* Group */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">קהל יעד</label>
            <div className="flex flex-wrap gap-1.5">
              {groupOptions.map((g, i) => {
                const pal = PALETTE[i === 0 ? 0 : i <= groups.length ? i : PALETTE.length - 1] ?? PALETTE[0];
                return (
                  <button key={g.id} type="button" onClick={() => set({ groupId: g.id })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      form.groupId === g.id
                        ? `${pal.bg} ${pal.border} ${pal.text}`
                        : "bg-white/5 border-white/[0.07] text-slate-500 hover:bg-white/8"
                    }`}>
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">מיקום</label>
            <select value={form.locationId} onChange={e => set({ locationId: e.target.value })}
              className="w-full bg-slate-800 border border-white/[0.07] rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-colors">
              <option value="">בחר מיקום...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Staff */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              אנשי צוות {form.staffIds.length > 0 && <span className="text-blue-400">({form.staffIds.length})</span>}
            </label>
            <input value={search} onChange={e => setSrch(e.target.value)} placeholder="חיפוש שם..."
              className="w-full bg-white/5 border border-white/[0.07] rounded-lg p-2 text-xs mb-1.5 focus:border-blue-500 outline-none transition-colors" />
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {filteredStaff.map(p => (
                <button key={p.id} type="button" onClick={() => toggleStaff(p.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                    form.staffIds.includes(p.id)
                      ? "bg-blue-600/15 border border-blue-500/25 text-blue-300"
                      : "bg-white/[0.03] border border-white/[0.05] text-slate-400 hover:bg-white/6"
                  }`}>
                  <div className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center shrink-0 border ${form.staffIds.includes(p.id) ? "bg-blue-600 border-blue-500" : "border-white/20"}`}>
                    {form.staffIds.includes(p.id) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">הערות</label>
            <textarea value={form.notes || ""} onChange={e => set({ notes: e.target.value })}
              placeholder="פרטים נוספים..." rows={2}
              className="w-full bg-white/5 border border-white/[0.07] rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition-colors resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 px-5 py-4 border-t border-white/[0.07] shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 bg-white/5 rounded-lg font-medium text-sm hover:bg-white/8 transition-all">ביטול</button>
          <button onClick={() => onSave(form)} disabled={!form.title.trim()}
            className="flex-1 py-2.5 bg-blue-600 rounded-lg font-semibold text-sm hover:bg-blue-500 transition-all disabled:opacity-40">
            שמור פעילות
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────── */

function SchedulePageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [date,      setDate]      = useState(format(new Date(), "yyyy-MM-dd"));
  const [schedule,  setSchedule]  = useState<DaySchedule>(EMPTY);
  const [staff,     setStaff]     = useState<Person[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [groups,    setGroups]    = useState<Group[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [viewFilter, setViewFilter] = useState(searchParams.get("group") || "show_all");
  const [editingActivity, setEditingActivity] = useState<Activity | null | "new">(null);
  const [newActivityGroup, setNewActivityGroup] = useState("all");

  /* ── Load reference data once ── */
  useEffect(() => {
    (async () => {
      const [u, l, g] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "locations")),
        getDocs(query(collection(db, "groups"), orderBy("name"))),
      ]);
      setStaff(u.docs.map(d => ({ id: d.id, name: d.data().name || d.data().email })));
      setLocations(l.docs.map(d => ({ id: d.id, name: d.data().name })));
      setGroups(g.docs.map(d => ({ id: d.id, name: d.data().name })));
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
  const nameOf     = (id: string) => staff.find(s => s.id === id)?.name     || id;
  const locName    = (id: string) => locations.find(l => l.id === id)?.name || "—";
  const groupLabel = (gid: string) =>
    gid === "all"        ? "משותף" :
    gid === "staff_only" ? "צוות"  :
    groups.find(g => g.id === gid)?.name || gid;

  // Palette index for a groupId
  const palIdx = (gid: string) => {
    if (gid === "all") return 0;
    const gi = groups.findIndex(g => g.id === gid);
    if (gi >= 0) return gi + 1;
    return PALETTE.length - 1; // staff_only
  };

  // All sections in order: all, ...groups, staff_only
  const sections = useMemo(() => [
    { id: "all",        label: "משותף",    palIdx: 0 },
    ...groups.map((g, i) => ({ id: g.id, label: g.name, palIdx: i + 1 })),
    { id: "staff_only", label: "צוות בלבד", palIdx: PALETTE.length - 1 },
  ], [groups]);

  // Activities for the current view, sorted by time
  const visibleActivities = useMemo(() =>
    schedule.activities
      .filter(a => viewFilter === "show_all" || a.groupId === viewFilter)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [schedule.activities, viewFilter]
  );

  // Count per section (for badges)
  const countFor = (id: string) => schedule.activities.filter(a => a.groupId === id).length;

  /* ── Mutations ── */
  const upsertActivity = (a: Activity) => {
    setSchedule(s => ({
      ...s,
      activities: s.activities.some(x => x.id === a.id)
        ? s.activities.map(x => x.id === a.id ? a : x)
        : [...s.activities, a],
    }));
    setEditingActivity(null);
  };
  const deleteActivity = (id: string) =>
    setSchedule(s => ({ ...s, activities: s.activities.filter(a => a.id !== id) }));

  const saveSchedule = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "schedules", date), schedule);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };
  const saveAsTemplate = async () => {
    const dow = new Date(date).getDay();
    setSaving(true);
    try {
      await setDoc(doc(db, "scheduleTemplates", String(dow)), schedule);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };
  const openNew = (groupId = viewFilter === "show_all" ? "all" : viewFilter) => {
    setNewActivityGroup(groupId);
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
              <button onClick={saveAsTemplate} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/[0.07] rounded text-xs font-medium text-slate-400 hover:text-white hover:bg-white/8 transition-colors disabled:opacity-40">
                <Copy className="w-3.5 h-3.5" />
                שמור כתבנית ל{DAY_NAMES[new Date(date).getDay()]}
              </button>
              <button onClick={saveSchedule} disabled={saving}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all disabled:opacity-40 ${
                  saved
                    ? "bg-emerald-600 text-white"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                {saved ? "נשמר!" : "שמור לו״ז"}
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
                  onChange={e => setSchedule(s => ({ ...s, dutyInstructorId: e.target.value }))}
                  className="w-full bg-white/5 border border-white/[0.07] rounded-lg px-2.5 py-2 text-xs font-medium focus:outline-none focus:border-rose-500 transition-colors appearance-none">
                  <option value="" className="bg-slate-900 text-slate-400">ללא תורן</option>
                  {staff.map(p => <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>)}
                </select>
              </div>

              {/* Section/group filters */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">סינון לפי קבוצה</p>
                <div className="space-y-0.5">
                  {/* "All" option */}
                  <button onClick={() => setViewFilter("show_all")}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                      viewFilter === "show_all"
                        ? "bg-white/8 text-white"
                        : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
                    }`}>
                    <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" />
                    <span className="flex-1 text-right">כל הקבוצות</span>
                    <span className="text-[9px] text-slate-600 shrink-0">{schedule.activities.length}</span>
                  </button>

                  {sections.map(sec => {
                    const pal   = PALETTE[sec.palIdx] ?? PALETTE[0];
                    const cnt   = countFor(sec.id);
                    const actv  = viewFilter === sec.id;
                    return (
                      <button key={sec.id} onClick={() => setViewFilter(sec.id)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                          actv ? `${pal.bg} ${pal.text}` : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
                        }`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${pal.dot}`} />
                        <span className="flex-1 text-right">{sec.label}</span>
                        {cnt > 0 && <span className={`text-[9px] shrink-0 ${actv ? pal.text : "text-slate-600"}`}>{cnt}</span>}
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

              {/* Mobile: section tabs */}
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
                        viewFilter === sec.id
                          ? `${pal.bg} ${pal.border} ${pal.text}`
                          : "bg-white/5 border-white/[0.07] text-slate-500"
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
                /* Show all sections */
                <div className="space-y-5">
                  {sections.map(sec => {
                    const acts = schedule.activities
                      .filter(a => a.groupId === sec.id)
                      .sort((a, b) => a.startTime.localeCompare(b.startTime));
                    const pal  = PALETTE[sec.palIdx] ?? PALETTE[0];
                    return (
                      <section key={sec.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`w-2 h-2 rounded-full ${pal.dot}`} />
                          <span className={`text-[11px] font-bold uppercase tracking-wider ${pal.text}`}>{sec.label}</span>
                          <span className="text-[10px] text-slate-600">{acts.length > 0 ? `${acts.length}` : ""}</span>
                          <div className={`flex-1 h-px ${pal.border} border-b`} />
                          <button onClick={() => openNew(sec.id)}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium ${pal.chip} hover:opacity-80 transition-opacity`}>
                            <Plus className="w-2.5 h-2.5" /> הוסף
                          </button>
                        </div>
                        {acts.length === 0 ? (
                          <button onClick={() => openNew(sec.id)}
                            className="w-full py-4 border border-dashed border-white/[0.07] rounded-lg text-slate-700 text-xs flex items-center justify-center gap-2 hover:border-white/15 hover:text-slate-500 transition-all">
                            <Plus className="w-3.5 h-3.5" /> הוסף פעילות ל{sec.label}
                          </button>
                        ) : (
                          <div className="space-y-1.5">
                            <AnimatePresence>
                              {acts.map(a => (
                                <ActivityCard key={a.id}
                                  activity={a}
                                  palIdx={sec.palIdx}
                                  groupLabel={sec.label}
                                  onEdit={() => setEditingActivity(a)}
                                  onDelete={() => deleteActivity(a.id)}
                                  nameOf={nameOf}
                                  locName={locName}
                                />
                              ))}
                            </AnimatePresence>
                          </div>
                        )}
                      </section>
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
                        {visibleActivities.map(a => (
                          <ActivityCard key={a.id}
                            activity={a}
                            palIdx={palIdx(a.groupId)}
                            groupLabel={groupLabel(a.groupId)}
                            onEdit={() => setEditingActivity(a)}
                            onDelete={() => deleteActivity(a.id)}
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
          <div className="flex gap-2">
            <button onClick={saveAsTemplate} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-white/5 border border-white/[0.07] rounded-xl text-xs font-medium text-slate-400 hover:bg-white/8 transition-colors shrink-0 disabled:opacity-40">
              <Copy className="w-3.5 h-3.5" />
              תבנית
            </button>
            <button onClick={saveSchedule} disabled={saving}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                saved ? "bg-emerald-600 text-white" : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
              }`}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><Check className="w-4 h-4" />נשמר!</> : <><Save className="w-4 h-4" />שמור לו״ז</>}
            </button>
          </div>
        </div>

        {/* Activity Modal */}
        <AnimatePresence>
          {editingActivity !== null && (
            <ActivityModal
              initial={editingActivity === "new"
                ? { id: uid(), title: "", startTime: "09:00", endTime: "10:00", locationId: "", staffIds: [], groupId: newActivityGroup, notes: "" }
                : editingActivity}
              groups={groups} staff={staff} locations={locations}
              onSave={upsertActivity} onClose={() => setEditingActivity(null)}
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
