"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, setDoc, doc, query, orderBy, getDoc } from "firebase/firestore";
import { Calendar, Clock, MapPin, User, Plus, Trash2, Save, Copy, Loader2, ArrowRight, Layers } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface Activity {
  id: string;
  hosenType: string; // Group ID
  startTime: string;
  endTime: string;
  activityType: string;
  locationId: string;
  instructorId: string;
}

interface DailySchedule {
  dutyId: string; // Single duty instructor for all groups
  activities: Activity[];
}

interface Group {
  id: string;
  name: string;
}

export default function ScheduleManagementPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [schedule, setSchedule] = useState<DailySchedule>({
    dutyId: "",
    activities: []
  });
  const [instructors, setInstructors] = useState<{id: string, name: string}[]>([]);
  const [locations, setLocations] = useState<{id: string, name: string}[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchBaseData();
  }, []);

  useEffect(() => {
    fetchScheduleForDate();
  }, [date, groups]);

  const fetchBaseData = async () => {
    try {
      // 1. Fetch instructors (all staff)
      const usersSnap = await getDocs(collection(db, "users"));
      const instList: {id: string, name: string}[] = [];
      usersSnap.forEach(doc => {
        const data = doc.data();
        instList.push({ id: doc.id, name: data.name || data.email });
      });
      setInstructors(instList);

      // 2. Fetch locations
      const locsSnap = await getDocs(collection(db, "locations"));
      const locList: {id: string, name: string}[] = [];
      locsSnap.forEach(doc => {
        locList.push({ id: doc.id, name: doc.data().name });
      });
      setLocations(locList);

      // 3. Fetch groups
      const groupsSnap = await getDocs(query(collection(db, "groups"), orderBy("name")));
      const groupList: Group[] = [];
      groupsSnap.forEach(doc => {
        groupList.push({ id: doc.id, name: doc.data().name });
      });
      
      // Seed if empty
      if (groupList.length === 0) {
        setGroups([
          { id: "upper", name: "חוסן עליון" },
          { id: "lower", name: "חוסן תחתון" }
        ]);
      } else {
        setGroups(groupList);
      }
    } catch (error) {
      console.error("Error fetching base data:", error);
    }
  };

  const fetchScheduleForDate = async () => {
    if (groups.length === 0) return;
    setLoading(true);
    try {
      const docRef = doc(db, "schedules", date);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSchedule({
          dutyId: data.dutyId || data.upperDutyId || "", // Migration fallback
          activities: data.activities || []
        });
      } else {
        // Try template
        const dayOfWeek = new Date(date).getDay();
        const templateRef = doc(db, "scheduleTemplates", dayOfWeek.toString());
        const templateSnap = await getDoc(templateRef);
        if (templateSnap.exists()) {
          const data = templateSnap.data();
          setSchedule({
            dutyId: data.dutyId || "",
            activities: data.activities || []
          });
        } else {
          setSchedule({ dutyId: "", activities: [] });
        }
      }
    } catch (error) {
      console.error("Error fetching schedule:", error);
    } finally {
      setLoading(false);
    }
  };

  const addActivity = (hosenType: string) => {
    const newActivity: Activity = {
      id: Math.random().toString(36).substr(2, 9),
      hosenType,
      startTime: "09:00",
      endTime: "10:00",
      activityType: "",
      locationId: "",
      instructorId: ""
    };
    setSchedule(prev => ({
      ...prev,
      activities: [...prev.activities, newActivity]
    }));
  };

  const updateActivity = (id: string, updates: Partial<Activity>) => {
    setSchedule(prev => ({
      ...prev,
      activities: prev.activities.map(a => a.id === id ? { ...a, ...updates } : a)
    }));
  };

  const deleteActivity = (id: string) => {
    setSchedule(prev => ({
      ...prev,
      activities: prev.activities.filter(a => a.id !== id)
    }));
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "schedules", date), schedule);
      alert("הלו״ז נשמר בהצלחה!");
    } catch (error) {
      console.error("Error saving schedule:", error);
      alert("שגיאה בשמירת הלו״ז");
    } finally {
      setSaving(false);
    }
  };

  const saveAsTemplate = async () => {
    const dayOfWeek = new Date(date).getDay();
    if (!confirm(`האם לשמור לו״ז זה כתבנית קבועה לימי ${["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][dayOfWeek]}?`)) return;
    
    setSaving(true);
    try {
      await setDoc(doc(db, "scheduleTemplates", dayOfWeek.toString()), schedule);
      alert("התבנית נשמרה בהצלחה!");
    } catch (error) {
      console.error("Error saving template:", error);
    } finally {
      setSaving(false);
    }
  };

  const renderActivityForm = (activity: Activity) => (
    <div key={activity.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          <input 
            type="time" 
            value={activity.startTime}
            onChange={(e) => updateActivity(activity.id, { startTime: e.target.value })}
            className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
          />
          <span className="text-slate-500">-</span>
          <input 
            type="time" 
            value={activity.endTime}
            onChange={(e) => updateActivity(activity.id, { endTime: e.target.value })}
            className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>
        <button 
          onClick={() => deleteActivity(activity.id)}
          className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input 
          type="text"
          placeholder="סוג הפעילות..."
          value={activity.activityType}
          onChange={(e) => updateActivity(activity.id, { activityType: e.target.value })}
          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <select
          value={activity.locationId}
          onChange={(e) => updateActivity(activity.id, { locationId: e.target.value })}
          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">בחר מיקום...</option>
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
        <select
          value={activity.instructorId}
          onChange={(e) => updateActivity(activity.id, { instructorId: e.target.value })}
          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">בחר איש צוות...</option>
          {instructors.map(inst => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white p-6 pb-24">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push("/admin")}
              className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <Calendar className="w-6 h-6 text-rose-400" />
                ניהול לו״ז יומי
              </h1>
              <p className="text-slate-400 text-sm">שיבוץ פעילויות וצוות למסגרות חוסן</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/5 p-2 rounded-2xl border border-white/10">
            <input 
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-sm font-bold text-blue-400 p-2"
            />
          </div>
        </header>

        {/* Global Duty Instructor */}
        <div className="max-w-xl mx-auto mb-10">
          <div className="bg-gradient-to-br from-rose-500/10 to-orange-500/10 border border-rose-500/20 p-6 rounded-[2rem] shadow-xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-3 text-rose-400">
              <User className="w-6 h-6" />
              מדריך תורן יומי (לכלל המרכז)
            </h3>
            <select
              value={schedule.dutyId}
              onChange={(e) => setSchedule(prev => ({ ...prev, dutyId: e.target.value }))}
              className="w-full bg-slate-900/50 border border-white/10 rounded-2xl px-4 py-4 text-sm focus:outline-none focus:border-rose-500 transition-all"
            >
              <option value="">בחר מדריך תורן להיום...</option>
              {instructors.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-3 text-center italic">* המדריך התורן אחראי על ריכוז הדיווחים ונוכחות כללית במרכז</p>
          </div>
        </div>

        {/* Group Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {groups.map((group, idx) => (
            <section key={group.id} className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <div className={`w-2 h-8 rounded-full ${idx % 2 === 0 ? 'bg-purple-500' : 'bg-blue-500'}`} />
                  פעילויות {group.name}
                </h2>
                <button 
                  onClick={() => addActivity(group.id)}
                  className="flex items-center gap-2 text-slate-400 hover:text-white font-bold text-sm transition-colors bg-white/5 px-4 py-2 rounded-xl border border-white/10"
                >
                  <Plus className="w-4 h-4" />
                  הוסף פעילות
                </button>
              </div>
              <div className="space-y-4">
                {schedule.activities.filter(a => a.hosenType === group.id).map(renderActivityForm)}
                {schedule.activities.filter(a => a.hosenType === group.id).length === 0 && (
                  <div className="text-center py-12 bg-white/5 border border-dashed border-white/10 rounded-[2rem] text-slate-500 text-sm">
                    טרם הוגדרו פעילויות ל{group.name}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950/80 backdrop-blur-md border-t border-white/10 z-30">
          <div className="max-w-4xl mx-auto flex gap-4">
            <button
              onClick={saveAsTemplate}
              className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 py-4 rounded-2xl font-bold transition-all"
            >
              <Copy className="w-5 h-5" />
              שמור כתבנית יום
            </button>
            <button
              onClick={saveSchedule}
              disabled={saving}
              className="flex-[2] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              שמור לו״ז ליום זה
            </button>
          </div>
        </div>
      </main>
    </RoleGuard>
  );
}
