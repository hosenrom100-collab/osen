"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogOut, Users, Calendar, ShoppingCart, CheckCircle,
  Shield, MapPin, Edit3, ChevronLeft, Clock,
  ClipboardList, Layers, X, Check, ChevronDown, Plus,
} from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, query, where, doc, getDoc, orderBy, updateDoc, setDoc,
} from "firebase/firestore";
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

// ── Thin progress bar ─────────────────────────────────────────────────────────
function Bar({ pct }: { pct: number }) {
  const color = pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : "bg-amber-500";
  return (
    <div className="h-1 bg-[var(--foreground)]/6 rounded-full overflow-hidden">
      <motion.div className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
    </div>
  );
}

// ── Timeline row — compact ────────────────────────────────────────────────────
function TimelineRow({
  act, groups, now,
}: {
  act: ScheduleAct;
  groups: { id: string; name: string }[];
  now: string;
}) {
  const isPast    = (act.endTime ?? act.startTime) < now;
  const isCurrent = !isPast && act.startTime <= now;
  const gName     = groups.find(g => g.id === act.groupId)?.name
    ?? (act.groupId === "all" ? null : act.groupId === "staff_only" ? "צוות" : null);

  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-[var(--border)] last:border-0 transition-opacity ${isPast ? "opacity-35" : ""}`}>
      {/* Time */}
      <span className={`text-xs font-semibold shrink-0 w-10 text-right pt-px ${isCurrent ? "text-emerald-500" : "text-[var(--muted)]"}`}>
        {act.startTime}
      </span>

      {/* Now dot */}
      <div className="pt-1.5 shrink-0">
        <div className={`w-2 h-2 rounded-full ${isCurrent ? "bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.7)]" : isPast ? "bg-[var(--foreground)]/10" : "bg-[var(--foreground)]/25"}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium truncate ${isCurrent ? "text-[var(--foreground)]" : "text-[var(--foreground)]/75"}`}>
            {act.title}
          </span>
          {isCurrent && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">עכשיו</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {gName && <span className="text-[10px] text-[var(--muted)]">{gName}</span>}
          {act.locationName && (
            <span className="text-[10px] text-[var(--muted)] flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5" />{act.locationName}
            </span>
          )}
          {act.staffNames.length > 0 && (
            <span className="text-[10px] text-[var(--muted)] truncate max-w-[160px]">{act.staffNames.join(", ")}</span>
          )}
        </div>
      </div>

      {/* End time */}
      {act.endTime && (
        <span className="text-[10px] text-[var(--muted)] shrink-0 pt-px">{act.endTime}</span>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const {
    user, loading, isWhitelisted, logout,
    isAdmin, isManager, assignedGroups, primaryGroupId, setPrimaryGroupId,
  } = useAuth();
  const router = useRouter();

  const [groups,          setGroups]          = useState<{ id: string; name: string }[]>([]);
  const [stats,           setStats]           = useState<GroupStat[]>([]);
  const [presentPatients, setPresentPatients] = useState<PresentPat[]>([]);
  const [activities,      setActivities]      = useState<ScheduleAct[]>([]);
  const [dutyName,        setDutyName]        = useState("");
  const [dutyId,          setDutyId]          = useState("");
  const [allStaff,        setAllStaff]        = useState<{ id: string; name: string }[]>([]);
  const [isEditingDuty,   setIsEditingDuty]   = useState(false);
  const [shoppingCount,   setShoppingCount]   = useState(0);
  const [conflicts,       setConflicts]       = useState<{userId: string, userName: string, type: 'duty'|'activity'}[]>([]);
  const [expandedGroups,  setExpandedGroups]  = useState<Set<string>>(new Set());
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [dataLoaded,      setDataLoaded]      = useState(false);

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

      const shopSnap = await getDocs(
        query(collection(db, "shopping_requests"), where("status", "==", "pending"))
      );
      setShoppingCount(shopSnap.size);

      const schedSnap = await getDoc(doc(db, "schedules", today));
      if (schedSnap.exists()) {
        const data = schedSnap.data();
        const [usersSnap, locsSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "locations")),
        ]);
        const userMap: Record<string, string> = {};
        const staffList: { id: string; name: string }[] = [];
        usersSnap.forEach(d => {
          const name = d.data().name || d.data().email;
          userMap[d.id] = name;
          staffList.push({ id: d.id, name });
        });
        setAllStaff(staffList);
        const locMap: Record<string, string> = {};
        locsSnap.forEach(d => { locMap[d.id] = d.data().name; });
        const duty = data.dutyInstructorId || data.dutyId || "";
        setDutyId(duty);
        setDutyName(duty ? (userMap[duty] || "") : "");
        const acts: ScheduleAct[] = (data.activities || []).map((a: any) => ({
          id:           a.id || Math.random().toString(36).slice(2),
          title:        a.title || a.activityType || "פעילות",
          startTime:    a.startTime || "",
          endTime:      a.endTime || "",
          locationName: locMap[a.locationId] || "",
          staffNames:   (a.staffIds || (a.instructorId ? [a.instructorId] : []))
                          .map((id: string) => userMap[id] || "").filter(Boolean),
          groupId:      a.groupId || a.hosenType || "all",
        })).sort((a: ScheduleAct, b: ScheduleAct) => a.startTime.localeCompare(b.startTime));
        setActivities(acts);

        // ── STAFF CONFLICT DETECTION ──
        if (isAdmin || isManager) {
          const staffAttSnap = await getDocs(query(collection(db, "staff_attendance"), where("date", "==", today)));
          const absentStaffIds = new Set(staffAttSnap.docs.filter(d => d.data().status === 'absent' || d.data().status === 'leave').map(d => d.data().userId));
          
          const newConflicts: {userId: string, userName: string, type: 'duty'|'activity'}[] = [];
          if (duty && absentStaffIds.has(duty)) {
            newConflicts.push({ userId: duty, userName: userMap[duty], type: 'duty' });
          }
          
          (data.activities || []).forEach((oa: any) => {
            const staffIds = oa.staffIds || (oa.instructorId ? [oa.instructorId] : []);
            staffIds.forEach((sid: string) => {
              if (absentStaffIds.has(sid)) {
                newConflicts.push({ userId: sid, userName: userMap[sid], type: 'activity' });
              }
            });
          });
          setConflicts(newConflicts);
        }
      }
    } catch (err) { console.error(err); }
    finally { setDataLoaded(true); }
  };

  const updateDuty = async (newId: string) => {
    const today = format(new Date(), "yyyy-MM-dd");
    try {
      const ref  = doc(db, "schedules", today);
      const snap = await getDoc(ref);
      if (snap.exists()) await updateDoc(ref, { dutyInstructorId: newId });
      else               await setDoc(ref, { dutyInstructorId: newId, activities: [] });
      setDutyId(newId);
      setDutyName(allStaff.find(s => s.id === newId)?.name || "");
      setIsEditingDuty(false);
    } catch (err) { console.error(err); }
  };

  /* ── Derived ── */
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
      <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
        <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const firstName  = user.displayName?.split(" ")[0] ?? "שלום";
  const todayLabel = format(new Date(), "EEEE, d בMMMM", { locale: he });

  return (
    <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6">
        <div className="flex items-center gap-3 h-12">

          {/* Greeting — desktop shows in header since no sidebar greeting */}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold hidden md:inline">{greeting()}, {firstName}</span>
            {/* Mobile greeting */}
            <div className="flex items-center gap-2 md:hidden">
              <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center text-xs font-bold text-white shrink-0">
                {firstName.charAt(0)}
              </div>
              <span className="text-sm font-semibold">{greeting()}, {firstName}</span>
            </div>
          </div>

          {/* Date — desktop */}
          <span className="text-xs text-[var(--muted)] hidden md:inline shrink-0">{todayLabel}</span>

          {/* Group picker — non-admins */}
          {!showAll && (
            <button onClick={() => setShowGroupPicker(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary)]/8 border border-[var(--primary)]/15 rounded-lg text-xs font-medium text-[var(--primary)] hover:bg-[var(--primary)]/12 transition-colors shrink-0">
              <Layers className="w-3.5 h-3.5" />
              <span className="max-w-[120px] truncate">{primaryGroup?.name ?? "בחר קבוצה"}</span>
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
          )}

          <button onClick={logout} aria-label="התנתק"
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Status bar — single line summary ── */}
      {dataLoaded && totalActive > 0 && (
        <div className="border-b border-[var(--border)] px-4 md:px-6">
          <div className="flex items-center gap-4 h-9 text-xs">
            <Link href="/attendance" className="flex items-center gap-1.5 hover:text-emerald-500 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="font-semibold text-emerald-500">{totalPresent}</span>
              <span className="text-[var(--muted)]">נוכחים</span>
            </Link>
            {totalMissing > 0 && (
              <Link href="/attendance" className="flex items-center gap-1.5 hover:text-amber-500 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="font-semibold text-amber-500">{totalMissing}</span>
                <span className="text-[var(--muted)]">ממתינים לסימון</span>
              </Link>
            )}
            {shoppingCount > 0 && (
              <Link href="/shopping" className="flex items-center gap-1.5 hover:text-[var(--primary)] transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                <span className="font-semibold text-[var(--primary)]">{shoppingCount}</span>
                <span className="text-[var(--muted)]">בקשות רכש</span>
              </Link>
            )}
            <div className="mr-auto hidden md:flex items-center gap-1.5">
              <div className="h-1.5 w-24 bg-[var(--foreground)]/6 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${overallPct === 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${overallPct}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
              <span className="text-[var(--muted)]">{overallPct}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="px-4 md:px-6 py-5 pb-24">
        <div className="grid md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_320px] gap-5 max-w-6xl mx-auto">

          {/* ── Schedule — PRIMARY column ── */}
          <section className="md:order-1">
            <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card-bg,var(--surface))]">

              {/* Section header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[var(--primary)]" />
                  <h2 className="text-sm font-semibold">לוז היום</h2>
                  <span className="text-[10px] text-[var(--muted)] hidden sm:inline">
                    {format(new Date(), "EEEE", { locale: he })}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Duty instructor */}
                  {(isAdmin || isManager) && isEditingDuty ? (
                    <select autoFocus value={dutyId}
                      onChange={e => updateDuty(e.target.value)}
                      onBlur={() => setIsEditingDuty(false)}
                      className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs outline-none focus:border-[var(--primary)]">
                      <option value="">ללא תורן</option>
                      {allStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  ) : dutyName ? (
                    <button
                      onClick={() => (isAdmin || isManager) && setIsEditingDuty(true)}
                      className="flex items-center gap-1.5 text-[10px] font-medium text-rose-500 bg-rose-500/8 px-2 py-1 rounded-lg border border-rose-500/15 hover:bg-rose-500/12 transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                      תורן: {dutyName}
                      {(isAdmin || isManager) && <Edit3 className="w-2.5 h-2.5 opacity-50" />}
                    </button>
                  ) : (isAdmin || isManager) && (
                    <button onClick={() => setIsEditingDuty(true)}
                      className="text-[10px] text-[var(--muted)] hover:text-rose-500 flex items-center gap-1 transition-colors">
                      <Plus className="w-3 h-3" />הגדר תורן
                    </button>
                  )}

                  <Link href="/calendar"
                    className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {/* Active Alerts */}
              {(isAdmin || isManager) && conflicts.length > 0 && (
                <div className="space-y-3 px-4 pt-4">
                  {conflicts.map((c, i) => (
                    <motion.div 
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      key={i}
                      className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-600">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-rose-600 uppercase tracking-widest">התראת כוח אדם</p>
                          <p className="text-sm font-bold text-rose-500">{c.userName} משובץ ל{c.type === 'duty' ? 'מדריך תורן' : 'פעילות'} אך רשום כנעדר</p>
                        </div>
                      </div>
                      <Link href="/admin/staff" className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-[10px] font-black uppercase">נהל</Link>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Current activity highlight */}
              {currentAct && (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-500/6 border-b border-emerald-500/12">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-xs font-semibold text-emerald-500 truncate">{currentAct.title}</span>
                  <span className="text-[10px] text-emerald-600 shrink-0 mr-auto">{currentAct.startTime}–{currentAct.endTime}</span>
                </div>
              )}

              {/* Activities list */}
              <div className="px-4 py-2">
                {!dataLoaded ? (
                  <div className="flex justify-center py-10">
                    <div className="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--primary)] rounded-full animate-spin" />
                  </div>
                ) : visibleActs.length === 0 ? (
                  <div className="py-10 text-center text-[var(--muted)] text-sm">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    אין פעילויות רשומות להיום
                  </div>
                ) : (
                  <div>
                    {visibleActs.map(act => (
                      <TimelineRow key={act.id} act={act} groups={groups} now={now} />
                    ))}
                  </div>
                )}
              </div>

              {/* Next up */}
              {nextAct && (
                <div className="flex items-center gap-2 px-4 py-2.5 border-t border-[var(--border)] text-xs">
                  <span className="text-[var(--muted)]">הבא:</span>
                  <span className="font-medium truncate">{nextAct.title}</span>
                  <span className="text-[var(--primary)] font-semibold shrink-0 mr-auto">{nextAct.startTime}</span>
                </div>
              )}
            </div>
          </section>

          {/* ── Sidebar — attendance + actions ── */}
          <aside className="space-y-4 md:order-2">

            {/* Attendance by group */}
            <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card-bg,var(--surface))]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <h2 className="text-sm font-semibold">נוכחות היום</h2>
                </div>
                <Link href="/attendance"
                  className="text-[10px] font-medium text-[var(--primary)] hover:underline flex items-center gap-0.5">
                  סמן <ChevronLeft className="w-3 h-3" />
                </Link>
              </div>

              <div className="p-3">
                {!dataLoaded ? (
                  <div className="py-6 flex justify-center">
                    <div className="w-4 h-4 border-2 border-[var(--border)] border-t-[var(--primary)] rounded-full animate-spin" />
                  </div>
                ) : visibleStats.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] text-center py-5">
                    {showAll || primaryGroupId ? "טוען..." : "בחר קבוצה למעלה"}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {visibleStats.map(g => {
                      const pct = g.total > 0 ? Math.round((g.present / g.total) * 100) : 0;
                      return (
                        <div key={g.id}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium truncate">{g.name}</span>
                            <span className={`text-[10px] font-semibold ${pct === 100 ? "text-emerald-500" : "text-[var(--muted)]"}`}>
                              {g.present}/{g.total}
                            </span>
                          </div>
                          <Bar pct={pct} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Quick actions — only show links not in sidebar already */}
            <nav className="grid grid-cols-2 gap-2" aria-label="פעולות מהירות">
              {[
                { href: "/attendance", icon: ClipboardList, label: "נוכחות", color: "text-emerald-500 bg-emerald-500/8" },
                { href: "/patients",   icon: Users,         label: "מטופלים", color: "text-blue-500 bg-blue-500/8" },
                { href: "/shopping",   icon: ShoppingCart,  label: "קניות",   color: "text-amber-500 bg-amber-500/8" },
                ...(isAdmin || isManager ? [{ href: "/admin", icon: Shield, label: "ניהול", color: "text-violet-500 bg-violet-500/8" }] : [
                  { href: "/calendar", icon: Calendar, label: "לוח שנה", color: "text-rose-500 bg-rose-500/8" },
                ]),
              ].map(({ href, icon: Icon, label, color }) => (
                <Link key={href} href={href}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--border)] text-xs font-medium hover:border-[var(--border-strong)] transition-colors ${color.split(" ")[1]} hover:brightness-110`}>
                  <Icon className={`w-4 h-4 shrink-0 ${color.split(" ")[0]}`} />
                  {label}
                  {href === "/shopping" && shoppingCount > 0 && (
                    <span className="mr-auto text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">{shoppingCount}</span>
                  )}
                  {href === "/attendance" && totalMissing > 0 && (
                    <span className="mr-auto text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">{totalMissing}</span>
                  )}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      </main>

      {/* ── Group picker modal ── */}
      <AnimatePresence>
        {showGroupPicker && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowGroupPicker(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="relative bg-[var(--surface)] border-t border-[var(--border)] w-full max-w-sm rounded-t-2xl shadow-2xl"
            >
              <div className="w-8 h-1 bg-[var(--foreground)]/10 rounded-full mx-auto mt-3 mb-1" />
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
                <h2 className="font-semibold text-sm">בחר קבוצה עיקרית</h2>
                <button onClick={() => setShowGroupPicker(false)}
                  className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-1.5 max-h-[50vh] overflow-y-auto">
                <p className="text-[11px] text-[var(--muted)] mb-3">הקבוצה שתבחר תקבע את תצוגת ברירת המחדל בדשבורד.</p>
                {groups.map(g => (
                  <button key={g.id}
                    onClick={() => { setPrimaryGroupId(g.id); setShowGroupPicker(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-sm ${
                      primaryGroupId === g.id
                        ? "bg-[var(--primary)]/8 border-[var(--primary)]/20 text-[var(--primary)]"
                        : "bg-[var(--foreground)]/2 border-[var(--border)] hover:bg-[var(--foreground)]/4"
                    }`}>
                    <Layers className="w-3.5 h-3.5 shrink-0 opacity-60" />
                    <span className="flex-1 text-right font-medium">{g.name}</span>
                    {primaryGroupId === g.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-[var(--border)]">
                <button onClick={() => { setPrimaryGroupId(null); setShowGroupPicker(false); }}
                  className="w-full py-2.5 bg-[var(--foreground)]/4 rounded-xl text-sm font-medium text-[var(--muted)] hover:bg-[var(--foreground)]/6 transition-all">
                  הצג הכל
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
