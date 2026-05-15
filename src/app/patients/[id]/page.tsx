"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PatientForm } from "@/components/patients/PatientForm";
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase/config";
import {
  doc, getDoc, collection, query, where, orderBy, getDocs, limit, updateDoc, onSnapshot, serverTimestamp, setDoc,
} from "firebase/firestore";
import {
  Calendar, Loader2, Shield,
  Edit3, CheckCircle, CheckCircle2,
  AlertCircle, ChevronLeft, Printer, Download, FileText,
  X, Check, Info, History, Send, Bell, MessageCircle,
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format, subMonths, addMonths, differenceInDays, parseISO, isValid } from "date-fns";
import { he } from "date-fns/locale";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  hosenType?: string;
  status: string;
  assignedWorkerId?: string;
  startDate?: string;
  endDate?: string;
  phone?: string;
  email?: string;
  fullName?: string;
  rehabPlanCompleted?: boolean;
  extensionSent?: boolean;
  extensionSentAt?: string;
  extensionReceived?: boolean;
  extensionReceivedAt?: string;
}

interface Group { id: string; name: string }
interface Attendance { id: string; date: string; status: "present" | "absent" | "late" }

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin, isManager, user: authUser } = useAuth();
  const router = useRouter();
  const reportRef = useRef<HTMLDivElement>(null);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "attendance" | "reports" | "messages">("overview");
  const [messages, setMessages] = useState<any[]>([]);
  const [participantUid, setParticipantUid] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingExt, setSavingExt] = useState<string | null>(null);
  const [editingEndDate, setEditingEndDate] = useState(false);
  const [editEndDateVal, setEditEndDateVal] = useState("");
  const [socialWorkers, setSocialWorkers] = useState<{ id: string; name: string }[]>([]);
  const [docRequests, setDocRequests] = useState<any[]>([]);
  const [processedDocs, setProcessedDocs] = useState<any[]>([]);

  useEffect(() => { if (id) fetchPatientData(); }, [id]);

  const fetchPatientData = async () => {
    try {
      const patientDoc = await getDoc(doc(db, "patients", id));
      if (!patientDoc.exists()) { router.push("/patients"); return; }
      setPatient({ id: patientDoc.id, ...patientDoc.data() } as Patient);

      const [groupsSnap, progsSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, "groups")),
        getDocs(collection(db, "programs")),
        getDocs(collection(db, "users"))
      ]);
      setGroups(groupsSnap.docs.map(d => ({ id: d.id, name: d.data().name } as Group)));
      setPrograms(progsSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
      setSocialWorkers(usersSnap.docs.map(d => ({ id: d.id, name: d.data().displayName || d.data().name || d.data().email })));

      const attQuery = query(
        collection(db, "attendance"),
        where("patientId", "==", id),
        orderBy("date", "desc"),
        limit(50)
      );
      const attSnap = await getDocs(attQuery);
      const rawAtt = attSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance));
      
      // De-duplicate by date, keeping the first (latest due to orderBy("date", "desc"))
      const uniqueAtt: Attendance[] = [];
      const seenDates = new Set<string>();
      rawAtt.forEach(record => {
        if (!seenDates.has(record.date) && (record.status as string) !== "unset") {
          seenDates.add(record.date);
          uniqueAtt.push(record);
        }
      });
      
      setAttendance(uniqueAtt);
      const uSnap = await getDocs(query(collection(db, "users"), where("patientId", "==", id), limit(1)));
      if (!uSnap.empty) setParticipantUid(uSnap.docs[0].id);

    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  // Real-time messages
  useEffect(() => {
    if (!participantUid || activeTab !== "messages") return;

    const q = query(
      collection(db, "messages"),
      where("participants", "array-contains" as any, participantUid),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => unsubscribe();
  }, [participantUid, activeTab]);

  async function sendMessage() {
    if (!newMessage.trim() || !authUser || !participantUid) return;
    const content = newMessage.trim();
    setNewMessage("");
    try {
      await setDoc(doc(collection(db, "messages")), {
        participants: [authUser.uid, participantUid],
        senderId: authUser.uid,
        receiverId: participantUid,
        content,
        timestamp: serverTimestamp(),
        read: false,
      });

      // Create a notification for the participant
      await setDoc(doc(collection(db, "notifications")), {
        title: `הודעה חדשה מהצוות`,
        body: content.length > 50 ? content.substring(0, 50) + "..." : content,
        recipientIds: [participantUid],
        senderId: authUser.uid,
        createdAt: serverTimestamp(),
        readBy: [],
        link: `/portal`
      });
    } catch (e) { console.error(e); }
  }

  const handleProcessRequest = async (request: any) => {
    if (!patient) return;
    setReportLoading(true);
    try {
      const docTitle = request.type === 'stay' ? 'אישור שהייה' : `דו״ח נוכחות - ${request.month || format(new Date(), "MM/yyyy")}`;
      
      const docData = {
        patientId: patient.id,
        title: docTitle,
        type: request.type,
        url: "#", 
        createdAt: serverTimestamp(),
        processedBy: authUser?.uid
      };

      await setDoc(doc(collection(db, "documents")), docData);
      
      await updateDoc(doc(db, "document_requests", request.id), {
        status: "completed",
        processedAt: serverTimestamp()
      });

      await setDoc(doc(collection(db, "messages")), {
        participants: [authUser?.uid, participantUid].filter(Boolean),
        senderId: authUser?.uid,
        text: `המסמך שביקשת (${docTitle}) מוכן וממתין לך באיזור האישי.`,
        timestamp: serverTimestamp(),
      });

      alert("המסמך הופק ונשלח בהצלחה!");
      fetchPatientData();
    } catch (e) { console.error(e); }
    finally { setReportLoading(false); }
  };

  function effectiveEndDate(p: Patient): Date | null {
    if (p.endDate) { try { const d = parseISO(p.endDate); return isValid(d) ? d : null; } catch { return null; } }
    if (p.startDate) { try { const d = parseISO(p.startDate); return isValid(d) ? addMonths(d, 3) : null; } catch { return null; } }
    return null;
  }

  async function markExtensionSent() {
    if (!patient) return;
    setSavingExt("sent");
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, "patients", patient.id), { extensionSent: true, extensionSentAt: now });
      setPatient(p => p ? { ...p, extensionSent: true, extensionSentAt: now } : p);
    } catch (e) { console.error(e); }
    finally { setSavingExt(null); }
  }

  async function markExtensionReceived() {
    if (!patient) return;
    setSavingExt("recv");
    try {
      const end = effectiveEndDate(patient) ?? new Date();
      const newEnd = format(addMonths(end, 6), "yyyy-MM-dd");
      const now = new Date().toISOString();
      await updateDoc(doc(db, "patients", patient.id), {
        extensionReceived: true, extensionReceivedAt: now,
        extensionSent: true, endDate: newEnd,
      });
      setPatient(p => p ? { ...p, extensionReceived: true, extensionReceivedAt: now, extensionSent: true, endDate: newEnd } : p);
    } catch (e) { console.error(e); }
    finally { setSavingExt(null); }
  }

  async function saveEndDate() {
    if (!patient || !editEndDateVal) return;
    setSavingExt("date");
    try {
      await updateDoc(doc(db, "patients", patient.id), { endDate: editEndDateVal });
      setPatient(p => p ? { ...p, endDate: editEndDateVal } : p);
      setEditingEndDate(false);
    } catch (e) { console.error(e); }
    finally { setSavingExt(null); }
  }
  
  async function toggleRehabPlan() {
    if (!patient) return;
    const next = !patient.rehabPlanCompleted;
    try {
      await updateDoc(doc(db, "patients", patient.id), { rehabPlanCompleted: next });
      setPatient(p => p ? { ...p, rehabPlanCompleted: next } : p);
    } catch (e) { console.error(e); }
  }

  const generateReport = async (type: 'participation' | 'attendance') => {
    if (!patient || !reportRef.current) return;
    setReportLoading(true);
    
    try {
      await new Promise(r => setTimeout(r, 100));
      
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff"
      });
      
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
      pdf.save(`${type === 'participation' ? 'אישור_השתתפות' : 'דוח_נוכחות'}_${patient.firstName}_${patient.lastName}.pdf`);
    } catch (err) {
      console.error(err);
      alert("שגיאה בהפקת הדוח");
    } finally {
      setReportLoading(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--background)] gap-4">
      <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      <p className="text-sm font-black text-[var(--foreground)]/30 uppercase tracking-[0.2em]">טוען תיק מטופל...</p>
    </div>
  );

  if (!patient) return null;

  const patientName = patient.firstName && patient.lastName ? `${patient.firstName} ${patient.lastName}` : (patient.fullName || "מטופל ללא שם");
  
  const progName = programs.find(p => p.id === (patient as any).programId)?.name;
  const grpName = groups.find(g => g.id === patient.hosenType)?.name || patient.hosenType;
  const fullGroupName = (progName && grpName && progName !== grpName) ? `${progName} - ${grpName}` : (progName || grpName || "כללי");

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker"]} redirectTo="/login">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        
        <header className="sticky top-0 z-40 bg-[var(--background)]/70 backdrop-blur-2xl border-b border-[var(--border)]">
          <div className="max-w-7xl mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <button 
                onClick={() => router.push("/patients")} 
                className="w-11 h-11 rounded-2xl bg-[var(--foreground)]/5 border border-[var(--border)] flex items-center justify-center hover:bg-[var(--foreground)]/10 hover:scale-105 transition-all active:scale-95 group"
              >
                <ChevronLeft className="w-5 h-5 rotate-180 group-hover:-translate-x-0.5 transition-transform" />
              </button>
              <div className="flex flex-col">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-black tracking-tight leading-none text-slate-900">{patientName}</h1>
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                    patient.status === 'active' ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-500/10 text-slate-500"
                  }`}>
                    {patient.status === 'active' ? 'פעיל' : 'בטיפול'}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  <span className="text-emerald-600/80">{fullGroupName}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-200" />
                  <span>עו"ס: {socialWorkers.find(w => w.id === patient.assignedWorkerId)?.name || "טרם שובץ"}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-200" />
                  <span>ID: {patient.idNumber}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
               {(isAdmin || isManager) && (
                 <button 
                  onClick={() => setShowEditModal(true)}
                  className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl text-xs font-black transition-all active:scale-95 hover:bg-slate-800 shadow-xl shadow-slate-900/10"
                 >
                   <Edit3 className="w-4 h-4" />
                   <span>עריכת נתונים</span>
                 </button>
               )}
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto p-4 md:p-8">
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
             {[
               { label: "נוכחות החודש", value: `${attendance.filter(a => a.status === 'present').length}`, icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-50" },
               { label: "ימי היעדרות", value: `${attendance.filter(a => a.status === 'absent').length}`, icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-50" },
               { label: "תאריך הצטרפות", value: patient.startDate ? format(new Date(patient.startDate), "dd/MM/yy") : "—", icon: Calendar, color: "text-indigo-500", bg: "bg-indigo-50" },
               { label: "סטטוס שיקומי", value: patient.rehabPlanCompleted ? "בתהליך מתקדם" : "שלב התחלתי", icon: Shield, color: "text-blue-500", bg: "bg-blue-50" },
             ].map((stat, i) => (
               <div key={i} className="bg-white border border-slate-200/60 p-5 rounded-[2rem] hover:border-slate-300 transition-all group">
                 <div className={`w-10 h-10 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <stat.icon className="w-5 h-5" />
                 </div>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                 <p className="text-xl font-black text-slate-900">{stat.value}</p>
               </div>
             ))}
          </div>

          {/* ── Tabs ── */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mb-8 w-fit">
             {[
               { id: "overview", label: "סקירה", icon: Info },
               { id: "attendance", label: "נוכחות", icon: History },
               { id: "messages", label: "הודעות", icon: MessageCircle },
               { id: "reports", label: "דוחות", icon: FileText },
             ].map((tab) => (
               <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[11px] font-black transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
               >
                 <tab.icon className="w-3.5 h-3.5" />
                 {tab.label}
               </button>
             ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "overview" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="overview" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                 
                 {/* Left Column: Personal & Contact (Bento style) */}
                 <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    
                    {/* Primary Info Card */}
                    <div className="sm:col-span-2 bg-white border border-slate-200/60 rounded-[2.5rem] p-8 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/40 to-emerald-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <h3 className="text-lg font-black mb-8 flex items-center gap-3 text-slate-800">
                        <div className="w-2 h-6 bg-emerald-500 rounded-full" />
                        מידע אישי וקשר
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-10 gap-x-12">
                         <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">מספר זהות</p>
                            <p className="text-lg font-black font-mono text-slate-700">{patient.idNumber}</p>
                         </div>
                         <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">קבוצה ותוכנית</p>
                            <p className="text-lg font-black text-emerald-600">{fullGroupName}</p>
                         </div>
                         <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">טלפון ליצירת קשר</p>
                            <p className="text-lg font-black text-slate-700">{patient.phone || "—"}</p>
                         </div>
                         <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">כתובת דוא״ל</p>
                            <p className="text-lg font-black text-slate-700">{patient.email || "—"}</p>
                         </div>
                      </div>
                    </div>

                 </div>

                 {/* Right Column: Administrative (Stay Period & Actions) */}
                 <div className="lg:col-span-4 space-y-6">
                    {/* ── Stay Period Management ── */}
                    {(() => {
                      const startDate = patient.startDate ? parseISO(patient.startDate) : null;
                      const endDate = effectiveEndDate(patient);
                      const totalDays = (startDate && endDate) ? differenceInDays(endDate, startDate) : 90;
                      const elapsedDays = startDate ? differenceInDays(new Date(), startDate) : 0;
                      const progress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
                      
                      const days = endDate ? differenceInDays(endDate, new Date()) : null;
                      const isUrgent = days !== null && days >= 0 && days <= 14;
                      const isExpired = days !== null && days < 0;

                      return (
                        <div className={`bg-white border rounded-[2.5rem] p-8 shadow-sm relative overflow-hidden ${
                          isExpired ? "border-slate-300" :
                          isUrgent  ? "border-rose-500/30" :
                          "border-slate-200/60"
                        }`}>
                          <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isUrgent ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-400'}`}>
                                <Calendar className="w-5 h-5" />
                              </div>
                              <div>
                                <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900">תקופת שהות</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">ניהול זמני תוכנית</p>
                              </div>
                            </div>
                            {isUrgent && <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
                          </div>

                          <div className="space-y-6 mb-8">
                            {/* Dates visualization */}
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-slate-50 rounded-2xl p-4">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">תאריך התחלה</p>
                                <p className="text-xs font-black text-slate-700">{patient.startDate ? format(parseISO(patient.startDate), "dd/MM/yyyy") : "—"}</p>
                              </div>
                              <div className={`rounded-2xl p-4 ${isUrgent ? 'bg-rose-50' : 'bg-slate-50'}`}>
                                <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isUrgent ? 'text-rose-400' : 'text-slate-400'}`}>תאריך סיום</p>
                                <p className={`text-xs font-black ${isUrgent ? 'text-rose-600' : 'text-slate-700'}`}>{endDate ? format(endDate, "dd/MM/yyyy") : "—"}</p>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="space-y-2">
                              <div className="flex justify-between items-end">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">התקדמות תקופה</span>
                                <span className={`text-sm font-black ${isExpired ? 'text-slate-400' : isUrgent ? 'text-rose-500' : 'text-emerald-500'}`}>
                                  {isExpired ? 'הסתיימה' : `${days} ימים נותרו`}
                                </span>
                              </div>
                              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                                <div 
                                  className={`h-full transition-all duration-1000 ${isExpired ? 'bg-slate-300' : isUrgent ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {patient.extensionSent ? (
                              <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/10 rounded-2xl px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                  <span className="text-xs font-black text-emerald-600">הארכה נשלחה</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase">
                                  {patient.extensionSentAt ? format(parseISO(patient.extensionSentAt), "dd/MM/yy") : ""}
                                </span>
                              </div>
                            ) : (
                              <button onClick={markExtensionSent} disabled={savingExt === "sent"}
                                className="w-full flex items-center justify-center gap-3 px-5 py-4 text-xs font-black bg-orange-500/10 text-orange-600 border border-orange-500/20 rounded-2xl hover:bg-orange-500/20 transition-all disabled:opacity-50">
                                {savingExt === "sent" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                סמן: הארכה לחצי שנה נשלחה
                              </button>
                            )}

                            {patient.extensionReceived ? (
                              <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/10 rounded-2xl px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                                  <span className="text-xs font-black text-emerald-600">הארכה לחצי שנה התקבלה</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase">
                                  {patient.extensionReceivedAt ? format(parseISO(patient.extensionReceivedAt), "dd/MM/yy") : ""}
                                </span>
                              </div>
                            ) : (
                              <button onClick={markExtensionReceived} disabled={savingExt === "recv"}
                                className="w-full flex items-center justify-center gap-3 px-5 py-4 text-xs font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-2xl hover:bg-emerald-500/20 transition-all disabled:opacity-50">
                                {savingExt === "recv" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                סמן: הארכה לחצי שנה התקבלה
                              </button>
                            )}

                            <div className="pt-4 mt-2 border-t border-slate-100">
                              {editingEndDate ? (
                                <div className="flex items-center gap-2">
                                  <input type="date" value={editEndDateVal}
                                    onChange={e => setEditEndDateVal(e.target.value)} autoFocus
                                    className="flex-1 bg-slate-50 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-emerald-500/10" />
                                  <button onClick={saveEndDate} disabled={savingExt === "date"}
                                    className="p-3 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all">
                                    {savingExt === "date" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                  </button>
                                  <button onClick={() => setEditingEndDate(false)}
                                    className="p-3 rounded-xl bg-slate-100 text-slate-400 hover:bg-slate-200 transition-all">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => {
                                    const end = effectiveEndDate(patient);
                                    setEditEndDateVal(patient.endDate || (end ? format(end, "yyyy-MM-dd") : ""));
                                    setEditingEndDate(true);
                                  }}
                                  className="w-full text-[10px] font-black text-slate-300 hover:text-emerald-500 flex items-center justify-center gap-2 transition-all py-2 group">
                                  <Edit3 className="w-3 h-3 group-hover:rotate-12 transition-transform" />
                                  שינוי תאריך סיום באופן ידני
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Rehab Status ── */}
                    <div 
                      className={`rounded-[2.5rem] p-8 cursor-pointer transition-all select-none group border ${
                        patient.rehabPlanCompleted 
                          ? "bg-emerald-500 text-white border-emerald-600 shadow-xl shadow-emerald-500/10" 
                          : "bg-white text-slate-900 border-slate-200/60 hover:border-emerald-500/40"
                      }`}
                      onClick={toggleRehabPlan}
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] ${patient.rehabPlanCompleted ? 'text-white/60' : 'text-slate-400'}`}>
                          סטטוס תוכנית
                        </h4>
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          patient.rehabPlanCompleted 
                            ? "bg-white border-white" 
                            : "border-slate-200 group-hover:border-emerald-500/50"
                        }`}>
                          {patient.rehabPlanCompleted && <Check className="w-4 h-4 text-emerald-500 font-black" />}
                        </div>
                      </div>
                      <p className="text-xl font-black">תוכנית שיקום</p>
                      <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${patient.rehabPlanCompleted ? 'text-white/60' : 'text-slate-400'}`}>
                        {patient.rehabPlanCompleted ? 'הושלמה בהצלחה' : 'ממתין לביצוע'}
                      </p>
                    </div>
                 </div>
              </motion.div>
            )}

            {activeTab === "attendance" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="attendance" className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                  <h3 className="text-xs font-black uppercase tracking-widest">יומן נוכחות</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {attendance.length === 0 ? (
                    <div className="py-20 text-center opacity-20 italic">אין רישומי נוכחות זמינים</div>
                  ) : attendance.map((att) => (
                    <div key={att.id} className="p-5 flex items-center justify-between hover:bg-[var(--foreground)]/[0.01] transition-colors">
                      <div className="flex items-center gap-4">
                        <Calendar className="w-4 h-4 text-[var(--foreground)]/20" />
                        <span className="text-sm font-bold">{format(new Date(att.date + "T12:00:00"), "EEEE, dd/MM/yyyy", { locale: he })}</span>
                      </div>
                      <span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border uppercase tracking-tighter ${
                        att.status === "present" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                      }`}>
                        {att.status === "present" ? "נוכח" : "נעדר"}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === "reports" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="reports" className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                    <div className="bg-[var(--card-bg)] border border-[var(--border)] p-6 rounded-[2rem] shadow-sm flex flex-col items-center text-center transition-all hover:border-emerald-500/30 group">
                       <div className="w-12 h-12 rounded-xl bg-emerald-600/10 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
                          <FileText className="w-6 h-6" />
                       </div>
                       <h4 className="text-base font-black mb-1">אישור השתתפות בתוכנית</h4>
                       <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest mb-6">מסמך רשמי המעיד על פעילות המטופל</p>
                       <button 
                        onClick={() => generateReport('participation')}
                        disabled={reportLoading}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/10 flex items-center justify-center gap-2"
                       >
                         {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                         הפק דוח השתתפות
                       </button>
                    </div>

                    <div className="bg-[var(--card-bg)] border border-[var(--border)] p-6 rounded-[2rem] shadow-sm flex flex-col items-center text-center transition-all hover:border-blue-500/30 group">
                       <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
                          <FileText className="w-6 h-6" />
                       </div>
                       <h4 className="text-base font-black mb-1">דוח נוכחות חודשי</h4>
                       <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest mb-6">פירוט ימי נוכחות והיעדרות לפי חודש</p>
                       
                       <div className="flex gap-2 w-full mb-3">
                         <select 
                          value={selectedMonth} 
                          onChange={(e) => setSelectedMonth(e.target.value)}
                          className="flex-1 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-lg px-3 py-2 text-[10px] font-bold outline-none focus:border-blue-500/50"
                         >
                            {Array.from({ length: 12 }).map((_, i) => {
                              const d = subMonths(new Date(), i);
                              return (
                                <option key={i} value={format(d, "yyyy-MM")}>
                                  {format(d, "MMMM yyyy", { locale: he })}
                                </option>
                              );
                            })}
                         </select>
                       </div>

                       <button 
                        onClick={() => generateReport('attendance')}
                        disabled={reportLoading}
                        className="w-full bg-slate-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                       >
                         {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                         הפק דוח נוכחות חודשי
                       </button>
                    </div>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* ── PDF Template (Hidden from UI but visible to html2canvas) ── */}
        <div className="fixed left-[-9999px] top-[-9999px]">
          <div ref={reportRef} className="w-[210mm] p-[20mm] bg-white text-black font-sans leading-relaxed">
            <div className="flex justify-between items-start border-b-2 border-emerald-600 pb-8 mb-12">
              <div>
                <h1 className="text-4xl font-black text-emerald-600 mb-2">מרכז חוסן</h1>
                <h2 className="text-xl font-bold text-slate-500">חוות רום</h2>
              </div>
              <div className="text-left text-sm text-slate-400 font-mono">
                <p>{format(new Date(), "dd/MM/yyyy")}</p>
                <p>סימוכין: {id?.slice(-6).toUpperCase()}</p>
              </div>
            </div>

            <div className="text-center mb-16">
              <h3 className="text-3xl font-black mb-4">אישור השתתפות בתוכנית</h3>
              <div className="w-24 h-1 bg-emerald-500 mx-auto rounded-full" />
            </div>

            <div className="space-y-8 text-lg">
              <p>לכל המעוניין,</p>
              <p className="leading-loose">
                הרינו לאשר כי המטופל/ת <strong>{patientName}</strong>, ת.ז <strong>{patient.idNumber}</strong>, משתתף/ת באופן פעיל בתוכנית המרכז במסגרת קבוצת <strong>{fullGroupName}</strong>.
              </p>
              <p>המטופל/ת החל/ה את פעילותו/ה בתוכנית בתאריך {patient.startDate ? format(new Date(patient.startDate), "dd/MM/yyyy") : "—"}.</p>
              
              <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 my-12">
                <h4 className="font-black text-sm uppercase tracking-widest text-slate-400 mb-4">סיכום נוכחות תקופתי</h4>
                <div className="flex justify-around items-center">
                  <div className="text-center">
                    <p className="text-3xl font-black text-emerald-600">{attendance.filter(a => a.status === 'present').length}</p>
                    <p className="text-xs font-bold text-slate-500">ימי נוכחות</p>
                  </div>
                  <div className="w-px h-12 bg-slate-200" />
                  <div className="text-center">
                    <p className="text-3xl font-black text-rose-600">{attendance.filter(a => a.status === 'absent').length}</p>
                    <p className="text-xs font-bold text-slate-500">ימי היעדרות</p>
                  </div>
                </div>
              </div>

              <p className="mt-12">בברכה,</p>
              <div className="mt-8">
                <p className="font-black">הנהלת מרכז חוסן</p>
                <p className="text-sm text-slate-500 italic">חוות רום - שיקום חקלאי וקהילתי</p>
              </div>
            </div>

            <div className="mt-24 pt-8 border-t border-slate-100 text-[10px] text-slate-400 text-center">
              מסמך זה הופק באופן ממוחשב ואינו דורש חתימה | מרכז חוסן - חוות רום
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showEditModal && patient && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowEditModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl bg-[var(--card-bg)] border border-[var(--border)] rounded-[3rem] shadow-2xl overflow-hidden"
              >
                <div className="flex items-center justify-between p-8 pb-0">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                      <Edit3 className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black tracking-tight">עריכת פרטי מטופל</h2>
                      <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest mt-0.5">
                        {patient.firstName} {patient.lastName}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="p-3 hover:bg-[var(--foreground)]/5 rounded-2xl transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-8 max-h-[80vh] overflow-y-auto no-scrollbar">
                  <PatientForm
                    patientId={patient.id}
                    initialData={patient}
                    onSuccess={() => {
                      setShowEditModal(false);
                      fetchPatientData();
                    }}
                  />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </RoleGuard>
  );
}
