"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, setDoc, doc, query, orderBy, getDoc } from "firebase/firestore";
import {
  Calendar, Clock, MapPin, Users, User, Plus, Trash2, Save, Copy,
  Loader2, ArrowRight, ChevronLeft, ChevronRight, Edit3, X, Check,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format, addDays, subDays, parseISO } from "date-fns";
import { he } from "date-fns/locale";

/* ─────────────────── Types ─────────────────── */

interface Activity {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  locationId: string;
  staffIds: string[];
  /** group.id | "all" (joint) | "staff_only" */
  groupId: string;
  notes?: string;
}

interface DaySchedule {
  dutyInstructorId: string;
  activities: Activity[];
}

interface Group    { id: string; name: string }
interface Person   { id: string; name: string }
interface Location { id: string; name: string }

const EMPTY_SCHEDULE: DaySchedule = { dutyInstructorId: "", activities: [] };

const DAY_NAMES = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];

/* ─────────────────── Helpers ─────────────────── */

const uid = () => Math.random().toString(36).slice(2, 9);

/** Migrate old single-instructor field to staffIds array */
const migrateActivity = (a: any): Activity => ({
  id:         a.id            || uid(),
  title:      a.title         || a.activityType || "",
  startTime:  a.startTime     || "09:00",
  endTime:    a.endTime       || "10:00",
  locationId: a.locationId    || "",
  staffIds:   a.staffIds      || (a.instructorId ? [a.instructorId] : []),
  groupId:    a.groupId       || a.hosenType || "all",
  notes:      a.notes         || "",
});

/* ─────────────────── Component ─────────────────── */

export default function SchedulePage() {
  const router = useRouter();

  const [date,      setDate]      = useState(new Date().toISOString().split("T")[0]);
  const [schedule,  setSchedule]  = useState<DaySchedule>(EMPTY_SCHEDULE);
  const [staff,     setStaff]     = useState<Person[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [groups,    setGroups]    = useState<Group[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  /** "all" | "staff_only" | group.id */
  const [viewFilter, setViewFilter] = useState("all");

  /** null = hidden, "new" = new activity modal, Activity = edit */
  const [editingActivity, setEditingActivity] = useState<Activity | null | "new">(null);
  /** Which group to pre-select when opening "new" */
  const [newActivityGroup, setNewActivityGroup] = useState("all");

  /* ── Load reference data once ── */
  useEffect(() => {
    const init = async () => {
      const [usersSnap, locsSnap, groupsSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "locations")),
        getDocs(query(collection(db, "groups"), orderBy("name"))),
      ]);
      setStaff(usersSnap.docs.map(d => ({ id: d.id, name: d.data().name || d.data().email })));
      setLocations(locsSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
      setGroups(groupsSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
    };
    init();
  }, []);

  /* ── Load schedule for selected date ── */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "schedules", date));
        if (snap.exists()) {
          const data = snap.data();
          setSchedule({
            dutyInstructorId: data.dutyInstructorId || data.dutyId || "",
            activities: (data.activities || []).map(migrateActivity),
          });
        } else {
          const dow = new Date(date).getDay();
          const tpl = await getDoc(doc(db, "scheduleTemplates", String(dow)));
          if (tpl.exists()) {
            const data = tpl.data();
            setSchedule({
              dutyInstructorId: data.dutyInstructorId || data.dutyId || "",
              activities: (data.activities || []).map(migrateActivity),
            });
          } else {
            setSchedule(EMPTY_SCHEDULE);
          }
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [date]);

  /* ── Derived ── */
  const nameOf  = (id: string) => staff.find(s => s.id === id)?.name     || id;
  const locName = (id: string) => locations.find(l => l.id === id)?.name || "—";
  const groupLabel = (gid: string) =>
    gid === "all"        ? "משותף לכל הקבוצות" :
    gid === "staff_only" ? "צוות בלבד" :
    groups.find(g => g.id === gid)?.name || gid;

  const visibleActivities = useMemo(() =>
    schedule.activities
      .filter(a => viewFilter === "all" || a.groupId === viewFilter)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [schedule.activities, viewFilter]
  );

  const sections: { id: string; label: string; color: string }[] = [
    { id: "all",        label: "משותף", color: "border-blue-500/40" },
    ...groups.map((g, i) => ({ id: g.id, label: g.name, color: i === 0 ? "border-purple-500/40" : "border-teal-500/40" })),
    { id: "staff_only", label: "צוות בלבד", color: "border-slate-500/40" },
  ];

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
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const saveAsTemplate = async () => {
    const dow = new Date(date).getDay();
    setSaving(true);
    try {
      await setDoc(doc(db, "scheduleTemplates", String(dow)), schedule);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const openNew = (groupId = "all") => {
    setNewActivityGroup(groupId);
    setEditingActivity("new");
  };

  /* ── Render ── */
  const dateObj  = parseISO(date);
  const dateLabel = format(dateObj, "EEEE, d בMMMM yyyy", { locale: he });

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div className="min-h-screen bg-slate-950 text-white">

        {/* ── Sticky header ── */}
        <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-4xl mx-auto px-4 pt-4 pb-3 space-y-3">

            {/* Row 1: back · title · date nav */}
            <div className="flex items-center gap-3">
              <button onClick={() => router.push("/admin")}
                className="p-2 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all flex-shrink-0">
                <ArrowRight className="w-4 h-4" />
              </button>
              <div className="flex-1">
                <h1 className="text-[17px] font-bold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-rose-400" /> ניהול לו״ז
                </h1>
                <p className="text-[11px] text-slate-500 mt-0.5">{dateLabel}</p>
              </div>
              {/* Date navigation */}
              <div className="flex items-center gap-1">
                <button onClick={() => setDate(subDays(dateObj,1).toISOString().split("T")[0])}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-xs font-bold text-blue-400 focus:outline-none focus:border-blue-500 w-28" />
                <button onClick={() => setDate(addDays(dateObj,1).toISOString().split("T")[0])}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Row 2: view filter tabs */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
              {[{ id: "all", label: "הכל" }, ...sections.map(s => ({ id: s.id, label: s.label }))].map(tab => (
                <button key={tab.id} onClick={() => setViewFilter(tab.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                    viewFilter === tab.id
                      ? "bg-rose-600 border-rose-500 text-white"
                      : "bg-white/5 border-white/10 text-slate-400"
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>

          </div>
        </header>

        {/* ── Content ── */}
        <div className="max-w-4xl mx-auto px-4 pt-4 pb-32">

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-7 h-7 text-rose-400 animate-spin" />
              <p className="text-slate-500 text-sm">טוען לו״ז...</p>
            </div>
          ) : (
            <div className="space-y-6">

              {/* Duty instructor */}
              <div className="flex items-center gap-3 bg-rose-500/8 border border-rose-500/20 rounded-2xl px-4 py-3">
                <User className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span className="text-[12px] font-bold text-rose-300 flex-shrink-0">מדריך תורן:</span>
                <select
                  value={schedule.dutyInstructorId}
                  onChange={e => setSchedule(s => ({ ...s, dutyInstructorId: e.target.value }))}
                  className="flex-1 bg-transparent text-sm font-semibold focus:outline-none text-white">
                  <option value="" className="bg-slate-900 text-slate-400">בחר מדריך תורן...</option>
                  {staff.map(p => <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>)}
                </select>
              </div>

              {/* Sections — when viewing "all", render each section; otherwise render filtered list */}
              {viewFilter === "all" ? (
                sections.map(section => {
                  const acts = schedule.activities
                    .filter(a => a.groupId === section.id)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                  return (
                    <SectionBlock
                      key={section.id}
                      label={section.label}
                      color={section.color}
                      activities={acts}
                      staff={staff}
                      locations={locations}
                      onEdit={a => setEditingActivity(a)}
                      onDelete={deleteActivity}
                      onAdd={() => openNew(section.id)}
                      nameOf={nameOf}
                      locName={locName}
                    />
                  );
                })
              ) : (
                <SectionBlock
                  label={sections.find(s => s.id === viewFilter)?.label || ""}
                  color={sections.find(s => s.id === viewFilter)?.color || "border-white/20"}
                  activities={visibleActivities}
                  staff={staff}
                  locations={locations}
                  onEdit={a => setEditingActivity(a)}
                  onDelete={deleteActivity}
                  onAdd={() => openNew(viewFilter)}
                  nameOf={nameOf}
                  locName={locName}
                />
              )}

            </div>
          )}
        </div>

        {/* ── Floating action buttons ── */}
        <div className="fixed bottom-24 left-4 z-30 md:bottom-8">
          <button onClick={() => openNew()}
            className="w-14 h-14 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-rose-600/30 active:scale-95 transition-all">
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {/* ── Save bar ── */}
        <div className="fixed bottom-0 inset-x-0 z-30 bg-slate-950/95 backdrop-blur-xl border-t border-white/5 px-4 py-3 md:pb-4">
          <div className="max-w-4xl mx-auto flex gap-3">
            <button onClick={saveAsTemplate}
              className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:bg-white/10 transition-all flex-shrink-0">
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">שמור כתבנית ל{DAY_NAMES[new Date(date).getDay()]}</span>
              <span className="sm:hidden">תבנית</span>
            </button>
            <button onClick={saveSchedule} disabled={saving}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                saved
                  ? "bg-emerald-600 text-white"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 disabled:opacity-50"
              }`}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> :
               saved   ? <><Check className="w-4 h-4" /> נשמר!</> :
                         <><Save className="w-4 h-4" /> שמור לו״ז</>}
            </button>
          </div>
        </div>

        {/* ── Add / Edit modal ── */}
        <AnimatePresence>
          {editingActivity !== null && (
            <ActivityModal
              initial={editingActivity === "new"
                ? { id: uid(), title: "", startTime: "09:00", endTime: "10:00", locationId: "", staffIds: [], groupId: newActivityGroup, notes: "" }
                : editingActivity}
              groups={groups}
              staff={staff}
              locations={locations}
              onSave={upsertActivity}
              onClose={() => setEditingActivity(null)}
            />
          )}
        </AnimatePresence>

      </div>
    </RoleGuard>
  );
}

/* ─────────────────── SectionBlock ─────────────────── */

interface SectionBlockProps {
  label: string;
  color: string;
  activities: Activity[];
  staff: Person[];
  locations: Location[];
  onEdit: (a: Activity) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  nameOf: (id: string) => string;
  locName: (id: string) => string;
}

function SectionBlock({ label, color, activities, onEdit, onDelete, onAdd, nameOf, locName }: SectionBlockProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <div className={`w-1 h-5 rounded-full border-l-2 ${color}`} />
          <span className="text-[12px] font-bold text-slate-400">{label}</span>
          <span className="text-[10px] text-slate-600 font-bold">({activities.length})</span>
        </div>
        <button onClick={onAdd}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95">
          <Plus className="w-3 h-3" /> הוסף
        </button>
      </div>

      <div className="space-y-2">
        {activities.length === 0 ? (
          <button onClick={onAdd}
            className="w-full py-6 border border-dashed border-white/8 rounded-xl text-slate-600 text-sm flex items-center justify-center gap-2 hover:border-white/20 hover:text-slate-400 transition-all">
            <Plus className="w-4 h-4" /> הוסף פעילות ל{label}
          </button>
        ) : activities.map(a => (
          <ActivityCard key={a.id} activity={a} onEdit={() => onEdit(a)} onDelete={() => onDelete(a.id)} nameOf={nameOf} locName={locName} />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────── ActivityCard ─────────────────── */

interface ActivityCardProps {
  activity: Activity;
  onEdit: () => void;
  onDelete: () => void;
  nameOf: (id: string) => string;
  locName: (id: string) => string;
}

function ActivityCard({ activity, onEdit, onDelete, nameOf, locName }: ActivityCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.03] border border-white/8 rounded-xl overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Time */}
        <div className="flex-shrink-0 text-center">
          <div className="text-[12px] font-black text-blue-400">{activity.startTime}</div>
          <div className="w-px h-3 bg-white/10 mx-auto" />
          <div className="text-[11px] text-slate-600">{activity.endTime}</div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[14px] leading-tight truncate">{activity.title || <span className="text-slate-600 italic">ללא שם</span>}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
            {activity.locationId && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <MapPin className="w-3 h-3" />{locName(activity.locationId)}
              </span>
            )}
            {activity.staffIds.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <Users className="w-3 h-3" />{activity.staffIds.map(nameOf).join(", ")}
              </span>
            )}
          </div>
          {activity.notes && <p className="text-[11px] text-slate-600 mt-0.5 truncate">{activity.notes}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 transition-colors">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────── ActivityModal ─────────────────── */

interface ActivityModalProps {
  initial: Activity;
  groups: Group[];
  staff: Person[];
  locations: Location[];
  onSave: (a: Activity) => void;
  onClose: () => void;
}

function ActivityModal({ initial, groups, staff, locations, onSave, onClose }: ActivityModalProps) {
  const [form, setForm] = useState<Activity>(initial);
  const [staffSearch, setStaffSearch] = useState("");

  const set = (patch: Partial<Activity>) => setForm(f => ({ ...f, ...patch }));

  const toggleStaff = (id: string) =>
    set({ staffIds: form.staffIds.includes(id) ? form.staffIds.filter(x => x !== id) : [...form.staffIds, id] });

  const filteredStaff = staff.filter(p => p.name.toLowerCase().includes(staffSearch.toLowerCase()));

  const groupOptions = [
    { id: "all",        label: "משותף לכל הקבוצות", color: "text-blue-400"   },
    ...groups.map((g, i) => ({ id: g.id, label: g.name, color: i === 0 ? "text-purple-400" : "text-teal-400" })),
    { id: "staff_only", label: "צוות בלבד",           color: "text-slate-400" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 26, stiffness: 260 }}
        className="relative bg-slate-900 border-t sm:border border-white/10 w-full max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="font-bold text-base">{initial.title ? "עריכת פעילות" : "פעילות חדשה"}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal body */}
        <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">

          {/* Title */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">שם הפעילות</label>
            <input value={form.title} onChange={e => set({ title: e.target.value })}
              placeholder="למשל: פסיכודרמה, אמנות, ישיבת צוות..."
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
          </div>

          {/* Time */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">שעות</label>
            <div className="flex items-center gap-3">
              <input type="time" value={form.startTime} onChange={e => set({ startTime: e.target.value })}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
              <span className="text-slate-500 font-bold">עד</span>
              <input type="time" value={form.endTime} onChange={e => set({ endTime: e.target.value })}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
            </div>
          </div>

          {/* Group */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">קבוצה / קהל יעד</label>
            <div className="flex flex-wrap gap-2">
              {groupOptions.map(g => (
                <button key={g.id} type="button" onClick={() => set({ groupId: g.id })}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                    form.groupId === g.id
                      ? `bg-white/15 border-white/30 ${g.color}`
                      : "bg-white/5 border-white/10 text-slate-500"
                  }`}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">מיקום</label>
            <select value={form.locationId} onChange={e => set({ locationId: e.target.value })}
              className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors">
              <option value="">בחר מיקום...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Staff */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">
              אנשי צוות {form.staffIds.length > 0 && `(${form.staffIds.length} נבחרו)`}
            </label>
            <input value={staffSearch} onChange={e => setStaffSearch(e.target.value)}
              placeholder="חיפוש שם..."
              className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs mb-2 focus:border-blue-500 outline-none transition-colors" />
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {filteredStaff.map(p => (
                <button key={p.id} type="button" onClick={() => toggleStaff(p.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                    form.staffIds.includes(p.id)
                      ? "bg-blue-600/20 border border-blue-500/30 text-blue-300"
                      : "bg-white/[0.03] border border-white/5 text-slate-400 hover:bg-white/8"
                  }`}>
                  <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                    form.staffIds.includes(p.id) ? "bg-blue-600 border-blue-500" : "border-white/20"
                  }`}>
                    {form.staffIds.includes(p.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">הערות (אופציונלי)</label>
            <textarea value={form.notes || ""} onChange={e => set({ notes: e.target.value })}
              placeholder="פרטים נוספים, הוראות מיוחדות..."
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors resize-none" />
          </div>

        </div>

        {/* Modal footer */}
        <div className="flex gap-3 p-5 border-t border-white/8">
          <button onClick={onClose}
            className="flex-1 py-3 bg-white/5 rounded-xl font-bold text-sm hover:bg-white/10 transition-all">
            ביטול
          </button>
          <button onClick={() => onSave(form)}
            disabled={!form.title.trim()}
            className="flex-1 py-3 bg-blue-600 rounded-xl font-bold text-sm hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-40">
            שמור פעילות
          </button>
        </div>
      </motion.div>
    </div>
  );
}
