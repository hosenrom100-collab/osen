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
    <div className="h-1.5 bg-[var(--foreground)]/5 rounded-full overflow-hidden">
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
    emerald: { bg: "bg-emerald-500/5  border-emerald-500/10 hover:bg-emerald-500/10", num: "text-emerald-500", icon: "bg-emerald-500/10 text-emerald-500" },
    rose:    { bg: "bg-rose-500/5     border-rose-500/10    hover:bg-rose-500/10",    num: "text-rose-500",    icon: "bg-rose-500/10    text-rose-500"    },
    blue:    { bg: "bg-blue-500/5     border-blue-500/10    hover:bg-blue-500/10",    num: "text-blue-500",    icon: "bg-blue-500/10    text-blue-500"    },
    amber:   { bg: "bg-amber-500/5    border-amber-500/10   hover:bg-amber-500/10",   num: "text-amber-500",   icon: "bg-amber-500/10   text-amber-500"   },
    indigo:  { bg: "bg-indigo-500/5   border-indigo-500/10  hover:bg-indigo-500/10",  num: "text-indigo-500",  icon: "bg-indigo-500/10  text-indigo-500"  },
  }[color];

  return (
    <button onClick={() => router.push(href)}
      className={`w-full text-right border rounded-2xl p-5 transition-all hover:scale-[1.02] active:scale-[0.98] bg-[var(--card-bg)] ${clr.bg}`}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${clr.icon}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-3xl font-black leading-none ${clr.num}`}>{value}</span>
          <p className="text-[10px] font-bold text-[var(--foreground)]/40 uppercase tracking-widest mt-2">{label}</p>
        </div>
      </div>
      {sub && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--foreground)]/50 flex items-center gap-1.5">
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
  const isCurrent = !isPast && act.startTime <= now && (!act.endTime || act.endTime > now);
  
  const groupName = groups.find(g => g.id === act.groupId)?.name
    || (act.groupId === "all" ? "כללי" : act.groupId === "staff_only" ? "צוות" : "");

  return (
    <div className={`flex gap-6 group transition-all duration-500 ${isPast ? "opacity-30 grayscale-[0.5]" : ""}`}>
      {/* Time and Status Column */}
      <div className="w-20 shrink-0 flex flex-col items-end pt-1">
        <span className={`text-sm font-black tracking-tighter ${isCurrent ? "text-primary text-lg" : "text-[var(--foreground)]/40"}`}>
          {act.startTime}
        </span>
        {act.endTime && (
          <span className="text-[10px] font-bold text-[var(--foreground)]/20 uppercase mt-0.5">עד {act.endTime}</span>
        )}
      </div>

      {/* Decorative Connector */}
      <div className="flex flex-col items-center shrink-0 pt-2 relative">
        <div className={`w-3.5 h-3.5 rounded-full z-10 border-2 transition-all duration-500 ${
          isCurrent 
            ? "bg-primary border-primary/20 scale-125 shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)]" 
            : isPast 
              ? "bg-[var(--foreground)]/10 border-transparent" 
              : "bg-white border-[var(--border)] dark:bg-[var(--card-bg)]"
        }`} />
        <div className="absolute top-5 bottom-0 w-0.5 bg-[var(--border)] group-last:hidden" />
      </div>

      {/* Content Card */}
      <div className={`flex-1 min-w-0 pb-10 transition-all ${isCurrent ? "translate-x-[-4px]" : ""}`}>
        <div className={`p-5 rounded-2xl border transition-all duration-300 ${
          isCurrent 
            ? "bg-primary/[0.03] border-primary/20 shadow-sm" 
            : "bg-[var(--card-bg)] border-[var(--border)] hover:border-[var(--foreground)]/10"
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
               <div className="flex items-center gap-2 mb-1">
                  {groupName && (
                    <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/10">
                      {groupName}
                    </span>
                  )}
                  {isCurrent && (
                    <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/10">
                      <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> בתהליך
                    </span>
                  )}
               </div>
               <h4 className={`text-base font-black leading-tight truncate ${isCurrent ? "text-[var(--foreground)]" : "text-[var(--foreground)]/80"}`}>
                 {act.title}
               </h4>
               
               <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-3">
                  {act.locationName && (
                    <span className="text-[11px] text-[var(--foreground)]/50 font-medium flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-primary opacity-60" />
                      {act.locationName}
                    </span>
                  )}
                  {act.staffNames && act.staffNames.length > 0 && (
                    <span className="text-[11px] text-[var(--foreground)]/50 font-medium flex items-center gap-1.5">
                      <Users className="w-3 h-3 text-primary opacity-60" />
                      {act.staffNames.join(", ")}
                    </span>
                  )}
               </div>
            </div>

            <div className="flex shrink-0">
               <button className="p-2 rounded-xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 transition-all opacity-0 group-hover:opacity-100">
                  <ArrowUpRight className="w-4 h-4 text-[var(--foreground)]/40" />
               </button>
            </div>
          </div>
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
  const primaryGroup  = groups.find(g => g.id === primaryGroupId);
  const overallPct    = totalActive > 0 ? Math.round((totalPresent / totalActive) * 100) : 0;

  if (loading || !user || !isWhitelisted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const firstName  = user.displayName?.split(" ")[0] ?? "שלום";
  const todayLabel = format(new Date(), "EEEE, d בMMMM", { locale: he });

  return (
    <div dir="rtl" className="flex flex-col h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden font-sans selection:bg-primary/30 transition-colors duration-300">
      
      {/* ── Desktop CRM Header ── */}
      <header className="hidden md:flex items-center justify-between px-8 h-16 shrink-0 border-b border-[var(--border)] bg-[var(--card-bg)]/40 backdrop-blur-md z-30">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--foreground)]/40 uppercase tracking-widest mb-0.5">
              <span>לוח בקרה מרכזי</span>
              <ChevronRight className="w-2.5 h-2.5 opacity-30" />
              <span>מבט על</span>
            </div>
            <h1 className="text-lg font-black flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-primary" />
              מרכז חוסן
              <span className="text-xs font-bold text-primary/40 mr-1 opacity-50">| חוות רום</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <div className="relative hidden lg:block">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground)]/30" />
              <input type="text" placeholder="חיפוש מהיר..." className="bg-[var(--foreground)]/5 border border-[var(--border)] rounded-lg py-1.5 pr-9 pl-4 text-xs w-64 focus:outline-none focus:border-primary/50 transition-all" />
           </div>
           <div className="w-px h-6 bg-[var(--border)]" />
           <button className="p-2 text-[var(--foreground)]/40 hover:text-[var(--foreground)] transition-colors relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full" />
           </button>
           <button onClick={logout} className="p-2 text-[var(--foreground)]/40 hover:text-rose-500 transition-colors">
              <LogOut className="w-4 h-4" />
           </button>
        </div>
      </header>

      {/* ── Mobile Header ── */}
      <header className="md:hidden sticky top-0 z-30 bg-[var(--background)]/95 backdrop-blur-lg border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-black text-white">{firstName.charAt(0)}</div>
              <h1 className="text-sm font-bold">{greeting()}, {firstName}</h1>
           </div>
           <button onClick={logout} className="p-2 text-[var(--foreground)]/40"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--foreground)]/[0.02] no-scrollbar">
          <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-8">
            
            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
               <div>
                  <h2 className="text-2xl md:text-3xl font-black">{greeting()}, {firstName}</h2>
                  <p className="text-[var(--foreground)]/50 text-sm md:text-base mt-1 font-medium">{todayLabel} | מבט עדכני על פעילות המרכז</p>
               </div>
               {!showAll && (
                 <button onClick={() => setShowGroupPicker(true)} className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl text-primary text-xs font-bold hover:bg-primary/20 transition-all">
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

            <div className="grid lg:grid-cols-[380px_1fr] gap-6 md:gap-8 items-start">
              
              {/* Left Column (Narrow): Status & Quick Actions */}
              <div className="space-y-6 order-2 lg:order-1">
                <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden backdrop-blur-sm shadow-sm">
                   <div className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--foreground)]/[0.01]">
                      <h3 className="text-sm font-black text-[var(--foreground)]/40 uppercase tracking-widest flex items-center gap-2">
                         <Activity className="w-4 h-4 text-emerald-500" />
                         נוכחות לפי קבוצה
                      </h3>
                      <Link href="/attendance" className="p-1.5 rounded-lg hover:bg-[var(--foreground)]/5 text-primary transition-all">
                         <ArrowUpRight className="w-4 h-4" />
                      </Link>
                   </div>
                   <div className="p-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                      {visibleStats.map((group) => {
                        const pct = group.total > 0 ? Math.round((group.present / group.total) * 100) : 0;
                        return (
                          <div key={group.id} className="p-4 hover:bg-[var(--foreground)]/[0.02] rounded-xl transition-all group">
                             <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                   <div className={`w-1.5 h-4 rounded-full ${pct === 100 ? "bg-emerald-500" : pct > 50 ? "bg-blue-500" : "bg-amber-500"}`} />
                                   <span className="font-bold text-xs text-[var(--foreground)]/80">{group.name}</span>
                                </div>
                                <span className="text-[10px] font-black text-[var(--foreground)]/40">{group.present}/{group.total}</span>
                             </div>
                             <Bar pct={pct} color={pct === 100 ? "bg-emerald-500" : pct > 50 ? "bg-blue-500" : "bg-amber-500"} />
                          </div>
                        );
                      })}
                   </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                   <Link href="/patients" className="flex items-center gap-4 p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl hover:bg-[var(--foreground)]/[0.02] transition-all group shadow-sm">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                         <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">מאגר מטופלים</p>
                        <p className="text-[10px] text-[var(--foreground)]/40 mt-0.5">ניהול תיקים ומידע רפואי</p>
                      </div>
                   </Link>
                   <Link href="/shopping" className="flex items-center gap-4 p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl hover:bg-[var(--foreground)]/[0.02] transition-all group shadow-sm">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                         <ShoppingCart className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">ניהול לוגיסטי</p>
                        <p className="text-[10px] text-[var(--foreground)]/40 mt-0.5">הזמנות רכש ומלאי שוטף</p>
                      </div>
                   </Link>
                   <Link href="/calendar" className="flex items-center gap-4 p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl hover:bg-[var(--foreground)]/[0.02] transition-all group shadow-sm">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                         <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">יומן עבודה</p>
                        <p className="text-[10px] text-[var(--foreground)]/40 mt-0.5">שיבוצים ופעילות יומית</p>
                      </div>
                   </Link>
                </div>

                <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                   <h3 className="text-[11px] font-black text-[var(--foreground)]/30 uppercase tracking-widest mb-4">עדכונים אחרונים</h3>
                   <div className="space-y-4">
                      <div className="flex gap-3">
                         <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0"><Check className="w-4 h-4 text-emerald-500" /></div>
                         <div className="min-w-0"><p className="text-xs font-bold">נוכחות עודכנה</p><p className="text-[10px] text-[var(--foreground)]/40 mt-0.5">לפני 5 דקות</p></div>
                      </div>
                      <div className="flex gap-3">
                         <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><ShoppingCart className="w-4 h-4 text-primary" /></div>
                         <div className="min-w-0"><p className="text-xs font-bold">בקשת רכש חדשה</p><p className="text-[10px] text-[var(--foreground)]/40 mt-0.5">לפני שעה</p></div>
                      </div>
                   </div>
                </div>
              </div>

              {/* Right Column (Wide): The Schedule - PLACE OF HONOR */}
              <div className="space-y-6 order-1 lg:order-2">
                <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2rem] overflow-hidden backdrop-blur-md shadow-xl shadow-black/5">
                   <div className="px-8 py-7 border-b border-[var(--border)] flex items-center justify-between bg-gradient-to-l from-[var(--foreground)]/[0.02] to-transparent">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
                           <Clock className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black tracking-tight">סדר יום ולוח פעילות</h3>
                          <p className="text-xs text-[var(--foreground)]/40 font-bold uppercase tracking-widest mt-0.5">שיבוצים בזמן אמת ליום {format(new Date(), "EEEE", { locale: he })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {dutyName && (
                          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                             <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                             <span className="text-xs font-bold text-rose-500">תורן: {dutyName}</span>
                          </div>
                        )}
                        <Link href="/calendar" className="p-2.5 rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)]/40 hover:text-primary hover:border-primary/30 transition-all active:scale-95">
                           <Calendar className="w-5 h-5" />
                        </Link>
                      </div>
                   </div>
                   
                   <div className="p-8 md:p-10 min-h-[400px]">
                      {visibleActs.length === 0 ? (
                        <div className="py-24 text-center flex flex-col items-center justify-center">
                           <div className="w-20 h-20 rounded-full bg-[var(--foreground)]/5 flex items-center justify-center mb-6">
                              <Inbox className="w-10 h-10 text-[var(--foreground)]/20" />
                           </div>
                           <h4 className="text-lg font-bold text-[var(--foreground)]/30 italic">אין פעילויות רשומות להיום</h4>
                           <p className="text-sm text-[var(--foreground)]/20 mt-2">הלו״ז היומי יופיע כאן ברגע שיעודכן</p>
                        </div>
                      ) : (
                        <div className="space-y-2 relative">
                           <div className="absolute top-2 bottom-2 right-16 md:right-[72px] w-0.5 bg-gradient-to-b from-primary/30 via-[var(--border)] to-transparent hidden sm:block" />
                           {visibleActs.map((act) => (
                               <TimelineRow key={act.id} act={act} groups={groups} now={now} />
                           ))}
                        </div>
                      )}
                   </div>

                   {nextAct && (
                     <div className="px-8 py-5 bg-primary/5 border-t border-[var(--border)] flex items-center justify-between group cursor-pointer hover:bg-primary/10 transition-colors">
                        <div className="flex items-center gap-4">
                           <div className="relative">
                              <div className="w-3 h-3 rounded-full bg-primary animate-ping absolute inset-0" />
                              <div className="w-3 h-3 rounded-full bg-primary relative" />
                           </div>
                           <div className="flex flex-col">
                              <span className="text-[10px] font-black text-primary uppercase tracking-widest leading-none">הבא בתור</span>
                              <span className="text-sm font-black text-[var(--foreground)] mt-1">{nextAct.title}</span>
                           </div>
                        </div>
                        <div className="flex items-center gap-3">
                           <div className="flex flex-col items-end">
                              <span className="text-xs font-black text-primary">{nextAct.startTime}</span>
                              <span className="text-[10px] text-[var(--foreground)]/40 font-medium">מתחיל בקרוב</span>
                           </div>
                           <ChevronLeft className="w-4 h-4 text-primary group-hover:translate-x-[-4px] transition-transform" />
                        </div>
                     </div>
                   )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-lg shadow-blue-600/20">
                      <div className="flex justify-between items-start mb-8">
                         <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                            <TrendingUp className="w-5 h-5" />
                         </div>
                         <ArrowUpRight className="w-5 h-5 opacity-40" />
                      </div>
                      <h4 className="text-lg font-black leading-tight">סיכום פעילות<br />שבועי</h4>
                      <p className="text-white/60 text-xs mt-2 font-medium">94% נוכחות ממוצעת השבוע</p>
                   </div>
                   <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-3xl p-6 flex flex-col justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                            <AlertCircle className="w-5 h-5" />
                         </div>
                         <div>
                            <p className="text-xs font-bold">הודעות קריטיות</p>
                            <p className="text-[10px] text-[var(--foreground)]/40">אין התראות חדשות</p>
                         </div>
                      </div>
                      <button className="mt-6 w-full py-2 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-xl text-xs font-bold transition-all">הצג את כל ההתראות</button>
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
              className="absolute inset-0 bg-black/40 backdrop-blur-md" />
            <motion.div
              initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
              className="relative bg-[var(--card-bg)] border-t md:border border-[var(--border)] w-full max-w-sm rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--foreground)]/[0.02]">
                <h3 className="text-sm font-bold flex items-center gap-2"><Layers className="w-4 h-4 text-primary" /> בחר קבוצת עבודה</h3>
                <button onClick={() => setShowGroupPicker(false)} className="p-2 hover:bg-[var(--foreground)]/5 rounded-xl transition-colors text-[var(--foreground)]/50"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                {groups.map(g => (
                  <button key={g.id}
                    onClick={() => { setPrimaryGroupId(g.id); setShowGroupPicker(false); }}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all ${
                      primaryGroupId === g.id
                        ? "bg-primary border-primary text-white shadow-lg shadow-primary/20"
                        : "bg-[var(--foreground)]/5 border-[var(--border)] text-[var(--foreground)]/50 hover:bg-[var(--foreground)]/10 hover:text-[var(--foreground)]"
                    }`}>
                    <span className="font-bold text-sm">{g.name}</span>
                    {primaryGroupId === g.id && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-[var(--border)] bg-[var(--foreground)]/[0.01]">
                <button onClick={() => { setPrimaryGroupId(null); setShowGroupPicker(false); }}
                  className="w-full py-3.5 bg-[var(--foreground)]/5 rounded-2xl text-sm font-bold text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/10 transition-all">
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
