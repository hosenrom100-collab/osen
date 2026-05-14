"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, LogOut, Users, Calendar, ShoppingCart, CheckCircle,
  Shield, User, MapPin, Edit3, ChevronLeft, Clock,
  ClipboardList, Layers, X, Check, ChevronDown, ChevronUp,
  TrendingUp, AlertCircle, Activity, LayoutDashboard,
  Bell, Search, Settings, ArrowUpRight, Inbox, ChevronRight
} from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, doc, getDoc, orderBy } from "firebase/firestore";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface GroupStat   { id: string; name: string; present: number; total: number }
interface PresentPat  { id: string; firstName: string; lastName: string; hosenType?: string }
interface ScheduleAct {
  id: string; title: string; startTime: string; endTime?: string;
  locationName: string; staffNames: string[]; groupId: string;
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  return "ערב טוב";
};

function Bar({ pct, color = "bg-blue-500" }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <motion.div className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
    </div>
  );
}

function StatCard({
  value, label, sub, icon: Icon, color, href,
}: {
  value: number | string; label: string; sub?: string;
  icon: React.ElementType; color: "emerald" | "rose" | "blue" | "amber" | "indigo"; href: string;
}) {
  const router = useRouter();
  const clr = {
    emerald: { bg: "bg-emerald-500/5  border-emerald-500/10 hover:bg-emerald-500/10", num: "text-emerald-400", icon: "bg-emerald-500/10 text-emerald-400" },
    rose:    { bg: "bg-rose-500/5     border-rose-500/10    hover:bg-rose-500/10",    num: "text-rose-400",    icon: "bg-rose-500/10    text-rose-400"    },
    blue:    { bg: "bg-blue-500/5     border-blue-500/10    hover:bg-blue-500/10",    num: "text-blue-400",    icon: "bg-blue-500/10    text-blue-400"    },
    amber:   { bg: "bg-amber-500/5    border-amber-500/10   hover:bg-amber-500/10",   num: "text-amber-400",   icon: "bg-amber-500/10   text-amber-400"   },
    indigo:  { bg: "bg-indigo-500/5   border-indigo-500/10  hover:bg-indigo-500/10",  num: "text-indigo-400",  icon: "bg-indigo-500/10  text-indigo-400"  },
  }[color];

  return (
    <button onClick={() => router.push(href)}
      className={`w-full text-right border rounded-2xl p-5 transition-all hover:scale-[1.02] active:scale-[0.98] ${clr.bg}`}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${clr.icon}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-3xl font-black leading-none ${clr.num}`}>{value}</span>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">{label}</p>
        </div>
      </div>
      {sub && (
        <div className="mt-4 pt-4 border-t border-white/[0.05]">
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 opacity-50" />
            {sub}
          </p>
        </div>
      )}
    </button>
  );
}

function TimelineRow({ act, groups, now }: { act: ScheduleAct; groups: { id: string; name: string }[]; now: string }) {
  const isPast    = act.endTime ? act.endTime < now : act.startTime < now;
  const isCurrent = !isPast && act.startTime <= now;
  const groupName = groups.find(g => g.id === act.groupId)?.name
    || (act.groupId === "all" ? "משותף" : act.groupId === "staff_only" ? "צוות" : "");

  return (
    <div className={`flex gap-4 group transition-opacity ${isPast ? "opacity-30" : ""}`}>
      <div className="w-12 shrink-0 text-right pt-0.5">
        <span className={`text-xs font-black ${isCurrent ? "text-blue-400" : "text-slate-500"}`}>{act.startTime}</span>
      </div>
      <div className="flex flex-col items-center shrink-0 pt-1.5 relative">
        <div className={`w-2.5 h-2.5 rounded-full z-10 ${isCurrent ? "bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]" : isPast ? "bg-slate-700" : "bg-slate-600"}`} />
        <div className="absolute top-4 bottom-0 w-px bg-white/[0.05] last:hidden" />
      </div>
      <div className="flex-1 min-w-0 pb-6">
        <p className={`text-sm font-bold leading-tight truncate ${isCurrent ? "text-white" : "text-slate-300"}`}>
          {act.title}
        </p>
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {act.locationName && (
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5 opacity-50" />{act.locationName}
            </span>
          )}
          {groupName && (
            <span className="text-[10px] text-slate-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">{groupName}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading, isWhitelisted, logout, isAdmin, isManager, assignedGroups, primaryGroupId, setPrimaryGroupId } = useAuth();
  const router = useRouter();

  const [groups,          setGroups]          = useState<{ id: string; name: string }[]>([]);
  const [stats,           setStats]           = useState<GroupStat[]>([]);
  const [presentPatients, setPresentPatients] = useState<PresentPat[]>([]);
  const [activities,      setActivities]      = useState<ScheduleAct[]>([]);
  const [dutyName,        setDutyName]        = useState("");
  const [shoppingCount,   setShoppingCount]   = useState(0);
  const [expandedGroups,  setExpandedGroups]  = useState<Set<string>>(new Set());
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  const showAll = isAdmin || isManager;

  useEffect(() => {
    if (!loading && (!user || !isWhitelisted)) router.push("/login");
  }, [user, loading, isWhitelisted, router]);

  useEffect(() => {
    if (user && isWhitelisted) fetchAll();
  }, [user, isWhitelisted]);

  const fetchAll = async () => {
    const today = format(new Date(), "yyyy-MM-dd");
    try {
      const groupsSnap = await getDocs(query(collection(db, "groups"), orderBy("name")));
      const groupList  = groupsSnap.docs.map(d => ({ id: d.id, name: d.data().name as string }));
      setGroups(groupList);

      const [pSnap, aSnap] = await Promise.all([
        getDocs(query(collection(db, "patients"), where("status", "==", "active"))),
        getDocs(query(collection(db, "attendance"), where("date", "==", today), where("status", "==", "present"))),
      ]);

      const presentIds = new Set(aSnap.docs.map(d => d.data().patientId as string));
      const statMap    = new Map<string, GroupStat>();
      groupList.forEach(g => statMap.set(g.id, { ...g, present: 0, total: 0 }));

      const present: PresentPat[] = [];
      pSnap.forEach(d => {
        const p   = d.data();
        const ht  = (p.hosenType || "") as string;
        const gId = groupList.find(g => g.id === ht || g.name === ht)?.id;
        if (gId && statMap.has(gId)) {
          const s = statMap.get(gId)!;
          s.total++;
          if (presentIds.has(d.id)) {
            s.present++;
            present.push({ id: d.id, firstName: p.firstName, lastName: p.lastName, hosenType: gId });
          }
        }
      });
      setStats([...statMap.values()]);
      setPresentPatients(present);

      const shopSnap = await getDocs(query(collection(db, "shopping_requests"), where("status", "==", "pending")));
      setShoppingCount(shopSnap.size);

      const schedSnap = await getDoc(doc(db, "schedules", today));
      if (schedSnap.exists()) {
        const data      = schedSnap.data();
        const usersSnap = await getDocs(collection(db, "users"));
        const userMap: Record<string, string> = {};
        usersSnap.forEach(d => { userMap[d.id] = d.data().name || d.data().email; });
        const locsSnap = await getDocs(collection(db, "locations"));
        const locMap: Record<string, string> = {};
        locsSnap.forEach(d => { locMap[d.id] = d.data().name; });
        const duty = data.dutyInstructorId || data.dutyId || "";
        setDutyName(duty ? (userMap[duty] || "") : "");
        const acts: ScheduleAct[] = (data.activities || []).map((a: any) => ({
          id:           a.id || Math.random().toString(36).slice(2),
          title:        a.title || a.activityType || "פעילות",
          startTime:    a.startTime || "",
          endTime:      a.endTime   || "",
          locationName: locMap[a.locationId] || "",
          staffNames:   (a.staffIds || (a.instructorId ? [a.instructorId] : [])).map((id: string) => userMap[id] || "").filter(Boolean),
          groupId:      a.groupId || a.hosenType || "all",
        })).sort((a: ScheduleAct, b: ScheduleAct) => a.startTime.localeCompare(b.startTime));
        setActivities(acts);
      }
    } catch (err) { console.error(err); }
  };

  const isGroupVisible = (gId: string) => {
    if (showAll) return true;
    if (primaryGroupId) return gId === primaryGroupId;
    return assignedGroups.includes(gId);
  };
  const visibleStats  = stats.filter(s => isGroupVisible(s.id) && s.total > 0);
  const totalPresent  = visibleStats.reduce((n, s) => n + s.present, 0);
  const totalMissing  = visibleStats.reduce((n, s) => n + Math.max(0, s.total - s.present), 0);
  const totalActive   = visibleStats.reduce((n, s) => n + s.total, 0);
  const now           = format(new Date(), "HH:mm");
  const visibleActs   = activities.filter(a => isGroupVisible(a.groupId) || a.groupId === "all");
  const nextAct       = visibleActs.find(a => a.startTime > now);
  const currentAct    = visibleActs.find(a => a.startTime <= now && (!a.endTime || a.endTime > now));
  const primaryGroup  = groups.find(g => g.id === primaryGroupId);
  const overallPct    = totalActive > 0 ? Math.round((totalPresent / totalActive) * 100) : 0;

  if (loading || !user || !isWhitelisted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const firstName  = user.displayName?.split(" ")[0] ?? "שלום";
  const todayLabel = format(new Date(), "EEEE, d בMMMM", { locale: he });

  return (
    <div dir="rtl" className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-blue-500/30">
      
      {/* ── Desktop CRM Header ── */}
      <header className="hidden md:flex items-center justify-between px-8 h-16 shrink-0 border-b border-border bg-card-bg/40 backdrop-blur-md z-30">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
              <span className="text-slate-400">לוח בקרה מרכזי</span>
              <ChevronRight className="w-2.5 h-2.5 opacity-30" />
              <span className="text-slate-400">מבט על</span>
            </div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-blue-400" />
              מרכז שליטה "חוסן"
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
           {/* Search Placeholder for Enterprise feel */}
           <div className="relative hidden lg:block">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
              <input type="text" placeholder="חיפוש מהיר..." className="bg-white/5 border border-white/10 rounded-lg py-1.5 pr-9 pl-4 text-xs w-64 focus:outline-none focus:border-blue-500/50 transition-all" />
           </div>
           
           <div className="w-px h-6 bg-white/[0.07]" />
           
           <button className="p-2 text-slate-500 hover:text-white transition-colors relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full" />
           </button>
           
           <button onClick={logout} className="p-2 text-slate-500 hover:text-rose-400 transition-colors">
              <LogOut className="w-4 h-4" />
           </button>
        </div>
      </header>

      {/* ── Mobile Header ── */}
      <header className="md:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-black">{firstName.charAt(0)}</div>
              <h1 className="text-sm font-bold">{greeting()}, {firstName}</h1>
           </div>
           <button onClick={logout} className="p-2 text-slate-500"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-background/20 no-scrollbar">
          <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-8">
            
            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
               <div>
                  <h2 className="text-2xl md:text-3xl font-black text-white">{greeting()}, {firstName}</h2>
                  <p className="text-slate-500 text-sm md:text-base mt-1 font-medium">{todayLabel} | מבט עדכני על פעילות המרכז</p>
               </div>
               {!showAll && (
                 <button onClick={() => setShowGroupPicker(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 border border-blue-500/20 rounded-xl text-blue-400 text-xs font-bold hover:bg-blue-600/20 transition-all">
                    <Layers className="w-4 h-4" />
                    {primaryGroup?.name ?? "בחר קבוצה להצגה"}
                    <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                 </button>
               )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <StatCard value={totalPresent} label="נוכחים היום" sub={`${overallPct}% מהפעילים`} icon={CheckCircle} color="emerald" href="/attendance" />
              <StatCard value={totalMissing} label="ממתינים לסימון" sub={totalMissing > 0 ? "דורש התייחסות" : "הכל עודכן"} icon={AlertCircle} color={totalMissing > 0 ? "rose" : "emerald"} href="/attendance" />
              <StatCard value={totalActive} label="מטופלים פעילים" sub={`${visibleStats.length} קבוצות בטיפול`} icon={Users} color="blue" href="/patients" />
              <StatCard value={shoppingCount} label="בקשות רכש" sub={shoppingCount > 0 ? "ממתינות לאישור" : "מלאי תקין"} icon={ShoppingCart} color={shoppingCount > 0 ? "amber" : "indigo"} href="/shopping" />
            </div>

            <div className="grid lg:grid-cols-[1fr_350px] gap-6 md:gap-8">
              
              {/* Left Column: Presence Activity */}
              <div className="space-y-6">
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden backdrop-blur-sm">
                   <div className="px-6 py-5 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.01]">
                      <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                         <Activity className="w-4 h-4 text-emerald-400" />
                         סטטוס נוכחות לפי קבוצה
                      </h3>
                      <Link href="/attendance" className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 uppercase tracking-wider">
                         ניהול נוכחות <ArrowUpRight className="w-3 h-3" />
                      </Link>
                   </div>
                   <div className="p-2">
                      {visibleStats.map((group, idx) => {
                        const pct = group.total > 0 ? Math.round((group.present / group.total) * 100) : 0;
                        const missing = group.total - group.present;
                        return (
                          <div key={group.id} className="p-4 hover:bg-white/[0.02] rounded-xl transition-all group">
                             <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                   <div className={`w-1.5 h-6 rounded-full ${pct === 100 ? "bg-emerald-500" : pct > 50 ? "bg-blue-500" : "bg-amber-500"}`} />
                                   <span className="font-bold text-sm text-slate-200">{group.name}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                   <span className="text-xs font-black text-slate-400">{group.present}/{group.total}</span>
                                   {missing > 0 && <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full uppercase">{missing} חסרים</span>}
                                </div>
                             </div>
                             <Bar pct={pct} color={pct === 100 ? "bg-emerald-500" : pct > 50 ? "bg-blue-500" : "bg-amber-500"} />
                          </div>
                        );
                      })}
                   </div>
                </div>

                {/* Desktop Quick Nav Grid */}
                <div className="hidden md:grid grid-cols-3 gap-4">
                   <Link href="/patients" className="p-6 bg-white/[0.02] border border-white/[0.05] rounded-2xl hover:bg-white/[0.04] transition-all group">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                         <Users className="w-5 h-5" />
                      </div>
                      <p className="font-bold text-sm text-white">מאגר מטופלים</p>
                      <p className="text-[10px] text-slate-500 mt-1">ניהול תיקים ומידע רפואי</p>
                   </Link>
                   <Link href="/shopping" className="p-6 bg-white/[0.02] border border-white/[0.05] rounded-2xl hover:bg-white/[0.04] transition-all group">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                         <ShoppingCart className="w-5 h-5" />
                      </div>
                      <p className="font-bold text-sm text-white">ניהול לוגיסטי</p>
                      <p className="text-[10px] text-slate-500 mt-1">הזמנות רכש ומלאי שוטף</p>
                   </Link>
                   <Link href="/calendar" className="p-6 bg-white/[0.02] border border-white/[0.05] rounded-2xl hover:bg-white/[0.04] transition-all group">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                         <Calendar className="w-5 h-5" />
                      </div>
                      <p className="font-bold text-sm text-white">יומן עבודה</p>
                      <p className="text-[10px] text-slate-500 mt-1">שיבוצים ופעילות יומית</p>
                   </Link>
                </div>
              </div>

              {/* Right Column: Timeline & Schedule */}
              <div className="space-y-6">
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden backdrop-blur-sm">
                   <div className="px-6 py-5 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.01]">
                      <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                         <Clock className="w-4 h-4 text-blue-400" />
                         סדר יום
                      </h3>
                      {dutyName && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                           <User className="w-3 h-3 text-rose-400" />
                           <span className="text-[10px] font-bold text-rose-400">תורן: {dutyName}</span>
                        </div>
                      )}
                   </div>
                   <div className="p-6">
                      {visibleActs.length === 0 ? (
                        <div className="py-12 text-center opacity-30 flex flex-col items-center">
                           <Inbox className="w-10 h-10 mb-3" />
                           <p className="text-xs font-bold uppercase tracking-widest">אין פעילויות רשומות</p>
                        </div>
                      ) : (
                        <div className="space-y-0 relative">
                           {visibleActs.map(act => (
                              <TimelineRow key={act.id} act={act} groups={groups} now={now} />
                           ))}
                        </div>
                      )}
                   </div>
                   {nextAct && (
                     <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.05] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                           <span className="text-[11px] font-bold text-slate-300">הבא בתור: {nextAct.title}</span>
                        </div>
                        <span className="text-[11px] font-black text-blue-400">{nextAct.startTime}</span>
                     </div>
                   )}
                </div>

                {/* Notifications/Recent Actions (Mock for CRM feel) */}
                <div className="hidden lg:block bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6">
                   <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">הודעות מערכת</h3>
                   <div className="space-y-4">
                      <div className="flex gap-3">
                         <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0"><Check className="w-4 h-4 text-emerald-500" /></div>
                         <div className="min-w-0"><p className="text-xs font-bold text-slate-200">יומן נוכחות עודכן</p><p className="text-[10px] text-slate-500 mt-0.5">לפני 5 דקות ע"י {firstName}</p></div>
                      </div>
                      <div className="flex gap-3 opacity-60">
                         <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0"><ShoppingCart className="w-4 h-4 text-blue-500" /></div>
                         <div className="min-w-0"><p className="text-xs font-bold text-slate-200">הזמנת רכש חדשה</p><p className="text-[10px] text-slate-500 mt-0.5">לפני שעה - מוצרי ניקיון</p></div>
                      </div>
                   </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      {/* ── Group picker modal ── */}
      <AnimatePresence>
        {showGroupPicker && (
          <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center p-0 md:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowGroupPicker(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div
              initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
              className="relative bg-slate-900 border-t md:border border-white/10 w-full max-w-sm rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-white/[0.07] flex items-center justify-between bg-white/[0.02]">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Layers className="w-4 h-4 text-blue-400" /> בחר קבוצת עבודה</h3>
                <button onClick={() => setShowGroupPicker(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                {groups.map(g => (
                  <button key={g.id}
                    onClick={() => { setPrimaryGroupId(g.id); setShowGroupPicker(false); }}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all ${
                      primaryGroupId === g.id
                        ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20"
                        : "bg-white/[0.03] border-white/[0.07] text-slate-400 hover:bg-white/[0.06] hover:text-white"
                    }`}>
                    <span className="font-bold text-sm">{g.name}</span>
                    {primaryGroupId === g.id && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-white/[0.07] bg-white/[0.01]">
                <button onClick={() => { setPrimaryGroupId(null); setShowGroupPicker(false); }}
                  className="w-full py-3.5 bg-white/5 rounded-2xl text-sm font-bold text-slate-400 hover:bg-white/10 transition-all">
                  הצג את כל הקבוצות
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
