"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useCallback } from "react";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin,
  Plus, Loader2, ArrowRight, ExternalLink, AlertTriangle, RefreshCw,
  CheckCircle, Info, Trash2, X, Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, parseISO,
} from "date-fns";
import { he } from "date-fns/locale";

/* ── Types ── */

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end:   { dateTime?: string; date?: string };
  htmlLink?: string;
}

interface SyncError {
  message: string;
  hint?:   string;
  type?:   string;
}

interface NewEventForm {
  title:       string;
  allDay:      boolean;
  startDate:   string;
  startTime:   string;
  endDate:     string;
  endTime:     string;
  description: string;
  location:    string;
}

const SERVICE_ACCOUNT = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL
  || "firebase-adminsdk-fbsvc@hosen-550dc.iam.gserviceaccount.com";

const DAY_NAMES = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

const getEventStart = (e: CalendarEvent) =>
  new Date(e.start.dateTime || e.start.date || new Date().toISOString());

/* ── Component ── */

export default function CalendarPage() {
  const router = useRouter();

  const [currentDate,  setCurrentDate]  = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [cache,        setCache]        = useState<Record<string, CalendarEvent[]>>({});

  type SyncStatus = "idle" | "loading" | "ok" | "error";
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError,  setSyncError]  = useState<SyncError | null>(null);

  const [showCreate,   setShowCreate]   = useState(false);
  const [createError,  setCreateError]  = useState<string | null>(null);
  const [creating,     setCreating]     = useState(false);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [showSetup,    setShowSetup]    = useState(false);

  const [form, setForm] = useState<NewEventForm>({
    title: "", allDay: false,
    startDate: format(new Date(), "yyyy-MM-dd"), startTime: "09:00",
    endDate:   format(new Date(), "yyyy-MM-dd"), endTime:   "10:00",
    description: "", location: "",
  });

  /* ── Fetch for a month ── */
  const fetchMonth = useCallback(async (date: Date, force = false) => {
    const key  = format(date, "yyyy-MM");
    if (!force && cache[key]) return; // already cached

    setSyncStatus("loading");
    setSyncError(null);

    const from = format(startOfMonth(date), "yyyy-MM-dd");
    const to   = format(endOfMonth(date),   "yyyy-MM-dd");

    try {
      const res  = await fetch(`/api/calendar?from=${from}&to=${to}`);
      const data = await res.json();

      if (!res.ok) {
        setSyncError({ message: data.error || "שגיאה", hint: data.hint, type: data.type });
        setSyncStatus("error");
        setShowSetup(["MISSING_CONFIG","NOT_FOUND","FORBIDDEN","AUTH_ERROR"].includes(data.type));
        return;
      }
      setCache(c => ({ ...c, [key]: data }));
      setSyncStatus("ok");
    } catch (err: any) {
      setSyncError({ message: err.message || "שגיאת רשת" });
      setSyncStatus("error");
    }
  }, [cache]);

  /* ── Load month on change ── */
  useEffect(() => { fetchMonth(currentDate); }, [currentDate]);

  /* ── Sync selectedDate start fields when selected changes ── */
  useEffect(() => {
    const d = format(selectedDate, "yyyy-MM-dd");
    setForm(f => ({ ...f, startDate: d, endDate: d }));
  }, [selectedDate]);

  /* ── Derived ── */
  const monthKey   = format(currentDate, "yyyy-MM");
  const events     = cache[monthKey] ?? [];

  const monthStart  = startOfMonth(currentDate);
  const calDays     = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(monthStart)) });
  const dayEvents   = (day: Date) => events.filter(e => isSameDay(getEventStart(e), day));
  const selectedEvs = dayEvents(selectedDate).sort((a, b) =>
    getEventStart(a).getTime() - getEventStart(b).getTime()
  );

  /* ── Create event ── */
  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res  = await fetch("/api/calendar", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.hint || data.error || "שגיאה ביצירת האירוע");

      // Invalidate cache for affected month and re-fetch
      const affectedKey = format(parseISO(form.startDate), "yyyy-MM");
      setCache(c => { const n = { ...c }; delete n[affectedKey]; return n; });
      setShowCreate(false);
      setForm(f => ({ ...f, title: "", description: "", location: "" }));
      await fetchMonth(currentDate, true);
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  /* ── Delete event ── */
  const handleDelete = async (eventId: string) => {
    setDeletingId(eventId);
    try {
      await fetch(`/api/calendar?eventId=${encodeURIComponent(eventId)}`, { method: "DELETE" });
      const key = format(currentDate, "yyyy-MM");
      setCache(c => ({ ...c, [key]: (c[key] || []).filter(e => e.id !== eventId) }));
    } finally {
      setDeletingId(null);
    }
  };

  /* ── Render ── */
  return (
    <RoleGuard allowedRoles={["admin","manager","instructor","social_worker","employee"]} redirectTo="/">
      <div className="min-h-screen bg-slate-950 text-white">

        {/* ── Sticky header ── */}
        <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-white/5 px-4 pt-4 pb-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button onClick={() => router.push("/")}
              className="p-2 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all flex-shrink-0">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex-1">
              <h1 className="text-[17px] font-bold flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-rose-400" /> יומן
              </h1>
              {/* Connection status */}
              <div className="flex items-center gap-1.5 mt-0.5">
                {syncStatus === "loading" && <Loader2 className="w-2.5 h-2.5 text-slate-500 animate-spin" />}
                {syncStatus === "ok"      && <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />}
                {syncStatus === "error"   && <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />}
                <span className={`text-[10px] font-bold ${
                  syncStatus === "ok"    ? "text-emerald-400" :
                  syncStatus === "error" ? "text-amber-400"   : "text-slate-500"
                }`}>
                  {syncStatus === "loading" ? "מסנכרן..." :
                   syncStatus === "ok"      ? "מסונכרן עם Google Calendar" :
                   syncStatus === "error"   ? "שגיאת סנכרון" : "Google Calendar"}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5">
              <button onClick={() => fetchMonth(currentDate, true)} disabled={syncStatus === "loading"}
                className="p-2 rounded-xl bg-white/5 border border-white/10 disabled:opacity-40 active:scale-95 transition-all">
                <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === "loading" ? "animate-spin" : ""}`} />
              </button>
              <button onClick={() => window.open("https://calendar.google.com", "_blank")}
                className="p-2 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all">
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 active:scale-95 transition-all">
                <Plus className="w-3.5 h-3.5" /> אירוע
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 space-y-4">

          {/* ── Error / Setup banner ── */}
          <AnimatePresence>
            {syncError && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="bg-amber-500/10 border border-amber-500/25 rounded-2xl overflow-hidden"
              >
                <div className="flex items-start gap-3 p-4">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-amber-400 text-[13px] font-bold">{syncError.message}</p>
                    {syncError.hint && (
                      <p className="text-amber-400/70 text-[11px] mt-1 leading-relaxed">{syncError.hint}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setShowSetup(s => !s)}
                      className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
                      <Info className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => fetchMonth(currentDate, true)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-[11px] font-bold hover:bg-amber-500/25 transition-colors">
                      נסה שוב
                    </button>
                  </div>
                </div>

                {/* Expandable setup guide */}
                <AnimatePresence>
                  {showSetup && (
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                      className="overflow-hidden border-t border-amber-500/15"
                    >
                      <div className="p-4 space-y-3">
                        <p className="text-amber-300 text-[12px] font-bold">הוראות חיבור יומן גוגל:</p>
                        <ol className="space-y-2 text-[11px] text-amber-400/80 leading-relaxed list-decimal list-inside">
                          <li>פתח <strong>הגדרות יומן גוגל</strong> ← בחר את היומן הרצוי</li>
                          <li>עבור ל-<strong>שיתוף אנשים</strong> ← הוסף:</li>
                        </ol>
                        <code className="block bg-black/30 text-amber-300 text-[10px] p-2 rounded-lg font-mono break-all">
                          {SERVICE_ACCOUNT}
                        </code>
                        <ol start={3} className="space-y-2 text-[11px] text-amber-400/80 list-decimal list-inside">
                          <li>הרשאה לקריאה: <em>ראה פרטי כל האירועים</em></li>
                          <li>הרשאה לכתיבה: <em>בצע שינויים לאירועים</em></li>
                          <li>ודא ש-<code className="text-amber-300 font-mono">GOOGLE_CALENDAR_ID</code> ב-.env.local נכון</li>
                        </ol>
                        <button onClick={() => navigator.clipboard?.writeText(SERVICE_ACCOUNT)}
                          className="text-[10px] text-amber-400 underline">
                          העתק אימייל חשבון השירות
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Month calendar grid ── */}
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-black">
                {format(currentDate, "MMMM yyyy", { locale: he })}
              </h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentDate(d => subMonths(d, 1))}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-[11px] font-bold transition-colors">
                  היום
                </button>
                <button onClick={() => setCurrentDate(d => addMonths(d, 1))}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Day names */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-[10px] font-black text-slate-600 py-1">{d}</div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 gap-0.5">
              {calDays.map((day, i) => {
                const evs        = dayEvents(day);
                const isSelected = isSameDay(day, selectedDate);
                const isToday    = isSameDay(day, new Date());
                const inMonth    = isSameMonth(day, monthStart);
                return (
                  <motion.button
                    key={i} whileTap={{ scale: 0.9 }}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      relative aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors
                      ${!inMonth ? "opacity-20" : ""}
                      ${isSelected ? "bg-blue-600 shadow-lg shadow-blue-600/30" : "hover:bg-white/5 active:bg-white/8"}
                    `}
                  >
                    <span className={`text-xs font-bold leading-none ${isToday && !isSelected ? "text-blue-400" : ""}`}>
                      {format(day, "d")}
                    </span>
                    {evs.length > 0 && (
                      <div className="flex gap-0.5">
                        {evs.slice(0, 3).map((_, j) => (
                          <div key={j} className={`w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-blue-400"}`} />
                        ))}
                      </div>
                    )}
                    {isToday && !isSelected && (
                      <div className="absolute top-1 right-1 w-1 h-1 bg-blue-400 rounded-full" />
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* ── Day event list ── */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-[13px] font-bold text-slate-400 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                {format(selectedDate, "EEEE, d בMMMM", { locale: he })}
              </h3>
              <button onClick={() => setShowCreate(true)}
                className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                <Plus className="w-3 h-3" /> הוסף
              </button>
            </div>

            {syncStatus === "loading" && !events.length ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              </div>
            ) : selectedEvs.length === 0 ? (
              <div className="text-center py-10 bg-white/[0.02] border border-dashed border-white/8 rounded-2xl">
                <CalendarIcon className="w-8 h-8 text-slate-800 mx-auto mb-2" />
                <p className="text-slate-600 text-sm">
                  {syncError ? "לא ניתן לטעון אירועים" : "אין אירועים ביום זה"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedEvs.map(event => {
                  const isAllDay = !event.start.dateTime;
                  return (
                    <motion.div key={event.id}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-white/[0.03] border border-white/8 rounded-2xl flex items-center gap-3 px-4 py-3 group"
                    >
                      <div className="w-1 self-stretch bg-blue-500 rounded-full flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[14px] leading-tight truncate">{event.summary}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Clock className="w-3 h-3" />
                            {isAllDay ? "כל היום" :
                              `${format(new Date(event.start.dateTime!), "HH:mm")} – ${format(new Date(event.end.dateTime!), "HH:mm")}`
                            }
                          </span>
                          {event.location && (
                            <span className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              {event.location}
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{event.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {event.htmlLink && (
                          <a href={event.htmlLink} target="_blank" rel="noreferrer"
                            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-blue-400 transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button onClick={() => handleDelete(event.id)} disabled={deletingId === event.id}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 transition-colors disabled:opacity-40">
                          {deletingId === event.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* ── Create event modal ── */}
        <AnimatePresence>
          {showCreate && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowCreate(false)}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

              <motion.div
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 26, stiffness: 260 }}
                className="relative bg-slate-900 border-t sm:border border-white/10 w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl"
              >
                <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-3 mb-1 sm:hidden" />
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                  <h2 className="font-bold text-base">אירוע חדש</h2>
                  <button onClick={() => setShowCreate(false)} className="p-2 rounded-xl hover:bg-white/5 text-slate-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
                  {createError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[12px] text-rose-400 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {createError}
                    </div>
                  )}

                  {/* Title */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">כותרת *</label>
                    <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="שם האירוע..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
                  </div>

                  {/* All-day toggle */}
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setForm(f => ({ ...f, allDay: !f.allDay }))}
                      className={`w-10 h-6 rounded-full transition-colors ${form.allDay ? "bg-blue-600" : "bg-white/10"}`}>
                      <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${form.allDay ? "translate-x-4" : ""}`} />
                    </button>
                    <span className="text-sm text-slate-400">אירוע כל היום</span>
                  </div>

                  {/* Dates / times */}
                  <div className={`grid gap-3 ${form.allDay ? "grid-cols-2" : "grid-cols-1"}`}>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">תאריך התחלה</label>
                      <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
                    </div>
                    {form.allDay ? (
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">תאריך סיום</label>
                        <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
                      </div>
                    ) : (
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">שעות</label>
                        <div className="flex items-center gap-2">
                          <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
                          <span className="text-slate-500 text-sm">–</span>
                          <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Location */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">מיקום (אופציונלי)</label>
                    <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                      placeholder="כתובת או שם מקום..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors" />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">תיאור (אופציונלי)</label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="פרטים נוספים..." rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-colors resize-none" />
                  </div>
                </div>

                <div className="flex gap-3 p-5 border-t border-white/8">
                  <button onClick={() => setShowCreate(false)}
                    className="flex-1 py-3 bg-white/5 rounded-xl font-bold text-sm hover:bg-white/10 transition-all">
                    ביטול
                  </button>
                  <button onClick={handleCreate} disabled={!form.title.trim() || creating}
                    className="flex-1 py-3 bg-emerald-600 rounded-xl font-bold text-sm hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-40 flex items-center justify-center gap-2">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> צור אירוע</>}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </RoleGuard>
  );
}
