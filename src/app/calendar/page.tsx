"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin, Plus, Loader2, ArrowRight, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, addDays } from "date-fns";
import { he } from "date-fns/locale";

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; date?: string };
  end: { dateTime: string; date?: string };
  color?: string;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const router = useRouter();

  // For demonstration and future API integration
  // This would ideally fetch from Google Calendar API
  useEffect(() => {
    fetchMockEvents();
  }, [currentDate]);

  const fetchMockEvents = () => {
    setLoading(true);
    // Simulate API delay
    setTimeout(() => {
      const mockEvents: CalendarEvent[] = [
        {
          id: "1",
          summary: "ישיבת צוות שבועית",
          location: "חדר ישיבות קומה 2",
          start: { dateTime: new Date(new Date().setHours(10, 0)).toISOString() },
          end: { dateTime: new Date(new Date().setHours(11, 30)).toISOString() },
          color: "bg-blue-500"
        },
        {
          id: "2",
          summary: "סדנת חוסן עליון",
          location: "אולם מרכזי",
          start: { dateTime: new Date(new Date().setHours(14, 0)).toISOString() },
          end: { dateTime: new Date(new Date().setHours(16, 0)).toISOString() },
          color: "bg-emerald-500"
        }
      ];
      setEvents(mockEvents);
      setLoading(false);
    }, 800);
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const dayNames = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(new Date(event.start.dateTime), day));
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white p-4 pb-24 md:p-8">
        <header className="max-w-4xl mx-auto mb-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => router.push("/")}
                className="p-2.5 bg-white/5 border border-white/10 rounded-2xl active:scale-95 transition-all"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-3">
                  <CalendarIcon className="w-6 h-6 text-rose-400" />
                  לו״ז ויומן
                </h1>
                <p className="text-slate-500 text-[10px] font-bold mt-1 uppercase tracking-wider">סנכרון מלא עם Google Calendar</p>
              </div>
            </div>
            
            <button 
              onClick={() => window.open("https://calendar.google.com", "_blank")}
              className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl font-bold text-xs hover:bg-white/10 transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              פתח ביומן גוגל
            </button>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-6 shadow-2xl overflow-hidden relative">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-black text-white/90">
                {format(currentDate, "MMMM yyyy", { locale: he })}
              </h2>
              <div className="flex gap-2">
                <button onClick={prevMonth} className="p-2.5 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button onClick={nextMonth} className="p-2.5 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {dayNames.map(day => (
                <div key={day} className="text-center text-[10px] font-black text-slate-600 uppercase py-2">
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
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      relative aspect-square rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300
                      ${!isCurrentMonth ? "opacity-20" : "opacity-100"}
                      ${isSelected ? "bg-blue-600 shadow-lg shadow-blue-600/40" : "hover:bg-white/5"}
                    `}
                  >
                    <span className={`text-sm font-bold ${isToday && !isSelected ? "text-blue-400" : ""}`}>
                      {format(day, "d")}
                    </span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5 mt-1">
                        {dayEvents.slice(0, 3).map((_, i) => (
                          <div key={i} className={`w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-blue-500"}`} />
                        ))}
                      </div>
                    )}
                    {isToday && (
                      <div className="absolute top-2 right-2 w-1 h-1 bg-blue-400 rounded-full animate-pulse" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto">
          <section>
            <div className="flex items-center justify-between mb-6 px-4">
              <h3 className="text-sm font-bold text-slate-400 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                אירועים ליום {format(selectedDate, "d בMMMM", { locale: he })}
              </h3>
              <button 
                onClick={() => setShowEventModal(true)}
                className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 px-2">
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : getEventsForDay(selectedDate).length > 0 ? (
                getEventsForDay(selectedDate).map(event => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white/5 border border-white/5 p-6 rounded-[2rem] flex items-center justify-between group active:bg-white/10 transition-all"
                  >
                    <div className="flex items-center gap-5">
                      <div className={`w-1 h-12 rounded-full ${event.color || "bg-blue-500"}`} />
                      <div>
                        <h4 className="font-bold text-base tracking-tight">{event.summary}</h4>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-[11px] text-slate-500 flex items-center gap-1.5 font-bold">
                            <Clock className="w-3.5 h-3.5" />
                            {format(new Date(event.start.dateTime), "HH:mm")} - {format(new Date(event.end.dateTime), "HH:mm")}
                          </span>
                          {event.location && (
                            <span className="text-[11px] text-slate-500 flex items-center gap-1.5 font-bold">
                              <MapPin className="w-3.5 h-3.5" />
                              {event.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronLeft className="w-5 h-5 text-slate-700 group-hover:text-slate-400 transition-colors" />
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-16 bg-white/5 border border-dashed border-white/10 rounded-[3rem]">
                  <CalendarIcon className="w-12 h-12 text-slate-800 mx-auto mb-4 opacity-20" />
                  <p className="text-slate-600 text-sm italic">אין אירועים רשומים ליום זה</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Modal for adding events (Placeholder) */}
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
                className="relative bg-slate-900 w-full max-w-lg rounded-t-[3rem] sm:rounded-[3rem] p-8 shadow-2xl"
              >
                <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8 sm:hidden" />
                <h3 className="text-2xl font-bold mb-4">הוספת אירוע חדש</h3>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                  הוספת אירועים תבוצע ישירות דרך ממשק Google Calendar המאובטח כדי להבטיח סנכרון מלא עם כל המכשירים שלך.
                </p>
                <div className="space-y-4">
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
