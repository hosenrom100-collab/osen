"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PatientForm } from "@/components/patients/PatientForm";
import { useState, useEffect, useRef } from "react";
import { db, storage } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  doc, getDoc, collection, query, where, orderBy, getDocs, limit, updateDoc, onSnapshot, serverTimestamp, setDoc,
} from "firebase/firestore";
import {
  Calendar, Loader2, Shield,
  Edit3, CheckCircle, CheckCircle2,
  AlertCircle, ChevronLeft, Printer, Download, FileText,
  X, Check, Info, History, Send, Bell, MessageCircle,
} from "lucide-react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const reportRef = useRef<HTMLDivElement>(null);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const initialTab = (searchParams.get("tab") as "overview" | "attendance" | "reports" | "messages") || "overview";
  const [activeTab, setActiveTab] = useState<"overview" | "attendance" | "reports" | "messages">(initialTab);
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
      where("participants", "array-contains", participantUid),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse());
    });

    return () => unsubscribe();
  }, [participantUid, activeTab]);

  // Document Requests & Documents
  useEffect(() => {
    if (!id) return;

    const qReq = query(
      collection(db, "document_requests"),
      where("patientId", "==", id),
      orderBy("createdAt", "desc")
    );
    const qDocs = query(
      collection(db, "documents"),
      where("patientId", "==", id),
      orderBy("createdAt", "desc")
    );

    const unsubReq = onSnapshot(qReq, (snap) => {
      setDocRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubDocs = onSnapshot(qDocs, (snap) => {
      setProcessedDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubReq(); unsubDocs(); };
  }, [id]);

  async function sendMessage() {
    if (!newMessage.trim() || !authUser || !participantUid || !patient) return;
    const content = newMessage.trim();
    setNewMessage("");
    try {
      const participants = [authUser.uid, participantUid];
      if (patient.assignedWorkerId && !participants.includes(patient.assignedWorkerId)) {
        participants.push(patient.assignedWorkerId);
      }
      await setDoc(doc(collection(db, "messages")), {
        participants,
        senderId: authUser.uid,
        receiverId: participantUid,
        content,
        timestamp: serverTimestamp(),
        read: false,
      });

      // Create a notification for the participant in DB
      await setDoc(doc(collection(db, "notifications")), {
        title: `הודעה חדשה מהצוות`,
        body: content.length > 50 ? content.substring(0, 50) + "..." : content,
        recipientIds: [participantUid],
        senderId: authUser.uid,
        createdAt: serverTimestamp(),
        readBy: [],
        type: "chat",
        link: `/portal`
      });

      // Send actual PUSH notification
      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `הודעה חדשה מהצוות`,
            body: content.length > 50 ? content.substring(0, 50) + "..." : content,
            userIds: [participantUid],
            link: `/portal`,
            skipDb: true
          }),
        });
      } catch (err) { console.error("Push failed:", err); }
    } catch (e) { console.error(e); }
  }

  const handleProcessRequest = async (request: any) => {
    if (!patient || !reportRef.current) return;
    setReportLoading(true);
    try {
      const docTitle = request.type === 'stay' ? 'אישור שהייה' : `דו״ח נוכחות - ${request.month || format(new Date(), "MM/yyyy")}`;

      // Generate PDF from the hidden template
      await new Promise(r => setTimeout(r, 100));
      const canvas = await html2canvas(reportRef.current, {
        scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff"
      });
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);

      // Upload to Firebase Storage and get download URL
      const pdfBlob = pdf.output("blob");
      const storageRef = ref(storage, `documents/${patient.id}/${Date.now()}_${request.type}.pdf`);
      await uploadBytes(storageRef, pdfBlob, { contentType: "application/pdf" });
      const downloadUrl = await getDownloadURL(storageRef);

      // Save document record with real URL
      const newDocRef = doc(collection(db, "documents"));
      await setDoc(newDocRef, {
        patientId: patient.id,
        title: docTitle,
        type: request.type,
        url: downloadUrl,
        createdAt: serverTimestamp(),
        processedBy: authUser?.uid,
      });

      await updateDoc(doc(db, "document_requests", request.id), {
        status: "completed",
        processedAt: serverTimestamp(),
        documentId: newDocRef.id,
      });

      // Notify participant via Firestore notification + push
      if (participantUid) {
        await setDoc(doc(collection(db, "notifications")), {
          title: 'מסמך מוכן להורדה',
          body: `${docTitle} מוכן לצפייה ולהורדה באיזור האישי שלך`,
          recipientIds: [participantUid],
          senderId: authUser?.uid,
          createdAt: serverTimestamp(),
          readBy: [],
          type: 'chat',
          link: '/portal',
        });

        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'מסמך מוכן להורדה',
            body: `${docTitle} מוכן לצפייה ולהורדה באיזור האישי שלך`,
            userId: participantUid,
            link: '/portal',
            skipDb: true
          }),
        }).catch(console.error);
      }

      alert("המסמך הופק ונשלח בהצלחה!");
      fetchPatientData();
    } catch (e) {
      console.error(e);
      alert("שגיאה בהפקת המסמך");
    } finally { setReportLoading(false); }
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

            {activeTab === "messages" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                key="messages"
                className="bg-white border border-slate-200 rounded-2xl md:rounded-[2.5rem] shadow-sm flex flex-col overflow-hidden"
                style={{ height: "min(600px, calc(100svh - 180px))" }}
              >
                {/* Chat Header */}
                <div className="p-4 md:p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50 shrink-0">
                  <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 font-black text-sm">
                    {patientName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-sm font-black leading-tight">שיחה עם {patientName}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">צ׳אט בזמן אמת</p>
                  </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-3 no-scrollbar bg-gradient-to-b from-transparent to-slate-50/30">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-20 italic">
                      <MessageCircle className="w-10 h-10 mb-3 opacity-10" />
                      <p className="text-sm">אין הודעות עדיין.</p>
                    </div>
                  ) : (
                    messages.map((m: any, i) => {
                      const isMe = m.senderId === authUser?.uid;
                      const isParticipant = m.senderId === participantUid;
                      return (
                        <div key={m.id || i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                            isMe
                              ? "bg-slate-900 text-white rounded-br-none"
                              : isParticipant
                                ? "bg-white border border-slate-200 text-slate-800 rounded-bl-none"
                                : "bg-teal-50 border border-teal-100 text-teal-900 rounded-bl-none"
                          }`}>
                            {!isMe && !isParticipant && (
                              <p className="text-[10px] font-black text-teal-600 mb-1">איש צוות אחר</p>
                            )}
                            <p className="leading-relaxed">{m.content}</p>
                            <p className={`text-[9px] mt-1 opacity-40 font-bold ${isMe ? "text-left" : "text-right"}`}>
                              {m.timestamp?.toDate ? format(m.timestamp.toDate(), "HH:mm | dd/MM", { locale: he }) : "שולח..."}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Input Area */}
                <div className="p-3 md:p-6 bg-white border-t border-slate-100 shrink-0">
                  <div className="flex gap-2 md:gap-3 bg-slate-50 border border-slate-200 p-1.5 md:p-2 rounded-xl md:rounded-2xl focus-within:border-emerald-500/30 focus-within:bg-white transition-all">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && sendMessage()}
                      placeholder="כתוב הודעה..."
                      className="flex-1 bg-transparent border-none outline-none text-sm px-3 py-2"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!newMessage.trim()}
                      className="w-10 h-10 md:w-12 md:h-12 bg-emerald-500 text-white rounded-lg md:rounded-xl flex items-center justify-center hover:bg-emerald-600 transition-all active:scale-90 disabled:opacity-30 shadow-lg shadow-emerald-500/20 shrink-0"
                    >
                      <Send className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "reports" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="reports" className="space-y-6">
                
                {/* Document Requests Section */}
                <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
                   <div className="flex items-center gap-3 mb-8">
                      <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
                        <Bell className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black leading-tight text-slate-900">בקשות להנפקת דוחות</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">בקשות הממתינות לטיפול המשתתף</p>
                      </div>
                   </div>

                   <div className="space-y-4">
                      {docRequests.filter(r => r.status === 'pending').length === 0 ? (
                        <div className="py-12 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-3xl">
                          <p className="text-xs text-slate-400 font-bold italic">אין בקשות פתוחות כרגע</p>
                        </div>
                      ) : (
                        docRequests.filter(r => r.status === 'pending').map((req) => (
                          <div key={req.id} className="flex items-center justify-between p-5 bg-amber-50/30 border border-amber-500/10 rounded-2xl">
                             <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                                  {req.type === 'stay' ? <Shield className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                                </div>
                                <div>
                                  <p className="text-sm font-black text-slate-900">
                                    {req.type === 'stay' ? 'אישור שהייה' : `דו״ח נוכחות חודשי - ${req.month}`}
                                  </p>
                                  <p className="text-[10px] text-slate-500 font-bold">
                                    התבקש ב-{req.createdAt?.toDate ? format(req.createdAt.toDate(), "dd/MM/yyyy HH:mm") : "עכשיו"}
                                  </p>
                                </div>
                             </div>
                             <button 
                               onClick={() => handleProcessRequest(req)}
                               disabled={reportLoading}
                               className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-slate-800 active:scale-95 disabled:opacity-50"
                             >
                               {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                               הנפק ושלח
                             </button>
                          </div>
                        ))
                      )}
                   </div>
                </div>

                {/* Manual Generation Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                   {/* Participation Certificate */}
                   <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm hover:border-emerald-500/40 transition-all group">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                         <Printer className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-black mb-2">הנפקת אישור השתתפות</h4>
                      <p className="text-[10px] text-slate-400 font-bold leading-relaxed mb-8 uppercase tracking-widest">
                        הפקת מסמך רשמי המאשר את חברות המטופל בתוכנית ונוכחותו.
                      </p>
                      <button 
                        onClick={() => generateReport('participation')}
                        disabled={reportLoading}
                        className="w-full bg-emerald-500 text-white py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-emerald-600 shadow-lg shadow-emerald-500/10 active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        הורד אישור רשמי
                      </button>
                   </div>

                   {/* Attendance Report */}
                   <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm hover:border-slate-900/40 transition-all group">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-900 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                         <FileText className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-black mb-2">דוח נוכחות תקופתי</h4>
                      <p className="text-[10px] text-slate-400 font-bold leading-relaxed mb-6 uppercase tracking-widest">
                        בחר חודש להפקת דוח נוכחות מפורט למטופל.
                      </p>
                      
                      <div className="flex flex-col gap-3">
                         <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                           <select 
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                            className="w-full bg-transparent border-none text-xs font-bold outline-none cursor-pointer"
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
                          className="w-full bg-slate-900 text-white py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-slate-800 active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-slate-900/10"
                         >
                           {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                           הפק דוח נוכחות חודשי
                         </button>
                      </div>
                   </div>
                </div>

                {/* History Section */}
                <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
                   <h3 className="text-sm font-black mb-6">מסמכים שהונפקו לאחרונה</h3>
                   <div className="space-y-3">
                      {processedDocs.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic text-center py-8">טרם הונפקו מסמכים למטופל זה</p>
                      ) : (
                        processedDocs.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                             <div className="flex items-center gap-3">
                                <FileText className="w-4 h-4 text-slate-400" />
                                <div>
                                   <p className="text-xs font-black text-slate-800">{doc.title}</p>
                                   <p className="text-[9px] text-slate-400 font-bold uppercase">
                                     הונפק ב-{doc.createdAt?.toDate ? format(doc.createdAt.toDate(), "dd/MM/yyyy") : "—"}
                                   </p>
                                </div>
                             </div>
                             <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">נשלח למשתתף</span>
                          </div>
                        ))
                      )}
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* ── PDF Template — inline styles only to avoid html2canvas lab() parse error ── */}
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
                <p style={{ margin: 0 }}>סימוכין: {id?.slice(-6).toUpperCase()}</p>
              </div>
            </div>

            {/* Title */}
            <div style={{ textAlign: "center", marginBottom: "64px" }}>
              <h3 style={{ fontSize: "26px", fontWeight: 900, margin: "0 0 16px 0" }}>אישור השתתפות בתוכנית</h3>
              <div style={{ width: "96px", height: "4px", backgroundColor: "#10b981", margin: "0 auto", borderRadius: "9999px" }} />
            </div>

            {/* Body */}
            <div style={{ fontSize: "17px" }}>
              <p style={{ marginBottom: "24px" }}>לכל המעוניין,</p>
              <p style={{ marginBottom: "24px", lineHeight: 2 }}>
                הרינו לאשר כי המטופל/ת <strong>{patientName}</strong>, ת.ז <strong>{patient.idNumber}</strong>, משתתף/ת באופן פעיל בתוכנית המרכז במסגרת קבוצת <strong>{fullGroupName}</strong>.
              </p>
              <p style={{ marginBottom: "24px" }}>
                המטופל/ת החל/ה את פעילותו/ה בתוכנית בתאריך {patient.startDate ? format(new Date(patient.startDate), "dd/MM/yyyy") : "—"}.
              </p>

              {/* Stats box */}
              <div style={{ backgroundColor: "#f8fafc", padding: "32px", borderRadius: "24px", border: "1px solid #f1f5f9", margin: "48px 0" }}>
                <h4 style={{ fontWeight: 900, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8", marginBottom: "16px" }}>סיכום נוכחות תקופתי</h4>
                <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: "28px", fontWeight: 900, color: "#059669", margin: "0 0 4px 0" }}>{attendance.filter(a => a.status === "present").length}</p>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", margin: 0 }}>ימי נוכחות</p>
                  </div>
                  <div style={{ width: "1px", height: "48px", backgroundColor: "#e2e8f0" }} />
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: "28px", fontWeight: 900, color: "#e11d48", margin: "0 0 4px 0" }}>{attendance.filter(a => a.status === "absent").length}</p>
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
