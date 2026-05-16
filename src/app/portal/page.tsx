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
  Moon, Sun, FileText, Shield, Download, Globe
} from "lucide-react";
import { format, parseISO, addMonths, differenceInDays, isBefore } from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { FloatingChat } from "@/components/chat/FloatingChat";
import { useSettings } from "@/context/SettingsContext";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useRef } from "react";

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

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'news' | 'event' | 'alert';
  createdAt: any;
}

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
  const [showRenewalPrompt, setShowRenewalPrompt] = useState(false);
  const [renewalBusy, setRenewalBusy] = useState(false);

  const [idNumber, setIdNumber] = useState("");
  const [error,     setError]     = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [activeTab, setActiveTab] = useState<"schedule" | "attendance" | "documents">("schedule");
  const [docRequests, setDocRequests] = useState<any[]>([]);
  const [myDocs, setMyDocs] = useState<any[]>([]);
  const [docBusy, setDocBusy] = useState(false);
  const [patientData, setPatientData] = useState<any>(null);
  const [swData, setSwData] = useState<any>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const [selectedReportMonth, setSelectedReportMonth] = useState(format(new Date(), "yyyy-MM"));

  const today      = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const todayLabel = useMemo(() => format(new Date(), "EEEE, d בMMMM", { locale: he }), []);

  const myGroupId   = assignedGroups[0] ?? null;
  const myProgramId = preferredProgramIds[0] ?? null;

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "announcements"), where("active", "==", true), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));
    });
  }, [user]);

  // Redirect non-participants away (staff go to /)
  useEffect(() => {
    if (isWhitelisted && role && role !== "participant") router.replace("/");
    if (!user) router.replace("/portal/join");
  }, [user, role, isWhitelisted, router]);

  useEffect(() => {
    if (user && onboardingComplete) {
      loadScheduleAndRefs();
      
      // ── Real-time Sync ──
      const initRealtime = async () => {
        try {
          const uSnap = await getDoc(doc(db, "users", user.uid));
          if (!uSnap.exists() || !uSnap.data().patientId) return;
          const patientId = uSnap.data().patientId;
          
          const unsubPatient = onSnapshot(doc(db, "patients", patientId), (snap) => {
            if (snap.exists()) {
              const pData = snap.data();
              setPatientData({ id: snap.id, ...pData });
              
              if (pData.startDate) {
                const start = parseISO(pData.startDate);
                const end = pData.endDate ? parseISO(pData.endDate) : addMonths(start, 3);
                const daysLeft = differenceInDays(end, new Date());
                setShowRenewalPrompt(daysLeft >= 0 && daysLeft <= 14);
              }
              
              if (pData.assignedWorkerId) {
                getDoc(doc(db, "users", pData.assignedWorkerId)).then(swSnap => {
                  if (swSnap.exists()) setSwData({ id: swSnap.id, ...swSnap.data() });
                });
              }
            }
          });

          const unsubAtt = onSnapshot(
            query(collection(db, "attendance"), where("patientId", "==", patientId), orderBy("date", "desc")),
            (snap) => {
              const dailyStatus: Record<string, string> = {};
              snap.docs.forEach(d => {
                const data = d.data();
                if (!dailyStatus[data.date] || data.status === 'present') {
                  dailyStatus[data.date] = data.status;
                }
              });
              setAttendanceHistory(Object.entries(dailyStatus).map(([date, status]) => ({ date, status })).sort((a, b) => b.date.localeCompare(a.date)));
            }
          );

          const unsubRequests = onSnapshot(
            query(collection(db, "document_requests"), where("patientId", "==", patientId), orderBy("createdAt", "desc")),
            (snap) => {
              setDocRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
          );

          const unsubDocs = onSnapshot(
            query(collection(db, "documents"), where("patientId", "==", patientId), orderBy("createdAt", "desc")),
            (snap) => {
              setMyDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
          );

          return () => {
            unsubPatient();
            unsubAtt();
            unsubRequests();
            unsubDocs();
          };
        } catch (err) {
          console.error("Error loading patient data:", err);
        }
      };
      
      const cleanup = initRealtime();
      return () => { cleanup.then(fn => fn && fn()); };
    }
  }, [user, onboardingComplete]);


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

  /* Request participation extension */
  async function requestExtension() {
    if (!user || !patientData || !swData || renewalBusy) return;
    setRenewalBusy(true);
    try {
      const msg = `שלום, אני מעוניין/ת להאריך את ההשתתפות שלי ב-3 חודשים נוספים.`;
      await setDoc(doc(collection(db, "messages")), {
        participants: [user.uid, swData.id],
        senderId: user.uid,
        text: msg,
        timestamp: serverTimestamp(),
        isRequest: true,
      });
      
      // Also update patient record to show they requested
      await updateDoc(doc(db, "patients", patientData.id), {
        extensionRequested: true,
        extensionRequestedAt: serverTimestamp(),
      });

      setShowRenewalPrompt(false);
      alert("בקשתך נשלחה לעו״ס. ניצור איתך קשר בקרוב!");
    } catch (e) { console.error(e); }
    finally { setRenewalBusy(false); }
  }

  /* Request a document */
  async function requestDoc(type: "stay" | "attendance") {
    if (!user || !patientData || docBusy) return;
    const month = type === "attendance" ? format(new Date(), "yyyy-MM") : null;
    
    // Check if already pending
    const existing = docRequests.find(r => r.type === type && r.status === "pending" && (type !== "attendance" || r.month === month));
    if (existing) {
      alert("כבר קיימת בקשה פתוחה לסוג מסמך זה.");
      return;
    }

    setDocBusy(true);
    try {
      const reqData = {
        patientId: patientData.id,
        patientName: `${patientData.firstName} ${patientData.lastName}`,
        assignedWorkerId: patientData.assignedWorkerId || null,
        type,
        month,
        status: "pending",
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(collection(db, "document_requests")), reqData);

      // Push push + Firestore notification to SW
      if (swData) {
        const docTypeLabel = type === 'stay' ? 'אישור שהייה' : 'דו"ח נוכחות חודשי';
        const senderName = user.displayName || 'משתתף';

        await setDoc(doc(collection(db, "notifications")), {
          title: 'בקשת מסמך חדשה',
          body: `${senderName} ביקש ${docTypeLabel}`,
          recipientIds: [swData.id],
          senderId: user.uid,
          createdAt: serverTimestamp(),
          readBy: [],
          type: 'chat',
          link: '/admin/notifications',
        });

        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'בקשת מסמך חדשה',
            body: `${senderName} ביקש ${docTypeLabel}`,
            userId: swData.id,
            link: '/admin/notifications',
          }),
        }).catch(console.error);
      }

      alert("בקשתך התקבלה ותטופל בקרוב.");
    } catch (e) { console.error(e); }
    finally { setDocBusy(false); }
  }

  /* Self-generate a document */
  async function selfGenerateReport(type: 'stay' | 'attendance', month?: string) {
    if (!patientData || !reportRef.current) return;
    setReportLoading(true);
    try {
      await new Promise(r => setTimeout(r, 100));
      const canvas = await html2canvas(reportRef.current, {
        scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff"
      });
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
      
      const monthLabel = month ? format(parseISO(month + "-01"), "MM-yyyy") : "";
      const fileName = `${type === 'stay' ? 'אישור_השתתפות' : 'דו"ח_נוכחות'}${monthLabel ? '_' + monthLabel : ''}_${patientData.firstName}_${patientData.lastName}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error(err);
      alert("שגיאה בהפקת המסמך");
    } finally {
      setReportLoading(false);
    }
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
            {/* News Ticker */}
            {announcements.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-1 overflow-hidden shadow-sm flex items-center h-11">
                  <div className="bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0 z-10 shadow-lg shadow-emerald-500/20 mr-1">
                    <Globe className="w-3 h-3" />
                    עדכונים
                  </div>
                  <div className="flex-1 overflow-hidden relative h-full flex items-center">
                    <div className="flex items-center gap-12 px-8 animate-scroll whitespace-nowrap">
                      {announcements.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 shrink-0">
                          <span className={`w-1.5 h-1.5 rounded-full ${a.type === 'alert' ? 'bg-rose-500 animate-pulse' : a.type === 'event' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                          <span className="text-[11px] font-black text-[var(--foreground)]">{a.title}:</span>
                          <span className="text-[11px] font-medium text-[var(--muted)]">{a.content}</span>
                        </div>
                      ))}
                      {/* Duplicate for infinite effect */}
                      {announcements.map((a) => (
                        <div key={`${a.id}-clone`} className="flex items-center gap-2 shrink-0">
                          <span className={`w-1.5 h-1.5 rounded-full ${a.type === 'alert' ? 'bg-rose-500 animate-pulse' : a.type === 'event' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                          <span className="text-[11px] font-black text-[var(--foreground)]">{a.title}:</span>
                          <span className="text-[11px] font-medium text-[var(--muted)]">{a.content}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Renewal Prompt */}
            {showRenewalPrompt && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 relative overflow-hidden"
              >
                <div className="relative z-10">
                  <div className="flex items-center gap-2 text-amber-500 mb-2">
                    <Clock className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-wider">תקופת ההשתתפות מסתיימת בקרוב</span>
                  </div>
                  <h3 className="text-lg font-black mb-2">היי {user?.displayName?.split(" ")[0]}, תרצה/י להמשיך איתנו?</h3>
                  <p className="text-sm text-[var(--muted)] mb-4 leading-relaxed">
                    תקופת 3 החודשים הראשונה שלך מסתיימת בקרוב. האם תרצה/י להאריך את ההשתתפות בעוד 3 חודשים?
                  </p>
                  <div className="flex gap-2">
                    <button 
                      onClick={requestExtension}
                      disabled={renewalBusy}
                      className="flex-1 bg-amber-500 text-white text-xs font-black py-2.5 rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {renewalBusy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "כן, אשמח להאריך!"}
                    </button>
                    <button 
                      onClick={() => setShowRenewalPrompt(false)}
                      className="px-4 text-xs font-bold text-[var(--muted)]"
                    >
                      לא עכשיו
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Welcome Greeting */}
            <div className="mb-8 relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-transparent border border-teal-500/20 p-8">
              <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-400 mb-3 opacity-80">שלום וברוך הבא לבית שלך</p>
                <h2 className="text-3xl font-black text-[var(--foreground)] leading-tight mb-2">
                  שלום, {user?.displayName?.split(" ")[0] || "חבר/ה"} ✨
                </h2>
                <p className="text-sm text-[var(--muted)] max-w-[240px] leading-relaxed">
                  אנחנו שמחים לראות אותך כאן. מה נרצה לעשות היום?
                </p>
              </div>
              
              {/* Abstract decorative elements */}
              <div className="absolute -top-12 -left-12 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl" />
            </div>

            {/* Main Tabs */}
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
                onClick={() => setActiveTab("documents")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'documents' ? 'bg-[var(--foreground)] text-[var(--background)]' : 'text-[var(--muted)]'}`}
              >
                <FileText className="w-3.5 h-3.5" />
                מסמכים
              </button>
            </div>

            {activeTab === "documents" && (
              <div className="space-y-6">
                {/* Request section */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
                  <h3 className="text-sm font-black mb-4">הפקת מסמכים עצמאית</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-500 flex items-center justify-center">
                          <Shield className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black">אישור השתתפות</p>
                          <p className="text-[10px] text-[var(--muted)]">אישור רשמי על סטטוס פעיל</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => selfGenerateReport("stay")}
                        disabled={reportLoading}
                        className="p-2.5 rounded-xl bg-teal-500 text-white hover:bg-teal-600 transition-all active:scale-95 disabled:opacity-50"
                      >
                        {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl p-4 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
                            <BarChart3 className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-black">דו״ח נוכחות חודשי</p>
                            <p className="text-[10px] text-[var(--muted)]">פירוט נוכחות לפי חודש בחירה</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => selfGenerateReport("attendance", selectedReportMonth)}
                          disabled={reportLoading}
                          className="p-2.5 rounded-xl bg-sky-500 text-white hover:bg-sky-600 transition-all active:scale-95 disabled:opacity-50"
                        >
                          {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]/50">
                        <Calendar className="w-3.5 h-3.5 text-[var(--muted)]" />
                        <select 
                          value={selectedReportMonth}
                          onChange={(e) => setSelectedReportMonth(e.target.value)}
                          className="flex-1 bg-transparent text-[10px] font-bold focus:outline-none"
                        >
                          {(() => {
                            const months = [];
                            const start = patientData.startDate ? parseISO(patientData.startDate) : new Date();
                            const curr = new Date();
                            let iter = new Date(curr.getFullYear(), curr.getMonth(), 1);
                            while (iter >= new Date(start.getFullYear(), start.getMonth(), 1)) {
                              months.push(new Date(iter));
                              iter = addMonths(iter, -1);
                            }
                            return months.map((m, i) => (
                              <option key={i} value={format(m, "yyyy-MM")}>
                                {format(m, "MMMM yyyy", { locale: he })}
                              </option>
                            ));
                          })()}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-[var(--border)]">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-3">בקשות מיוחדות מהצוות</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => requestDoc("stay")}
                        disabled={docBusy}
                        className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[10px] font-black hover:bg-[var(--foreground)]/5 transition-all"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        בקש אישור חתום
                      </button>
                      <button 
                        onClick={() => requestDoc("attendance")}
                        disabled={docBusy}
                        className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[10px] font-black hover:bg-[var(--foreground)]/5 transition-all"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        דו״ח היסטורי
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status section */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-1">מסמכים ובקשות</p>
                  
                  {/* Pending Requests */}
                  {docRequests.filter(r => r.status === 'pending').map((req, i) => (
                    <div key={i} className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 opacity-70">
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-amber-400" />
                        <div>
                          <p className="text-sm font-bold">{req.type === 'stay' ? 'אישור שהייה' : 'דו״ח נוכחות'}</p>
                          <p className="text-[10px] text-[var(--muted)]">ממתין לטיפול עו״ס</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black bg-amber-500/10 text-amber-500 px-2 py-1 rounded">בטיפול</span>
                    </div>
                  ))}

                  {/* Ready Documents */}
                  {myDocs.map((doc, i) => (
                    <div key={i} className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-teal-400" />
                        <div>
                          <p className="text-sm font-bold">{doc.title}</p>
                          <p className="text-[10px] text-[var(--muted)]">{doc.createdAt ? format(doc.createdAt.toDate(), "dd/MM/yyyy") : ""}</p>
                        </div>
                      </div>
                      <button 
                        onClick={async () => {
                          const fileName = `${doc.title}.pdf`;
                          if (navigator.share) {
                            try {
                              const response = await fetch(doc.url);
                              const blob = await response.blob();
                              const file = new File([blob], fileName, { type: 'application/pdf' });
                              if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                await navigator.share({ files: [file], title: doc.title });
                                return;
                              }
                            } catch (err) { console.error("Share failed", err); }
                          }
                          window.open(doc.url, "_blank");
                        }}
                        className="p-2 rounded-lg bg-teal-500/10 text-teal-500 hover:bg-teal-500 hover:text-white transition-all"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {docRequests.length === 0 && myDocs.length === 0 && (
                    <div className="text-center py-12 opacity-20 italic text-sm">טרם ביקשת מסמכים</div>
                  )}
                </div>
              </div>
            )}

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

          </Fragment>
        )}
        
        {/* Floating Chat */}
        {user && swData && (
          <FloatingChat 
            senderId={user.uid}
            senderName={patientData ? `${patientData.firstName} ${patientData.lastName}` : (user.displayName || "משתתף")}
            recipientId={swData.id}
            recipientName={swData.name}
            patientId={patientData?.id}
          />
        )}
      </main>

      {/* ── PDF Template — inline styles only to avoid html2canvas lab() parse error ── */}
      {patientData && (
        <div style={{ position: "fixed", left: -9999, top: -9999 }}>
          <div ref={reportRef} style={{
            width: "794px", padding: "80px", backgroundColor: "#ffffff",
            color: "#000000", fontFamily: "Arial, sans-serif", lineHeight: 1.6, direction: "rtl"
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #059669", paddingBottom: "32px", marginBottom: "48px" }}>
              <div>
                <h1 style={{ fontSize: "32px", fontWeight: 900, color: "#059669", margin: "0 0 8px 0" }}>מרכז חוסן</h1>
                <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#64748b", margin: 0 }}>חוות רום</h2>
              </div>
              <div style={{ textAlign: "left", fontSize: "13px", color: "#94a3b8", fontFamily: "monospace" }}>
                <p style={{ margin: "0 0 4px 0" }}>{format(new Date(), "dd/MM/yyyy")}</p>
                <p style={{ margin: 0 }}>סימוכין: {patientData.id?.slice(-6).toUpperCase()}</p>
              </div>
            </div>

            {/* Title */}
            <div style={{ textAlign: "center", marginBottom: "64px" }}>
              <h3 style={{ fontSize: "26px", fontWeight: 900, margin: "0 0 16px 0" }}>
                {activeTab === 'documents' && selectedReportMonth !== format(new Date(), "yyyy-MM") 
                  ? `דו״ח נוכחות - ${format(parseISO(selectedReportMonth + "-01"), "MMMM yyyy", { locale: he })}`
                  : "אישור השתתפות בתוכנית"}
              </h3>
              <div style={{ width: "96px", height: "4px", backgroundColor: "#10b981", margin: "0 auto", borderRadius: "9999px" }} />
            </div>

            {/* Body */}
            <div style={{ fontSize: "17px" }}>
              <p style={{ marginBottom: "24px" }}>לכל המעוניין,</p>
              <p style={{ marginBottom: "24px", lineHeight: 2 }}>
                הרינו לאשר כי המטופל/ת <strong>{patientData.firstName} {patientData.lastName}</strong>, ת.ז <strong>{patientData.idNumber}</strong>, משתתף/ת באופן פעיל בתוכנית המרכז במסגרת קבוצת <strong>{groups.find(g => g.id === patientData.hosenType)?.name || "—"}</strong>.
              </p>
              <p style={{ marginBottom: "24px" }}>
                המטופל/ת החל/ה את פעילותו/ה בתוכנית בתאריך {patientData.startDate ? format(new Date(patientData.startDate), "dd/MM/yyyy") : "—"}.
              </p>

              {/* Stats box */}
              <div style={{ backgroundColor: "#f8fafc", padding: "32px", borderRadius: "24px", border: "1px solid #f1f5f9", margin: "48px 0" }}>
                <h4 style={{ fontWeight: 900, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8", marginBottom: "16px" }}>
                  {activeTab === 'documents' 
                    ? `סיכום נוכחות - ${format(parseISO(selectedReportMonth + "-01"), "MMMM yyyy", { locale: he })}`
                    : "סיכום נוכחות תקופתי"}
                </h4>
                <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: "28px", fontWeight: 900, color: "#059669", margin: "0 0 4px 0" }}>
                      {attendanceHistory.filter(h => {
                        if (activeTab !== 'documents') return h.status === 'present';
                        return h.status === 'present' && h.date.startsWith(selectedReportMonth);
                      }).length}
                    </p>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", margin: 0 }}>ימי נוכחות</p>
                  </div>
                  <div style={{ width: "1px", height: "48px", backgroundColor: "#e2e8f0" }} />
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: "28px", fontWeight: 900, color: "#e11d48", margin: "0 0 4px 0" }}>
                      {attendanceHistory.filter(h => {
                        if (activeTab !== 'documents') return h.status === 'absent';
                        return h.status === 'absent' && h.date.startsWith(selectedReportMonth);
                      }).length}
                    </p>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", margin: 0 }}>ימי היעדרות</p>
                  </div>
                </div>
              </div>

              <p style={{ marginTop: "48px", marginBottom: "8px" }}>בברכה,</p>
              <p style={{ fontWeight: 900, margin: "0 0 4px 0" }}>הנהלת מרכז חוסן</p>
              <p style={{ fontSize: "13px", color: "#64748b", fontStyle: "italic", margin: 0 }}>חוות רום - שיקום חקלאי וקהילתי</p>
            </div>

            {/* Footer */}
            <div style={{ marginTop: "96px", paddingTop: "24px", borderTop: "1px solid #f1f5f9", fontSize: "9px", color: "#94a3b8", textAlign: "center" }}>
              מסמך זה הופק באופן ממוחשב ואינו דורש חתימה | מרכז חוסן - חוות רום
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
