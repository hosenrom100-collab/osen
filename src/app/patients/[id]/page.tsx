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
  X, Check, Info, History, Send, Bell, MessageCircle, Upload
} from "lucide-react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format, subMonths, addMonths, differenceInDays, parseISO, isValid } from "date-fns";
import { he } from "date-fns/locale";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const monthNamesHebrew = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
];

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
  const { isAdmin, isManager, user: authUser, signatureTitle, signatureImage } = useAuth();
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
  const [programs, setPrograms] = useState<{ id: string; name: string; activeDays?: number[] }[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingExt, setSavingExt] = useState<string | null>(null);
  const [editingEndDate, setEditingEndDate] = useState(false);
  const [editEndDateVal, setEditEndDateVal] = useState("");
  const [socialWorkers, setSocialWorkers] = useState<{ id: string; name: string }[]>([]);
  const [docRequests, setDocRequests] = useState<any[]>([]);
  const [processedDocs, setProcessedDocs] = useState<any[]>([]);

  // Recipient and PDF modal states
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [recipientText, setRecipientText] = useState("עו״ס אגף השיקום משרד הביטחון");
  const [pendingReportType, setPendingReportType] = useState<'participation' | 'attendance' | 'stay' | 'travel' | null>(null);
  const [pendingRequest, setPendingRequest] = useState<any | null>(null);
  const [activeReportType, setActiveReportType] = useState<'participation' | 'attendance' | 'travel'>('participation');

  // Travel reimbursement specific states (Transient, not saved to DB)
  const [showTravelModal, setShowTravelModal] = useState(false);
  const [travelLetterDate, setTravelLetterDate] = useState("");
  const [travelFirstName, setTravelFirstName] = useState("");
  const [travelLastName, setTravelLastName] = useState("");
  const [travelIdNumber, setTravelIdNumber] = useState("");
  const [travelApprovalStartDate, setTravelApprovalStartDate] = useState("");
  const [travelProgramName, setTravelProgramName] = useState("חרבות ברזל");
  const [travelActivityDays, setTravelActivityDays] = useState("שני, שלישי, רביעי");
  const [travelAttendanceDatesStr, setTravelAttendanceDatesStr] = useState("");
  const [travelSignatoryName, setTravelSignatoryName] = useState("מירב סארמילי");
  const [travelSignatoryTitle, setTravelSignatoryTitle] = useState("מנהלת תפעול מרכז חוסן");
  const [travelSignatoryOrg, setTravelSignatoryOrg] = useState("חוות רום");

  const getProgramDaysText = (defaultText: string) => {
    const patientProgram = programs.find(p => p.id === (patient as any)?.programId);
    const activeDays = patientProgram?.activeDays;
    
    if (!activeDays || activeDays.length === 0) {
      return defaultText;
    }

    const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    const sortedDays = [...activeDays].sort((a, b) => a - b);
    const mapped = sortedDays.map(d => dayNames[d]);

    if (mapped.length === 1) {
      return `ביום ${mapped[0]}`;
    }

    const last = mapped.pop();
    return `בימים ${mapped.join(", ")} ו${last}`;
  };

  const getTravelAttendanceDates = () => {
    let result = "";
    if (!travelAttendanceDatesStr || !travelAttendanceDatesStr.trim() || travelAttendanceDatesStr.includes("[הכנס תאריכים]")) {
      const reqMonth = pendingRequest?.month || selectedMonth;
      const monthlyPresence = attendance
        .filter(h => h.date.startsWith(reqMonth) && h.status === 'present')
        .sort((a, b) => a.date.localeCompare(b.date));
      const dayNumbers = monthlyPresence.map(h => parseInt(h.date.split("-")[2], 10));
      const [selYear, selMonth] = reqMonth.split("-");
      const selMonthName = monthNamesHebrew[parseInt(selMonth, 10) - 1];
      if (dayNumbers.length > 0) {
        result = `${dayNumbers.join(",")} לחודש ${selMonthName} ${selYear}`;
      } else {
        result = "";
      }
    } else {
      result = travelAttendanceDatesStr;
    }
    // Remove all quotes (double, single, smart quotes) and brackets
    return result.replace(/["'“”‘’\[\]]/g, "");
  };

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
      setPrograms(progsSnap.docs.map(d => ({ id: d.id, name: d.data().name, activeDays: d.data().activeDays })));
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
    if (!patient) return;
    if (request.type === 'stay') {
      setPendingRequest(request);
      setPendingReportType('stay');
      setActiveReportType('participation');
      setRecipientText("עו״ס אגף השיקום משרד הביטחון");
      setShowRecipientModal(true);
    } else if (request.type === 'travel') {
      setPendingRequest(request);
      setPendingReportType('travel');
      setActiveReportType('travel');
      
      const today = new Date();
      const hebrewDaysOfWeek = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
      const dayName = hebrewDaysOfWeek[today.getDay()];
      const dayNum = today.getDate();
      const monthNamesHebrew = [
        "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
        "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
      ];
      const monthName = monthNamesHebrew[today.getMonth()];
      const yearNum = today.getFullYear();
      setTravelLetterDate(`יום ${dayName} ${dayNum} ${monthName} ${yearNum}`);
      
      setTravelFirstName(patient.firstName || "");
      setTravelLastName(patient.lastName || "");
      setTravelIdNumber(patient.idNumber || "");
      
      if (patient.startDate) {
        try {
          const parsed = parseISO(patient.startDate);
          if (isValid(parsed)) {
            setTravelApprovalStartDate(format(parsed, "dd.MM.yyyy"));
          } else {
            setTravelApprovalStartDate("08.09.2025");
          }
        } catch {
          setTravelApprovalStartDate("08.09.2025");
        }
      } else {
        setTravelApprovalStartDate("08.09.2025");
      }
      
      setTravelProgramName("חרבות ברזל");
      const patientProgram = programs.find(p => p.id === (patient as any)?.programId);
      const activeDays = patientProgram?.activeDays;
      if (activeDays && activeDays.length > 0) {
        const sortedDays = [...activeDays].sort((a, b) => a - b);
        const mapped = sortedDays.map(d => hebrewDaysOfWeek[d]);
        setTravelActivityDays(mapped.join(", "));
      } else {
        setTravelActivityDays("שני, שלישי, רביעי");
      }
      
      const reqMonth = request.month || selectedMonth;
      const monthlyPresence = attendance
        .filter(h => h.date.startsWith(reqMonth) && h.status === 'present')
        .sort((a, b) => a.date.localeCompare(b.date));
      const dayNumbers = monthlyPresence.map(h => parseInt(h.date.split("-")[2], 10));
      const [selYear, selMonth] = reqMonth.split("-");
      const selMonthName = monthNamesHebrew[parseInt(selMonth, 10) - 1];
      const attDatesFormatted = dayNumbers.length > 0
        ? `${dayNumbers.join(",")} לחודש ${selMonthName} ${selYear}`
        : `[הכנס תאריכים] לחודש ${selMonthName} ${selYear}`;
      setTravelAttendanceDatesStr(attDatesFormatted);
      
      setTravelSignatoryName("מירב סארמילי");
      setTravelSignatoryTitle("מנהלת תפעול מרכז חוסן");
      setTravelSignatoryOrg("חוות רום");
      
      setShowTravelModal(true);
    } else {
      if (request.type === 'attendance') {
        setActiveReportType('attendance');
        if (request.month) {
          setSelectedMonth(request.month);
        }
      }
      setReportLoading(true);
      try {
        await executeDirectRequestProcessing(request);
      } catch (err) {
        console.error(err);
      } finally {
        setReportLoading(false);
      }
    }
  };

  const executeDirectRequestProcessing = async (request: any) => {
    if (!patient || !reportRef.current) return;
    try {
      const docTitle = request.type === 'attendance' 
        ? `דו״ח נוכחות - ${request.month || format(new Date(), "MM/yyyy")}` 
        : (request.customType || 'בקשה מיוחדת');

      // Wait for rendering
      await new Promise(r => setTimeout(r, 300));
      const canvas = await html2canvas(reportRef.current, {
        scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff"
      });
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);

      const pdfBlob = pdf.output("blob");
      const storageRef = ref(storage, `documents/${patient.id}/${Date.now()}_${request.type}.pdf`);
      await uploadBytes(storageRef, pdfBlob, { contentType: "application/pdf" });
      const downloadUrl = await getDownloadURL(storageRef);

      const newDocRef = doc(collection(db, "documents"));
      await setDoc(newDocRef, {
        patientId: patient.id,
        title: docTitle,
        type: request.type,
        url: downloadUrl,
        createdAt: serverTimestamp(),
        processedBy: authUser?.uid || null,
      });

      await updateDoc(doc(db, "document_requests", request.id), {
        status: "completed",
        processedAt: serverTimestamp(),
        documentId: newDocRef.id,
      });

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
    }
  };

  const executePDFGeneration = async () => {
    if (!patient || !reportRef.current) return;
    setShowRecipientModal(false);
    setReportLoading(true);
    
    try {
      // Wait for rendering
      await new Promise(r => setTimeout(r, 350));
      
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

      const docType = (pendingReportType === 'participation' || pendingReportType === 'stay') ? 'stay' : 'travel';
      const docTitle = docType === 'stay' ? 'אישור שהייה' : 'אישור נוכחות חודשי';
      const fileName = docType === 'stay' ? 'אישור_שהייה' : 'אישור_נוכחות_חודשי';

      // If manual generation (no pending request), download locally
      if (!pendingRequest) {
        pdf.save(`${fileName}_${patient.firstName}_${patient.lastName}.pdf`);
      }

      // In all cases, upload to storage and register in documents collection
      let downloadUrl = "";
      try {
        const pdfBlob = pdf.output("blob");
        const storageRef = ref(storage, `documents/${patient.id}/${Date.now()}_${docType}.pdf`);
        await uploadBytes(storageRef, pdfBlob, { contentType: "application/pdf" });
        downloadUrl = await getDownloadURL(storageRef);
      } catch (storageErr) {
        console.warn("Storage upload failed, attempting data URL fallback to prevent workflow failure:", storageErr);
        
        // If this was a pending request, we download it for the admin locally so they have it immediately
        if (pendingRequest) {
          pdf.save(`${fileName}_${patient.firstName}_${patient.lastName}.pdf`);
          alert("שים לב: העלאה לענן נכשלה עקב שגיאת שרת. הקובץ הורד ישירות למחשבך ויירשם במערכת.");
        }
        
        try {
          const dataUri = pdf.output("datauristring");
          if (dataUri.length < 900000) { // Firestore 1MB document limit
            downloadUrl = dataUri;
          } else {
            downloadUrl = "#";
          }
        } catch (pdfErr) {
          downloadUrl = "#";
        }
      }

      try {
        const newDocRef = doc(collection(db, "documents"));
        await setDoc(newDocRef, {
          patientId: patient.id,
          title: docTitle,
          type: docType,
          url: downloadUrl,
          createdAt: serverTimestamp(),
          processedBy: authUser?.uid || null,
        });

        // If responding to a specific request, mark it as completed
        if (pendingRequest) {
          await updateDoc(doc(db, "document_requests", pendingRequest.id), {
            status: "completed",
            processedAt: serverTimestamp(),
            documentId: newDocRef.id,
          });
        }

        // Notify the participant if their UID is available
        if (participantUid) {
          await setDoc(doc(collection(db, "notifications")), {
            title: 'מסמך מוכן להורדה',
            body: `${docTitle} מוכן לצפייה ולהורדה באיזור האישי שלך`,
            recipientIds: [participantUid],
            senderId: authUser?.uid || null,
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
      } catch (firestoreErr) {
        console.error("Failed to register document in Firestore history database:", firestoreErr);
      }

      alert("המסמך הופק ונשלח בהצלחה!");
      fetchPatientData();
    } catch (e) {
      console.error(e);
      alert("שגיאה בהפקת המסמך");
    } finally {
      setReportLoading(false);
      setPendingRequest(null);
      setPendingReportType(null);
    }
  };

  const handleUploadCustomDoc = async (request: any, file: File) => {
    if (!patient) return;
    setReportLoading(true);
    try {
      const docTitle = request.type === 'stay' 
        ? 'אישור שהייה' 
        : request.type === 'attendance' 
          ? `דו״ח נוכחות - ${request.month || format(new Date(), "MM/yyyy")}` 
          : (request.customType || 'בקשה מיוחדת');

      const storageRef = ref(storage, `documents/${patient.id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const downloadUrl = await getDownloadURL(storageRef);

      const newDocRef = doc(collection(db, "documents"));
      await setDoc(newDocRef, {
        patientId: patient.id,
        title: docTitle,
        type: request.type,
        url: downloadUrl,
        createdAt: serverTimestamp(),
        processedBy: authUser?.uid || null,
      });

      await updateDoc(doc(db, "document_requests", request.id), {
        status: "completed",
        processedAt: serverTimestamp(),
        documentId: newDocRef.id,
      });

      if (participantUid) {
        await setDoc(doc(collection(db, "notifications")), {
          title: 'מסמך מוכן להורדה',
          body: `${docTitle} הועלה עבורך ומוכן לצפייה באיזור האישי שלך`,
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
            body: `${docTitle} הועלה עבורך ומוכן לצפייה באיזור האישי שלך`,
            userId: participantUid,
            link: '/portal',
            skipDb: true
          }),
        }).catch(console.error);
      }

      alert("הקובץ הועלה ונשלח למשתתף בהצלחה!");
      fetchPatientData();
    } catch (e) {
      console.error(e);
      alert("שגיאה בהעלאת הקובץ");
    } finally {
      setReportLoading(false);
    }
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

  const generateReport = async (type: 'participation' | 'attendance' | 'travel') => {
    if (!patient) return;
    if (type === 'participation') {
      setPendingRequest(null);
      setPendingReportType('participation');
      setActiveReportType('participation');
      setRecipientText("עו״ס אגף השיקום משרד הביטחון");
      setShowRecipientModal(true);
    } else if (type === 'travel') {
      setPendingRequest(null);
      setPendingReportType('travel');
      setActiveReportType('travel');
      
      const today = new Date();
      const hebrewDaysOfWeek = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
      const dayName = hebrewDaysOfWeek[today.getDay()];
      const dayNum = today.getDate();
      const monthNamesHebrew = [
        "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
        "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
      ];
      const monthName = monthNamesHebrew[today.getMonth()];
      const yearNum = today.getFullYear();
      setTravelLetterDate(`יום ${dayName} ${dayNum} ${monthName} ${yearNum}`);
      
      setTravelFirstName(patient.firstName || "");
      setTravelLastName(patient.lastName || "");
      setTravelIdNumber(patient.idNumber || "");
      
      if (patient.startDate) {
        try {
          const parsed = parseISO(patient.startDate);
          if (isValid(parsed)) {
            setTravelApprovalStartDate(format(parsed, "dd.MM.yyyy"));
          } else {
            setTravelApprovalStartDate("08.09.2025");
          }
        } catch {
          setTravelApprovalStartDate("08.09.2025");
        }
      } else {
        setTravelApprovalStartDate("08.09.2025");
      }
      
      setTravelProgramName("חרבות ברזל");
      const patientProgram = programs.find(p => p.id === (patient as any)?.programId);
      const activeDays = patientProgram?.activeDays;
      if (activeDays && activeDays.length > 0) {
        const sortedDays = [...activeDays].sort((a, b) => a - b);
        const mapped = sortedDays.map(d => hebrewDaysOfWeek[d]);
        setTravelActivityDays(mapped.join(", "));
      } else {
        setTravelActivityDays("שני, שלישי, רביעי");
      }
      
      const monthlyPresence = attendance
        .filter(h => h.date.startsWith(selectedMonth) && h.status === 'present')
        .sort((a, b) => a.date.localeCompare(b.date));
      const dayNumbers = monthlyPresence.map(h => parseInt(h.date.split("-")[2], 10));
      const [selYear, selMonth] = selectedMonth.split("-");
      const selMonthName = monthNamesHebrew[parseInt(selMonth, 10) - 1];
      const attDatesFormatted = dayNumbers.length > 0
        ? `${dayNumbers.join(",")} לחודש ${selMonthName} ${selYear}`
        : `[הכנס תאריכים] לחודש ${selMonthName} ${selYear}`;
      setTravelAttendanceDatesStr(attDatesFormatted);
      
      setTravelSignatoryName("מירב סארמילי");
      setTravelSignatoryTitle("מנהלת תפעול מרכז חוסן");
      setTravelSignatoryOrg("חוות רום");
      
      setShowTravelModal(true);
    } else {
      setActiveReportType('attendance');
      setReportLoading(true);
      try {
        await executeManualGeneration('attendance');
      } catch (err) {
        console.error(err);
      } finally {
        setReportLoading(false);
      }
    }
  };

  const executeManualGeneration = async (type: 'attendance') => {
    if (!patient || !reportRef.current) return;
    try {
      await new Promise(r => setTimeout(r, 300));
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
      pdf.save(`דוח_נוכחות_${patient.firstName}_${patient.lastName}.pdf`);
    } catch (err) {
      console.error(err);
      alert("שגיאה בהפקת הדוח");
    }
  };

  const executeTravelPDFGeneration = async () => {
    if (!patient || !reportRef.current) return;
    setShowTravelModal(false);
    setReportLoading(true);
    try {
      await new Promise(r => setTimeout(r, 350));
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
      
      const fileName = `החזר_נסיעות_${travelLastName}_${travelFirstName}`;
      pdf.save(`${fileName}.pdf`);
      
      // Update pending request status to completed in Firestore if there is one
      // but do NOT save the document URL or notifications to DB as requested.
      if (pendingRequest) {
        await updateDoc(doc(db, "document_requests", pendingRequest.id), {
          status: "completed",
          processedAt: serverTimestamp()
        });
      }
      
      alert("המסמך הופק בהצלחה!");
      fetchPatientData();
    } catch (err) {
      console.error(err);
      alert("שגיאה בהפקת המסמך");
    } finally {
      setReportLoading(false);
      setPendingRequest(null);
      setPendingReportType(null);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--background)] gap-4">
      <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      <p className="text-sm font-black text-[var(--foreground)]/30 uppercase tracking-[0.2em]">טוען תיק משתתף...</p>
    </div>
  );

  if (!patient) return null;
  const patientName = patient.firstName && patient.lastName ? `${patient.firstName} ${patient.lastName}` : (patient.fullName || "משתתף ללא שם");
  
  const progName = programs.find(p => p.id === (patient as any).programId)?.name;
  const grpName = groups.find(g => g.id === patient.hosenType)?.name || patient.hosenType;
  let rawGroupName = (progName && grpName && progName !== grpName) ? `${progName} - ${grpName}` : (progName || grpName || "כללי");
  const fullGroupName = (rawGroupName && rawGroupName !== "כללי" && !rawGroupName.startsWith("תוכנית")) ? `תוכנית ${rawGroupName}` : rawGroupName;

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker"]} redirectTo="/login">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        
        <header className="sticky top-0 z-40 bg-[var(--background)]/70 backdrop-blur-2xl border-b border-[var(--border)]">
          <div className="max-w-7xl mx-auto px-4 md:px-8 h-auto min-h-[5rem] py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3 md:gap-5">
              <button 
                onClick={() => router.push("/patients")} 
                className="w-9 h-9 md:w-11 md:h-11 rounded-xl md:rounded-2xl bg-[var(--foreground)]/5 border border-[var(--border)] flex items-center justify-center hover:bg-[var(--foreground)]/10 hover:scale-105 transition-all active:scale-95 group shrink-0"
              >
                <ChevronLeft className="w-4 h-4 md:w-5 md:h-5 rotate-180 group-hover:-translate-x-0.5 transition-transform" />
              </button>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h1 className="text-lg md:text-2xl font-black tracking-tight leading-tight text-slate-900 truncate">{patientName}</h1>
                  <span className={`px-1.5 py-0.5 md:px-2.5 md:py-1 rounded-full text-[7px] md:text-[9px] font-black uppercase tracking-widest shrink-0 ${
                    patient.status === 'active' ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-500/10 text-slate-500"
                  }`}>
                    {patient.status === 'active' ? 'פעיל' : 'בטיפול'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[8px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  <span className="text-emerald-600/80 truncate max-w-[120px] md:max-w-none">{fullGroupName}</span>
                  <span className="w-0.5 h-0.5 rounded-full bg-slate-200" />
                  <span className="shrink-0">{patient.idNumber}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto p-4 md:p-8">
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 mb-8">
             {[
               { label: "נוכחות החודש", value: `${attendance.filter(a => a.status === 'present').length}`, icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-50" },
               { label: "ימי היעדרות", value: `${attendance.filter(a => a.status === 'absent').length}`, icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-50" },
               { label: "תאריך הצטרפות", value: patient.startDate ? format(new Date(patient.startDate), "dd/MM/yy") : "—", icon: Calendar, color: "text-indigo-500", bg: "bg-indigo-50" },
               { label: "סטטוס שיקומי", value: patient.rehabPlanCompleted ? "בתהליך" : "התחלתי", icon: Shield, color: "text-blue-500", bg: "bg-blue-50" },
             ].map((stat, i) => (
               <div key={i} className="bg-[var(--card-bg)] border border-[var(--border)] p-4 md:p-5 rounded-2xl md:rounded-[2rem] hover:border-[var(--foreground)]/20 transition-all group shadow-sm">
                 <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center mb-3 md:mb-4 group-hover:scale-110 transition-transform`}>
                    <stat.icon className="w-4 h-4 md:w-5 md:h-5" />
                 </div>
                 <p className="text-[8px] md:text-[10px] font-black text-[var(--foreground)]/40 uppercase tracking-widest mb-0.5 md:mb-1">{stat.label}</p>
                 <p className="text-base md:text-xl font-black text-[var(--foreground)]">{stat.value}</p>
               </div>
             ))}
          </div>

          {/* ── Tabs ── */}
          <div className="flex bg-[var(--foreground)]/5 p-1.5 rounded-2xl border border-[var(--border)] mb-6 w-full md:w-fit overflow-x-auto no-scrollbar touch-pan-x gap-1">
             {[
               { id: "overview", label: "סקירה", icon: Info },
               { id: "attendance", label: "נוכחות", icon: History },
               { id: "messages", label: "הודעות", icon: MessageCircle },
               { id: "reports", label: "אישורים", icon: FileText },
             ].map((tab) => (
               <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2.5 md:px-5 md:py-2.5 rounded-xl md:rounded-2xl text-xs font-black transition-all whitespace-nowrap border cursor-pointer select-none ${
                  activeTab === tab.id 
                    ? "bg-[var(--card-bg)] text-emerald-600 border-[var(--border)] shadow-sm" 
                    : "bg-transparent text-[var(--foreground)]/50 hover:text-[var(--foreground)] border-transparent"
                }`}
               >
                 <tab.icon className="w-4 h-4 md:w-3.5 md:h-3.5 shrink-0" />
                 <span className="hidden sm:inline">{tab.label}</span>
               </button>
             ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "overview" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="overview" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                 
                 {/* Left Column: Personal & Contact (Upgraded Inline Form with Silent Auto-save) */}
                 <div className="lg:col-span-8 bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] p-6 md:p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-1.5 h-5 md:w-2 md:h-6 bg-emerald-500 rounded-full" />
                      <h3 className="text-base md:text-lg font-black text-slate-800">פרטי משתתף ועריכה</h3>
                    </div>
                    <PatientForm
                      patientId={patient.id}
                      initialData={patient}
                      onSuccess={fetchPatientData}
                    />
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
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="attendance" className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden">
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
                className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl md:rounded-[2.5rem] shadow-sm flex flex-col overflow-hidden"
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
                              ? "bg-[var(--primary)] text-white rounded-br-none"
                              : isParticipant
                                ? "bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-bl-none"
                                : "bg-teal-500/15 border border-teal-500/20 text-teal-600 dark:text-teal-400 rounded-bl-none"
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
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="reports" className="space-y-5">
                
                {/* Document Requests Section */}
                <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-3xl p-5 shadow-sm">
                   <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-black leading-tight text-slate-900">בקשות להנפקת דוחות</h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">בקשות הממתינות לטיפול עבור המשתתף</p>
                      </div>
                   </div>

                   <div className="space-y-2.5">
                      {docRequests.filter(r => r.status === 'pending').length === 0 ? (
                        <div className="py-6 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
                          <p className="text-[10px] text-slate-400 font-bold italic">אין בקשות פתוחות כרגע</p>
                        </div>
                      ) : (
                        docRequests.filter(r => r.status === 'pending').map((req) => (
                           <div key={req.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-amber-50/20 border border-amber-500/10 rounded-2xl gap-3">
                              <div className="flex items-start gap-3">
                                 <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0 mt-0.5">
                                   {req.type === 'stay' ? <Shield className="w-4 h-4" /> : req.type === 'attendance' ? <Printer className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                 </div>
                                 <div>
                                   <p className="text-xs font-black text-slate-900">
                                     {req.type === 'stay' ? 'אישור שהייה' : req.type === 'attendance' ? `דו״ח נוכחות חודשי - ${req.month}` : (req.customType || 'בקשה מיוחדת')}
                                   </p>
                                   <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                                     התבקש ב-{req.createdAt?.toDate ? format(req.createdAt.toDate(), "dd/MM/yyyy HH:mm") : "עכשיו"}
                                   </p>
                                   {req.notes && (
                                     <p className="text-[11px] text-amber-800 bg-amber-500/5 border border-amber-500/10 rounded-xl p-2.5 mt-2 font-medium leading-relaxed">
                                        הערת משתתף: {req.notes}
                                     </p>
                                   )}
                                 </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-end md:self-center">
                                 {req.type !== 'custom' && (
                                    <button 
                                      onClick={() => handleProcessRequest(req)}
                                      disabled={reportLoading}
                                      className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                                    >
                                      {reportLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                      הפק אוטומטית
                                    </button>
                                 )}
                                 
                                 <label className="flex items-center gap-1.5 bg-emerald-500 text-white px-3.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all hover:bg-emerald-600 active:scale-95 cursor-pointer shadow-sm">
                                    <Upload className="w-3 h-3" />
                                    העלה קובץ ידנית
                                    <input 
                                      type="file"
                                      accept="application/pdf,image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleUploadCustomDoc(req, file);
                                      }}
                                    />
                                 </label>
                              </div>
                           </div>
                         ))
                      )}
                   </div>
                </div>

                {/* Manual Generation Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                   {/* Stay Certificate */}
                   <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-3xl shadow-sm hover:border-emerald-500/40 transition-all group flex flex-col justify-between min-h-[160px]">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                             <Printer className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-800">הנפקת אישור שהייה</h4>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">אישור רשמי ופרטי התוכנית</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
                          הפקת מסמך רשמי המאשר את חברות המשתתף בתוכנית וזמני הגעתו לחווה.
                        </p>
                      </div>
                      <button 
                        onClick={() => generateReport('participation')}
                        disabled={reportLoading}
                        className="w-full bg-emerald-500 text-white py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:bg-emerald-600 shadow-sm active:scale-[0.98] flex items-center justify-center gap-1.5 mt-auto"
                      >
                        {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        הורד אישור שהייה
                      </button>
                   </div>

                   {/* Monthly Attendance Certificate */}
                   <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-3xl shadow-sm hover:border-sky-500/40 transition-all group flex flex-col justify-between min-h-[160px]">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                             <Shield className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-800">אישור נוכחות חודשי</h4>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">פירוט ימי הגעה בפועל</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
                          הפקת מכתב מפורט הכולל את רשימת ימי ההגעה המדויקים בפועל של המשתתף בחודש שנבחר.
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-auto w-full">
                         <div className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shrink-0">
                           <select 
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                            className="bg-transparent border-none text-[11px] font-bold outline-none cursor-pointer text-slate-700"
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
                          onClick={() => generateReport('travel')}
                          disabled={reportLoading}
                          className="flex-1 bg-sky-500 text-white py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:bg-sky-600 shadow-sm active:scale-[0.98] flex items-center justify-center gap-1.5"
                         >
                          {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          הפק אישור
                         </button>
                      </div>
                   </div>
                </div>

                {/* History Section */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                   <h3 className="text-xs font-black mb-3">מסמכים שהונפקו לאחרונה</h3>
                   <div className="space-y-2">
                      {processedDocs.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic text-center py-4">טרם הונפקו מסמכים למשתתף זה</p>
                      ) : (
                        processedDocs.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100/80">
                             <div className="flex items-center gap-2.5">
                                <FileText className="w-3.5 h-3.5 text-slate-400" />
                                <div>
                                   <p className="text-xs font-black text-slate-800">{doc.title}</p>
                                   <p className="text-[9px] text-slate-400 font-bold">
                                     הונפק ב-{doc.createdAt?.toDate ? format(doc.createdAt.toDate(), "dd/MM/yyyy") : "—"}
                                   </p>
                                </div>
                             </div>
                             <span className="text-[8px] font-black uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">נשלח למשתתף</span>
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
            width: "794px", height: "1123px", position: "relative", backgroundColor: "#ffffff",
            color: "#000000", fontFamily: "Arial, sans-serif", lineHeight: 1.6, direction: "rtl"
          }}>
            {/* Background Logo Page */}
            <img
              src="/logopage.png"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                zIndex: 0
              }}
            />

            {/* Content Overlay */}
            <div style={{
              position: "relative",
              zIndex: 1,
              paddingTop: "180px",
              paddingBottom: "120px",
              paddingLeft: "75px",
              paddingRight: "75px"
            }}>
              {activeReportType === 'participation' ? (
                /* Stay / Participation Certificate */
                <div>
                  {/* Document Meta */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", fontSize: "14px", color: "#64748b", fontWeight: 700 }}>
                    <div>תאריך: {format(new Date(), "dd.MM.yyyy")}</div>
                    <div>סימוכין: {patient.id?.slice(-6).toUpperCase()}</div>
                  </div>

                  {/* Recipient */}
                  <div style={{ fontSize: "16px", marginBottom: "24px", fontWeight: 700 }}>
                    עבור: {recipientText}
                  </div>

                  {/* Title */}
                  <div style={{ textAlign: "center", marginBottom: "32px" }}>
                    <h3 style={{ fontSize: "26px", fontWeight: 900, margin: "0 0 8px 0", color: "#1e293b" }}>אישור שהייה בחווה שיקומית</h3>
                  </div>

                  {/* Body */}
                  <div style={{ fontSize: "16px", color: "#000000" }}>
                    <p style={{ marginBottom: "16px" }}>הנדון: <strong>{patientName}</strong></p>
                    <p style={{ marginBottom: "24px" }}>ת.ז: <strong>{patient.idNumber || "—"}</strong></p>
                    
                    <p style={{ marginBottom: "20px", lineHeight: 1.8 }}>
                      הרינו לאשר כי החל בהגעה לחווה מהתאריך <strong>{patient.startDate ? format(parseISO(patient.startDate), "dd.MM.yyyy") : "—"}</strong>.
                    </p>
                    <p style={{ marginBottom: "20px", lineHeight: 1.8 }}>
                      הפעילות בחווה בתוכנית חרבות ברזל מתקיימת {getProgramDaysText("בימים ב' ג' וד'")} בין השעות 9:00-15:00.
                    </p>
                    <p style={{ marginBottom: "36px", lineHeight: 1.8 }}>
                      הפעילויות השונות המתקיימות בחווה: עבודה חקלאית, גילוף בעץ ומלאכות קדומות, דיקור, יוגה, סדנאות שונות ושיחות קבוצתיות.
                    </p>

                    <p style={{ marginTop: "40px", marginBottom: "8px" }}>בברכה,</p>
                    
                    {/* Signature Area */}
                    {signatureImage ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                        <img 
                          src={signatureImage} 
                          alt="חתימה דיגיטלית" 
                          style={{ maxHeight: "64px", maxWidth: "160px", objectFit: "contain", alignSelf: "flex-start" }} 
                        />
                        <p style={{ fontWeight: 900, margin: "4px 0 2px 0", fontSize: "14px" }}>{authUser?.displayName || "מורשה חתימה"}</p>
                        <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{signatureTitle || "עו\"ס בחווה"}</p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                        <div style={{ height: "48px", borderBottom: "1px dashed #cbd5e1", width: "160px", marginBottom: "8px" }} />
                        <p style={{ fontWeight: 900, margin: "4px 0 2px 0", fontSize: "14px" }}>{authUser?.displayName || "מורשה חתימה"}</p>
                        <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{signatureTitle || "עו\"ס בחווה"}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeReportType === 'travel' ? (
                /* Monthly Attendance/Travel Reimbursement Certificate */
                <div style={{
                  paddingTop: "20px",
                  paddingBottom: "20px",
                  paddingLeft: "25px",
                  paddingRight: "25px",
                  fontSize: "16px",
                  color: "#000000",
                  fontFamily: "Arial, sans-serif",
                  lineHeight: "1.8",
                  direction: "rtl",
                  textAlign: "right"
                }}>
                  {/* Date of letter */}
                  <div style={{ textAlign: "left", marginBottom: "40px", fontWeight: "bold" }}>
                    {travelLetterDate}
                  </div>

                  {/* Empty Line */}
                  <div style={{ height: "20px" }} />

                  {/* Document Title */}
                  <div style={{ textAlign: "center", marginBottom: "40px" }}>
                    <h3 style={{ fontSize: "20px", fontWeight: "bold", margin: 0 }}>החזר נסיעות חודשי</h3>
                  </div>

                  {/* Empty Line */}
                  <div style={{ height: "20px" }} />

                  {/* Recipient */}
                  <div style={{ fontWeight: "bold", marginBottom: "30px" }}>
                    עבור משרד הביטחון - אגף השיקום
                  </div>

                  {/* Subject */}
                  <div style={{ fontWeight: "bold", marginBottom: "15px" }}>
                    הנדון: <strong style={{ fontWeight: "bold" }}>{travelFirstName} {travelLastName}</strong>
                  </div>

                  {/* ID */}
                  <div style={{ fontWeight: "bold", marginBottom: "40px" }}>
                    ת.ז: <strong style={{ fontWeight: "bold" }}>{travelIdNumber}</strong>
                  </div>

                  {/* Empty Line */}
                  <div style={{ height: "20px" }} />

                  {/* Body Paragraphs */}
                  <p style={{ marginBottom: "24px" }}>
                    הרינו לאשר כי קיבל אישור להגעה לחווה מהתאריך <strong style={{ fontWeight: "bold" }}>{travelApprovalStartDate}</strong>
                  </p>

                  <p style={{ marginBottom: "24px" }}>
                    הפעילות בחווה בתוכנית <strong style={{ fontWeight: "bold" }}>{travelProgramName}</strong> מתקיימת בימי <strong style={{ fontWeight: "bold" }}>{travelActivityDays}</strong> .
                  </p>

                  <p style={{ marginBottom: "24px" }}>
                    הפעילויות השונות המתקיימות בחווה: עבודה חקלאית, גילוף בעץ ומלאכות קדומות, דיקור, יוגה, סדנאות שונות ושיחות קבוצתיות.
                  </p>

                  <p style={{ marginBottom: "50px" }}>
                    הנ"ל מבקש החזר נסיעות עבור ההגעה לחווה
                    <br />
                    בתאריכים: <strong style={{ fontWeight: "bold", textDecoration: "underline" }}>{getTravelAttendanceDates()}</strong>
                  </p>

                  {/* Signature */}
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "flex-end", 
                    marginTop: "40px" 
                  }}>
                    <div style={{ 
                      fontSize: "16px", 
                      textAlign: "right", 
                      width: "220px" 
                    }}>
                      <p style={{ margin: "0 0 10px 0" }}>בברכה,</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <p style={{ fontWeight: "bold", margin: 0 }}>{travelSignatoryName}</p>
                        <p style={{ margin: 0 }}>{travelSignatoryTitle}</p>
                        <p style={{ margin: 0 }}>{travelSignatoryOrg}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Attendance Report - Fallback */
                <div>
                  {/* Document Meta */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", fontSize: "14px", color: "#64748b", fontWeight: 700 }}>
                    <div>תאריך: {format(new Date(), "EEEE d MMMM yyyy", { locale: he })}</div>
                    <div>סימוכין: {patient.id?.slice(-6).toUpperCase()}</div>
                  </div>

                  {/* Recipient */}
                  <div style={{ fontSize: "16px", marginBottom: "24px", fontWeight: 700 }}>
                    עבור: {recipientText}
                  </div>

                  {/* Title */}
                  <div style={{ textAlign: "center", marginBottom: "32px" }}>
                    <h3 style={{ fontSize: "26px", fontWeight: 900, margin: "0 0 8px 0", color: "#1e293b" }}>
                      {(() => {
                        const [year, month] = selectedMonth.split("-");
                        const months = [
                          "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
                          "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
                        ];
                        return `אישור נוכחות בחוות רום לחודש ${months[parseInt(month) - 1]} שנה ${year}`;
                      })()}
                    </h3>
                  </div>

                  {/* Body */}
                  <div style={{ fontSize: "16px", color: "#000000" }}>
                    <p style={{ marginBottom: "16px" }}>הנדון: <strong>{patientName}</strong></p>
                    <p style={{ marginBottom: "24px" }}>ת.ז: <strong>{patient.idNumber || "—"}</strong></p>
                    
                    <p style={{ marginBottom: "20px", lineHeight: 1.8 }}>
                      הרינו לאשר כי קיבל אישור להגעה לחווה החל התאריך: <strong>{patient.startDate ? format(parseISO(patient.startDate), "dd.MM.yyyy") : "—"}</strong>.
                    </p>
                    <p style={{ marginBottom: "20px", lineHeight: 1.8 }}>
                      הפעילות בחווה בתוכנית <strong>{programs.find(p => p.id === (patient as any).programId)?.name || "חוסן"}</strong> מתקיימת {getProgramDaysText("בימי ראשון")}.
                    </p>

                    {(() => {
                      const arrivedDates = attendance
                        .filter(h => h.date.startsWith(selectedMonth) && h.status === 'present')
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map(h => format(parseISO(h.date), "dd/MM/yyyy"));
                      const totalDays = arrivedDates.length;
                      const datesStr = arrivedDates.length > 0 ? arrivedDates.join(", ") : "אין ימי נוכחות בחודש זה";
                      return (
                        <div style={{ marginTop: "24px" }}>
                          <p style={{ marginBottom: "8px" }}>להלן תאריכי ההגעה בחודש זה :</p>
                          <p style={{ fontWeight: 700, color: "#0369a1", marginBottom: "12px", direction: "ltr", textAlign: "right" }}>
                            {datesStr}
                          </p>
                          <p style={{ marginBottom: "36px", lineHeight: 1.8 }}>
                            סה״כ {totalDays} ימי נוכחות
                          </p>
                        </div>
                      );
                    })()}

                    <p style={{ marginTop: "40px", marginBottom: "8px" }}>בברכה,</p>
                    
                    {/* Signature Area */}
                    {signatureImage ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                        <img 
                          src={signatureImage} 
                          alt="חתימה דיגיטלית" 
                          style={{ maxHeight: "64px", maxWidth: "160px", objectFit: "contain", alignSelf: "flex-start" }} 
                        />
                        <p style={{ fontWeight: 900, margin: "4px 0 2px 0", fontSize: "14px" }}>{authUser?.displayName || "מורשה חתימה"}</p>
                        <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{signatureTitle || "עו\"ס בחווה"}</p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                        <div style={{ height: "48px", borderBottom: "1px dashed #cbd5e1", width: "160px", marginBottom: "8px" }} />
                        <p style={{ fontWeight: 900, margin: "4px 0 2px 0", fontSize: "14px" }}>{authUser?.displayName || "מורשה חתימה"}</p>
                        <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{signatureTitle || "עו\"ס בחווה"}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recipient Customization Modal */}
        <AnimatePresence>
          {showRecipientModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowRecipientModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl overflow-hidden p-8 z-10"
                dir="rtl"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">
                        {pendingReportType === 'participation' ? 'התאמת אישור שהייה' : 'התאמת אישור נוכחות חודשי'}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        התאמת שדה הנמען לפני הנפקת המסמך
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowRecipientModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-xl transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">עבור (נמען):</label>
                    <input
                      type="text"
                      value={recipientText}
                      onChange={(e) => setRecipientText(e.target.value)}
                      placeholder="לדוגמה: עו״ס אגף השיקום משרד הביטחון"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-emerald-500 transition-all font-bold"
                    />
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      onClick={executePDFGeneration}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      הפק אישור
                    </button>
                    <button
                      onClick={() => setShowRecipientModal(false)}
                      className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Travel Reimbursement Modal */}
        <AnimatePresence>
          {showTravelModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowTravelModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl overflow-hidden p-8 z-10 my-8"
                dir="rtl"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">
                        הפקת מכתב החזר נסיעות חודשי
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-bold">
                        מלא או ערוך את פרטי המטופל לפני הפקת המכתב (לא יישמר בדאטהבייס)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowTravelModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-xl transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto px-1 scrollbar-thin">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">תאריך המכתב:</label>
                      <input
                        type="text"
                        value={travelLetterDate}
                        onChange={(e) => setTravelLetterDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שם פרטי:</label>
                      <input
                        type="text"
                        value={travelFirstName}
                        onChange={(e) => setTravelFirstName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שם משפחה:</label>
                      <input
                        type="text"
                        value={travelLastName}
                        onChange={(e) => setTravelLastName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">תעודת זהות:</label>
                      <input
                        type="text"
                        value={travelIdNumber}
                        onChange={(e) => setTravelIdNumber(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">אישור הגעה מהתאריך:</label>
                      <input
                        type="text"
                        value={travelApprovalStartDate}
                        onChange={(e) => setTravelApprovalStartDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שם התוכנית:</label>
                      <input
                        type="text"
                        value={travelProgramName}
                        onChange={(e) => setTravelProgramName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">ימי פעילות בחווה:</label>
                      <input
                        type="text"
                        value={travelActivityDays}
                        onChange={(e) => setTravelActivityDays(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">תאריכי הגעה בחודש:</label>
                      <input
                        type="text"
                        value={travelAttendanceDatesStr}
                        onChange={(e) => setTravelAttendanceDatesStr(e.target.value)}
                        placeholder="לדוגמה: 13-15-20-29 אפריל 2026"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4 mt-2">
                    <h4 className="text-[11px] font-black uppercase text-slate-900 mb-2">פרטי חתימה</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400">שם מורשה חתימה:</label>
                        <input
                          type="text"
                          value={travelSignatoryName}
                          onChange={(e) => setTravelSignatoryName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400">תפקיד:</label>
                        <input
                          type="text"
                          value={travelSignatoryTitle}
                          onChange={(e) => setTravelSignatoryTitle(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400">ארגון:</label>
                        <input
                          type="text"
                          value={travelSignatoryOrg}
                          onChange={(e) => setTravelSignatoryOrg(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 flex gap-3">
                  <button
                    onClick={executeTravelPDFGeneration}
                    className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    הפק אישור נסיעות
                  </button>
                  <button
                    onClick={() => setShowTravelModal(false)}
                    className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    ביטול
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>


      </div>
    </RoleGuard>
  );
}
