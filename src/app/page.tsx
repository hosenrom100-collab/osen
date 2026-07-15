"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogOut, Users, User, Calendar, CheckCircle,
  Shield, MapPin, Edit3, ChevronLeft, Clock,
  ClipboardList, Layers, X, Check, ChevronDown, Plus,
  AlertTriangle, Sparkles, Bell, Coffee, Utensils, ArrowLeftRight,
  ShoppingCart
} from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, query, where, doc, getDoc, orderBy, updateDoc, setDoc, limit
} from "firebase/firestore";
import { format, addMonths, differenceInDays, parseISO, isValid } from "date-fns";
import { he } from "date-fns/locale";
import { ScheduleEditorModal } from "@/components/home/ScheduleEditorModal";

interface GroupStat   { id: string; name: string; present: number; absent: number; total: number }
interface PresentPat  { id: string; firstName: string; lastName: string; hosenType?: string }
interface ScheduleAct {
  id: string; title: string; startTime: string; endTime?: string;
  locationName: string; staffNames: string[]; groupId: string;
  type?: 'activity' | 'break' | 'meal' | 'swap' | 'custom';
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

  let Icon = null;
  let customClass = "";
  let tagClass = "";
  if (act.type === "break") {
    Icon = Coffee;
    customClass = "bg-slate-500/5 hover:bg-slate-500/8 border border-slate-500/15 rounded-xl px-3 py-2.5 my-1.5";
    tagClass = "bg-slate-500/15 text-slate-400 border border-slate-500/10";
  } else if (act.type === "meal") {
    Icon = Utensils;
    customClass = "bg-amber-500/5 hover:bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5 my-1.5";
    tagClass = "bg-amber-500/15 text-amber-400 border border-amber-500/10";
  } else if (act.type === "swap") {
    Icon = ArrowLeftRight;
    customClass = "bg-indigo-500/5 hover:bg-indigo-500/8 border border-indigo-500/20 rounded-xl px-3 py-2.5 my-1.5";
    tagClass = "bg-indigo-500/15 text-indigo-400 border border-indigo-500/10";
  }

  return (
    <div className={`flex items-start gap-3 py-2.5 transition-all ${isPast ? "opacity-35" : ""} ${customClass ? customClass : "border-b border-[var(--border)] last:border-0"}`}>
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
          <span className={`text-sm font-medium truncate flex items-center gap-1.5 ${isCurrent ? "text-[var(--foreground)]" : "text-[var(--foreground)]/75"}`}>
            {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${act.type === 'break' ? 'text-slate-400' : act.type === 'meal' ? 'text-amber-400' : 'text-indigo-400'}`} />}
            {act.title}
          </span>
          {isCurrent && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">עכשיו</span>
          )}
          {tagClass && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${tagClass}`}>
              {act.type === 'break' ? 'הפסקה' : act.type === 'meal' ? 'ארוחה' : 'החלפה'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {gName && <span className="text-[10px] text-[var(--muted)]">{gName}</span>}
          {act.locationName && (
            <span className="text-[10px] text-[var(--muted)] flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5" />{act.locationName}
            </span>
          )}
          {isCurrent && act.staffNames.length > 0 && (
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
    isAdmin, isManager, role, roles, assignedGroups, primaryGroupId, setPrimaryGroupId,
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
  const [staffMembers,    setStaffMembers]    = useState<any[]>([]);
  const [staffAttendance, setStaffAttendance] = useState<Record<string, { status: string; reason?: string }>>({});
  const [isEditingDuty,   setIsEditingDuty]   = useState(false);
  const [isScheduleEditorOpen, setIsScheduleEditorOpen] = useState(false);
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
  const [activeShoppingCount, setActiveShoppingCount] = useState(0);

  const isStrictAdmin = isAdmin && !(roles || []).some(r => r === "social_worker" || r === "instructor" || r === "employee" || r === "logistics");
  const isStrictManager = isManager && !(roles || []).some(r => r === "social_worker" || r === "instructor" || r === "employee" || r === "logistics");
  const showAll = isStrictAdmin || isStrictManager;

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
            const standard3m = addMonths(start, 3);
            const standard6m = addMonths(start, 6);
            let effectiveEnd = p.extensionReceived ? standard6m : standard3m;

            if (p.endDate) {
              const dbEnd = parseISO(p.endDate);
              if (isValid(dbEnd)) {
                const dbEndStr = format(dbEnd, "yyyy-MM-dd");
                const std3mStr = format(standard3m, "yyyy-MM-dd");
                const std6mStr = format(standard6m, "yyyy-MM-dd");
                if (dbEndStr !== std3mStr && dbEndStr !== std6mStr) {
                  effectiveEnd = dbEnd;
                }
              }
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const diffDays = differenceInDays(effectiveEnd, today);

            if (p.extensionReceived) {
              if (diffDays <= 14) {
                expiring6m++;
              }
            } else {
              if (diffDays <= 14) {
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

      // 3. Absences
      const [myAbsSnap, allAbsSnap] = await Promise.all([
        getDocs(query(collection(db, "absence_requests"), where("userId", "==", user?.uid || ""), where("status", "==", "pending"))),
        isAdmin || isManager ? getDocs(query(collection(db, "absence_requests"), where("status", "==", "pending"))) : Promise.resolve({ size: 0, docs: [] } as any)
      ]);
      setUserAbsence(myAbsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      setPendingAbsences(allAbsSnap.size);

      // 4. Schedule and Staff Presence
      const [schedSnap, usersSnap, locsSnap, staffAttSnap] = await Promise.all([
        getDoc(doc(db, "schedules", today)),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "locations")),
        getDocs(query(collection(db, "staff_attendance"), where("date", "==", today))),
      ]);
      const userMap: Record<string, string> = {};
      const staffList: { id: string; name: string }[] = [];
      const fullStaffList: any[] = [];
      usersSnap.forEach(d => {
        const udata = d.data();
        const name = udata.name || udata.displayName || udata.email || "צוות";
        userMap[d.id] = name;
        const roles = udata.roles || (udata.role ? [udata.role] : []);
        const isStaff = !roles.includes("participant") && udata.role !== "participant";
        if (isStaff) {
          staffList.push({ id: d.id, name });
          fullStaffList.push({
            id: d.id,
            name,
            role: udata.role || (roles.length > 0 ? roles[0] : ""),
            roles,
            assignedProgramIds: udata.assignedProgramIds || [],
            workSchedule: udata.workSchedule || {},
          });
        }
      });
      setAllStaff(staffList);
      setStaffMembers(fullStaffList);

      const locMap: Record<string, string> = {};
      locsSnap.forEach(d => { locMap[d.id] = d.data().name; });

      // Process staff attendance
      const attRec: Record<string, { status: string; reason?: string }> = {};
      const absentStaffIds = new Set<string>();
      staffAttSnap.forEach(d => {
        const data = d.data();
        attRec[data.userId] = { status: data.status, reason: data.reason };
        if (data.status === 'absent' || data.status === 'leave') {
          absentStaffIds.add(data.userId);
        }
      });
      setStaffAttendance(attRec);

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
          type:         a.type || "activity",
        })).sort((a: ScheduleAct, b: ScheduleAct) => a.startTime.localeCompare(b.startTime));
        setActivities(acts);

        if (isAdmin || isManager) {
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

      // 6. Shopping Count (for admins and managers)
      if (isAdmin || isManager) {
        try {
          const shoppingSnap = await getDocs(query(
            collection(db, "shopping_requests"),
            where("status", "in", ["approved", "pending"])
          ));
          setActiveShoppingCount(shoppingSnap.size);
        } catch (err) {
          console.error("Error fetching shopping count:", err);
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
  const visibleActs   = activities.filter(a => {
    const isPast = (a.endTime ?? a.startTime) < now;
    if (isPast) return false;
    return isGroupVisible(a.groupId) || a.groupId === "all";
  });
  const nextAct       = visibleActs.find(a => a.startTime > now);
  const currentAct    = visibleActs.find(a => a.startTime <= now && (!a.endTime || a.endTime > now));
  const primaryGroup  = groups.find(g => g.id === primaryGroupId);
  const overallPct    = totalActive > 0 ? Math.round((totalPresent / totalActive) * 100) : 0;

  const dayOfWeekStr = String(new Date().getDay());

  const ROLE_HE: Record<string, string> = {
    admin: "מנהל מערכת",
    manager: "מנהל/ת חוסן",
    social_worker: "עו״ס",
    instructor: "מדריך/ה",
    logistics: "לוגיסטיקה",
    employee: "עובד/ת"
  };

  // Group staff members by program
  const staffByProgram = programs.map(prog => {
    const members = staffMembers.filter(s => s.assignedProgramIds?.includes(prog.id));
    return {
      program: prog,
      members: members.map(m => {
        const att = staffAttendance[m.id];
        const daySched = m.workSchedule?.[dayOfWeekStr];
        const hasSched = !!daySched;
        let schedTime = "";
        let isScheduledForProg = hasSched;

        if (hasSched) {
          const hasSpecificProgs = daySched.programs && Object.keys(daySched.programs).length > 0;
          if (hasSpecificProgs) {
            const progSched = daySched.programs[prog.id];
            if (progSched) {
              schedTime = `${progSched.start} - ${progSched.end}`;
            } else {
              isScheduledForProg = false;
            }
          } else {
            schedTime = `${daySched.start} - ${daySched.end}`;
          }
        }

        return {
          ...m,
          status: att?.status || (isScheduledForProg ? "scheduled" : "offline"),
          reason: att?.reason || "",
          time: schedTime,
        };
      }).filter(m => m.status !== "offline"),
    };
  }).filter(p => p.members.length > 0);

  // General staff members (with no program assigned)
  const unassignedStaffMembers = staffMembers.filter(s => !s.assignedProgramIds || s.assignedProgramIds.length === 0);
  const generalStaff = {
    program: { id: "general", name: "צוות כללי / מטה" },
    members: unassignedStaffMembers.map(m => {
      const att = staffAttendance[m.id];
      const hasSched = !!m.workSchedule?.[dayOfWeekStr];
      const schedTime = hasSched ? `${m.workSchedule[dayOfWeekStr].start} - ${m.workSchedule[dayOfWeekStr].end}` : "";
      return {
        ...m,
        status: att?.status || (hasSched ? "scheduled" : "offline"),
        reason: att?.reason || "",
        time: schedTime,
      };
    }).filter(m => m.status !== "offline")
  };


  if (loading || !user || !isWhitelisted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
        <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const firstName  = user.displayName?.split(" ")[0] ?? "שלום";
  const todayLabel = format(new Date(), "EEEE, d בMMMM", { locale: he });

  const quickActions = isStrictAdmin
    ? [
        { href: "/admin/staff-attendance", icon: ClipboardList, label: "אישורי היעדרות", color: "text-amber-500 bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/10 hover:border-amber-500/20" },
        { href: "/shopping",               icon: ShoppingCart,  label: "קניות",          color: "text-indigo-500 bg-indigo-500/5 hover:bg-indigo-500/10 border-indigo-500/10 hover:border-indigo-500/20" },
        { href: "/admin",                  icon: Shield,        label: "ממשק ניהול ובקרה", color: "text-slate-300 bg-[var(--foreground)]/5 border-[var(--border)] hover:bg-[var(--foreground)]/8" },
      ]
    : [
        { href: "/attendance", icon: ClipboardList, label: "נוכחות", color: "text-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/10 hover:border-emerald-500/20" },
        { href: "/patients",   icon: Users,         label: "משתתפים ותיקים", color: "text-blue-500 bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/10 hover:border-blue-500/20" },
        ...((isAdmin || isManager) ? [{ href: "/admin", icon: Shield, label: "ממשק ניהול ובקרה", color: "text-slate-300 bg-[var(--foreground)]/5 border-[var(--border)] hover:bg-[var(--foreground)]/8" }] : []),
      ];

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

      {/* ── Stunning Metrics Dashboard ── */}
      {dataLoaded && (
        <div className="px-4 md:px-6 mt-6 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* Card 1: Active Patients */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.4, delay: 0.05 }}
              className="relative p-5 bg-[var(--card-bg,var(--surface))] border border-[var(--border)] rounded-3xl overflow-hidden hover:border-blue-500/40 transition-all duration-300 group shadow-lg"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">משתתפים פעילים</p>
                  <h3 className="text-3xl font-black text-[var(--foreground)] tracking-tight">{totalActive}</h3>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <p className="text-[9px] text-[var(--muted)] font-bold mt-4 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                שיוך קבוצתי ותוכניות שיקום פעילות
              </p>
            </motion.div>

            {/* Card 2: Attendance Today */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.4, delay: 0.1 }}
              className="relative p-5 bg-[var(--card-bg,var(--surface))] border border-[var(--border)] rounded-3xl overflow-hidden hover:border-emerald-500/40 transition-all duration-300 group shadow-lg"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">נוכחות היום</p>
                  <h3 className="text-3xl font-black text-[var(--foreground)] tracking-tight">
                    {totalPresent} <span className="text-xs text-[var(--muted)] font-bold">מתוך {totalActive}</span>
                  </h3>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CheckCircle className="w-5 h-5" />
                </div>
              </div>
              
              <div className="mt-4 space-y-1">
                <div className="flex justify-between items-center text-[9px] font-bold text-[var(--muted)]">
                  <span>אחוז התייצבות</span>
                  <span>{overallPct}%</span>
                </div>
                <div className="h-1 bg-[var(--border)] rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${overallPct}%` }} />
                </div>
              </div>
            </motion.div>

            {/* Card 3: Missing Attendance */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.4, delay: 0.15 }}
              className="relative p-5 bg-[var(--card-bg,var(--surface))] border border-[var(--border)] rounded-3xl overflow-hidden hover:border-amber-500/40 transition-all duration-300 group shadow-lg"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">ממתינים לרישום</p>
                  <h3 className={`text-3xl font-black tracking-tight ${totalMissing > 0 ? "text-amber-500" : "text-[var(--muted)]"}`}>
                    {totalMissing}
                  </h3>
                </div>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                  totalMissing > 0 
                    ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 animate-pulse" 
                    : "bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--muted)]"
                }`}>
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <p className="text-[9px] font-bold mt-4 flex items-center gap-1">
                {totalMissing > 0 ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                    <span className="text-amber-500">טרם הוזנה נוכחות לכולם היום</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span className="text-[var(--muted)]">הוזנה נוכחות מלאה היום</span>
                  </>
                )}
              </p>
            </motion.div>

          </div>
        </div>
      )}

      {/* ── AI Insights Feed ── */}
      {dataLoaded && (expiring3mCount > 0 || expiring6mCount > 0) && (
        <div className="px-4 md:px-6 mt-6 max-w-6xl mx-auto">
          <div className="p-5 bg-[var(--card-bg,var(--surface))] border border-[var(--border)] rounded-3xl shadow-xl relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--foreground)]">תובנות והתראות תקופת טיפול</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {expiring3mCount > 0 && (
                <div className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-[var(--foreground)]">נדרשת הארכת תוכנית (3 חודשים)</h4>
                    <p className="text-[10px] text-[var(--muted)] mt-0.5 leading-relaxed font-bold">
                      {expiring3mCount} משתתפים מתקרבים לסיום תקופת הטיפול הראשונית של 3 חודשים. מומלץ להפיק עבורם דו"ח תקופתי לצורך הארכת שהות מול משרד הביטחון.
                    </p>
                  </div>
                </div>
              )}

              {expiring6mCount > 0 && (
                <div className="flex items-start gap-3 p-3 bg-rose-500/5 border border-rose-500/10 rounded-2xl">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-[var(--foreground)]">סיום תקופת זכאות (חצי שנה)</h4>
                    <p className="text-[10px] text-[var(--muted)] mt-0.5 leading-relaxed font-bold">
                      {expiring6mCount} משתתפים לקראת סיום חצי שנת פעילות (תקופת המקסימום). נדרש תהליך עיבוד פרידה או בקשת חריגים מיוחדת.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="px-4 md:px-6 py-5 pb-24">
        <div className="grid md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_320px] gap-6 max-w-6xl mx-auto">

          {/* ── Attendance by group — PRIMARY column ── */}
          <section className="md:order-1 space-y-6">
            {isStrictAdmin ? (
              <>
                {/* ── Absence Approvals Summary ── */}
                <div className="border border-[var(--border)] rounded-3xl overflow-hidden bg-[var(--card-bg,var(--surface))] shadow-xl">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <h2 className="text-sm font-black text-[var(--foreground)]">אישורי היעדרות ממתינים (צוות)</h2>
                    </div>
                    <Link href="/admin/staff-attendance"
                      className="text-[10px] font-black text-amber-500 hover:underline flex items-center gap-0.5">
                      לניהול היעדרויות <ChevronLeft className="w-3 h-3" />
                    </Link>
                  </div>
                  <div className="p-5">
                    {pendingAbsences === 0 ? (
                      <div className="text-center py-8 text-[var(--muted)] space-y-2">
                        <CheckCircle className="w-8 h-8 mx-auto stroke-1 text-emerald-500 opacity-60" />
                        <p className="text-xs font-black text-[var(--foreground)]">אין בקשות היעדרות ממתינות</p>
                        <p className="text-[10px] text-[var(--muted)] font-bold">כל בקשות ההיעדרות של הצוות טופלו בהצלחה</p>
                      </div>
                    ) : (
                      <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                            <AlertTriangle className="w-5 h-5 animate-pulse" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-[var(--foreground)]">{pendingAbsences} בקשות ממתינות לאישור</p>
                            <p className="text-[10px] text-[var(--muted)] font-bold">נדרשת סקירה ואישור של בקשות היעדרות עובדים</p>
                          </div>
                        </div>
                        <Link href="/admin/staff-attendance"
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 !text-white text-xs font-black rounded-xl shadow-md transition-all">
                          בדוק כעת
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Active Shopping Summary ── */}
                <div className="border border-[var(--border)] rounded-3xl overflow-hidden bg-[var(--card-bg,var(--surface))] shadow-xl">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-indigo-500" />
                      <h2 className="text-sm font-black text-[var(--foreground)]">רשימת קניות פעילה</h2>
                    </div>
                    <Link href="/shopping"
                      className="text-[10px] font-black text-indigo-500 hover:underline flex items-center gap-0.5">
                      לרשימת הקניות <ChevronLeft className="w-3 h-3" />
                    </Link>
                  </div>
                  <div className="p-5">
                    {activeShoppingCount === 0 ? (
                      <div className="text-center py-8 text-[var(--muted)] space-y-2">
                        <CheckCircle className="w-8 h-8 mx-auto stroke-1 text-emerald-500 opacity-60" />
                        <p className="text-xs font-black text-[var(--foreground)]">אין פריטים לקנייה</p>
                        <p className="text-[10px] text-[var(--muted)] font-bold">רשימת הקניות ריקה או שכל הפריטים כבר נקנו</p>
                      </div>
                    ) : (
                      <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0">
                            <ShoppingCart className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-[var(--foreground)]">{activeShoppingCount} מוצרים ברשימת הקניות</p>
                            <p className="text-[10px] text-[var(--muted)] font-bold">ישנם מוצרים הממתינים לרכישה בסופרמרקט או כציוד גדול</p>
                          </div>
                        </div>
                        <Link href="/shopping"
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 !text-white text-xs font-black rounded-xl shadow-md transition-all">
                          לרשימת הקניות
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* ── Attendance by group — PRIMARY column ── */}
                <div className="border border-[var(--border)] rounded-3xl overflow-hidden bg-[var(--card-bg,var(--surface))] shadow-xl">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <h2 className="text-sm font-black text-[var(--foreground)]">נוכחות היום לפי תוכניות</h2>
                    </div>
                    <Link href="/attendance"
                      className="text-[10px] font-black text-[var(--primary)] hover:underline flex items-center gap-0.5">
                      סמן נוכחות <ChevronLeft className="w-3 h-3" />
                    </Link>
                  </div>

                  <div className="p-5">
                    {!dataLoaded ? (
                      <div className="py-10 flex justify-center">
                        <div className="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--primary)] rounded-full animate-spin" />
                      </div>
                    ) : visibleStats.length === 0 ? (
                      <p className="text-xs text-[var(--muted)] text-center py-8">
                        {showAll || primaryGroupId ? "טוען נתונים..." : "בחר קבוצה להצגה"}
                      </p>
                    ) : (
                      <div className="space-y-3.5">
                        {visibleStats.map(g => {
                          const pct = g.total > 0 ? Math.round((g.present / g.total) * 100) : 0;
                          return (
                            <div key={g.id} className="p-4 bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl hover:bg-[var(--foreground)]/2 transition-all duration-200">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-black truncate text-[var(--foreground)]">
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
                                <span className={`text-[11px] font-bold ${pct === 100 ? "text-emerald-500" : "text-[var(--muted)]"}`}>
                                  {g.present} מתוך {g.total} נוכחים
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

                {/* ── Daily Schedule timeline ── */}
                {dataLoaded && (
                  <div className="border border-[var(--border)] rounded-3xl overflow-hidden bg-[var(--card-bg,var(--surface))] shadow-xl">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-violet-500" />
                        <h2 className="text-sm font-black text-[var(--foreground)]">סדר יום ופעילויות</h2>
                      </div>
                      <div className="flex items-center gap-2">
                        {(isAdmin || isManager) && (
                          <button
                            onClick={() => setIsScheduleEditorOpen(true)}
                            className="text-[10px] font-black text-violet-500 hover:underline px-2.5 py-1 rounded-xl bg-violet-500/5 hover:bg-violet-500/10 border border-violet-500/10 transition-all cursor-pointer"
                          >
                            ערוך לו״ז
                          </button>
                        )}
                        <span className="text-[10px] bg-slate-500/10 text-[var(--muted)] px-2.5 py-1 rounded-full font-bold">
                          {visibleActs.length} פעילויות מתוכננות
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-5">
                      {visibleActs.length === 0 ? (
                        <div className="text-center py-8 text-[var(--muted)] space-y-2">
                          <Coffee className="w-8 h-8 mx-auto stroke-1 text-[var(--muted)] opacity-60" />
                          <p className="text-xs font-black text-[var(--foreground)]">אין פעילויות מתוזמנות להיום</p>
                          <p className="text-[10px] text-[var(--muted)] font-bold">יומן הפעילויות ריק או שלא נבחרו קבוצות מתאימות</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {visibleActs.map((act) => (
                            <TimelineRow
                              key={act.id}
                              act={act}
                              groups={groups}
                              programs={programs}
                              now={now}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Sidebar — Duty Counselor, Staff Presence, Quick actions ── */}
          <aside className="space-y-4 md:order-2">
            {!isStrictAdmin && (
              <>
                {/* ── Duty Counselor ── */}
                <div className="border border-[var(--border)] rounded-3xl overflow-hidden bg-[var(--card-bg,var(--surface))] p-5 space-y-3.5 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/40">מדריך תורן היום</h3>
                    {(isAdmin || isManager) && (
                      <button 
                        onClick={() => setIsEditingDuty(!isEditingDuty)}
                        className="text-[10px] font-black text-violet-500 hover:underline"
                      >
                        {isEditingDuty ? "ביטול" : "עריכה"}
                      </button>
                    )}
                  </div>

                  {isEditingDuty ? (
                    <div className="space-y-2">
                      <select
                        value={dutyId}
                        onChange={(e) => updateDuty(e.target.value)}
                        className="w-full bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                      >
                        <option value="">-- בחר מדריך תורן --</option>
                        {staffMembers.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center border border-violet-500/20 shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm truncate">{dutyName || "אין מדריך תורן מוגדר"}</p>
                        <p className="text-[9px] text-[var(--muted)] font-bold mt-0.5">מדריך תורן אחראי לניהול השוטף בחווה</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Staff Presence ── */}
                <div className="border border-[var(--border)] rounded-3xl overflow-hidden bg-[var(--card-bg,var(--surface))] p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/40">צוות היום לפי מסגרת</h3>
                    <span className="text-[9px] bg-violet-500/10 text-violet-500 px-2 py-0.5 rounded-full font-bold">
                      {staffMembers.filter(m => staffAttendance[m.id]?.status === "present").length} נוכחים
                    </span>
                  </div>

                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1 no-scrollbar text-right">
                    {/* Programs with staff */}
                    {staffByProgram.map(p => (
                      <div key={p.program.id} className="space-y-2">
                        <h4 className="text-xs font-black text-violet-500 border-b border-[var(--border)]/60 pb-1">{p.program.name}</h4>
                        <div className="space-y-2">
                          {p.members.map(m => (
                            <div key={m.id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${
                                  m.status === "present" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                                  m.status === "absent" ? "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                                  m.status === "leave" ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" :
                                  "bg-slate-400"
                                }`} />
                                <span className="font-bold">{m.name}</span>
                                <span className="text-[9px] text-[var(--muted)]">({ROLE_HE[m.role] || m.role})</span>
                              </div>
                              <span className="text-[9px] text-[var(--muted)] font-medium">
                                {m.status === "present" ? "נוכח" :
                                 m.status === "absent" ? "נעדר" :
                                 m.status === "leave" ? `חופשה ${m.reason ? `(${m.reason})` : ""}` :
                                 m.status === "scheduled" ? `מתוכנן: ${m.time}` : "לא רשום"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* General staff */}
                    {generalStaff.members.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-black text-violet-500 border-b border-[var(--border)]/60 pb-1">{generalStaff.program.name}</h4>
                        <div className="space-y-2">
                          {generalStaff.members.map(m => (
                            <div key={m.id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${
                                  m.status === "present" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                                  m.status === "absent" ? "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                                  m.status === "leave" ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" :
                                  "bg-slate-400"
                                }`} />
                                <span className="font-bold">{m.name}</span>
                                <span className="text-[9px] text-[var(--muted)]">({ROLE_HE[m.role] || m.role})</span>
                              </div>
                              <span className="text-[9px] text-[var(--muted)] font-medium">
                                {m.status === "present" ? "נוכח" :
                                 m.status === "absent" ? "נעדר" :
                                 m.status === "leave" ? `חופשה ${m.reason ? `(${m.reason})` : ""}` :
                                 m.status === "scheduled" ? `מתוכנן: ${m.time}` : "לא רשום"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {staffByProgram.length === 0 && generalStaff.members.length === 0 && (
                      <p className="text-[10px] text-[var(--muted)] text-center py-4 italic font-bold">אין אנשי צוות פעילים היום</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── Quick Actions ── */}
            <div className="border border-[var(--border)] rounded-3xl overflow-hidden bg-[var(--card-bg,var(--surface))] p-5 space-y-4 shadow-xl">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground)]/40">פעולות מהירות</h3>
              <nav className="grid grid-cols-1 gap-2.5" aria-label="פעולות מהירות">
                {quickActions.map(({ href, icon: Icon, label, color }) => (
                  <Link key={href} href={href}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-xs font-black transition-all transform hover:scale-[1.01] hover:shadow-md active:scale-[0.99] ${color}`}>
                    <Icon className="w-4.5 h-4.5 shrink-0" />
                    <span>{label}</span>
                    {href === "/attendance" && totalMissing > 0 && (
                      <span className="mr-auto text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">{totalMissing}</span>
                    )}
                    {href === "/admin/staff-attendance" && pendingAbsences > 0 && (
                      <span className="mr-auto text-[10px] font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">{pendingAbsences}</span>
                    )}
                    {href === "/shopping" && activeShoppingCount > 0 && (
                      <span className="mr-auto text-[10px] font-black text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/20">{activeShoppingCount}</span>
                    )}
                  </Link>
                ))}
              </nav>
            </div>
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

      <ScheduleEditorModal
        isOpen={isScheduleEditorOpen}
        onClose={() => setIsScheduleEditorOpen(false)}
        onSaved={fetchAll}
        initialDate={format(new Date(), "yyyy-MM-dd")}
      />
    </div>
  );
}
