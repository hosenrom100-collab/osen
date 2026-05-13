"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin, Plus, Loader2, ArrowRight, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";
import { he } from "date-fns/locale";

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  color?: string;
}

const getEventDate = (eventTime: { dateTime?: string; date?: string }) =>
  new Date(eventTime.dateTime || eventTime.date || new Date().toISOString());

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    setSyncError(null);
    try {
      const response = await fetch("/api/calendar");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "שגיאה בטעינת אירועים");
      }
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("תגובה לא תקינה מהשרת");
      setEvents(data);
    } catch (error: any) {
      console.error("Error fetching events:", error);
      setSyncError(error.message || "לא ניתן להתחבר ליומן גוגל");
    } finally {
      setLoading(false);
    }
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });
  const dayNames = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

  const getEventsForDay = (day: Date) =>
    events.filter(event => isSameDay(getEventDate(event.start), day));

  const selectedEvents = getEventsForDay(selectedDate);

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white p-4 pb-28 md:p-8">
        {/* Header */}
        <header className="max-w-4xl mx-auto mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="p-2.5 bg-white/5 border border-white/10 rounded-2xl active:scale-95 transition-all"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-rose-400" />
                  לו״ז ויומן
                </h1>
                <p className="text-slate-500 text-[10px] font-bold mt-0.5 uppercase tracking-wider">
                  סנכרון עם Google Calendar
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchEvents}
                disabled={loading}
                className="p-2.5 bg-white/5 border border-white/10 rounded-2xl active:scale-95 transition-all disabled:opacity-50"
                title="רענן"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={() => window.open("https://calendar.google.com", "_blank")}
                className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-2.5 rounded-2xl font-bold text-xs hover:bg-white/10 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">פתח ביומן גוגל</span>
              </button>
            </div>
          </div>

          {/* Sync Error Banner */}
          <AnimatePresence>
            {syncError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-4 flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4"
              >
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-amber-400 text-xs font-bold">שגיאת סנכרון</p>
                  <p className="text-amber-400/70 text-[11px] mt-0.5 truncate">{syncError}</p>
                </div>
                <button
                  onClick={fetchEvents}
                  className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-xl hover:bg-amber-500/20 transition-all flex-shrink-0"
                >
                  נסה שוב
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Calendar Grid */}
          <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-black text-white/90">
                {format(currentDate, "MMMM yyyy", { locale: he })}
              </h2>
              <div className="flex gap-2">
                <button onClick={prevMonth} className="p-2.5 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={nextMonth} className="p-2.5 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {dayNames.map(day => (
                <div key={day} className="text-center text-[10px] font-black text-slate-600 py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => {
                const dayEvents = getEventsForDay(day);
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, monthStart);

                return (
                  <motion.div
                    key={idx}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      relative aspect-square rounded-xl sm:rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200
                      ${!isCurrentMonth ? "opacity-20" : ""}
                      ${isSelected ? "bg-blue-600 shadow-lg shadow-blue-600/40" : "hover:bg-white/5 active:bg-white/10"}
                    `}
                  >
                    <span className={`text-xs sm:text-sm font-bold ${isToday && !isSelected ? "text-blue-400" : ""}`}>
                      {format(day, "d")}
                    </span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {dayEvents.slice(0, 3).map((_, i) => (
                          <div key={i} className={`w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-blue-500"}`} />
                        ))}
                      </div>
                    )}
                    {isToday && (
                      <div className="absolute top-1 right-1 w-1 h-1 bg-blue-400 rounded-full animate-pulse" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </header>

        {/* Events for selected day */}
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-sm font-bold text-slate-400 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {format(selectedDate, "EEEE, d בMMMM", { locale: he })}
            </h3>
            <button
              onClick={() => setShowEventModal(true)}
              className="w-9 h-9 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
              </div>
            ) : selectedEvents.length > 0 ? (
              selectedEvents.map(event => {
                const isAllDay = !event.start.dateTime;
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white/5 border border-white/5 p-4 sm:p-5 rounded-[1.75rem] flex items-center gap-4 active:bg-white/10 transition-all"
                  >
                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${event.color || "bg-blue-500"}`} />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm tracking-tight truncate">{event.summary}</h4>
                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <span className="text-[11px] text-slate-500 flex items-center gap-1 font-bold">
                          <Clock className="w-3 h-3" />
                          {isAllDay
                            ? "כל היום"
                            : `${format(new Date(event.start.dateTime!), "HH:mm")} – ${format(new Date(event.end.dateTime!), "HH:mm")}`
                          }
                        </span>
                        {event.location && (
                          <span className="text-[11px] text-slate-500 flex items-center gap-1 font-bold truncate">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {event.location}
                          </span>
                        )}
                      </div>
                      {event.description && (
                        <p className="text-[11px] text-slate-600 mt-1.5 line-clamp-2">{event.description}</p>
                      )}
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="text-center py-14 bg-white/5 border border-dashed border-white/10 rounded-[2.5rem]">
                <CalendarIcon className="w-10 h-10 text-slate-800 mx-auto mb-3 opacity-30" />
                <p className="text-slate-600 text-sm">
                  {syncError ? "לא ניתן לטעון אירועים" : "אין אירועים ביום זה"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Add Event Modal */}
        <AnimatePresence>
          {showEventModal && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowEventModal(false)}
                className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="relative bg-slate-900 w-full max-w-lg rounded-t-[3rem] sm:rounded-[3rem] p-8 shadow-2xl"
              >
                <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8 sm:hidden" />
                <h3 className="text-xl font-bold mb-3">הוספת אירוע חדש</h3>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                  הוספת אירועים מתבצעת ישירות דרך Google Calendar כדי לשמור על סנכרון מלא בכל המכשירים.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => window.open("https://calendar.google.com", "_blank")}
                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    <CalendarIcon className="w-5 h-5" />
                    פתח יומן גוגל להוספה
                  </button>
                  <button
                    onClick={() => setShowEventModal(false)}
                    className="w-full bg-white/5 border border-white/10 py-4 rounded-2xl font-bold text-sm hover:bg-white/10 transition-all"
                  >
                    ביטול
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </RoleGuard>
  );
}
