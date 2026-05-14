"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogOut, Users, Calendar, ShoppingCart, CheckCircle,
  Shield, User, MapPin, Edit3, ChevronLeft,
  Clock, ArrowLeftRight, ClipboardList, ChevronDown,
  Layers, X, Check,
} from "lucide-react";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, query, where, doc, getDoc, orderBy
} from "firebase/firestore";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface GroupStat    { id: string; name: string; present: number; total: number }
interface PresentPat   { id: string; firstName: string; lastName: string; hosenType?: string }
interface ScheduleAct  {
  id: string; title: string; startTime: string; endTime?: string;
  locationName: string; staffNames: string[]; groupId: string;
}

export default function Home() {
  const {
    user, loading, isWhitelisted, logout,
    isAdmin, isManager, assignedGroups,
    primaryGroupId, setPrimaryGroupId,
  } = useAuth();
  const router = useRouter();

  const [groups,          setGroups]          = useState<{ id: string; name: string }[]>([]);
  const [stats,           setStats]           = useState<GroupStat[]>([]);
  const [presentPatients, setPresentPatients] = useState<PresentPat[]>([]);
  const [activities,      setActivities]      = useState<ScheduleAct[]>([]);
  const [dutyName,        setDutyName]        = useState("");
  const [shoppingCount,   setShoppingCount]   = useState(0);
  const [expandedGroups,  setExpandedGroups]  = useState<Set<string>>(new Set());
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  // Admins/managers see all by default; others use primaryGroupId
  const showAll = isAdmin || isManager;

  /* ─── Redirect ─── */
  useEffect(() => {
    if (!loading && (!user || !isWhitelisted)) router.push("/login");
  }, [user, loading, isWhitelisted, router]);

  useEffect(() => {
    if (user && isWhitelisted) fetchAll();
  }, [user, isWhitelisted]);

  const fetchAll = async () => {
    const today = new Date().toISOString().split("T")[0];
    const now   = format(new Date(), "HH:mm");
    try {
      const groupsSnap = await getDocs(query(collection(db, "groups"), orderBy("name")));
      const groupList  = groupsSnap.docs.map(d => ({ id: d.id, name: d.data().name as string }));
      setGroups(groupList);

      const [patientsSnap, attendanceSnap] = await Promise.all([
        getDocs(query(collection(db, "patients"), where("status", "==", "active"))),
        getDocs(query(collection(db, "attendance"), where("date", "==", today), where("status", "==", "present"))),
      ]);

      const presentIds = new Set(attendanceSnap.docs.map(d => d.data().patientId as string));
      const statMap    = new Map<string, GroupStat>();
      groupList.forEach(g => statMap.set(g.id, { ...g, present: 0, total: 0 }));

      const present: PresentPat[] = [];
      patientsSnap.forEach(d => {
        const p  = d.data();
        const ht = (p.hosenType || "") as string;
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

        const acts: ScheduleAct[] = (data.activities || [])
          .map((a: any) => ({
            id:           a.id || Math.random().toString(36).slice(2),
            title:        a.title || a.activityType || "פעילות",
            startTime:    a.startTime || "",
            endTime:      a.endTime   || "",
            locationName: locMap[a.locationId] || "",
            staffNames:   (a.staffIds || (a.instructorId ? [a.instructorId] : []))
                            .map((id: string) => userMap[id] || "").filter(Boolean),
            groupId:      a.groupId || a.hosenType || "all",
          }))
          .sort((a: ScheduleAct, b: ScheduleAct) => a.startTime.localeCompare(b.startTime));
        setActivities(acts);
      }
    } catch (err) { console.error(err); }
  };

  /* ─── Derived ─── */
  const isGroupVisible = (gId: string) => {
    if (showAll) return true;
    if (primaryGroupId) return gId === primaryGroupId;
    return assignedGroups.includes(gId);
  };
  const visibleStats  = stats.filter(s => isGroupVisible(s.id));
  const totalPresent  = visibleStats.reduce((n, s) => n + s.present, 0);
  const totalMissing  = visibleStats.reduce((n, s) => n + Math.max(0, s.total - s.present), 0);
  const totalActive   = visibleStats.reduce((n, s) => n + s.total, 0);
  const now           = format(new Date(), "HH:mm");
  const visibleActs   = activities.filter(a => isGroupVisible(a.groupId) || a.groupId === "all");
  const nextActivity  = visibleActs.find(a => a.startTime >= now);
  const primaryGroup  = groups.find(g => g.id === primaryGroupId);

  if (loading || !user || !isWhitelisted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const firstName  = user.displayName?.split(" ")[0] ?? "שלום";
  const todayLabel = format(new Date(), "EEEE, d בMMMM", { locale: he });

  return (
    <main className="min-h-screen bg-slate-950 text-white pb-28">

      {/* ─── Sticky header ─── */}
      <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-xl border-b border-white/5 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 flex-shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold leading-tight">שלום, {firstName}</p>
            <p className="text-[11px] text-slate-500">{todayLabel}</p>
          </div>
          <button onClick={logout}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-500 hover:text-white transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-5">

        {/* ─── Primary group selector (non-admins) ─── */}
        {!showAll && (
          <button
            onClick={() => setShowGroupPicker(true)}
            className="w-full flex items-center gap-3 bg-violet-600/10 border border-violet-500/20 rounded-2xl px-4 py-3 hover:bg-violet-600/15 transition-colors active:scale-[0.99]"
          >
            <Layers className="w-4 h-4 text-violet-400 flex-shrink-0" />
            <div className="flex-1 text-right">
              <p className="text-[12px] font-bold text-violet-300">
                {primaryGroup ? primaryGroup.name : "בחר קבוצה עיקרית"}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {primaryGroup ? "הקבוצה שלי — לחץ לשינוי" : "הצג נתונים רלוונטיים עבורך"}
              </p>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-600" />
          </button>
        )}

        {/* ─── Quick actions 2×2 ─── */}
        <section className="grid grid-cols-2 gap-3">
          <motion.button whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/attendance")}
            className="bg-emerald-600/10 border border-emerald-500/20 rounded-2xl p-4 text-right active:bg-emerald-600/15 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center">
                <ClipboardList className="w-5 h-5" />
              </div>
              <span className="text-2xl font-black text-emerald-400">{totalPresent}</span>
            </div>
            <p className="font-bold text-sm text-white">סמן נוכחות</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {totalMissing > 0 ? `${totalMissing} ממתינים` : totalActive > 0 ? "✓ הכל סומן" : "—"}
            </p>
          </motion.button>

          <motion.button whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/shopping")}
            className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-4 text-right active:bg-indigo-600/15 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <span className="text-2xl font-black text-indigo-400">{shoppingCount}</span>
            </div>
            <p className="font-bold text-sm text-white">רשימת קניות</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {shoppingCount > 0 ? `${shoppingCount} ממתינות לאישור` : "אין בקשות פתוחות"}
            </p>
          </motion.button>

          <motion.button whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/patients")}
            className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-4 text-right active:bg-blue-600/15 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <span className="text-2xl font-black text-blue-400">{totalActive}</span>
            </div>
            <p className="font-bold text-sm text-white">מטופלים</p>
            <p className="text-[11px] text-slate-500 mt-0.5">פעילים כרגע</p>
          </motion.button>

          <motion.button whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/calendar")}
            className="bg-rose-600/10 border border-rose-500/20 rounded-2xl p-4 text-right active:bg-rose-600/15 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="w-10 h-10 bg-rose-500/20 text-rose-400 rounded-xl flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-2xl font-black text-rose-400">{visibleActs.length}</span>
            </div>
            <p className="font-bold text-sm text-white">לו״ז היום</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {nextActivity ? `הבא: ${nextActivity.startTime}` : visibleActs.length > 0 ? "הסתיים" : "אין פעילויות"}
            </p>
          </motion.button>
        </section>

        {/* ─── Present patients by group ─── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold text-slate-400 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              נוכחים היום
            </h2>
            <div className="flex items-center gap-2">
              {(isAdmin || isManager) && (
                <button onClick={() => router.push("/attendance/overview")}
                  className="text-[11px] font-bold text-slate-500 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-full border border-white/10 hover:border-white/20 transition-colors">
                  מבט כולל <ChevronLeft className="w-3 h-3" />
                </button>
              )}
              <button onClick={() => router.push("/attendance")}
                className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                סמן <ChevronLeft className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {visibleStats.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-6">
                {showAll || primaryGroupId ? "טוען נתונים..." : "בחר קבוצה עיקרית למעלה"}
              </p>
            ) : visibleStats.map(group => {
              const groupPresent = presentPatients.filter(p => p.hosenType === group.id);
              const pct          = group.total > 0 ? Math.round((group.present / group.total) * 100) : 0;
              const isExpanded   = expandedGroups.has(group.id);

              return (
                <div key={group.id} className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedGroups(prev => {
                      const n = new Set(prev);
                      n.has(group.id) ? n.delete(group.id) : n.add(group.id);
                      return n;
                    })}
                    className="w-full flex items-center gap-3 px-4 py-3"
                  >
                    <div className="flex-1 text-right">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[13px]">{group.name}</span>
                        <span className="text-[11px] text-emerald-400 font-bold">{group.present}/{group.total}</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden mt-1.5">
                        <motion.div className="h-full bg-emerald-500 rounded-full"
                          initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-600 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-3 border-t border-white/5 pt-3">
                          {groupPresent.length === 0 ? (
                            <p className="text-slate-600 text-[12px] italic">אף מטופל לא נרשם עדיין</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {groupPresent.map(p => (
                                <span key={p.id} className="text-[12px] bg-emerald-500/10 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium">
                                  {p.firstName} {p.lastName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── Today's schedule ─── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold text-slate-400 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-rose-400" />
              לו״ז היום
            </h2>
            {(isAdmin || isManager) && (
              <button onClick={() => router.push("/admin/schedule")}
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-500 hover:text-rose-400 transition-colors">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
            {dutyName && (
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-rose-500/5">
                <User className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                <span className="text-[12px] text-rose-300 font-bold">תורן: {dutyName}</span>
              </div>
            )}
            {visibleActs.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-slate-600 text-sm">אין פעילויות רשומות להיום</p>
              </div>
            ) : visibleActs.map(activity => {
              const isPast    = activity.endTime ? activity.endTime < now : activity.startTime < now;
              const groupName = groups.find(g => g.id === activity.groupId)?.name
                || (activity.groupId === "all" ? "משותף" : activity.groupId === "staff_only" ? "צוות" : "");
              return (
                <div key={activity.id}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0 ${isPast ? "opacity-40" : ""}`}>
                  <div className="w-12 text-right flex-shrink-0">
                    <span className="text-[12px] font-black text-blue-400">{activity.startTime}</span>
                    {activity.endTime && <p className="text-[10px] text-slate-600">{activity.endTime}</p>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[14px] leading-tight truncate">{activity.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {activity.locationName && (
                        <span className="flex items-center gap-0.5 text-[11px] text-slate-500">
                          <MapPin className="w-3 h-3" />{activity.locationName}
                        </span>
                      )}
                      {activity.staffNames.length > 0 && (
                        <span className="text-[11px] text-slate-600">{activity.staffNames.join(", ")}</span>
                      )}
                    </div>
                  </div>
                  {groupName && (
                    <span className="flex-shrink-0 text-[10px] font-bold bg-white/5 text-slate-500 px-2 py-0.5 rounded-md">
                      {groupName}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── Admin shortcut ─── */}
        {(isAdmin || isManager) && (
          <motion.button whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/admin")}
            className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] border border-white/8 rounded-2xl hover:bg-white/[0.05] transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-purple-500/15 text-purple-400 rounded-xl flex items-center justify-center">
                <Shield className="w-4 h-4" />
              </div>
              <span className="font-bold text-sm">ממשק ניהול</span>
            </div>
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </motion.button>
        )}

      </div>

      {/* ─── Primary group picker modal ─── */}
      <AnimatePresence>
        {showGroupPicker && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowGroupPicker(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="relative bg-slate-900 border-t border-white/10 w-full max-w-md rounded-t-3xl shadow-2xl"
            >
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-3 mb-1" />
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                <h2 className="font-bold text-base">בחר קבוצה עיקרית</h2>
                <button onClick={() => setShowGroupPicker(false)} className="p-2 rounded-xl hover:bg-white/5 text-slate-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-2 max-h-[50vh] overflow-y-auto">
                <p className="text-[12px] text-slate-500 mb-3">הקבוצה שתבחר תקבע את תצוגת ברירת המחדל בדשבורד, בנוכחות ובלוז.</p>
                {groups.map(g => (
                  <button key={g.id}
                    onClick={() => { setPrimaryGroupId(g.id); setShowGroupPicker(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                      primaryGroupId === g.id
                        ? "bg-violet-600/20 border-violet-500/40 text-violet-300"
                        : "bg-white/[0.03] border-white/8 text-white hover:bg-white/[0.06]"
                    }`}
                  >
                    <Layers className={`w-4 h-4 flex-shrink-0 ${primaryGroupId === g.id ? "text-violet-400" : "text-slate-500"}`} />
                    <span className="flex-1 text-right font-semibold text-sm">{g.name}</span>
                    {primaryGroupId === g.id && <Check className="w-4 h-4 text-violet-400" />}
                  </button>
                ))}
                {assignedGroups.length === 0 && !isAdmin && (
                  <p className="text-slate-600 text-sm text-center py-4">אין קבוצות מוקצות לחשבונך</p>
                )}
              </div>
              <div className="p-5 border-t border-white/8">
                <button onClick={() => { setPrimaryGroupId(null); setShowGroupPicker(false); }}
                  className="w-full py-3 bg-white/5 rounded-xl font-bold text-sm text-slate-400 hover:bg-white/10 transition-all">
                  הצג הכל (ללא סינון)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </main>
  );
}
