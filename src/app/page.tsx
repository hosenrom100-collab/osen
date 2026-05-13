"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { 
  LogOut, Users, Calendar, ShoppingCart, FileText, 
  CheckCircle, ArrowLeftRight, Clock, UserPlus, 
  Shield, User, MapPin, Edit3, ChevronLeft, Plus,
  Layers, Filter, ShoppingBag
} from "lucide-react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, doc, getDoc, orderBy } from "firebase/firestore";

export default function Home() {
  const { user, loading, isWhitelisted, logout, isAdmin, assignedGroups, role } = useAuth();
  const [stats, setStats] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [todaySchedule, setTodaySchedule] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !isWhitelisted)) {
      router.push("/login");
      return;
    }
    if (user && isWhitelisted) {
      // Admins/Managers see all by default, others see only theirs
      if (isAdmin || assignedGroups.length === 0) {
        setShowAll(true);
      }
      fetchData();
    }
  }, [user, loading, isWhitelisted, router, assignedGroups]);

  const fetchData = async () => {
    try {
      const groupsSnap = await getDocs(query(collection(db, "groups"), orderBy("name")));
      const groupList: any[] = [];
      groupsSnap.forEach(doc => groupList.push({ id: doc.id, ...doc.data() }));
      
      if (groupList.length === 0) {
        groupList.push({ id: "upper", name: "חוסן עליון" }, { id: "lower", name: "חוסן תחתון" });
      }
      setGroups(groupList);

      const today = new Date().toISOString().split('T')[0];
      const patientsSnap = await getDocs(query(collection(db, "patients"), where("status", "==", "active")));
      const attendanceSnap = await getDocs(query(collection(db, "attendance"), where("date", "==", today), where("status", "==", "present")));
      const attendedPatientIds = new Set();
      attendanceSnap.forEach(doc => attendedPatientIds.add(doc.data().patientId));

      const statsList = groupList.map(group => {
        let total = 0;
        let present = 0;
        patientsSnap.forEach(pDoc => {
          const pData = pDoc.data();
          if (pData.hosenType === group.id || pData.hosenType === group.name) {
            total++;
            if (attendedPatientIds.has(pDoc.id)) present++;
          }
        });
        return { ...group, present, total };
      });
      setStats(statsList);

      const scheduleRef = doc(db, "schedules", today);
      const scheduleSnap = await getDoc(scheduleRef);
      if (scheduleSnap.exists()) {
        const sData = scheduleSnap.data();
        const usersSnap = await getDocs(collection(db, "users"));
        const userMap: any = {};
        usersSnap.forEach(doc => userMap[doc.id] = doc.data().name || doc.data().email);
        
        const locsSnap = await getDocs(collection(db, "locations"));
        const locMap: any = {};
        locsSnap.forEach(doc => locMap[doc.id] = doc.data().name);

        const enrichedActivities = sData.activities.map((a: any) => ({
          ...a,
          instructorName: userMap[a.instructorId] || "לא הוגדר",
          locationName: locMap[a.locationId] || "לא הוגדר"
        })).sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));

        setTodaySchedule({
          ...sData,
          activities: enrichedActivities,
          userMap
        });
      }
    } catch (error) {
      console.error("Error fetching home data:", error);
    }
  };

  const isGroupVisible = (groupId: string, groupName: string) => {
    if (showAll) return true;
    return assignedGroups.includes(groupId) || assignedGroups.includes(groupName);
  };

  if (loading || !user || !isWhitelisted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const visibleStats = stats.filter(s => isGroupVisible(s.id, s.name));
  const visibleActivities = todaySchedule?.activities.filter((a: any) => isGroupVisible(a.hosenType, a.hosenType)) || [];

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 pb-24 md:p-8">
      {/* App Bar */}
      <header className="flex justify-between items-center mb-8 sticky top-0 bg-slate-950/80 backdrop-blur-md z-50 py-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold">חוסן-קונקט</h1>
            <p className="text-[10px] text-slate-500 font-medium">שלום, {user.displayName?.split(' ')[0]}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {assignedGroups.length > 0 && (
            <button 
              onClick={() => setShowAll(!showAll)}
              className={`p-2 rounded-xl border transition-all flex items-center gap-2 ${showAll ? "bg-blue-600/20 border-blue-500 text-blue-400" : "bg-white/5 border-white/10 text-slate-400"}`}
            >
              <Filter className="w-4 h-4" />
              <span className="text-[10px] font-bold hidden xs:block">{showAll ? "תצוגת כל המרכז" : "תצוגה מותאמת אישית"}</span>
            </button>
          )}
          <button onClick={logout} className="p-2 text-slate-400 hover:text-white transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Attendance & Stats */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            סטטוס נוכחות היום {!showAll && "(שלי)"}
          </h2>
          <button 
            onClick={() => router.push("/attendance")}
            className="text-xs font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20"
          >
            לכל היומן
            <ChevronLeft className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visibleStats.map((group) => (
            <motion.div 
              key={group.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push(`/attendance/log?group=${group.id}`)}
              className="bg-white/5 border border-white/10 p-4 rounded-2xl relative overflow-hidden active:bg-white/10 transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] text-slate-500 font-bold truncate max-w-[80px]">{group.name}</span>
                <Plus className="w-3 h-3 text-slate-600" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{group.present}</span>
                <span className="text-[10px] text-slate-500">/ {group.total}</span>
              </div>
              <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(group.present / (group.total || 1)) * 100}%` }}
                  className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                />
              </div>
            </motion.div>
          ))}
          {!showAll && assignedGroups.length > 0 && stats.length > visibleStats.length && (
            <button 
              onClick={() => setShowAll(true)}
              className="border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-1 text-slate-600 hover:text-slate-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="text-[10px] font-bold">הצג קבוצות נוספות</span>
            </button>
          )}
        </div>
      </section>

      {/* Daily Schedule - Timeline */}
      <section className="mb-8 bg-white/5 border border-white/10 rounded-3xl p-6 relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-rose-400" />
            לו״ז פעילות {!showAll && "(שלי)"}
          </h2>
          {(isAdmin || role === 'manager') && (
            <button 
              onClick={() => router.push("/admin/schedule")}
              className="p-2 bg-white/5 border border-white/10 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-all"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Duty Instructor Banner */}
        <div className="mb-8 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-500/20 rounded-full flex items-center justify-center border border-rose-500/30">
              <User className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">מדריך תורן להיום</p>
              <p className="text-sm font-bold">{todaySchedule?.userMap?.[todaySchedule?.dutyId] || "טרם שובץ"}</p>
            </div>
          </div>
          <Clock className="w-5 h-5 text-rose-500/30" />
        </div>

        {/* Timeline Activities */}
        <div className="space-y-6 relative before:absolute before:right-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-white/5">
          {visibleActivities.length > 0 ? (
            visibleActivities.map((activity: any) => (
              <div key={activity.id} className="relative pr-10">
                <div className="absolute right-4 top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-slate-950 z-10" />
                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 active:bg-white/10 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-blue-400">{activity.startTime}</span>
                    <span className="text-[10px] text-slate-500 bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
                      {groups.find(g => g.id === activity.hosenType || g.name === activity.hosenType)?.name || activity.hosenType}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm mb-2">{activity.activityType}</h4>
                  <div className="flex items-center gap-4 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {activity.locationName}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {activity.instructorName}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-10">
              <p className="text-slate-500 text-sm italic">אין פעילויות רשומות עבורך להיום</p>
              {!showAll && assignedGroups.length > 0 && (
                <button onClick={() => setShowAll(true)} className="mt-2 text-xs text-blue-400 font-bold">הצג את לו״ז כל המרכז</button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Core Quick Actions Grid */}
      <section className="mb-8 grid grid-cols-2 gap-4">
        <motion.div
          whileTap={{ scale: 0.95 }}
          onClick={() => router.push("/patients")}
          className="bg-blue-600/10 border border-blue-500/20 p-5 rounded-[2rem] flex flex-col items-center justify-center text-center gap-3"
        >
          <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <span className="text-sm font-bold">מטופלים</span>
        </motion.div>

        <motion.div
          whileTap={{ scale: 0.95 }}
          onClick={() => router.push("/shopping")}
          className="bg-indigo-600/10 border border-indigo-500/20 p-5 rounded-[2rem] flex flex-col items-center justify-center text-center gap-3"
        >
          <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <span className="text-sm font-bold">רשימת קניות</span>
        </motion.div>
      </section>

      {/* Secondary Tools Horizontal Scroll */}
      <section className="mb-4">
        <h2 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-4 px-2">כלים נוספים</h2>
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4">
          {[
            { id: 'shop', title: 'קניות', icon: ShoppingCart, color: 'text-indigo-400', path: '/shopping' },
            { id: 'reports', title: 'דוחות', icon: FileText, color: 'text-rose-400', path: '/reports' },
            { id: 'calendar', title: 'יומן', icon: Calendar, color: 'text-amber-400', path: '/calendar' },
            ...(isAdmin ? [{ id: 'admin', title: 'ניהול', icon: Shield, color: 'text-purple-400', path: '/admin' }] : [])
          ].map((item) => (
            <motion.div
              key={item.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push(item.path)}
              className="flex-shrink-0 w-24 h-24 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-2"
            >
              <item.icon className={`w-5 h-5 ${item.color}`} />
              <span className="text-xs font-medium">{item.title}</span>
            </motion.div>
          ))}
        </div>
      </section>
    </main>
  );
}
