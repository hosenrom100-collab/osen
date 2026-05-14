"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { doc, updateDoc } from "firebase/firestore";
import { Clock, Calendar, Check, Save, Loader2, X } from "lucide-react";

const DAYS = [
  { id: "0", label: "ראשון" },
  { id: "1", label: "שני" },
  { id: "2", label: "שלישי" },
  { id: "3", label: "רביעי" },
  { id: "4", label: "חמישי" },
  { id: "5", label: "שישי" },
  { id: "6", label: "שבת" },
];

export function StaffOnboardingModal() {
  const { user, onboardingComplete, role } = useAuth();
  const [isOpen, setIsOpen] = useState(!onboardingComplete && !!user);
  const [schedule, setSchedule] = useState<Record<string, { start: string, end: string }>>({});
  const [loading, setLoading] = useState(false);

  if (onboardingComplete || !user || !isOpen || role === "participant") return null;

  const toggleDay = (dayId: string) => {
    setSchedule(prev => {
      const next = { ...prev };
      if (next[dayId]) {
        delete next[dayId];
      } else {
        next[dayId] = { start: "08:00", end: "16:00" };
      }
      return next;
    });
  };

  const updateTime = (dayId: string, field: 'start' | 'end', value: string) => {
    setSchedule(prev => ({
      ...prev,
      [dayId]: { ...prev[dayId], [field]: value }
    }));
  };

  const handleSave = async () => {
    if (Object.keys(schedule).length === 0) {
      alert("יש לבחור לפחות יום עבודה אחד");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        workSchedule: schedule,
        onboardingComplete: true
      });
      setIsOpen(false);
      window.location.reload(); // Refresh to update context
    } catch (err) {
      console.error(err);
      alert("שגיאה בשמירת הנתונים");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-950/80 backdrop-blur-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-2xl bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] shadow-2xl overflow-hidden"
        >
          <div className="p-8 md:p-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-[var(--foreground)]">ברוך הבא!</h2>
                <p className="text-sm text-[var(--foreground)]/50 font-medium">כדי שנוכל לסנכרן את הנוכחות שלך, אנא הגדר את ימי ושעות העבודה הקבועים שלך.</p>
              </div>
            </div>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
              {DAYS.map((day) => (
                <div 
                  key={day.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    schedule[day.id] 
                      ? 'bg-rose-500/5 border-rose-500/30 shadow-sm' 
                      : 'bg-[var(--foreground)]/[0.02] border-[var(--border)] opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => toggleDay(day.id)}
                        className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                          schedule[day.id] ? 'bg-rose-500 border-rose-500 text-white' : 'border-[var(--border)]'
                        }`}
                      >
                        {schedule[day.id] && <Check className="w-4 h-4" />}
                      </button>
                      <span className="font-bold text-sm">יום {day.label}</span>
                    </div>

                    {schedule[day.id] && (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-[var(--foreground)]/30" />
                          <input 
                            type="time" 
                            value={schedule[day.id].start}
                            onChange={(e) => updateTime(day.id, 'start', e.target.value)}
                            className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs font-bold outline-none focus:border-rose-500"
                          />
                        </div>
                        <span className="text-[var(--foreground)]/20">—</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="time" 
                            value={schedule[day.id].end}
                            onChange={(e) => updateTime(day.id, 'end', e.target.value)}
                            className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs font-bold outline-none focus:border-rose-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 flex gap-4">
              <button 
                onClick={handleSave}
                disabled={loading}
                className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white py-4 rounded-2xl text-sm font-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                שמור והמשך
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
