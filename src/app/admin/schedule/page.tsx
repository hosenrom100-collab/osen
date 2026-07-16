"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase/config";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ScheduleEditorModal } from "@/components/home/ScheduleEditorModal";
import { 
  Calendar, ChevronLeft, ChevronRight, Edit3, 
  MapPin, Users, User, Clock, ArrowRight, Loader2, Info
} from "lucide-react";
import { format, addDays, subDays, parseISO } from "date-fns";

interface ActivityItem {
  id: string;
  title: string;
  locationId: string;
  groupId: string;
  type: string;
  startTime: string;
  endTime: string;
  staffIds?: string[];
}

interface Group {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface UserProfile {
  id: string;
  displayName?: string;
  email?: string;
}

const TYPE_COLORS: Record<string, string> = {
  activity: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  break: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  meal: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  swap: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  custom: "bg-rose-500/10 text-rose-500 border-rose-500/20"
};

const TYPE_NAMES: Record<string, string> = {
  activity: "פעילות",
  break: "הפסקה",
  meal: "ארוחה",
  swap: "החלפה",
  custom: "אחר"
};

function ScheduleContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role } = useAuth();
  
  const initialGroupParam = searchParams.get("group") || "all";
  
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedGroup, setSelectedGroup] = useState(initialGroupParam);
  
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [dutyInstructorName, setDutyInstructorName] = useState<string | null>(null);
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Sync state if URL search param change
  useEffect(() => {
    setSelectedGroup(searchParams.get("group") || "all");
  }, [searchParams]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch metadata
      const [groupsSnap, locsSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, "groups")),
        getDocs(collection(db, "locations")),
        getDocs(collection(db, "users")),
      ]);

      const groupsList = groupsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      const locsList = locsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      const usersList = usersSnap.docs.map(doc => ({ id: doc.id, displayName: doc.data().displayName, email: doc.data().email }));

      setGroups(groupsList);
      setLocations(locsList);
      setStaff(usersList);

      // 2. Fetch schedule document
      const scheduleSnap = await getDoc(doc(db, "schedules", selectedDate));
      if (scheduleSnap.exists()) {
        const schedData = scheduleSnap.data();
        setActivities(schedData.activities || []);
        
        // Find duty instructor name
        const instructorId = schedData.dutyInstructorId;
        if (instructorId) {
          const instructor = usersList.find(u => u.id === instructorId);
          setDutyInstructorName(instructor?.displayName || instructor?.email || "לא ידוע");
        } else {
          setDutyInstructorName(null);
        }
      } else {
        setActivities([]);
        setDutyInstructorName(null);
      }
    } catch (err) {
      console.error("Failed to load schedule data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const handlePrevDay = () => {
    setSelectedDate(prev => format(subDays(parseISO(prev), 1), "yyyy-MM-dd"));
  };

  const handleNextDay = () => {
    setSelectedDate(prev => format(addDays(parseISO(prev), 1), "yyyy-MM-dd"));
  };

  const handleGroupChange = (groupId: string) => {
    setSelectedGroup(groupId);
    // Update URL query param silently
    router.replace(`/admin/schedule?group=${groupId}`);
  };

  // Filter activities
  const filteredActivities = activities
    .filter(act => {
      if (selectedGroup === "all") return true;
      return act.groupId === "all" || act.groupId === selectedGroup;
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const canEdit = role === "admin" || role === "manager";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 py-3.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/admin/programs")}
              className="w-9 h-9 rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] active:scale-95 transition-all flex items-center justify-center text-[var(--foreground)]">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="text-right">
              <h1 className="text-sm font-black leading-tight">לוח זמנים שבועי ויומי</h1>
              <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest mt-0.5">Schedule Management</p>
            </div>
          </div>
          {canEdit && (
            <button
              onClick={() => setIsEditorOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 border border-rose-500 hover:bg-rose-500 text-white rounded-xl text-xs font-black transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
              ערוך לו״ז
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Date Selector & Group Filter Card */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2rem] p-6 shadow-sm space-y-6">
          {/* Date controls */}
          <div className="flex items-center justify-between gap-4">
            <button onClick={handlePrevDay} className="w-10 h-10 rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] flex items-center justify-center hover:bg-[var(--foreground)]/10 transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-rose-500" />
              <input 
                type="date" 
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-transparent border-0 text-sm font-black focus:ring-0 outline-none text-center cursor-pointer"
              />
            </div>
            <button onClick={handleNextDay} className="w-10 h-10 rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] flex items-center justify-center hover:bg-[var(--foreground)]/10 transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          {/* Group Filter */}
          <div className="space-y-2 text-right">
            <label className="text-[10px] font-black text-[var(--foreground)]/40 uppercase tracking-wider block mr-1">סינון לפי קבוצה</label>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                onClick={() => handleGroupChange("all")}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all shrink-0 ${
                  selectedGroup === "all"
                    ? "bg-rose-500 text-white shadow-sm"
                    : "bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                הכול
              </button>
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => handleGroupChange(g.id)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all shrink-0 ${
                    selectedGroup === g.id
                      ? "bg-rose-500 text-white shadow-sm"
                      : "bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Duty Instructor Banner */}
        {dutyInstructorName && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center gap-3 text-amber-700 dark:text-amber-500 text-right">
            <User className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-xs font-black">מדריך/ה תורן/נית להיום: {dutyInstructorName}</p>
            </div>
          </div>
        )}

        {/* Schedule Timeline */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2rem] p-12 text-center text-slate-400 space-y-3">
            <Info className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-sm font-black">אין פעילויות מתוכננות ליום זה בקבוצה שנבחרה.</p>
          </div>
        ) : (
          <div className="relative border-r-2 border-rose-500/25 mr-4 space-y-6 pl-2">
            {filteredActivities.map(act => {
              const loc = locations.find(l => l.id === act.locationId)?.name || "ללא מיקום";
              const grp = act.groupId === "all" ? "כללי (כל הקבוצות)" : groups.find(g => g.id === act.groupId)?.name || "ללא קבוצה";
              const typeCls = TYPE_COLORS[act.type] || TYPE_COLORS.custom;
              const typeLabel = TYPE_NAMES[act.type] || TYPE_NAMES.custom;

              // Find staff names
              const staffNames = act.staffIds
                ?.map(id => staff.find(s => s.id === id)?.displayName)
                .filter(Boolean)
                .join(", ") || "";

              return (
                <div key={act.id} className="relative pr-6">
                  {/* Timeline dot */}
                  <div className="absolute right-0 top-3 -translate-x-1/2 w-4 h-4 rounded-full bg-rose-500 border-4 border-[var(--background)] z-10" />

                  {/* Card */}
                  <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-5 hover:shadow-md transition-all space-y-3 text-right">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${typeCls}`}>
                          {typeLabel}
                        </span>
                        <h4 className="text-sm font-black text-[var(--foreground)]">{act.title}</h4>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-black text-rose-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{act.startTime} - {act.endTime}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] font-bold text-[var(--muted)] pt-2 border-t border-[var(--border-subtle)]">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>מיקום: {loc}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>קבוצה: {grp}</span>
                      </div>
                      {staffNames && (
                        <div className="flex items-center gap-1.5 sm:col-span-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>צוות: {staffNames}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Editor Modal */}
      <ScheduleEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSaved={fetchData}
        initialDate={selectedDate}
      />
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-rose-400 animate-spin" />
      </div>
    }>
      <ScheduleContent />
    </Suspense>
  );
}
