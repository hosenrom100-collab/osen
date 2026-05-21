"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogOut, Users, Calendar, ShoppingCart, CheckCircle,
  Shield, MapPin, Edit3, ChevronLeft, Clock,
  ClipboardList, Layers, X, Check, ChevronDown, Plus,
  AlertTriangle, Sparkles, Bell
} from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, query, where, doc, getDoc, orderBy, updateDoc, setDoc, limit
} from "firebase/firestore";
import { format, addMonths, differenceInDays, parseISO, isValid } from "date-fns";
import { he } from "date-fns/locale";

interface GroupStat   { id: string; name: string; present: number; absent: number; total: number }
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
  act, groups, programs, now,
}: {
  act: ScheduleAct;
  groups: any[];
  programs: { id: string; name: string }[];
  now: string;
}) {
  const isPast    = (act.endTime ?? act.startTime) < now;
  const isCurrent = !isPast && act.startTime <= now;
  
  const group = groups.find(g => g.id === act.groupId);
  let gName = group?.name;
  const progName = programs.find(p => p.id === group?.programId)?.name;
  if (progName && gName && progName !== gName) gName = `${progName} - ${gName}`;
  else if (!gName) gName = act.groupId === "all" ? null : act.groupId === "staff_only" ? "צוות" : null;

  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-[var(--border)] last:border-0 transition-opacity ${isPast ? "opacity-35" : ""}`}>
      {/* Time */}
      <span className={`text-xs font-semibold shrink-0 w-10 text-right pt-px ${isCurrent ? "text-emerald-500" : "text-[var(--muted)]"}`}>
        {act.startTime}
      </span>

      {/* Now dot */}
      <div className="pt-1.5 shrink-0">
        <div className={`w-2 h-2 rounded-full ${isCurrent ? "bg-emerald-500" : isPast ? "bg-slate-200" : "bg-slate-300"}`} />
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
    user, loading, isWhitelisted, logout, photoURL,
    isAdmin, isManager, role, assignedGroups, primaryGroupId, setPrimaryGroupId,
    preferredProgramIds, preferredGroupIds,
  } = useAuth();
  const router = useRouter();

  const [groups,          setGroups]          = useState<{ id: string; name: string }[]>([]);
  const [programs,        setPrograms]        = useState<{ id: string; name: string }[]>([]);
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
  const [expiring3mCount, setExpiring3mCount] = useState(0);
  const [expiring6mCount, setExpiring6mCount] = useState(0);
  const [userAbsence,     setUserAbsence]     = useState<any[]>([]);
  const [pendingAbsences, setPendingAbsences] = useState<number>(0);
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const showAll = isAdmin || isManager;

  useEffect(() => {
    if (!loading && (!user || !isWhitelisted)) router.push("/login");
    else if (!loading && role === "participant") router.replace("/portal");
  }, [user, loading, isWhitelisted, role, router]);

  useEffect(() => {
    if (user && isWhitelisted) fetchAll();
  }, [user, isWhitelisted]);

  const fetchAll = async () => {
    const today = format(new Date(), "yyyy-MM-dd");
    try {
      // 1. Basic Refs
      const [groupsSnap, progsSnap] = await Promise.all([
        getDocs(query(collection(db, "groups"), orderBy("name"))),
        getDocs(query(collection(db, "programs"), orderBy("name")))
      ]);
      const groupList  = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const progList   = progsSnap.docs.map(d => ({ id: d.id, name: d.data().name as string }));
      setGroups(groupList);
      setPrograms(progList);

      // 2. Attendance & Patients
      const [pSnap, aSnap] = await Promise.all([
        getDocs(query(collection(db, "patients"), where("status", "==", "active"))),
        getDocs(query(collection(db, "attendance"), where("date", "==", today))),
      ]);

      const presentIds = new Set<string>();
      const absentIds  = new Set<string>();
      aSnap.forEach(d => {
        const data = d.data();
        if (data.status === "present") presentIds.add(data.patientId);
        else if (data.status === "absent") absentIds.add(data.patientId);
      });

      const statMap    = new Map<string, GroupStat>();
      groupList.forEach(g => statMap.set(g.id, { ...g, present: 0, absent: 0, total: 0 }));

      const present: PresentPat[] = [];
      let expiring3m = 0;
      let expiring6m = 0;
      pSnap.forEach(d => {
        const p   = d.data();
        const pId = d.id;
        
        // Collect all groups this patient belongs to
        const gIds: string[] = [];
        if (p.hosenType) {
          const gId = groupList.find(g => g.id === p.hosenType || g.name === p.hosenType)?.id;
          if (gId) gIds.push(gId);
        }
        if (Array.isArray(p.groupIds)) {
          p.groupIds.forEach((id: string) => {
            if (groupList.some(g => g.id === id) && !gIds.includes(id)) {
              gIds.push(id);
            }
          });
        }

        gIds.forEach(gId => {
          if (statMap.has(gId)) {
            const s = statMap.get(gId)!;
            s.total++;

            // Check attendance specifically for this group context, or fallback to general doc
            const groupAttendance = aSnap.docs.find(doc => {
              const data = doc.data();
              return data.patientId === pId && (data.contextId === gId || data.groupId === gId);
            });

            if (groupAttendance) {
              const status = groupAttendance.data().status;
              if (status === "present") {
                s.present++;
                if (!present.some(x => x.id === pId && x.hosenType === gId)) {
                  present.push({ id: pId, firstName: p.firstName, lastName: p.lastName, hosenType: gId });
                }
              } else if (status === "absent") {
                s.absent++;
              }
            } else {
              // Backward compatibility check: check if there's a general attendance doc (without contextId) for this patient today
              const fallbackAttendance = aSnap.docs.find(doc => {
                const data = doc.data();
                return data.patientId === pId && !data.contextId;
              });
              if (fallbackAttendance) {
                const status = fallbackAttendance.data().status;
                if (status === "present") {
                  s.present++;
                  if (!present.some(x => x.id === pId && x.hosenType === gId)) {
                    present.push({ id: pId, firstName: p.firstName, lastName: p.lastName, hosenType: gId });
                  }
                } else if (status === "absent") {
                  s.absent++;
                }
              }
            }
          }
        });
        try {
          if (p.startDate) {
            const start = parseISO(p.startDate);
            const end3m = addMonths(start, 3);
            let end6m = p.endDate ? parseISO(p.endDate) : addMonths(start, 6);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const diffDays3m = differenceInDays(end3m, today);
            const diffDays6m = differenceInDays(end6m, today);

            if (p.extensionReceived) {
              if (diffDays6m <= 14) {
                expiring6m++;
              }
            } else {
              if (diffDays3m <= 14) {
                expiring3m++;
              }
            }
          }
        } catch { /* ignore */ }
      });
      setStats([...statMap.values()]);
      setPresentPatients(present);
      setExpiring3mCount(expiring3m);
      setExpiring6mCount(expiring6m);

      // 3. Logistics & Absences
      const [shopSnap, myAbsSnap, allAbsSnap] = await Promise.all([
        getDocs(query(collection(db, "shopping_requests"), where("status", "==", "pending"))),
        getDocs(query(collection(db, "absence_requests"), where("userId", "==", user?.uid || ""), where("status", "==", "pending"))),
        isAdmin || isManager ? getDocs(query(collection(db, "absence_requests"), where("status", "==", "pending"))) : Promise.resolve({ size: 0, docs: [] } as any)
      ]);
      setShoppingCount(shopSnap.size);
      setUserAbsence(myAbsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      setPendingAbsences(allAbsSnap.size);

      // 4. Schedule
      const [schedSnap, usersSnap, locsSnap] = await Promise.all([
        getDoc(doc(db, "schedules", today)),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "locations")),
      ]);
      const userMap: Record<string, string> = {};
      const staffList: { id: string; name: string }[] = [];
      usersSnap.forEach(d => {
        const udata = d.data();
        const name = udata.name || udata.email || "צוות";
        userMap[d.id] = name;
        const roles = udata.roles || (udata.role ? [udata.role] : []);
        const isStaff = !roles.includes("participant") && udata.role !== "participant";
        if (isStaff) {
          staffList.push({ id: d.id, name });
        }
      });
      setAllStaff(staffList);
      const locMap: Record<string, string> = {};
      locsSnap.forEach(d => { locMap[d.id] = d.data().name; });

      if (schedSnap.exists()) {
        const data = schedSnap.data();
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

        if (isAdmin || isManager) {
          const staffAttSnap = await getDocs(query(collection(db, "staff_attendance"), where("date", "==", today)));
          const absentStaffIds = new Set(staffAttSnap.docs.filter(d => d.data().status === 'absent' || d.data().status === 'leave').map(d => d.data().userId));
          const newConflicts: {userId: string, userName: string, type: 'duty'|'activity'}[] = [];
          if (duty && absentStaffIds.has(duty)) newConflicts.push({ userId: duty, userName: userMap[duty] || duty, type: 'duty' });
          (data.activities || []).forEach((oa: any) => {
            const staffIds = oa.staffIds || (oa.instructorId ? [oa.instructorId] : []);
            staffIds.forEach((sid: string) => { if (absentStaffIds.has(sid)) newConflicts.push({ userId: sid, userName: userMap[sid] || sid, type: 'activity' }); });
          });
          setConflicts(newConflicts);
        }
      } else {
        setDutyId("");
        setDutyName("");
        setActivities([]);
        setConflicts([]);
      }

      // 5. Notifications
      const nSnap = await getDocs(query(
        collection(db, "notifications"),
        where("recipientIds", "array-contains", user?.uid || ""),
        orderBy("createdAt", "desc"),
        limit(5)
      ));
      const nList = nSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecentNotifications(nList);
      setUnreadNotifCount(nList.filter((n: any) => !n.readBy?.includes(user?.uid)).length);
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
    const hasPreferences = (preferredProgramIds && preferredProgramIds.length > 0) || (preferredGroupIds && preferredGroupIds.length > 0);
    if (hasPreferences) {
      const gDoc = groups.find(g => g.id === gId) as any;
      const inPrefGroup = preferredGroupIds?.includes(gId);
      const inPrefProgram = gDoc?.programId ? preferredProgramIds?.includes(gDoc.programId) : false;
      return inPrefGroup || inPrefProgram;
    }
    if (showAll) return true;
    if (primaryGroupId) return gId === primaryGroupId;
    return assignedGroups.includes(gId);
  };
  const visibleStats  = stats.filter(s => isGroupVisible(s.id) && s.total > 0);
  const totalPresent  = visibleStats.reduce((n, s) => n + s.present, 0);
  const totalMissing  = visibleStats.reduce((n, s) => n + Math.max(0, s.total - s.present - s.absent), 0);
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
              {photoURL ? (
                <img 
                  src={photoURL} 
                  alt={firstName} 
                  className="w-7 h-7 rounded-full object-cover border border-[var(--border)]"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[var(--foreground)]/5 flex items-center justify-center text-xs font-bold text-[var(--muted)] shrink-0">
                  {firstName.charAt(0)}
                </div>
              )}
              <span className="text-sm font-black text-[var(--foreground)]">{greeting()}, {firstName}</span>
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
                <span className="text-[var(--muted)]">משתתפים ממתינים לבדיקת נוכחות</span>
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

      {/* ── AI Insights ── */}
      {dataLoaded && (
        <div className="px-4 md:px-6 mt-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <h2 className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/50">תובנות חכמות וסדר יום</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {(isAdmin || isManager) && pendingAbsences > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-3 flex gap-3 items-center cursor-pointer hover:bg-amber-500/10 transition-all group"
                  onClick={() => router.push("/admin/staff-attendance")}>
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20 group-hover:bg-amber-500/20 transition-all">
                    <Clock className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-[var(--foreground)]">אישור היעדרויות</p>
                    <p className="text-[10px] text-[var(--foreground)]/40 font-bold truncate">{pendingAbsences} בקשות ממתינות לאישור</p>
                  </div>
                </motion.div>
              )}
              {userAbsence.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-3 flex gap-3 items-center cursor-pointer hover:bg-indigo-500/10 transition-all group"
                  onClick={() => router.push("/profile")}>
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-all">
                    <Calendar className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-[var(--foreground)]">ההיעדרויות שלי</p>
                    <p className="text-[10px] text-[var(--foreground)]/40 font-bold truncate">{userAbsence.length} בקשות בטיפול</p>
                  </div>
                </motion.div>
              )}
              {(expiring3mCount > 0 || expiring6mCount > 0) && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-3 flex gap-3 items-center cursor-pointer hover:bg-blue-500/10 transition-all group"
                  onClick={() => router.push("/patients")}>
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20 group-hover:bg-blue-500/20 transition-all">
                    <Shield className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-[var(--foreground)]">הארכת תוכניות</p>
                    <div className="flex flex-col gap-0.5 mt-0.5 text-[9px] font-bold text-[var(--foreground)]/50">
                      {expiring3mCount > 0 && (
                        <span className="flex items-center gap-1 text-amber-500">
                          <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                          מסיים 3 חודשים: {expiring3mCount} משתתפים
                        </span>
                      )}
                      {expiring6mCount > 0 && (
                        <span className="flex items-center gap-1 text-rose-500">
                          <span className="w-1 h-1 rounded-full bg-rose-500 shrink-0" />
                          מסיים חצי שנה (פרידה): {expiring6mCount} משתתפים
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
              {unreadNotifCount > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                  className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-3 flex gap-3 items-center cursor-pointer hover:bg-emerald-500/10 transition-all group"
                  onClick={() => router.push("/notifications")}>
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-all">
                    <Bell className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-[var(--foreground)]">הודעות חדשות</p>
                    <p className="text-[10px] text-[var(--foreground)]/40 font-bold truncate">{unreadNotifCount} עדכונים שלא נקראו</p>
                  </div>
                </motion.div>
              )}
              {shoppingCount > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-3 flex gap-3 items-center cursor-pointer hover:bg-rose-500/10 transition-all group"
                  onClick={() => router.push("/shopping")}>
                  <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0 border border-rose-500/20 group-hover:bg-rose-500/20 transition-all">
                    <ShoppingCart className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-[var(--foreground)]">רכש ממתין</p>
                    <p className="text-[10px] text-[var(--foreground)]/40 font-bold truncate">{shoppingCount} מוצרים ממתינים לאישור</p>
                  </div>
                </motion.div>
              )}
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
                    <div className="flex items-center gap-1.5">
                      <select 
                        autoFocus 
                        value={dutyId}
                        onChange={e => updateDuty(e.target.value)}
                        className="bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--foreground)] rounded-lg px-2 py-1 text-xs outline-none focus:border-[var(--primary)] cursor-pointer"
                      >
                        <option value="">ללא מדריך תורן</option>
                        {allStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <button 
                        onClick={() => setIsEditingDuty(false)}
                        className="p-1 rounded-md hover:bg-[var(--foreground)]/5 text-[var(--muted)] hover:text-rose-500 transition-colors"
                        title="ביטול"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={!(isAdmin || isManager)}
                      onClick={() => (isAdmin || isManager) && setIsEditingDuty(true)}
                      className={`flex items-center gap-1.5 text-[10px] font-black rounded-lg border px-2.5 py-1 transition-all ${
                        dutyName 
                          ? 'text-rose-500 bg-rose-500/10 border-rose-500/20 active:scale-[0.98]'
                          : 'text-[var(--muted)] bg-[var(--foreground)]/[0.03] border-[var(--border)] hover:text-rose-500 hover:border-rose-500/20 transition-colors'
                      } ${!(isAdmin || isManager) ? 'cursor-default' : 'active:scale-[0.98]'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dutyName ? 'bg-rose-500' : 'bg-[var(--muted)]/40'}`} />
                      תורן: {dutyName || "טרם נקבע"}
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
                <div className="space-y-2 px-4 pt-4">
                  {conflicts.map((c, i) => (
                    <motion.div 
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      key={i}
                      className="bg-rose-500/5 border border-rose-500/15 rounded-2xl p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">התראת כוח אדם</p>
                          <p className="text-xs font-bold text-rose-500/80">{c.userName} משובץ ל{c.type === 'duty' ? 'מדריך תורן' : 'פעילות'} אך רשום כנעדר</p>
                        </div>
                      </div>
                      <Link href="/admin/staff-attendance" className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-[9px] font-black uppercase tracking-widest">נהל</Link>
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
                      <TimelineRow key={act.id} act={act} groups={groups} programs={programs} now={now} />
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

            {/* Recent Notifications */}
            <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card-bg,var(--surface))]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-emerald-500" />
                  <h2 className="text-sm font-semibold">עדכונים אחרונים</h2>
                </div>
                <button onClick={() => router.push("/notifications")} className="text-[10px] font-medium text-[var(--primary)] hover:underline">הכל</button>
              </div>
              <div className="p-3 space-y-2">
                {recentNotifications.length === 0 ? (
                  <p className="text-[10px] text-[var(--muted)] text-center py-4 opacity-40 italic">אין עדכונים חדשים</p>
                ) : (
                  recentNotifications.map(n => {
                    const isRead = n.readBy?.includes(user?.uid);
                    return (
                      <div key={n.id} className={`p-3 rounded-xl border transition-all ${isRead ? "bg-[var(--foreground)]/2 border-transparent opacity-60" : "bg-emerald-500/5 border-emerald-500/10"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {!isRead && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30" />}
                          <p className="text-[11px] font-black truncate">{n.title}</p>
                        </div>
                        <p className="text-[10px] text-[var(--muted)] line-clamp-2 leading-relaxed">{n.body}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

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
                            <span className="text-xs font-medium truncate">
                              {(() => {
                                const prog = programs.find(p => p.id === (g as any).programId)?.name;
                                let display = "";
                                if (prog && g.name && prog !== g.name) display = `${prog} - ${g.name}`;
                                else display = prog || g.name;
                                if (display && display !== "כללי" && !display.startsWith("תוכנית")) {
                                  return `תוכנית ${display}`;
                                }
                                return display;
                              })()}
                            </span>
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
                { href: "/attendance", icon: ClipboardList, label: "נוכחות", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
                { href: "/patients",   icon: Users,         label: "משתתפים", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
                { href: "/shopping",   icon: ShoppingCart,  label: "קניות",   color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
                ...(isAdmin || isManager ? [{ href: "/admin", icon: Shield, label: "ניהול", color: "text-[var(--muted)] bg-[var(--foreground)]/5 border-[var(--border)]" }] : [
                  { href: "/calendar", icon: Calendar, label: "לוח שנה", color: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
                ]),
              ].map(({ href, icon: Icon, label, color }) => (
                <Link key={href} href={href}
                  className={`flex items-center gap-2 px-3 py-3 rounded-2xl border text-xs font-black transition-all active:scale-[0.98] ${color}`}>
                  <Icon className={`w-4 h-4 shrink-0`} />
                  {label}
                  {href === "/shopping" && shoppingCount > 0 && (
                    <span className="mr-auto text-[10px] font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-lg border border-amber-500/20">{shoppingCount}</span>
                  )}
                  {href === "/attendance" && totalMissing > 0 && (
                    <span className="mr-auto text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-lg border border-emerald-500/20">{totalMissing}</span>
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
              className="relative bg-[var(--surface)] border-t border-[var(--border)] w-full max-w-sm rounded-t-[2.5rem]"
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
                    <span className="flex-1 text-right font-medium">
                      {(() => {
                        const prog = programs.find(p => p.id === (g as any).programId)?.name;
                        let display = "";
                        if (prog && g.name && prog !== g.name) display = `${prog} - ${g.name}`;
                        else display = prog || g.name;
                        if (display && display !== "כללי" && !display.startsWith("תוכנית")) {
                          return `תוכנית ${display}`;
                        }
                        return display;
                      })()}
                    </span>
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
