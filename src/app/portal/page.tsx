"use client";

import { useAuth } from "@/context/AuthContext";
import { useState, useEffect, useMemo, Fragment } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, doc, getDoc, updateDoc, setDoc,
  query, orderBy, arrayUnion, arrayRemove,
  where, limit, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import {
  Calendar, MapPin, Users, Check, X, Clock, Loader2,
  Plus, LogOut, User, MessageCircle, BarChart3, Send,
  Moon, Sun,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { useSettings } from "@/context/SettingsContext";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface Activity {
  id: string; title: string;
  startTime: string; endTime: string;
  locationId: string; staffIds: string[]; groupId: string;
}
interface Program  { id: string; name: string }
interface Group    { id: string; name: string; programId?: string }
interface Location { id: string; name: string }

/* overlap: two activities clash if one starts before the other ends */
function overlaps(a: Activity, b: Activity): boolean {
  return a.startTime < (b.endTime || "23:59") && b.startTime < (a.endTime || "23:59");
}

/* ─── Portal page ────────────────────────────────────────────────────────── */

export default function ParticipantPortal() {
  const {
    user, logout, role, isWhitelisted,
    assignedGroups, preferredProgramIds, onboardingComplete,
  } = useAuth();
  const { theme, setTheme } = useSettings();
  const router = useRouter();

  const [programs,   setPrograms]   = useState<Program[]>([]);
  const [groups,     setGroups]     = useState<Group[]>([]);
  const [locations,  setLocations]  = useState<Location[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [signups,    setSignups]    = useState<Record<string, string[]>>({});
  const [loading,    setLoading]    = useState(true);
  const [busy,       setBusy]       = useState<string | null>(null);

  const [idNumber, setIdNumber] = useState("");
  const [error,     setError]     = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [activeTab, setActiveTab] = useState<"schedule" | "attendance" | "messages">("schedule");
  const [patientData, setPatientData] = useState<any>(null);
  const [swData, setSwData] = useState<any>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");

  const today      = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const todayLabel = useMemo(() => format(new Date(), "EEEE, d בMMMM", { locale: he }), []);

  const myGroupId   = assignedGroups[0] ?? null;
  const myProgramId = preferredProgramIds[0] ?? null;

  // Redirect non-participants away (staff go to /)
  useEffect(() => {
    if (isWhitelisted && role && role !== "participant") router.replace("/");
    if (!user) router.replace("/portal/join");
  }, [user, role, isWhitelisted, router]);

  useEffect(() => {
    if (user && onboardingComplete) {
      loadScheduleAndRefs();
      loadPatientAndAttendance();
    }
  }, [user, today, onboardingComplete]);

  async function loadPatientAndAttendance() {
    if (!user) return;
    try {
      const uSnap = await getDoc(doc(db, "users", user.uid));
      if (!uSnap.exists()) return;
      const uData = uSnap.data();
      if (!uData.patientId) return;

      const pSnap = await getDoc(doc(db, "patients", uData.patientId));
      if (pSnap.exists()) {
        const pData = pSnap.data();
        setPatientData({ id: pSnap.id, ...pData });

        if (pData.assignedWorkerId) {
          const swSnap = await getDoc(doc(db, "users", pData.assignedWorkerId));
          if (swSnap.exists()) setSwData({ id: swSnap.id, ...swSnap.data() });
        }
      }

      // Load attendance history
      const attSnap = await getDocs(query(
        collection(db, "attendance"),
        where("patientId", "==", uData.patientId),
        orderBy("date", "desc")
      ));
      
      // Deduplicate by date (keep only one status per day, priority to 'present')
      const dailyStatus: Record<string, string> = {};
      attSnap.docs.forEach(d => {
        const data = d.data();
        if (!dailyStatus[data.date] || data.status === 'present') {
          dailyStatus[data.date] = data.status;
        }
      });

      const history = Object.entries(dailyStatus)
        .map(([date, status]) => ({ date, status }))
        .sort((a, b) => b.date.localeCompare(a.date));

      setAttendanceHistory(history);
    } catch (e) { console.error(e); }
  }

  // Real-time messages
  useEffect(() => {
    if (!user || !onboardingComplete || activeTab !== "messages") return;

    const uId = user.uid;
    const q = query(
      collection(db, "messages"),
      where("participants", "array-contains" as any, uId),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => unsubscribe();
  }, [user, onboardingComplete, activeTab]);

  async function sendMessage() {
    if (!newMessage.trim() || !user || !swData) return;
    const content = newMessage.trim();
    setNewMessage("");
    try {
      await setDoc(doc(collection(db, "messages")), {
        participants: [user.uid, swData.id],
        senderId: user.uid,
        receiverId: swData.id,
        content,
        timestamp: serverTimestamp(),
        read: false,
      });
    } catch (e) { console.error(e); }
  }

  async function loadScheduleAndRefs() {
    setLoading(true);
    try {
      const [gSnap, pSnap, lSnap, schedSnap] = await Promise.all([
        getDocs(query(collection(db, "groups"),   orderBy("name"))),
        getDocs(query(collection(db, "programs"), orderBy("name"))),
        getDocs(collection(db, "locations")),
        getDoc(doc(db, "schedules", today)),
      ]);
      setGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() } as Group)));
      setPrograms(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Program)));
      setLocations(lSnap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));

      if (schedSnap.exists()) {
        const data = schedSnap.data();
        setActivities((data.activities || []) as Activity[]);
        setSignups((data.signups || {}) as Record<string, string[]>);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  /* Save onboarding via ID lookup */
  async function saveOnboarding() {
    if (!idNumber || !user) return;
    setSaving(true);
    setError(null);
    try {
      // Find patient by ID
      const pSnap = await getDocs(query(
        collection(db, "patients"),
        where("idNumber", "==", idNumber),
        limit(1)
      ));

      if (pSnap.empty) {
        setError("לא נמצא מטופל עם תעודת זהות זו. אנא וודא/י שהמספר תקין או פנה/י לצוות.");
        setSaving(false);
        return;
      }

      const pDoc  = pSnap.docs[0];
      const pData = pDoc.data();

      // Link user to patient
      await updateDoc(doc(db, "users", user.uid), {
        patientId:           pDoc.id,
        assignedGroups:      pData.hosenType ? [pData.hosenType] : [],
        preferredProgramIds: pData.programId ? [pData.programId] : [],
        onboardingComplete:  true,
      });

      window.location.reload();
    } catch (e) {
      console.error(e);
      setError("שגיאה בחיבור הנתונים. נסה/י שנית מאוחר יותר.");
    } finally {
      setSaving(false);
    }
  }

  /* Sign up for an activity */
  async function signUp(activityId: string) {
    if (!user) return;
    setBusy(activityId);
    try {
      await setDoc(doc(db, "schedules", today), {
        [`signups.${activityId}`]: arrayUnion(user.uid),
      }, { merge: true });
      setSignups(prev => ({
        ...prev,
        [activityId]: Array.from(new Set([...(prev[activityId] ?? []), user.uid])),
      }));
    } catch (e) { console.error(e); }
    finally { setBusy(null); }
  }

  /* Cancel a signup */
  async function cancelSignup(activityId: string) {
    if (!user) return;
    setBusy(activityId);
    try {
      await updateDoc(doc(db, "schedules", today), {
        [`signups.${activityId}`]: arrayRemove(user.uid),
      });
      setSignups(prev => ({
        ...prev,
        [activityId]: (prev[activityId] ?? []).filter(id => id !== user.uid),
      }));
    } catch (e) { console.error(e); }
    finally { setBusy(null); }
  }

  /* Derived */
  const locName = (id: string) => locations.find(l => l.id === id)?.name ?? "";

  const myActivities = useMemo(() => {
    if (!myGroupId && !myProgramId) return [];
    return activities
      .filter(a =>
        a.groupId === myGroupId ||
        (myProgramId && a.groupId === myProgramId) ||
        a.groupId === "all"
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [activities, myGroupId, myProgramId]);

  const mySignedIds = useMemo(() =>
    Object.entries(signups)
      .filter(([, uids]) => uids.includes(user?.uid ?? ""))
      .map(([id]) => id),
    [signups, user?.uid]
  );

  /* Return the conflicting activity, or null if slot is free */
  function conflictFor(activity: Activity): Activity | null {
    for (const sid of mySignedIds) {
      if (sid === activity.id) continue;
      const other = myActivities.find(a => a.id === sid);
      if (other && overlaps(activity, other)) return other;
    }
    return null;
  }

  const programName = programs.find(p => p.id === myProgramId)?.name;
  const groupName   = groups.find(g => g.id === myGroupId)?.name;

  /* ── Loading skeleton ── */
  if (loading && !onboardingComplete) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6">
        <div className="flex items-center gap-3 h-12">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Calendar className="w-4 h-4 text-teal-400 shrink-0" />
            <h1 className="text-sm font-semibold truncate">פורטל משתתפים</h1>
          </div>
          {(programName || groupName) && (
            <span className="text-[10px] text-[var(--muted)] shrink-0 hidden sm:inline truncate max-w-[160px]">
              {programName}{groupName ? ` · ${groupName}` : ""}
            </span>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <NotificationCenter />
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <span className="text-xs text-[var(--muted)] hidden md:inline">{user?.displayName?.split(" ")[0]}</span>
            <button onClick={logout}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 md:px-6 py-5 pb-28 max-w-xl mx-auto">

        {/* ══ ONBOARDING — ID verification ══ */}
        {!onboardingComplete && (
          <section className="space-y-6">
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-teal-400" />
              </div>
              <h2 className="text-xl font-black">ברוך/ה הבא/ה!</h2>
              <p className="text-sm text-[var(--muted)] mt-2 max-w-xs mx-auto">
                הזינו מספר תעודת זהות כדי להתחבר לתיק האישי שלכם
              </p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-2 block">מספר תעודת זהות</label>
                <input
                  type="text"
                  value={idNumber}
                  onChange={e => setIdNumber(e.target.value)}
                  placeholder="000000000"
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] focus:outline-none focus:border-teal-500/50 transition-colors"
                />
              </div>

              {error && (
                <p className="text-[10px] text-rose-400 font-bold px-1">{error}</p>
              )}

              <button
                onClick={saveOnboarding}
                disabled={!idNumber || saving}
                className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                אימות פרטים וכניסה
              </button>
            </div>
          </section>
        )}

        {/* ══ MAIN PORTAL VIEW ══ */}
        {onboardingComplete && (
          <Fragment>
            {/* Tabs Navigation */}
            <div className="flex bg-[var(--surface)] border border-[var(--border)] p-1 rounded-xl mb-6">
              <button
                onClick={() => setActiveTab("schedule")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'schedule' ? 'bg-[var(--foreground)] text-[var(--background)]' : 'text-[var(--muted)]'}`}
              >
                <Calendar className="w-3.5 h-3.5" />
                פעילויות
              </button>
              <button
                onClick={() => setActiveTab("attendance")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'attendance' ? 'bg-[var(--foreground)] text-[var(--background)]' : 'text-[var(--muted)]'}`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                נוכחות
              </button>
              <button
                onClick={() => setActiveTab("messages")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'messages' ? 'bg-[var(--foreground)] text-[var(--background)]' : 'text-[var(--muted)]'}`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                הודעות
              </button>
            </div>

            {activeTab === "schedule" && (
              <Fragment>
            {/* Date header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-semibold text-base">{todayLabel}</h2>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {groupName ?? programName ?? ""}
                  {mySignedIds.length > 0 && (
                    <span className="text-teal-400 font-medium"> · {mySignedIds.length} הרשמה פעילה</span>
                  )}
                </p>
              </div>
            </div>

            {/* My signups summary strip */}
            {mySignedIds.length > 0 && (
              <div className="mb-5 bg-teal-500/6 border border-teal-500/15 rounded-xl px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400 mb-2">הרשמות שלי היום</p>
                <div className="space-y-1">
                  {myActivities
                    .filter(a => mySignedIds.includes(a.id))
                    .map(a => (
                      <div key={a.id} className="flex items-center gap-2 text-sm">
                        <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        <span className="font-medium flex-1 truncate">{a.title}</span>
                        <span className="text-[var(--muted)] text-xs shrink-0">{a.startTime}–{a.endTime}</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* Activities list */}
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
              </div>
            ) : myActivities.length === 0 ? (
              <div className="text-center py-20 text-[var(--muted)]">
                <Calendar className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm">אין פעילויות מתוכננות להיום</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myActivities.map((activity, i) => {
                  const isSignedUp    = mySignedIds.includes(activity.id);
                  const conflict      = !isSignedUp ? conflictFor(activity) : null;
                  const count         = (signups[activity.id] ?? []).length;
                  const isBusy        = busy === activity.id;
                  const now           = format(new Date(), "HH:mm");
                  const isPast        = activity.endTime && activity.endTime < now;
                  const isCurrent     = activity.startTime <= now && (!activity.endTime || activity.endTime > now);

                  return (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={`border rounded-xl p-4 transition-all ${
                        isPast        ? "opacity-45 bg-[var(--surface)] border-[var(--border)]" :
                        isSignedUp    ? "bg-teal-500/5 border-teal-500/25" :
                        isCurrent     ? "bg-[var(--primary)]/4 border-[var(--primary)]/20" :
                        "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <div className="flex items-start gap-3">

                        {/* Time column */}
                        <div className="shrink-0 text-right w-12 pt-0.5">
                          <p className={`text-xs font-bold ${isCurrent ? "text-[var(--primary)]" : "text-[var(--foreground)]/70"}`}>
                            {activity.startTime}
                          </p>
                          <p className="text-[10px] text-[var(--muted)]">{activity.endTime}</p>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm leading-tight">{activity.title}</span>
                            {isCurrent && (
                              <span className="text-[9px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 px-1.5 py-0.5 rounded">עכשיו</span>
                            )}
                            {isSignedUp && (
                              <span className="text-[9px] font-bold text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded">רשום/ה</span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {activity.locationId && (
                              <span className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
                                <MapPin className="w-3 h-3" />{locName(activity.locationId)}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
                              <Users className="w-3 h-3" />{count} רשומים
                            </span>
                          </div>

                          {/* Conflict warning */}
                          {conflict && (
                            <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              חופף עם &ldquo;{conflict.title}&rdquo; ({conflict.startTime}–{conflict.endTime})
                            </p>
                          )}
                        </div>

                        {/* Signup button */}
                        {!isPast && (
                          <button
                            onClick={() => isSignedUp ? cancelSignup(activity.id) : signUp(activity.id)}
                            disabled={isBusy || (!!conflict && !isSignedUp)}
                            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all disabled:opacity-40 active:scale-95 ${
                              isSignedUp
                                ? "bg-rose-500/8 text-rose-400 border-rose-500/20 hover:bg-rose-500/15"
                                : conflict
                                ? "bg-[var(--background)] text-[var(--muted)] border-[var(--border)] cursor-not-allowed"
                                : "bg-teal-500/10 text-teal-400 border-teal-500/20 hover:bg-teal-500/18"
                            }`}
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isSignedUp ? (
                              <span className="flex items-center gap-1.5"><X className="w-3.5 h-3.5" />בטל</span>
                            ) : conflict ? (
                              "חופף"
                            ) : (
                              <span className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />הירשם</span>
                            )}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </Fragment>
        )}

            {activeTab === "attendance" && (
              <div className="space-y-6">
                <div className="bg-teal-500/5 border border-teal-500/15 rounded-2xl p-6 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-400 mb-2">סה״כ ימי נוכחות</p>
                  <h3 className="text-3xl font-black">{attendanceHistory.filter(h => h.status === 'present').length}</h3>
                  <p className="text-xs text-[var(--muted)] mt-1">ימי נוכחות מתחילת ההשתתפות</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)] px-1 mb-3">היסטוריה אחרונה</p>
                  {attendanceHistory.map((h, i) => (
                    <div key={i} className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
                      <span className="text-sm font-bold">{format(parseISO(h.date), "dd/MM/yyyy", { locale: he })}</span>
                      <span className={`text-[10px] font-black px-2 py-1 rounded ${h.status === 'present' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {h.status === 'present' ? 'נוכח' : 'נעדר'}
                      </span>
                    </div>
                  ))}
                  {attendanceHistory.length === 0 && (
                    <div className="text-center py-10 opacity-30 italic text-sm">לא נמצאו נתוני נוכחות</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "messages" && (
              <div className="flex flex-col h-[calc(100vh-280px)]">
                {swData && (
                  <div className="flex items-center gap-3 p-3 bg-teal-500/5 border border-teal-500/10 rounded-xl mb-4">
                    <div className="w-8 h-8 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-400 text-xs font-bold">
                      {swData.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-bold">שיחה עם {swData.name}</p>
                      <p className="text-[9px] text-[var(--muted)]">עו"ס מלווה</p>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-3 mb-4 no-scrollbar pr-1">
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                        m.senderId === user?.uid 
                          ? 'bg-teal-600 text-white rounded-br-none' 
                          : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] rounded-bl-none'
                      }`}>
                        {m.content}
                        <p className={`text-[8px] mt-1 opacity-50 ${m.senderId === user?.uid ? 'text-right' : 'text-left'}`}>
                          {m.timestamp?.toDate ? format(m.timestamp.toDate(), "HH:mm") : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && (
                    <div className="text-center py-20 opacity-20 italic text-xs">אין הודעות עדיין</div>
                  )}
                </div>

                <div className="flex gap-2 bg-[var(--surface)] border border-[var(--border)] p-2 rounded-2xl">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    placeholder="כתוב הודעה לעו״ס..."
                    className="flex-1 bg-transparent border-none outline-none text-sm px-2"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || !swData}
                    className="w-10 h-10 bg-teal-600 text-white rounded-xl flex items-center justify-center disabled:opacity-30 transition-all active:scale-90"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </Fragment>
        )}
      </main>
    </div>
  );
}
