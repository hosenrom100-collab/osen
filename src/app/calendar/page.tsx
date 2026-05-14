"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useCallback } from "react";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin,
  Plus, Loader2, ArrowRight, ExternalLink, AlertTriangle, RefreshCw,
  CheckCircle, Info, Trash2, X, Check, Search, Filter, MoreVertical
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

const DAY_NAMES = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "שבת"];

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
    if (!force && cache[key]) return; 

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

  useEffect(() => { fetchMonth(currentDate); }, [currentDate]);

  useEffect(() => {
    const d = format(selectedDate, "yyyy-MM-dd");
    setForm(f => ({ ...f, startDate: d, endDate: d }));
  }, [selectedDate]);

  const monthKey   = format(currentDate, "yyyy-MM");
  const events     = cache[monthKey] ?? [];

  const monthStart  = startOfMonth(currentDate);
  const calDays     = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(monthStart)) });
  const dayEvents   = (day: Date) => events.filter(e => isSameDay(getEventStart(e), day));
  const selectedEvs = dayEvents(selectedDate).sort((a, b) =>
    getEventStart(a).getTime() - getEventStart(b).getTime()
  );

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

  return (
    <RoleGuard allowedRoles={["admin","manager","instructor","social_worker","employee"]} redirectTo="/">
      <div dir="rtl" className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-rose-500/30">
        
        {/* ── Desktop CRM Header ── */}
        <header className="hidden md:flex items-center justify-between px-8 h-16 shrink-0 border-b border-border bg-card-bg/40 backdrop-blur-md z-30">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                <Link href="/" className="hover:text-rose-400 transition-colors">בית</Link>
                <ChevronRight className="w-2.5 h-2.5 opacity-30" />
                <span className="text-slate-400">יומן ושיבוצים</span>
              </div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-rose-400" />
                ניהול יומן עבודה
              </h1>
            </div>

            {/* Sync Status Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] border border-white/[0.08] rounded-full">
              {syncStatus === "loading" && <Loader2 className="w-3 h-3 text-slate-500 animate-spin" />}
              {syncStatus === "ok"      && <CheckCircle className="w-3 h-3 text-emerald-400" />}
              {syncStatus === "error"   && <AlertTriangle className="w-3 h-3 text-amber-400" />}
              <span className={`text-[10px] font-black uppercase tracking-tight ${
                syncStatus === "ok" ? "text-emerald-400/80" : 
                syncStatus === "error" ? "text-amber-400/80" : "text-slate-500"
              }`}>
                {syncStatus === "loading" ? "מסנכרן..." : syncStatus === "ok" ? "Google Cal Connected" : "Connection Error"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white/[0.03] p-1 rounded-lg border border-white/[0.05]">
              <button onClick={() => setCurrentDate(d => subMonths(d, 1))} className="p-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
              <button onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }} className="px-3 py-1 text-xs font-bold text-slate-300 hover:text-white transition-all">היום</button>
              <button onClick={() => setCurrentDate(d => addMonths(d, 1))} className="p-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
            </div>

            <div className="w-px h-6 bg-white/[0.07] mx-1" />

            <button onClick={() => fetchMonth(currentDate, true)} disabled={syncStatus === "loading"}
              className="p-2 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 border border-white/[0.07] rounded-lg transition-all" title="רענן סנכרון">
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === "loading" ? "animate-spin" : ""}`} />
            </button>

            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-rose-600/20 transition-all active:scale-[0.98]">
              <Plus className="w-3.5 h-3.5" />
              אירוע חדש
            </button>
          </div>
        </header>

        {/* ── Mobile Header ── */}
        <header className="md:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-lg border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push("/")} className="p-2 rounded-xl bg-white/5 border border-white/10"><ArrowRight className="w-4 h-4" /></button>
              <h1 className="text-base font-bold">יומן</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => fetchMonth(currentDate, true)} className="p-2 bg-white/5 rounded-lg"><RefreshCw className={`w-3.5 h-3.5 ${syncStatus === "loading" ? "animate-spin" : ""}`} /></button>
              <button onClick={() => setShowCreate(true)} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">חדש</button>
            </div>
          </div>
        </header>

        {/* ── Content Area ── */}
        <main className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Left Sidebar (Desktop Only) */}
          <aside className="hidden lg:flex w-72 shrink-0 border-l border-border bg-card-bg/40 p-6 flex-col gap-8 overflow-y-auto custom-scrollbar">
            
            {/* Mini Calendar Navigation */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest">ניווט מהיר</h3>
                <div className="flex gap-1">
                   <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 hover:bg-white/5 rounded"><ChevronRight className="w-3 h-3" /></button>
                   <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 hover:bg-white/5 rounded"><ChevronLeft className="w-3 h-3" /></button>
                </div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                <p className="text-xs font-bold text-center mb-3 text-slate-300">{format(currentDate, "MMMM yyyy", { locale: he })}</p>
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {DAY_NAMES.map(d => <div key={d} className="text-[9px] font-black text-slate-600 text-center">{d[0]}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calDays.map((day, i) => {
                    const isSelected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, new Date());
                    const inMonth = isSameMonth(day, monthStart);
                    return (
                      <button key={i} onClick={() => { setSelectedDate(day); if(!inMonth) setCurrentDate(day); }}
                        className={`aspect-square flex items-center justify-center text-[10px] rounded-lg transition-all ${
                          isSelected ? "bg-rose-600 text-white font-black" : 
                          isToday ? "text-rose-400 bg-rose-500/10" :
                          inMonth ? "text-slate-400 hover:bg-white/5" : "text-slate-700"
                        }`}>
                        {format(day, "d")}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Upcoming Section */}
            <div>
              <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">אירועים קרובים</h3>
              <div className="space-y-3">
                {events.filter(e => getEventStart(e) >= new Date()).slice(0, 5).map(e => (
                   <div key={e.id} className="p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl group hover:border-white/[0.1] transition-all cursor-default">
                      <p className="text-xs font-bold text-slate-200 line-clamp-1 group-hover:text-rose-400 transition-colors">{e.summary}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{format(getEventStart(e), "d בMMM, HH:mm", { locale: he })}</p>
                   </div>
                ))}
              </div>
            </div>

            {/* Sync Help */}
            <div className="mt-auto p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-tight">סנכרון יומן</span>
              </div>
              <p className="text-[10px] text-amber-400/60 leading-relaxed">
                היומן מסונכרן אוטומטית עם Google Calendar. שינויים שתבצע כאן יתעדכנו ביומן המשותף של המרכז.
              </p>
            </div>
          </aside>

          {/* Main Grid Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-background/20">
            
            {/* Calendar Desktop Grid */}
            <div className="hidden md:flex flex-col h-full overflow-hidden">
               {/* Day Names Grid */}
               <div className="grid grid-cols-7 border-b border-white/[0.07] bg-white/[0.02]">
                 {DAY_NAMES.map(d => (
                   <div key={d} className="px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] border-l border-white/[0.03] text-center last:border-l-0">{d}</div>
                 ))}
               </div>
               
               {/* Days Cells */}
               <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto custom-scrollbar no-scrollbar">
                  {calDays.map((day, i) => {
                    const isSelected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, new Date());
                    const inMonth = isSameMonth(day, monthStart);
                    const evs = dayEvents(day).sort((a,b) => getEventStart(a).getTime() - getEventStart(b).getTime());
                    
                    return (
                      <div key={i} onClick={() => setSelectedDate(day)}
                        className={`min-h-[120px] p-2 border-b border-l border-white/[0.03] last:border-l-0 transition-all flex flex-col gap-1 cursor-default ${
                          !inMonth ? "bg-white/[0.01] opacity-30" : "bg-transparent hover:bg-white/[0.02]"
                        } ${isSelected ? "bg-rose-500/[0.03] ring-1 ring-inset ring-rose-500/20" : ""}`}>
                        
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full ${
                            isToday ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20" : 
                            isSelected ? "text-rose-400" : "text-slate-600"
                          }`}>{format(day, "d")}</span>
                          {evs.length > 0 && <span className="text-[9px] font-bold text-slate-700 bg-white/5 px-1.5 py-0.5 rounded uppercase tracking-tighter">{evs.length} אירועים</span>}
                        </div>

                        <div className="space-y-1 overflow-y-auto no-scrollbar max-h-32">
                          {evs.map(e => (
                             <div key={e.id} className="px-2 py-1 bg-white/[0.04] border border-white/[0.05] rounded text-[10px] text-slate-300 font-bold truncate hover:bg-white/[0.08] transition-colors cursor-pointer group">
                                <span className="text-rose-400/80 mr-1 text-[9px]">{format(getEventStart(e), "HH:mm")}</span>
                                <span>{e.summary}</span>
                             </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
               </div>
            </div>

            {/* Mobile List View */}
            <div className="md:hidden flex-1 flex flex-col overflow-hidden">
               {/* Mini Strip Cal */}
               <div className="bg-slate-900/50 border-b border-white/[0.07] px-2 py-3 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
                  {calDays.slice(0, 14).map((day, i) => {
                    const isSelected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, new Date());
                    return (
                      <button key={i} onClick={() => setSelectedDate(day)}
                        className={`flex flex-col items-center min-w-[48px] py-2 rounded-xl transition-all ${
                          isSelected ? "bg-rose-600 text-white" : "bg-white/5 text-slate-400"
                        }`}>
                        <span className="text-[10px] font-bold uppercase">{format(day, "eee", { locale: he })}</span>
                        <span className="text-sm font-black">{format(day, "d")}</span>
                        {isToday && !isSelected && <div className="w-1 h-1 bg-rose-500 rounded-full mt-1" />}
                      </button>
                    );
                  })}
               </div>
               
               {/* Selected Day Events */}
               <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{format(selectedDate, "EEEE, d בMMMM", { locale: he })}</h3>
                  {selectedEvs.length === 0 ? (
                    <div className="py-20 text-center opacity-30 grayscale flex flex-col items-center">
                       <CalendarIcon className="w-12 h-12 mb-4" />
                       <p className="text-sm">אין אירועים רשומים ליום זה</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                       {selectedEvs.map(e => (
                          <div key={e.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex gap-4">
                             <div className="w-1 bg-rose-600 rounded-full shrink-0" />
                             <div className="flex-1">
                                <p className="font-bold text-sm text-white mb-1">{e.summary}</p>
                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                   <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {format(getEventStart(e), "HH:mm")}</span>
                                   {e.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {e.location}</span>}
                                </div>
                             </div>
                             <button onClick={() => handleDelete(e.id)} className="p-2 text-slate-700 active:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </div>
                       ))}
                    </div>
                  )}
               </div>
            </div>

          </div>

        </main>

        {/* ── Modals (Create Event) ── */}
        <AnimatePresence>
          {showCreate && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCreate(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
               <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="relative bg-slate-900 border border-white/[0.1] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
                  <div className="px-6 py-5 border-b border-white/[0.07] flex items-center justify-between bg-white/[0.02]">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><Plus className="w-4 h-4 text-rose-500" /> אירוע חדש</h3>
                    <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">כותרת האירוע</label>
                      <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="לדוגמה: ישיבת צוות שבועית" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm font-medium focus:border-rose-500/50 outline-none transition-all" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">תאריך</label>
                        <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm font-medium focus:border-rose-500/50 outline-none transition-all" />
                       </div>
                       <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">שעה</label>
                        <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm font-medium focus:border-rose-500/50 outline-none transition-all" />
                       </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">מיקום (אופציונלי)</label>
                      <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="חדר ישיבות, זום..." className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm font-medium focus:border-rose-500/50 outline-none transition-all" />
                    </div>
                  </div>
                  <div className="p-6 border-t border-white/[0.07] bg-white/[0.01] flex gap-3">
                    <button onClick={() => setShowCreate(false)} className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-sm text-slate-400">ביטול</button>
                    <button onClick={handleCreate} disabled={!form.title.trim() || creating} className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-500 rounded-2xl font-bold text-sm text-white shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2">
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
