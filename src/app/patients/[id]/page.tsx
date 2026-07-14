"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PatientForm } from "@/components/patients/PatientForm";
import { useState, useEffect, useRef } from "react";
import { db, storage } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  doc, getDoc, collection, query, where, orderBy, getDocs, limit, updateDoc, serverTimestamp, setDoc, deleteDoc, addDoc,
} from "firebase/firestore";
import {
  Calendar, Loader2, Shield,
  Edit3, CheckCircle,
  AlertCircle, ChevronLeft, ChevronRight, ChevronDown, Printer, Download, FileText,
  X, Check, Info, History, Users, User, Layers, Briefcase,
  ClipboardCheck, Plus, Search, Circle, Trash2, Mail, Phone,
  CarFront, CarTaxiFront, Sparkles, ArrowLeft,
} from "lucide-react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format, subMonths, addMonths, differenceInCalendarDays, parseISO, isValid } from "date-fns";
import { he } from "date-fns/locale";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { generateStayCertificateWord, generateTravelReimbursementWord, generateAttendanceReportWord, generatePeriodicReportWord, downloadDocx, generateDocxWithLetterhead, generateDocxBlobWithLetterhead, generateFunctionalReportWord, generateRehabPlanWord, RehabPlanData } from "@/lib/word-generator";
import { Packer } from "docx";
import { ParticipantProfile, EMPTY_PROFILE } from "@/lib/participantProfile";
import { composeFunctionalSections, composePeriodicSections, composeRehabPlanSections, PeriodicReportType } from "@/lib/reportContent";
import { ParticipantSurveyStep } from "@/components/patients/ParticipantSurveyStep";

const monthNamesHebrew = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
];

interface RehabWorker {
  id: string;
  name: string;
  email: string;
  phone: string;
  district?: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  hosenType?: string;
  status: string;
  assignedWorkerId?: string;
  rehabWorkerId?: string;
  startDate?: string;
  endDate?: string;
  phone?: string;
  email?: string;
  fullName?: string;
  rehabPlanCompleted?: boolean;
  confidentialityWaiverCompleted?: boolean;
  personalDetailsFormCompleted?: boolean;
  arrivalMethod?: "private_car" | "taxi";
  extensionSent?: boolean;
  extensionSentAt?: string;
  extensionReceived?: boolean;
  extensionReceivedAt?: string;
  summaryReportCompleted?: boolean;
  programIds?: string[];
  programId?: string;
  groupIds?: string[];
  disabilityCommitteeDate?: string;
  disabilityCommitteePassed?: boolean;
}

interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

interface PatientTask {
  id: string;
  userId: string;
  title: string;
  completed: boolean;
  patientId?: string | null;
  dueDate?: string | null;
  createdAt: any;
  taskType?: "text" | "checklist";
  subtasks?: SubTask[];
}

interface Group { id: string; name: string }
interface Attendance { id: string; date: string; status: "present" | "absent" | "late" }

const REHAB_PLAN_SECTION_HEADERS = {
  areas: 'א. באילו תחומים בחייך היית מעוניין לראות שיפור? ציין את התחומים על פי סדר החשיבות:',
  goal: 'ב. הגדר את המטרה באופן ספציפי וברור:',
  ways: 'ג. דרכים אפשריות להשגת המטרה (בדגש החווה):',
  supports: 'ד. מקורות סיוע להשגת המטרה - מה או מי יכול לסייע?',
};

function serializePlanData(planData: RehabPlanData): string {
  const areasBlock = planData.areasOfImprovement.length > 0
    ? planData.areasOfImprovement.map((a, idx) => `${idx + 1}. ${a}`).join("\n")
    : "";
  const waysBlock = planData.waysToAchieve.join("\n");
  const supportsBlock = planData.sourcesOfSupport.join("\n");

  return [
    REHAB_PLAN_SECTION_HEADERS.areas,
    areasBlock,
    "",
    REHAB_PLAN_SECTION_HEADERS.goal,
    planData.specificGoal,
    "",
    REHAB_PLAN_SECTION_HEADERS.ways,
    waysBlock,
    "",
    REHAB_PLAN_SECTION_HEADERS.supports,
    supportsBlock,
  ].join("\n");
}

function deserializePlanData(text: string): RehabPlanData {
  const headers = REHAB_PLAN_SECTION_HEADERS;
  const order: (keyof typeof headers)[] = ["areas", "goal", "ways", "supports"];

  const positions = order.map((key) => ({ key, index: text.indexOf(headers[key]) }));

  const getSection = (key: keyof typeof headers): string => {
    const pos = positions.find((p) => p.key === key);
    if (!pos || pos.index === -1) return "";
    const start = pos.index + headers[key].length;
    const nextPositions = positions.filter((p) => p.index > pos.index && p.index !== -1);
    const end = nextPositions.length > 0 ? Math.min(...nextPositions.map((p) => p.index)) : text.length;
    return text.slice(start, end).trim();
  };

  const areasRaw = getSection("areas");
  const areasOfImprovement = areasRaw
    ? areasRaw.split("\n").map((l) => l.trim().replace(/^\d+\.\s*/, "")).filter(Boolean)
    : [];

  const specificGoal = getSection("goal");

  const waysRaw = getSection("ways");
  const waysToAchieve = waysRaw ? waysRaw.split("\n").map((l) => l.trim()).filter(Boolean) : [];

  const supportsRaw = getSection("supports");
  const sourcesOfSupport = supportsRaw ? supportsRaw.split("\n").map((l) => l.trim()).filter(Boolean) : [];

  return { areasOfImprovement, specificGoal, waysToAchieve, sourcesOfSupport };
}

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin, isManager, user: authUser, signatureTitle, signatureImage, role } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportRef = useRef<HTMLDivElement>(null);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const initialTab = (searchParams.get("tab") as "overview" | "attendance" | "certificates" | "reports" | "tasks") || "overview";
  const [activeTab, setActiveTab] = useState<"overview" | "attendance" | "certificates" | "reports" | "tasks">(initialTab);
  const [participantUid, setParticipantUid] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [programs, setPrograms] = useState<{ 
    id: string; 
    name: string; 
    activeDays?: number[]; 
    activityHours?: string;
    participationActivityDetail?: string;
    travelActivityDetail?: string;
  }[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingExt, setSavingExt] = useState<string | null>(null);
  const [editingEndDate, setEditingEndDate] = useState(false);
  const [editEndDateVal, setEditEndDateVal] = useState("");
  const [socialWorkers, setSocialWorkers] = useState<{ id: string; name: string }[]>([]);
  const [rehabWorkers, setRehabWorkers] = useState<RehabWorker[]>([]);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [expandedAttendanceMonths, setExpandedAttendanceMonths] = useState<Record<string, boolean>>({});
  const [stayStep, setStayStep] = useState<"details" | "signatory" | "preview">("details");
  const [travelStep, setTravelStep] = useState<"details" | "signatory" | "preview">("details");

  // Side navigation between filtered patients (carried over from /patients list)
  const [navList, setNavList] = useState<{ id: string; firstName?: string; lastName?: string; status?: string }[]>([]);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("hosen_patients_nav_list");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setNavList(parsed);
      }
    } catch {}

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowTravelModal(false);
        setShowStayModal(false);
        setShowPeriodicModal(false);
        setShowFunctionalModal(false);
        setShowRehabPlanModal(false);
        setIsTaskModalOpen(false);
        setShowRecipientModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (role === "logistics" && activeTab !== "attendance" && activeTab !== "certificates") {
      setActiveTab("certificates");
    }
  }, [role, activeTab]);

  // Recipient and PDF modal states
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [recipientText, setRecipientText] = useState("עו״ס אגף השיקום משרד הביטחון");
  const [travelRecipient, setTravelRecipient] = useState("עבור משרד הביטחון - אגף השיקום");
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
  const [travelSelectedMonths, setTravelSelectedMonths] = useState<string[]>([]);

  // Enriched parameters for travel reimbursement
  const [travelTransportationMethod, setTravelTransportationMethod] = useState("רכב פרטי / תחבורה ציבורית");
  const [travelTotalDays, setTravelTotalDays] = useState("");
  const [travelActivityHours, setTravelActivityHours] = useState("9:00-15:00");

  // Stay certificate specific states (Transient, not saved to DB)
  const [showStayModal, setShowStayModal] = useState(false);
  const [stayLetterDate, setStayLetterDate] = useState("");
  const [stayRecipient, setStayRecipient] = useState("עו״ס אגף השיקום משרד הביטחון");
  const [stayFirstName, setStayFirstName] = useState("");
  const [stayLastName, setStayLastName] = useState("");
  const [stayIdNumber, setStayIdNumber] = useState("");
  const [stayStartDate, setStayStartDate] = useState("");
  const [stayProgramName, setStayProgramName] = useState("חרבות ברזל");
  const [stayActivityDays, setStayActivityDays] = useState("בימים ב' ג' וד'");
  const [stayActivityHours, setStayActivityHours] = useState("9:00-15:00");
  const [staySignatoryName, setStaySignatoryName] = useState("מירב סארמילי");
  const [staySignatoryTitle, setStaySignatoryTitle] = useState("מנהלת תפעול מרכז חוסן");
  const [staySignatoryOrg, setStaySignatoryOrg] = useState("חוות רום");

  // Enriched parameters for stay certificate
  const [stayProgramTrack, setStayProgramTrack] = useState("שיקום תעסוקתי");
  const [stayFundingSource, setStayFundingSource] = useState("משרד הביטחון / סל שיקום");
  const [staySpecialRemarks, setStaySpecialRemarks] = useState("");

  const [reportSettings, setReportSettings] = useState<{
    participationActivityDetail?: string;
    travelActivityDetail?: string;
    logoHeaderUrl?: string;
    logoFooterUrl?: string;
  } | null>(null);

  // Periodic report specific states (Transient, not saved to DB)
  const [showPeriodicModal, setShowPeriodicModal] = useState(false);
  const [periodicStep, setPeriodicStep] = useState<"survey" | "form" | "preview">("survey");
  const [periodicReportType, setPeriodicReportType] = useState<"דו\"ח השמה" | "דו\"ח עזיבה" | "דו\"ח חצי שנתי" | "דו\"ח סיכום תקופה" | "בקשה להארכה">("דו\"ח השמה");
  const [periodicLetterDate, setPeriodicLetterDate] = useState("");
  const [periodicIdNumber, setPeriodicIdNumber] = useState("");
  const [periodicRecipient, setPeriodicRecipient] = useState("אגף שיקום נכים משרד הביטחון");
  const [periodicRehabWorker, setPeriodicRehabWorker] = useState("");
  const [periodicRehabDistrict, setPeriodicRehabDistrict] = useState("טבריה");
  const [periodicPeriodStart, setPeriodicPeriodStart] = useState("");
  const [periodicPeriodEnd, setPeriodicPeriodEnd] = useState("");
  const [periodicRehabDescription, setPeriodicRehabDescription] = useState("");
  const [periodicPlacementLocation, setPeriodicPlacementLocation] = useState("חוות רום - מרכז חוסן.");
  const [periodicWorkDays, setPeriodicWorkDays] = useState("ב', ג', ד'");
  const [periodicWorkHours, setPeriodicWorkHours] = useState("מ 9:00 עד 15:00");
  const [periodicSummaryProcess, setPeriodicSummaryProcess] = useState("");
  const [periodicRecommendations, setPeriodicRecommendations] = useState("");
  const [periodicFarmSocialWorker, setPeriodicFarmSocialWorker] = useState("");

  // Enriched parameters for periodic report
  const [periodicProgressStatus, setPeriodicProgressStatus] = useState("התקדמות טובה והשתלבות חיובית");
  const [periodicCooperationLevel, setPeriodicCooperationLevel] = useState("מלא ורציף");
  const [periodicWorkshopPerformance, setPeriodicWorkshopPerformance] = useState("עבודה מעשית בחממה ובסדנאות יצירה");
  const [periodicNextPeriodGoal, setPeriodicNextPeriodGoal] = useState("שיפור מיומנויות תפקוד והתמדה רציפה");

  // Functional report specific states (Transient, not saved to DB)
  const [showFunctionalModal, setShowFunctionalModal] = useState(false);
  const [functionalLetterDate, setFunctionalLetterDate] = useState("");
  const [functionalRecipient, setFunctionalRecipient] = useState("עבור משרד הביטחון - אגף השיקום");
  const [functionalSignatoryName, setFunctionalSignatoryName] = useState("מירב סארמילי");
  const [functionalSignatoryTitle, setFunctionalSignatoryTitle] = useState("מנהלת תפעול מרכז חוסן");
  const [functionalSignatoryOrg, setFunctionalSignatoryOrg] = useState("חוות רום");
  const [functionalTextArea, setFunctionalTextArea] = useState("");
  const [symptomsTextArea, setSymptomsTextArea] = useState("");
  const [familyTextArea, setFamilyTextArea] = useState("");
  const [progressTextArea, setProgressTextArea] = useState("");
  const [recommendationsTextArea, setRecommendationsTextArea] = useState("");
  const [functionalFreeText, setFunctionalFreeText] = useState("");

  // Pre-evaluation survey step & shared participant profile (reused across functional / periodic / rehab-plan wizards)
  const [functionalStep, setFunctionalStep] = useState<"survey" | "editor">("survey");
  const [profile, setProfile] = useState<ParticipantProfile>(EMPTY_PROFILE);

  // Rehab plan specific states (Transient, not saved to DB)
  const [showRehabPlanModal, setShowRehabPlanModal] = useState(false);
  const [rehabPlanStep, setRehabPlanStep] = useState<"survey" | "editor">("survey");
  const [rehabPlanDate, setRehabPlanDate] = useState("");
  const [rehabPlanTherapistName, setRehabPlanTherapistName] = useState("");
  const [rehabPlanTherapistTitle, setRehabPlanTherapistTitle] = useState("");
  const [rehabPlanDistrictWorker, setRehabPlanDistrictWorker] = useState("");
  const [rehabPlanEditableText, setRehabPlanEditableText] = useState("");

  // Task states
  const [tasks, setTasks] = useState<PatientTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PatientTask | null>(null);
  
  // Task form states
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskType, setTaskType] = useState<"text" | "checklist">("text");
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  // Task Filter/Search states
  const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "completed">("all");
  const [taskSearchTerm, setTaskSearchTerm] = useState("");

  const getProgramDaysText = (defaultText: string) => {
    const pIds = patient?.programIds || (patient?.programId ? [patient.programId] : []);
    const patientProgs = programs.filter(p => pIds.includes(p.id));
    const allActiveDays = Array.from(new Set(patientProgs.flatMap(p => p.activeDays || []))).sort((a, b) => a - b);
    
    if (allActiveDays.length === 0) {
      return defaultText;
    }

    const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    const mapped = allActiveDays.map(d => dayNames[d]);

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

  const updateTravelAttendanceDates = (monthsList: string[], currentAttendance = attendance) => {
    if (!monthsList || monthsList.length === 0) {
      setTravelAttendanceDatesStr("");
      return;
    }
    const sortedMonths = [...monthsList].sort();
    const lines = sortedMonths.map(mVal => {
      const monthlyPresence = currentAttendance
        .filter(h => h.date.startsWith(mVal) && h.status === 'present')
        .sort((a, b) => a.date.localeCompare(b.date));
      const dayNumbers = monthlyPresence.map(h => parseInt(h.date.split("-")[2], 10));
      const [yearStr, monthStr] = mVal.split("-");
      const monthName = monthNamesHebrew[parseInt(monthStr, 10) - 1];
      if (dayNumbers.length > 0) {
        return `${dayNumbers.join(",")} לחודש ${monthName} ${yearStr}`;
      } else {
        return `[הכנס תאריכים] לחודש ${monthName} ${yearStr}`;
      }
    });
    setTravelAttendanceDatesStr(lines.join("\n"));
  };

  useEffect(() => { if (id) fetchPatientData(); }, [id]);

  const fetchPatientData = async () => {
    try {
      const patientDoc = await getDoc(doc(db, "patients", id));
      if (!patientDoc.exists()) { router.push("/patients"); return; }
      setPatient({ id: patientDoc.id, ...patientDoc.data() } as Patient);

      const [groupsSnap, progsSnap, usersSnap, rehabWorkersSnap, settingsSnap] = await Promise.all([
        getDocs(collection(db, "groups")),
        getDocs(collection(db, "programs")),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "rehab_workers")),
        getDoc(doc(db, "settings", "reports"))
      ]);
      setGroups(groupsSnap.docs.map(d => ({ id: d.id, name: d.data().name } as Group)));
      setPrograms(progsSnap.docs.map(d => ({ 
        id: d.id, 
        name: d.data().name, 
        activeDays: d.data().activeDays,
        activityHours: d.data().activityHours,
        participationActivityDetail: d.data().participationActivityDetail,
        travelActivityDetail: d.data().travelActivityDetail,
      })));
      setSocialWorkers(usersSnap.docs.map(d => ({ id: d.id, name: d.data().displayName || d.data().name || d.data().email })));
      setRehabWorkers(rehabWorkersSnap.docs.map(d => ({ id: d.id, ...d.data() } as RehabWorker)));
      if (settingsSnap.exists()) {
        setReportSettings(settingsSnap.data());
      }

      const attQuery = query(
        collection(db, "attendance"),
        where("patientId", "==", id),
        orderBy("date", "desc"),
        limit(1000)
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

  const fetchPatientTasks = async () => {
    if (!id) return;
    setTasksLoading(true);
    try {
      const q = query(
        collection(db, "personal_tasks"),
        where("patientId", "==", id),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          title: data.title,
          completed: !!data.completed,
          patientId: data.patientId || null,
          dueDate: data.dueDate || null,
          createdAt: data.createdAt,
          taskType: data.taskType || "text",
          subtasks: data.subtasks || [],
        };
      });
      setTasks(list);
    } catch (err) {
      console.error("Error fetching patient tasks:", err);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchPatientTasks();
    }
  }, [id]);

  const handleSavePatientTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !authUser?.uid) return;
    setSavingTask(true);
    try {
      const isChecklist = taskType === "checklist";
      const finalCompleted = isChecklist
        ? (subtasks.length > 0 && subtasks.every(s => s.completed))
        : (editingTask ? editingTask.completed : false);

      if (editingTask) {
        // Edit existing
        await updateDoc(doc(db, "personal_tasks", editingTask.id), {
          title: taskTitle.trim(),
          dueDate: taskDueDate || null,
          taskType,
          subtasks: isChecklist ? subtasks : [],
          completed: finalCompleted,
          updatedAt: serverTimestamp(),
        });
        
        setTasks(prev => prev.map(t => t.id === editingTask.id ? {
          ...t,
          title: taskTitle.trim(),
          dueDate: taskDueDate || null,
          taskType,
          subtasks: isChecklist ? subtasks : [],
          completed: finalCompleted,
        } : t));
      } else {
        // Add new
        const docRef = await addDoc(collection(db, "personal_tasks"), {
          userId: authUser.uid,
          title: taskTitle.trim(),
          completed: finalCompleted,
          patientId: id || null,
          dueDate: taskDueDate || null,
          taskType,
          subtasks: isChecklist ? subtasks : [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const newTask = {
          id: docRef.id,
          userId: authUser.uid,
          title: taskTitle.trim(),
          completed: finalCompleted,
          patientId: id || null,
          dueDate: taskDueDate || null,
          taskType,
          subtasks: isChecklist ? subtasks : [],
          createdAt: new Date(),
        };

        setTasks(prev => [newTask, ...prev]);
      }

      setIsTaskModalOpen(false);
      setTaskTitle("");
      setTaskDueDate("");
      setTaskType("text");
      setSubtasks([]);
      setNewSubtaskTitle("");
      setEditingTask(null);
    } catch (err) {
      console.error("Error saving patient task:", err);
      alert("שגיאה בשמירת המשימה");
    } finally {
      setSavingTask(false);
    }
  };

  const handleTogglePatientTask = async (taskId: string, currentCompleted: boolean) => {
    try {
      const nextCompleted = !currentCompleted;
      const t = tasks.find(x => x.id === taskId);
      if (!t) return;

      let updatedSubtasks = t.subtasks || [];
      if (t.taskType === "checklist") {
        updatedSubtasks = updatedSubtasks.map(s => ({ ...s, completed: nextCompleted }));
      }

      await updateDoc(doc(db, "personal_tasks", taskId), {
        completed: nextCompleted,
        subtasks: updatedSubtasks,
        updatedAt: serverTimestamp()
      });

      setTasks(prev => prev.map(item => item.id === taskId ? { 
        ...item, 
        completed: nextCompleted,
        subtasks: updatedSubtasks 
      } : item));
    } catch (err) {
      console.error("Error toggling patient task:", err);
    }
  };

  const handleTogglePatientSubtask = async (taskId: string, subtaskId: string, currentSubtaskCompleted: boolean) => {
    try {
      const t = tasks.find(x => x.id === taskId);
      if (!t) return;

      const updatedSubtasks = (t.subtasks || []).map(s => 
        s.id === subtaskId ? { ...s, completed: !currentSubtaskCompleted } : s
      );

      const allCompleted = updatedSubtasks.length > 0 && updatedSubtasks.every(s => s.completed);

      await updateDoc(doc(db, "personal_tasks", taskId), {
        subtasks: updatedSubtasks,
        completed: allCompleted,
        updatedAt: serverTimestamp()
      });

      setTasks(prev => prev.map(item => item.id === taskId ? {
        ...item,
        subtasks: updatedSubtasks,
        completed: allCompleted
      } : item));
    } catch (err) {
      console.error("Error toggling patient subtask:", err);
    }
  };

  const handleDeletePatientTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, "personal_tasks", taskId));
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error("Error deleting patient task:", err);
    }
  };

  const initStayFields = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    setStayLetterDate(`${day}.${month}.${year}`);
    
    const assignedRehabWorker = rehabWorkers.find(w => w.id === patient?.rehabWorkerId);
    setStayRecipient(assignedRehabWorker ? `${assignedRehabWorker.name} - אגף השיקום משרד הביטחון` : "עו״ס אגף השיקום משרד הביטחון");
    setStayFirstName(patient?.firstName || "");
    setStayLastName(patient?.lastName || "");
    setStayIdNumber(patient?.idNumber || "");
    
    if (patient?.startDate) {
      try {
        const parsed = parseISO(patient.startDate);
        if (isValid(parsed)) {
          setStayStartDate(format(parsed, "dd.MM.yyyy"));
        } else {
          setStayStartDate(format(new Date(), "dd.MM.yyyy"));
        }
      } catch {
        setStayStartDate(format(new Date(), "dd.MM.yyyy"));
      }
    } else {
      setStayStartDate(format(new Date(), "dd.MM.yyyy"));
    }
    
    const pIds = patient?.programIds || (patient?.programId ? [patient.programId] : []);
    const patientProgs = programs.filter(p => pIds.includes(p.id));
    const combinedProgramName = patientProgs.map(p => p.name).join(" ו-") || "חרבות ברזל";
    const combinedHours = Array.from(new Set(patientProgs.map(p => p.activityHours).filter(Boolean))).join(", ") || "9:00-15:00";
    
    setStayProgramName(combinedProgramName);
    setStayActivityDays(getProgramDaysText("בימים ב' ג' וד'"));
    setStayActivityHours(combinedHours);
    
    setStaySignatoryName(authUser?.displayName || "מירב סארמילי");
    setStaySignatoryTitle(signatureTitle || "מנהלת תפעול מרכז חוסן");
    setStaySignatoryOrg("חוות רום");
    setStayProgramTrack("");
    setStayFundingSource("משרד הביטחון / סל שיקום");
    setStaySpecialRemarks("");
  };

  const executePDFGeneration = async () => {
    if (!patient) return;
    setShowRecipientModal(false);
    setReportLoading(true);
    
    try {
      const patientProgram = programs.find(p => p.id === (patient as any)?.programId);
      const docType = (pendingReportType === 'participation' || pendingReportType === 'stay') ? 'stay' : 'travel';
      const docTitle = docType === 'stay' ? 'אישור שהייה' : 'אישור נוכחות חודשי';
      const fileName = docType === 'stay' ? 'אישור_שהייה' : 'אישור_נוכחות_חודשי';

      // 1. Generate Word document dynamically
      let wordDoc;
      if (docType === 'stay') {
        wordDoc = generateStayCertificateWord({
          date: stayLetterDate,
          recipient: recipientText || stayRecipient,
          firstName: stayFirstName,
          lastName: stayLastName,
          idNumber: stayIdNumber,
          startDate: stayStartDate,
          programName: stayProgramName,
          activityDays: stayActivityDays,
          activityHours: stayActivityHours,
          activityDetailText: patientProgram?.participationActivityDetail || reportSettings?.participationActivityDetail,
          signatoryName: staySignatoryName,
          signatoryTitle: staySignatoryTitle,
          signatoryOrg: staySignatoryOrg,
          programTrack: stayProgramTrack,
          fundingSource: stayFundingSource,
          specialRemarks: staySpecialRemarks,
          logoHeaderData: undefined,
          logoFooterData: undefined
        });
      } else {
        wordDoc = generateTravelReimbursementWord({
          date: travelLetterDate,
          recipient: recipientText || travelRecipient,
          firstName: travelFirstName,
          lastName: travelLastName,
          idNumber: travelIdNumber,
          startDate: travelApprovalStartDate,
          programName: travelProgramName,
          activityDays: travelActivityDays,
          activityHours: travelActivityHours,
          attendanceDatesStr: travelAttendanceDatesStr,
          signatoryName: travelSignatoryName,
          signatoryTitle: travelSignatoryTitle,
          signatoryOrg: travelSignatoryOrg,
          activityDetailText: patientProgram?.travelActivityDetail || reportSettings?.travelActivityDetail,
          transportationMethod: travelTransportationMethod,
          totalDays: travelTotalDays || undefined,
          logoHeaderData: undefined,
          logoFooterData: undefined
        });
      }

      // 2. Generate Docx Blob with letterhead
      const docxBlob = await generateDocxBlobWithLetterhead(wordDoc);

      // 3. Convert to PDF using the local MS Word API
      const formData = new FormData();
      formData.append("file", docxBlob, `${fileName}.docx`);

      const response = await fetch("/api/convert-to-pdf", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Server failed to convert document");
      }

      const pdfBlob = await response.blob();

      // Download locally for the admin
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}_${patient.firstName}_${patient.lastName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // 4. Upload PDF to Storage
      let downloadUrl = "";
      try {
        const storageRef = ref(storage, `documents/${patient.id}/${Date.now()}_${docType}.pdf`);
        await uploadBytes(storageRef, pdfBlob, { contentType: "application/pdf" });
        downloadUrl = await getDownloadURL(storageRef);
      } catch (storageErr) {
        console.warn("Storage upload failed, fallback to offline link:", storageErr);
        downloadUrl = "#";
      }

      // 5. Register in Firestore
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
        console.error("Failed to register document in Firestore:", firestoreErr);
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

  function effectiveEndDate(p: Patient): Date | null {
    if (p.startDate) {
      try {
        const start = parseISO(p.startDate);
        if (isValid(start)) {
          const standard3m = addMonths(start, 3);
          const standard6m = addMonths(start, 6);
          let end = p.extensionReceived ? standard6m : standard3m;
          
          if (p.endDate) {
            const dbEnd = parseISO(p.endDate);
            if (isValid(dbEnd)) {
              const dbEndStr = format(dbEnd, "yyyy-MM-dd");
              const std3mStr = format(standard3m, "yyyy-MM-dd");
              const std6mStr = format(standard6m, "yyyy-MM-dd");
              if (dbEndStr !== std3mStr && dbEndStr !== std6mStr) {
                end = dbEnd;
              }
            }
          }
          return end;
        }
      } catch { return null; }
    }
    if (p.endDate) { try { const d = parseISO(p.endDate); return isValid(d) ? d : null; } catch { return null; } }
    return null;
  }

  async function toggleExtensionSent() {
    if (!patient) return;
    const next = !patient.extensionSent;
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, "patients", patient.id), {
        extensionSent: next,
        extensionSentAt: next ? now : null,
      });
      setPatient(p => p ? { ...p, extensionSent: next, extensionSentAt: next ? now : undefined } : p);
    } catch (e) { console.error(e); }
  }

  async function toggleExtensionReceived() {
    if (!patient) return;
    const next = !patient.extensionReceived;
    try {
      const start = patient.startDate ? parseISO(patient.startDate) : new Date();
      const newEnd = format(addMonths(start, next ? 6 : 3), "yyyy-MM-dd");
      const now = new Date().toISOString();
      await updateDoc(doc(db, "patients", patient.id), {
        extensionReceived: next, extensionReceivedAt: next ? now : null,
        endDate: newEnd,
      });
      setPatient(p => p ? { ...p, extensionReceived: next, extensionReceivedAt: next ? now : undefined, endDate: newEnd } : p);
    } catch (e) { console.error(e); }
  }

  async function toggleSummaryReportCompleted() {
    if (!patient) return;
    const next = !patient.summaryReportCompleted;
    try {
      await updateDoc(doc(db, "patients", patient.id), { summaryReportCompleted: next });
      setPatient(p => p ? { ...p, summaryReportCompleted: next } : p);
    } catch (e) { console.error(e); }
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

  async function toggleConfidentialityWaiver() {
    if (!patient) return;
    const next = !patient.confidentialityWaiverCompleted;
    try {
      await updateDoc(doc(db, "patients", patient.id), { confidentialityWaiverCompleted: next });
      setPatient(p => p ? { ...p, confidentialityWaiverCompleted: next } : p);
    } catch (e) { console.error(e); }
  }

  async function togglePersonalDetailsForm() {
    if (!patient) return;
    const next = !patient.personalDetailsFormCompleted;
    try {
      await updateDoc(doc(db, "patients", patient.id), { personalDetailsFormCompleted: next });
      setPatient(p => p ? { ...p, personalDetailsFormCompleted: next } : p);
    } catch (e) { console.error(e); }
  }

  async function setArrivalMethod(method: "private_car" | "taxi") {
    if (!patient) return;
    const next = patient.arrivalMethod === method ? undefined : method;
    try {
      await updateDoc(doc(db, "patients", patient.id), { arrivalMethod: next ?? null });
      setPatient(p => p ? { ...p, arrivalMethod: next } : p);
    } catch (e) { console.error(e); }
  }

  const generateReport = async (type: 'participation' | 'attendance' | 'travel') => {
    if (!patient) return;
    if (type === 'participation') {
      setPendingRequest(null);
      setPendingReportType('participation');
      setActiveReportType('participation');
      initStayFields();
      setStayStep("details");
      setShowStayModal(true);
    } else if (type === 'travel') {
      setPendingRequest(null);
      setPendingReportType('travel');
      setActiveReportType('travel');
      
      const assignedRehabWorker = rehabWorkers.find(w => w.id === patient.rehabWorkerId);
      setTravelRecipient(assignedRehabWorker ? `${assignedRehabWorker.name} - אגף השיקום משרד הביטחון` : "עבור משרד הביטחון - אגף השיקום");

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
      
      const pIds = patient.programIds || (patient.programId ? [patient.programId] : []);
      const patientProgs = programs.filter(p => pIds.includes(p.id));
      const combinedProgramName = patientProgs.map(p => p.name).join(" ו-") || "חרבות ברזל";
      setTravelProgramName(combinedProgramName);
      
      const allActiveDays = Array.from(new Set(patientProgs.flatMap(p => p.activeDays || []))).sort((a, b) => a - b);
      if (allActiveDays.length > 0) {
        const sortedDays = [...allActiveDays].sort((a, b) => a - b);
        const mapped = sortedDays.map(d => hebrewDaysOfWeek[d]);
        if (mapped.length === 1) {
          setTravelActivityDays(mapped[0]);
        } else {
          const last = mapped.pop();
          setTravelActivityDays(`${mapped.join(", ")} ו${last}`);
        }
      } else {
        setTravelActivityDays("שני, שלישי, רביעי");
      }
      
      setTravelSelectedMonths([selectedMonth]);
      updateTravelAttendanceDates([selectedMonth]);
      
      setTravelSignatoryName("מירב סארמילי");
      setTravelSignatoryTitle("מנהלת תפעול מרכז חוסן");
      setTravelSignatoryOrg("חוות רום");
      setTravelTransportationMethod("רכב פרטי / תחבורה ציבורית");
      const combinedHours = Array.from(new Set(patientProgs.map(p => p.activityHours).filter(Boolean))).join(", ") || "9:00-15:00";
      setTravelActivityHours(combinedHours);
      
      // Calculate total presence days for the selected month to pre-populate totalDays
      const monthlyPresence = attendance.filter(h => h.date.startsWith(selectedMonth) && h.status === 'present');
      setTravelTotalDays(String(monthlyPresence.length));
      
      setTravelStep("details");
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
    if (!patient) return;
    setReportLoading(true);
    try {
      const arrivedDates = attendance
        .filter(h => h.date.startsWith(selectedMonth) && h.status === 'present')
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(h => format(parseISO(h.date), "dd/MM/yyyy"));
      const totalDays = arrivedDates.length;

      const [year, month] = selectedMonth.split("-");
      const months = [
        "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
        "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
      ];
      const titleMonth = `${months[parseInt(month) - 1]} ${year}`;

      const doc = generateAttendanceReportWord({
        date: format(new Date(), "dd.MM.yyyy"),
        recipient: recipientText,
        patientName: patientName,
        idNumber: patient.idNumber || "—",
        startDate: patient.startDate ? format(parseISO(patient.startDate), "dd.MM.yyyy") : "—",
        programName: programs.find(p => p.id === (patient as any).programId)?.name || "חוסן",
        activityDaysText: getProgramDaysText("בימי ראשון"),
        arrivedDates,
        totalDays,
        signatoryName: authUser?.displayName || "מורשה חתימה",
        signatoryTitle: signatureTitle || "עו\"ס בחווה",
        logoHeaderData: undefined,
        logoFooterData: undefined
      });

      const fileName = `דוח_נוכחות_${patient.firstName}_${patient.lastName}_${titleMonth.replace(/\s+/g, "_")}.docx`;
      await generateDocxWithLetterhead(doc, fileName);
    } catch (err) {
      console.error(err);
      alert("שגיאה בהפקת הדוח");
    } finally {
      setReportLoading(false);
    }
  };

  const executeManualWordGeneration = async (type: 'attendance') => {
    if (!patient) return;
    try {
      const arrivedDates = attendance
        .filter(h => h.date.startsWith(selectedMonth) && h.status === 'present')
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(h => format(parseISO(h.date), "dd/MM/yyyy"));
      const totalDays = arrivedDates.length;

      const [year, month] = selectedMonth.split("-");
      const months = [
        "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
        "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
      ];
      const titleMonth = `${months[parseInt(month) - 1]} ${year}`;

      const doc = generateAttendanceReportWord({
        date: format(new Date(), "dd.MM.yyyy"),
        recipient: recipientText,
        patientName: patientName,
        idNumber: patient.idNumber || "—",
        startDate: patient.startDate ? format(parseISO(patient.startDate), "dd.MM.yyyy") : "—",
        programName: programs.find(p => p.id === (patient as any).programId)?.name || "חוסן",
        activityDaysText: getProgramDaysText("בימי ראשון"),
        arrivedDates,
        totalDays,
        signatoryName: authUser?.displayName || "מורשה חתימה",
        signatoryTitle: signatureTitle || "עו\"ס בחווה",
        logoHeaderData: undefined,
        logoFooterData: undefined
      });

      await generateDocxWithLetterhead(doc, `דוח_נוכחות_${patient.firstName}_${patient.lastName}_${titleMonth.replace(/\s+/g, "_")}.docx`);
    } catch (err) {
      console.error(err);
      alert("שגיאה בהפקת הדוח");
    }
  };



  const executeTravelWordGeneration = async () => {
    if (!patient) return;
    setShowTravelModal(false);
    setReportLoading(true);
    try {
      const patientProgram = programs.find(p => p.id === (patient as any)?.programId);
      const doc = generateTravelReimbursementWord({
        date: travelLetterDate,
        recipient: travelRecipient,
        firstName: travelFirstName,
        lastName: travelLastName,
        idNumber: travelIdNumber,
        startDate: travelApprovalStartDate,
        programName: travelProgramName,
        activityDays: travelActivityDays,
        activityHours: travelActivityHours,
        attendanceDatesStr: travelAttendanceDatesStr,
        signatoryName: travelSignatoryName,
        signatoryTitle: travelSignatoryTitle,
        signatoryOrg: travelSignatoryOrg,
        activityDetailText: patientProgram?.travelActivityDetail || reportSettings?.travelActivityDetail,
        transportationMethod: travelTransportationMethod,
        totalDays: travelTotalDays || undefined,
        logoHeaderData: undefined,
        logoFooterData: undefined
      });

      const reqMonth = pendingRequest?.month || selectedMonth;
      const monthNamesHebrew = [
        "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
        "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
      ];
      let monthSuffix = "";
      try {
        const monthsToUse = travelSelectedMonths.length > 0 ? travelSelectedMonths : [reqMonth];
        const sortedMonths = [...monthsToUse].sort();
        const monthNames = sortedMonths.map(m => {
          const [year, month] = m.split("-");
          const monthName = monthNamesHebrew[parseInt(month, 10) - 1];
          return monthName && year ? `${monthName}_${year}` : "";
        }).filter(Boolean);
        if (monthNames.length > 0) {
          monthSuffix = `_${monthNames.join("_")}`;
        }
      } catch {}

      const fileName = `החזר_נסיעות_${travelLastName}_${travelFirstName}${monthSuffix}.docx`;
      await generateDocxWithLetterhead(doc, fileName);

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



  const executeStayWordGeneration = async () => {
    if (!patient) return;
    setShowStayModal(false);
    setReportLoading(true);
    try {
      const patientProgram = programs.find(p => p.id === (patient as any)?.programId);
      const doc = generateStayCertificateWord({
        date: stayLetterDate,
        recipient: stayRecipient,
        firstName: stayFirstName,
        lastName: stayLastName,
        idNumber: stayIdNumber,
        startDate: stayStartDate,
        programName: stayProgramName,
        activityDays: stayActivityDays,
        activityHours: stayActivityHours,
        activityDetailText: patientProgram?.participationActivityDetail || reportSettings?.participationActivityDetail,
        signatoryName: staySignatoryName,
        signatoryTitle: staySignatoryTitle,
        signatoryOrg: staySignatoryOrg,
        programTrack: stayProgramTrack,
        fundingSource: stayFundingSource,
        specialRemarks: staySpecialRemarks,
        logoHeaderData: undefined,
        logoFooterData: undefined
      });

      const fileName = `אישור_שהייה_${stayLastName}_${stayFirstName}.docx`;
      await generateDocxWithLetterhead(doc, fileName);

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

  const initFunctionalFields = () => {
    if (!patient) return;
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    setFunctionalLetterDate(`${day}.${month}.${year}`);
    setFunctionalRecipient("אגף שיקום נכים משרד הביטחון");
    
    // Signatory
    const assignedFarmWorker = socialWorkers.find(u => u.id === patient.assignedWorkerId);
    setFunctionalSignatoryName(assignedFarmWorker ? assignedFarmWorker.name : (authUser?.displayName || authUser?.email || ""));
    setFunctionalSignatoryTitle(signatureTitle || "עו\"ס בחווה");
    setFunctionalSignatoryOrg("חוות רום - מרכז חוסן");
    
    // Reset Survey step & editor text areas (shared "profile" is intentionally NOT reset here)
    setFunctionalStep("survey");
    setFunctionalTextArea("");
    setSymptomsTextArea("");
    setFamilyTextArea("");
    setProgressTextArea("");
    setRecommendationsTextArea("");
    setFunctionalFreeText("");
  };

  const applyFunctionalSurvey = () => {
    if (!patient) return;
    const name = patient.firstName || "המשתתף";
    const sections = composeFunctionalSections(profile, name);
    setFunctionalTextArea(sections.functionalText);
    setSymptomsTextArea(sections.symptomsText);
    setFamilyTextArea(sections.familyText);
    setProgressTextArea(sections.progressText);
    setRecommendationsTextArea(sections.recommendationsText);
    setFunctionalStep("editor");
  };

  const executeFunctionalWordGeneration = async () => {
    if (!patient) return;
    setShowFunctionalModal(false);
    setReportLoading(true);
    try {
      const doc = generateFunctionalReportWord({
        paragraphs: functionalFreeText.split("\n\n").map(p => p.trim()).filter(Boolean),
        logoHeaderData: undefined,
        logoFooterData: undefined
      });

      const fileName = `דו"ח_תפקודי_${patient.lastName}_${patient.firstName}.docx`;
      await generateDocxWithLetterhead(doc, fileName);

      alert("המסמך הופק בהצלחה!");
    } catch (err) {
      console.error(err);
      alert("שגיאה בהפקת המסמך");
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (!patient) return;

    const fullReportText = [
      `עבור: ${functionalRecipient}`,
      `תאריך: ${functionalLetterDate}`,
      `הנדון: דו"ח תפקודי מפורט בעניינו של המשתתף ${patient.firstName} ${patient.lastName}`,
      `אנו כותבים דו"ח זה על מנת לתאר את מצבו התפקודי והתהליך השיקומי של המשתתף ${patient.firstName} ${patient.lastName} (ת.ז. ${patient.idNumber || ""}) במסגרת השתתפותו בחוות רום, בה החל לקחת חלק בתאריך ${patient.startDate ? format(parseISO(patient.startDate), "dd.MM.yyyy") : "___"}.`,
      functionalTextArea,
      symptomsTextArea,
      familyTextArea,
      progressTextArea,
      recommendationsTextArea,
      `בברכה,\n${functionalSignatoryName}\n${functionalSignatoryTitle}\n${functionalSignatoryOrg}`
    ].filter(Boolean).join("\n\n");

    setFunctionalFreeText(fullReportText);
  }, [patient, functionalTextArea, symptomsTextArea, familyTextArea, progressTextArea, recommendationsTextArea, functionalLetterDate, functionalRecipient, functionalSignatoryName, functionalSignatoryTitle, functionalSignatoryOrg, showFunctionalModal]);

  const initPeriodicFields = () => {
    if (!patient) return;

    setPeriodicStep("survey");

    // Date: today
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    setPeriodicLetterDate(`${day}.${month}.${year}`);
    setPeriodicIdNumber(patient.idNumber || "");
    
    // Recipient
    setPeriodicRecipient("אגף שיקום נכים משרד הביטחון");
    
    // MoD Rehab Worker and District
    const assignedRehabWorker = rehabWorkers.find(w => w.id === patient.rehabWorkerId);
    setPeriodicRehabWorker(assignedRehabWorker ? assignedRehabWorker.name : "");
    setPeriodicRehabDistrict(assignedRehabWorker ? (assignedRehabWorker.district || "טבריה") : "טבריה");
    
    // Period start/end dates
    setPeriodicPeriodStart(patient.startDate ? format(parseISO(patient.startDate), "dd.MM.yyyy") : "");
    setPeriodicPeriodEnd(`${day}.${month}.${year}`);
    
    // Rehab description
    setPeriodicRehabDescription("");
    
    // Location, Days, Hours
    setPeriodicPlacementLocation("חוות רום - מרכז חוסן.");
    
    const pIds = patient?.programIds || (patient?.programId ? [patient.programId] : []);
    const patientProgs = programs.filter(p => pIds.includes(p.id));
    const combinedHours = Array.from(new Set(patientProgs.map(p => p.activityHours).filter(Boolean))).join(", ") || "9:00-15:00";
    setPeriodicWorkDays(getProgramDaysText("בימים ב' ג' וד'"));
    setPeriodicWorkHours(combinedHours.startsWith("מ") ? combinedHours : `מ- ${combinedHours}`);
    
    // Summary, Recommendations
    setPeriodicSummaryProcess("");
    setPeriodicRecommendations("");
    
    // Farm Social Worker (therapist / case manager)
    const assignedFarmWorker = socialWorkers.find(u => u.id === patient.assignedWorkerId);
    setPeriodicFarmSocialWorker(assignedFarmWorker ? assignedFarmWorker.name : (authUser?.displayName || authUser?.email || ""));

    setPeriodicProgressStatus("התקדמות טובה והשתלבות חיובית");
    setPeriodicCooperationLevel("מלא ורציף");
    setPeriodicWorkshopPerformance("עבודה מעשית בחממה ובסדנאות יצירה");
    setPeriodicNextPeriodGoal("שיפור מיומנויות תפקוד והתמדה רציפה");
  };

  const applyPeriodicSurvey = () => {
    if (!patient) return;
    const name = patient.firstName || "המשתתף";
    const sections = composePeriodicSections(profile, name, periodicReportType as PeriodicReportType);
    setPeriodicRehabDescription(sections.rehabDescription);
    setPeriodicSummaryProcess(sections.summaryProcess);
    
    let defaultRec = sections.recommendations;
    if (periodicReportType === "דו\"ח סיכום תקופה" || periodicReportType === "בקשה להארכה") {
      if (patient.extensionReceived) {
        defaultRec = "הארכת השהות בעוד חודש (נועדה לאפשר במקרים מסויימים הערכות מייטבית להמשך השיקום לאחר החווה).";
      } else {
        defaultRec = "הארכת תקופת השהות בעוד 3 חודשים, סה״כ שהות בחווה לחצי שנה.";
      }
    }
    setPeriodicRecommendations(defaultRec);
    setPeriodicStep("form");
  };

  const executePeriodicWordGeneration = async () => {
    if (!patient) return;
    setShowPeriodicModal(false);
    setReportLoading(true);
    try {
      // 2. Generate Docx Document
      const doc = generatePeriodicReportWord({
        date: periodicLetterDate,
        reportType: periodicReportType,
        recipient: periodicRecipient,
        rehabDistrict: periodicRehabDistrict,
        rehabWorker: periodicRehabWorker,
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientId: periodicIdNumber,
        startDate: patient.startDate ? format(parseISO(patient.startDate), "dd.MM.yyyy") : "—",
        periodStart: periodicPeriodStart,
        periodEnd: periodicPeriodEnd,
        rehabDescription: periodicRehabDescription,
        placementLocation: periodicPlacementLocation,
        workDays: periodicWorkDays,
        workHours: periodicWorkHours,
        summaryProcess: periodicSummaryProcess,
        recommendations: periodicRecommendations,
        farmSocialWorker: periodicFarmSocialWorker,
        progressStatus: periodicProgressStatus,
        cooperationLevel: periodicCooperationLevel,
        workshopPerformance: periodicWorkshopPerformance,
        nextPeriodGoal: periodicNextPeriodGoal,
        logoHeaderData: undefined,
        logoFooterData: undefined
      });

      const fileName = `דו"ח_תקופתי_${patient.lastName}_${patient.firstName}_${periodicReportType.replace(/\//g, "-")}.docx`;
      
      // 3. Download locally
      await generateDocxWithLetterhead(doc, fileName);

      alert("המסמך הופק בהצלחה!");
    } catch (err) {
      console.error(err);
      alert("שגיאה בהפקת המסמך");
    } finally {
      setReportLoading(false);
    }
  };

  const initRehabPlanFields = () => {
    if (!patient) return;

    setRehabPlanStep("survey");

    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    setRehabPlanDate(`${day}.${month}.${year}`);

    const assignedFarmWorker = socialWorkers.find(u => u.id === patient.assignedWorkerId);
    setRehabPlanTherapistName(assignedFarmWorker ? assignedFarmWorker.name : (authUser?.displayName || authUser?.email || ""));
    setRehabPlanTherapistTitle(signatureTitle || "עו\"ס בחווה");

    const assignedRehabWorker = rehabWorkers.find(w => w.id === patient.rehabWorkerId);
    setRehabPlanDistrictWorker(assignedRehabWorker ? assignedRehabWorker.name : "");

    setRehabPlanEditableText("");
  };

  const applyRehabPlanSurvey = () => {
    if (!patient) return;
    const sections = composeRehabPlanSections(profile, patient.firstName || "המשתתף");
    const planData: RehabPlanData = {
      areasOfImprovement: sections.areasOfImprovement,
      specificGoal: sections.specificGoal,
      waysToAchieve: sections.waysToAchieve,
      sourcesOfSupport: sections.sourcesOfSupport,
    };
    setRehabPlanEditableText(serializePlanData(planData));
    setRehabPlanStep("editor");
  };

  const executeRehabPlanGeneration = async () => {
    if (!patient) return;
    setShowRehabPlanModal(false);
    setReportLoading(true);
    try {
      const planData = deserializePlanData(rehabPlanEditableText);
      const doc = generateRehabPlanWord(planData, {
        date: rehabPlanDate,
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientId: patient.idNumber || "",
        therapistName: rehabPlanTherapistName,
        therapistTitle: rehabPlanTherapistTitle,
        districtWorker: rehabPlanDistrictWorker,
        logoHeaderData: undefined,
        logoFooterData: undefined
      });
      const fileName = `תוכנית_שיקום_${patient.lastName}_${patient.firstName}.docx`;
      await generateDocxWithLetterhead(doc, fileName);
      alert("המסמך הופק בהצלחה!");
    } catch (err) {
      console.error(err);
      alert("שגיאה בהפקת המסמך");
    } finally {
      setReportLoading(false);
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
  
  const pIds = patient.programIds || ((patient as any).programId ? [(patient as any).programId] : []);
  const progNames = pIds.map(pid => programs.find(p => p.id === pid)?.name).filter(Boolean);
  const progName = progNames.join(" + ");

  const gIds = patient.groupIds || (patient.hosenType ? [patient.hosenType] : []);
  const grpNames = gIds.map(gid => groups.find(g => g.id === gid)?.name || gid).filter(Boolean);
  const grpName = grpNames.join(" · ");

  let rawGroupName = (progName && grpName && progName !== grpName) ? `${progName} - ${grpName}` : (progName || grpName || "כללי");
  const fullGroupName = (rawGroupName && rawGroupName !== "כללי" && !rawGroupName.startsWith("תוכנית")) ? `תוכנית ${rawGroupName}` : rawGroupName;

  const navIndex = navList.findIndex(p => p.id === id);
  const goToNavIndex = (idx: number) => {
    if (idx < 0 || idx >= navList.length) return;
    setNavOpen(false);
    router.push(`/patients/${navList[idx].id}`);
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager", "social_worker", "logistics"]} redirectTo="/login">
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
                  <span className="text-emerald-600/80">{fullGroupName}</span>
                  <span className="w-0.5 h-0.5 rounded-full bg-slate-200" />
                  <span className="shrink-0">{patient.idNumber}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              {navList.length > 0 && navIndex >= 0 && (
                <>
                  <div className="flex items-center bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl overflow-hidden">
                    <button
                      onClick={() => goToNavIndex(navIndex - 1)}
                      disabled={navIndex <= 0}
                      title="המשתתף הקודם ברשימה"
                      className="p-2 md:p-2.5 hover:bg-[var(--foreground)]/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] font-black text-slate-400 px-1.5 tabular-nums whitespace-nowrap">
                      {navIndex + 1} / {navList.length}
                    </span>
                    <button
                      onClick={() => goToNavIndex(navIndex + 1)}
                      disabled={navIndex >= navList.length - 1}
                      title="המשתתף הבא ברשימה"
                      className="p-2 md:p-2.5 hover:bg-[var(--foreground)]/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => setNavOpen(true)}
                    title="רשימת משתתפים מסוננת"
                    className="flex items-center gap-2 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl px-3 py-2 md:py-2.5 text-xs font-black hover:bg-[var(--foreground)]/10 transition-all active:scale-95"
                  >
                    <Users className="w-4 h-4" />
                    <span className="hidden sm:inline">רשימת משתתפים</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Side panel: filtered patients list navigation */}
        <AnimatePresence>
          {navOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setNavOpen(false)}
                className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm"
              />
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "tween", duration: 0.25 }}
                className="fixed top-0 right-0 h-full w-full max-w-xs bg-white z-50 shadow-2xl flex flex-col"
              >
                <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <h3 className="text-sm font-black">רשימת משתתפים ({navList.length})</h3>
                  <button onClick={() => setNavOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 no-scrollbar">
                  {navList.map((p, i) => {
                    const isCurrent = p.id === id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => goToNavIndex(i)}
                        className={`w-full text-right px-4 py-3 flex items-center gap-3 transition-colors ${
                          isCurrent ? "bg-emerald-50 text-emerald-700" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span className="text-xs font-bold truncate flex-1">{p.firstName} {p.lastName}</span>
                        {isCurrent && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <main className="max-w-7xl mx-auto p-4 md:p-8">
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
             {(() => {
               const [selYear, selMonth] = selectedMonth.split("-");
               const monthLabel = format(new Date(parseInt(selYear), parseInt(selMonth) - 1, 1), "MMMM yyyy", { locale: he });
               return [
                 { label: `נוכחות (${monthLabel})`, value: `${attendance.filter(a => a.date.startsWith(selectedMonth) && a.status === 'present').length}`, icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-50" },
                 { label: `היעדרויות (${monthLabel})`, value: `${attendance.filter(a => a.date.startsWith(selectedMonth) && a.status === 'absent').length}`, icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-50" },
                 { label: "תאריך הצטרפות", value: patient.startDate ? format(new Date(patient.startDate), "dd/MM/yy") : "—", icon: Calendar, color: "text-indigo-500", bg: "bg-indigo-50" },
                 { label: "סטטוס שיקומי", value: patient.rehabPlanCompleted ? "בתהליך" : "התחלתי", icon: Shield, color: "text-blue-500", bg: "bg-blue-50" },
               ];
             })().map((stat, i) => (
               <div key={i} className="bg-[var(--card-bg)] border border-[var(--border)] p-3 rounded-xl hover:border-[var(--foreground)]/20 transition-all group shadow-sm flex items-center gap-3">
                 <div className={`w-8 h-8 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                    <stat.icon className="w-4 h-4" />
                 </div>
                 <div className="min-w-0">
                   <p className="text-[8px] md:text-[9px] font-black text-[var(--foreground)]/40 uppercase tracking-widest mb-0.5 truncate">{stat.label}</p>
                   <p className="text-sm md:text-base font-black text-[var(--foreground)]">{stat.value}</p>
                 </div>
               </div>
             ))}
          </div>

          {/* ── Tabs ── */}
          <div className="flex bg-[var(--foreground)]/5 p-1.5 rounded-2xl border border-[var(--border)] mb-6 w-full md:w-fit overflow-x-auto no-scrollbar touch-pan-x gap-1">
             {[
               { id: "overview", label: "סקירה", icon: Info },
               { id: "attendance", label: "נוכחות", icon: History },
               { id: "certificates", label: "אישורים", icon: Shield },
               { id: "reports", label: "דוחות", icon: FileText },
             ].filter(tab => !(role === "logistics" && (tab.id === "overview" || tab.id === "reports"))).map((tab) => (
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
            {activeTab === "overview" && role !== "logistics" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="overview" className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

                 {/* Left Column: Personal & Contact Details */}
                 <div className="lg:col-span-8 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-4 md:p-6 shadow-sm">
                   {!isEditingDetails ? (
                     <div className="space-y-4">
                       {/* Header of summary with Edit toggle button */}
                       <div className="flex justify-between items-center mb-2">
                         <div className="flex items-center gap-2.5">
                           <div className="w-1.5 h-5 bg-emerald-500 rounded-full" />
                           <h3 className="text-sm md:text-base font-black text-slate-800">תיק משתתף</h3>
                         </div>
                         <button
                           onClick={() => setIsEditingDetails(true)}
                           className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100/80 transition-all border border-emerald-100 cursor-pointer"
                         >
                           <Edit3 className="w-3.5 h-3.5" />
                           עריכת פרטים
                         </button>
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {/* Personal Details Card */}
                         <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 shadow-sm hover:shadow-md/5 transition-all">
                           <div className="flex items-center gap-2 text-slate-800">
                             <User className="w-4 h-4 text-emerald-500" />
                             <span className="text-xs font-black">פרטים אישיים</span>
                           </div>
                           <div className="grid grid-cols-2 gap-3 text-xs">
                             <div>
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">שם מלא</p>
                               <p className="font-bold text-slate-700">{patient.firstName} {patient.lastName}</p>
                             </div>
                             <div>
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">מספר ת.ז.</p>
                               <p className="font-bold text-slate-700">{patient.idNumber || "—"}</p>
                             </div>
                             <div>
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">טלפון</p>
                               {patient.phone ? (
                                 <a href={`tel:${patient.phone}`} className="font-bold text-emerald-600 hover:underline flex items-center gap-1">
                                   <Phone className="w-3 h-3" />
                                   {patient.phone}
                                 </a>
                               ) : (
                                 <p className="font-bold text-slate-700">—</p>
                               )}
                             </div>
                             <div>
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">סטטוס</p>
                               <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black ${
                                 patient.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                                 patient.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                 'bg-slate-100 text-slate-700'
                                }`}>
                                 {patient.status === 'active' ? 'פעיל' :
                                  patient.status === 'pending' ? 'ממתין' :
                                  'לא פעיל'}
                               </span>
                             </div>
                           </div>
                         </div>

                         {/* Programs and Groups Assignment Card */}
                         <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 shadow-sm hover:shadow-md/5 transition-all">
                           <div className="flex items-center gap-2 text-slate-800">
                             <Layers className="w-4 h-4 text-emerald-500" />
                             <span className="text-xs font-black">שיבוץ לתוכניות וקבוצות</span>
                           </div>
                           <div className="space-y-3">
                             <div>
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">תוכניות פעילות</p>
                               <div className="flex flex-wrap gap-1.5">
                                 {(() => {
                                   const pIds = patient.programIds || (patient.programId ? [patient.programId] : []);
                                   if (pIds.length === 0) return <span className="text-xs text-slate-400 italic">לא משויך לתוכנית</span>;
                                   return pIds.map((pid: string) => {
                                     const prog = programs.find(p => p.id === pid);
                                     return (
                                       <span key={pid} className="px-2.5 py-1 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 shadow-sm">
                                         {prog ? prog.name : "תוכנית כללית"}
                                       </span>
                                     );
                                   });
                                 })()}
                               </div>
                             </div>

                             <div>
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">קבוצות משויכות</p>
                               <div className="flex flex-wrap gap-1.5">
                                 {(() => {
                                   const gIds = patient.groupIds || (patient.hosenType ? [patient.hosenType] : []);
                                   if (gIds.length === 0) return <span className="text-xs text-slate-400 italic">לא משויך לקבוצה</span>;
                                   return gIds.map((gid: string) => {
                                     const grp = groups.find(g => g.id === gid);
                                     return (
                                       <span key={gid} className="px-2.5 py-1 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 shadow-sm">
                                         {grp ? grp.name : "קבוצה כללית"}
                                       </span>
                                     );
                                   });
                                 })()}
                               </div>
                             </div>
                           </div>
                         </div>

                         {/* Supporting Team / Workers Card */}
                         <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 shadow-sm hover:shadow-md/5 transition-all">
                           <div className="flex items-center gap-2 text-slate-800">
                             <Briefcase className="w-4 h-4 text-emerald-500" />
                             <span className="text-xs font-black">צוות מלווה</span>
                           </div>
                           <div className="space-y-3.5 text-xs">
                             <div className="flex items-center justify-between">
                               <div>
                                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">עו"ס מלווה בחווה</p>
                                 <p className="font-bold text-slate-700">
                                   {socialWorkers.find(w => w.id === patient.assignedWorkerId)?.name || "טרם שובץ עו\"ס"}
                                 </p>
                               </div>
                             </div>

                             <div className="flex items-center justify-between border-t border-slate-200/50 pt-2.5">
                               <div>
                                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">עו"ס שיקום משרד הביטחון</p>
                                 <p className="font-bold text-slate-700">
                                   {(() => {
                                     const rehab = rehabWorkers.find(w => w.id === patient.rehabWorkerId);
                                     return rehab ? rehab.name : "טרם שובץ עו\"ס שיקום";
                                   })()}
                                 </p>
                               </div>
                               
                               {(() => {
                                 const rehab = rehabWorkers.find(w => w.id === patient.rehabWorkerId);
                                 if (!rehab) return null;
                                 return (
                                   <div className="flex items-center gap-1.5">
                                     {rehab.email && (
                                       <a href={`mailto:${rehab.email}`} className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 text-teal-600 hover:bg-teal-50 hover:border-teal-100 rounded-lg shadow-sm transition-colors cursor-pointer">
                                         <Mail className="w-3.5 h-3.5" />
                                       </a>
                                     )}
                                     {rehab.phone && (
                                       <a href={`tel:${rehab.phone}`} className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 text-teal-600 hover:bg-teal-50 hover:border-teal-100 rounded-lg shadow-sm transition-colors cursor-pointer">
                                         <Phone className="w-3.5 h-3.5" />
                                       </a>
                                     )}
                                   </div>
                                 );
                               })()}
                             </div>
                           </div>
                         </div>

                         {/* Dates & Milestones Card */}
                         <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 shadow-sm hover:shadow-md/5 transition-all">
                           <div className="flex items-center gap-2 text-slate-800">
                             <Calendar className="w-4 h-4 text-emerald-500" />
                             <span className="text-xs font-black">תאריכים ואבני דרך</span>
                           </div>
                           <div className="grid grid-cols-2 gap-3 text-xs">
                             <div>
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">תחילת השתתפות</p>
                               <p className="font-bold text-slate-700">{patient.startDate ? format(parseISO(patient.startDate), "dd/MM/yyyy") : "—"}</p>
                             </div>
                             <div>
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">סיום משוער</p>
                               <p className="font-bold text-slate-700">{patient.endDate ? format(parseISO(patient.endDate), "dd/MM/yyyy") : "—"}</p>
                             </div>
                             <div className="col-span-2 border-t border-slate-200/50 pt-2.5">
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">ועדת נכות משרד הביטחון</p>
                               <p className="font-bold text-slate-700">
                                 {patient.disabilityCommitteePassed 
                                   ? "עברה / לא נדרשת" 
                                   : patient.disabilityCommitteeDate 
                                     ? format(parseISO(patient.disabilityCommitteeDate), "dd/MM/yyyy")
                                     : "טרם נקבע מועד"
                                 }
                               </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {/* Header of editing with Cancel/Finish button */}
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-1.5 h-5 bg-emerald-500 rounded-full" />
                            <h3 className="text-sm md:text-base font-black text-slate-800">עריכת פרטי תיק</h3>
                          </div>
                          <button
                            onClick={() => setIsEditingDetails(false)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-black text-slate-600 hover:text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all border border-slate-200/60 cursor-pointer"
                          >
                            חזרה לתיק
                          </button>
                        </div>

                        <PatientForm
                          patientId={patient.id}
                          initialData={patient}
                          onSuccess={() => {
                            fetchPatientData();
                          }}
                        />
                      </div>
                    )}
                  </div>

                 {/* Right Column: Administrative (Stay Period & Actions) */}
                 <div className="lg:col-span-4 space-y-3">
                    {/* ── Stay Period Management ── */}
                    {(() => {
                      const startDate = patient.startDate ? parseISO(patient.startDate) : null;
                      const endDate = effectiveEndDate(patient);
                      const totalDays = (startDate && endDate) ? differenceInCalendarDays(endDate, startDate) : 90;
                      const elapsedDays = startDate ? differenceInCalendarDays(new Date(), startDate) : 0;
                      const progress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));

                      const days = endDate ? differenceInCalendarDays(endDate, new Date()) : null;
                      const isUrgent = days !== null && days >= 0 && days <= 14;
                      const isExpired = days !== null && days < 0;

                      return (
                        <div className={`bg-white border rounded-xl p-3 shadow-sm relative overflow-hidden ${
                          isExpired ? "border-slate-300" :
                          isUrgent  ? "border-rose-500/30" :
                          "border-slate-200/60"
                        }`}>
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isUrgent ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-400'}`}>
                                <Calendar className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">תקופת שהות</h4>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">ניהול זמני תוכנית</p>
                              </div>
                            </div>
                            {isUrgent && <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
                          </div>

                          <div className="space-y-3 mb-3">
                            {/* Dates visualization */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-slate-50 rounded-lg p-2.5">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">תאריך התחלה</p>
                                <p className="text-xs font-black text-slate-700">{patient.startDate ? format(parseISO(patient.startDate), "dd/MM/yyyy") : "—"}</p>
                              </div>
                              <div className={`rounded-lg p-2.5 ${isUrgent ? 'bg-rose-50' : 'bg-slate-50'}`}>
                                <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isUrgent ? 'text-rose-400' : 'text-slate-400'}`}>תאריך סיום</p>
                                <p className={`text-xs font-black ${isUrgent ? 'text-rose-600' : 'text-slate-700'}`}>{endDate ? format(endDate, "dd/MM/yyyy") : "—"}</p>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-end">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">התקדמות תקופה</span>
                                <span className={`text-sm font-black ${isExpired ? 'text-slate-400' : isUrgent ? 'text-rose-500' : 'text-emerald-500'}`}>
                                  {isExpired ? 'הסתיימה' : `${days} ימים נותרו`}
                                </span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                                <div
                                  className={`h-full transition-all duration-1000 ${isExpired ? 'bg-slate-300' : isUrgent ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="pt-2.5 border-t border-slate-100">
                            {editingEndDate ? (
                              <div className="flex items-center gap-2">
                                <input type="date" value={editEndDateVal}
                                  onChange={e => setEditEndDateVal(e.target.value)} autoFocus
                                  className="flex-1 bg-slate-50 border border-emerald-500/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-emerald-500/10" />
                                <button onClick={saveEndDate} disabled={savingExt === "date"}
                                  className="p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all">
                                  {savingExt === "date" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                </button>
                                <button onClick={() => setEditingEndDate(false)}
                                  className="p-2 rounded-lg bg-slate-100 text-slate-400 hover:bg-slate-200 transition-all">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => {
                                  const end = effectiveEndDate(patient);
                                  setEditEndDateVal(patient.endDate || (end ? format(end, "yyyy-MM-dd") : ""));
                                  setEditingEndDate(true);
                                }}
                                className="w-full text-[10px] font-black text-slate-300 hover:text-emerald-500 flex items-center justify-center gap-2 transition-all py-1 group">
                                <Edit3 className="w-3 h-3 group-hover:rotate-12 transition-transform" />
                                שינוי תאריך סיום באופן ידני
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Documents & Plan Checklist ── */}
                    <div className="bg-white border border-slate-200/60 rounded-xl p-3">
                      <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2.5">מסמכים ותוכניות</h4>
                      <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "תוכנית שיקום", checked: !!patient.rehabPlanCompleted, onToggle: toggleRehabPlan },
                        { label: "ויתור סודיות", checked: !!patient.confidentialityWaiverCompleted, onToggle: toggleConfidentialityWaiver },
                        { label: "טופס פרטים אישיים", checked: !!patient.personalDetailsFormCompleted, onToggle: togglePersonalDetailsForm },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className={`rounded-lg p-2 cursor-pointer transition-all select-none group border flex flex-col items-center text-center gap-1.5 ${
                            item.checked
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-50/50 text-slate-500 border-slate-200 hover:border-emerald-300"
                          }`}
                          onClick={item.onToggle}
                        >
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                            item.checked
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : "bg-white border-slate-300 group-hover:border-emerald-400"
                          }`}>
                            {item.checked && <X className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <p className="text-[9px] font-bold leading-tight">{item.label}</p>
                        </div>
                      ))}
                      </div>
                    </div>

                    {/* ── Report Markings ── */}
                    <div className="bg-white border border-slate-200/60 rounded-xl p-3">
                      <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2.5">סימון דוחות</h4>
                      <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "דוח אמצע והארכה", checked: !!patient.extensionSent, onToggle: toggleExtensionSent },
                        { label: "התקבלה הארכה", checked: !!patient.extensionReceived, onToggle: toggleExtensionReceived },
                        { label: "דוח סיכום", checked: !!patient.summaryReportCompleted, onToggle: toggleSummaryReportCompleted },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className={`rounded-lg p-2 cursor-pointer transition-all select-none group border flex flex-col items-center text-center gap-1.5 ${
                            item.checked
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-50/50 text-slate-500 border-slate-200 hover:border-emerald-300"
                          }`}
                          onClick={item.onToggle}
                        >
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                            item.checked
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : "bg-white border-slate-300 group-hover:border-emerald-400"
                          }`}>
                            {item.checked && <X className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <p className="text-[9px] font-bold leading-tight">{item.label}</p>
                        </div>
                      ))}
                      </div>
                    </div>

                    {/* ── Arrival Method ── */}
                    <div className="bg-white border border-slate-200/60 rounded-xl p-3">
                      <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2.5">אופן הגעה</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: "private_car" as const, label: "רכב פרטי", icon: CarFront },
                          { value: "taxi" as const, label: "מונית", icon: CarTaxiFront },
                        ].map((item) => {
                          const checked = patient.arrivalMethod === item.value;
                          return (
                            <div
                              key={item.value}
                              className={`rounded-lg p-2 cursor-pointer transition-all select-none group border flex flex-col items-center text-center gap-1.5 ${
                                checked
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-slate-50/50 text-slate-500 border-slate-200 hover:border-emerald-300"
                              }`}
                              onClick={() => setArrivalMethod(item.value)}
                            >
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                                checked
                                  ? "bg-emerald-500 border-emerald-500 text-white"
                                  : "bg-white border-slate-300 group-hover:border-emerald-400"
                              }`}>
                                {checked && <X className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                              <p className="text-[9px] font-bold leading-tight flex items-center gap-1">
                                <item.icon className="w-3 h-3" />
                                {item.label}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Rehab Worker Info Card ── */}
                    {(() => {
                      const assignedRehabWorker = rehabWorkers.find(w => w.id === patient.rehabWorkerId);
                      return (
                        <div className="bg-white border border-slate-200/60 rounded-xl p-3">
                          <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2.5">עו״ס שיקום משרד הביטחון</h4>
                          {assignedRehabWorker ? (
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-black text-slate-800 truncate">{assignedRehabWorker.name}</p>
                              <div className="flex items-center gap-1 shrink-0">
                                {assignedRehabWorker.email && (
                                  <a href={`mailto:${assignedRehabWorker.email}`}
                                    className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-teal-500 hover:border-teal-300 transition-colors">
                                    <Mail className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                {assignedRehabWorker.phone && (
                                  <a href={`tel:${assignedRehabWorker.phone}`}
                                    className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-teal-500 hover:border-teal-300 transition-colors">
                                    <Phone className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-[10px] font-bold text-slate-400 italic text-center py-1">לא שויך עו״ס שיקום משרד הביטחון</p>
                          )}
                        </div>
                      );
                    })()}
                 </div>
              </motion.div>
            )}

            {activeTab === "attendance" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="attendance" className="space-y-6">
                
                {/* Stats Grid Dashboard */}
                {attendance.length > 0 && (() => {
                  const totalDays = attendance.length;
                  const presentDays = attendance.filter(a => a.status === "present").length;
                  const absentDays = totalDays - presentDays;
                  const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/10 rounded-[1.5rem] p-4 text-right shadow-sm">
                        <div className="text-[10px] font-black text-emerald-600 uppercase tracking-wider mb-1">נוכחות בפועל</div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-slate-800">{presentDays}</span>
                          <span className="text-xs text-slate-400 font-bold">ימים</span>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border border-rose-500/10 rounded-[1.5rem] p-4 text-right shadow-sm">
                        <div className="text-[10px] font-black text-rose-600 uppercase tracking-wider mb-1">היעדרויות</div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-slate-800">{absentDays}</span>
                          <span className="text-xs text-slate-400 font-bold">ימים</span>
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/10 rounded-[1.5rem] p-4 text-right shadow-sm col-span-2 md:col-span-2">
                        <div className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-1">אחוז נוכחות כולל</div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-baseline gap-0.5">
                            <span className="text-2xl font-black text-slate-800">{attendanceRate}</span>
                            <span className="text-sm font-black text-slate-800">%</span>
                          </div>
                          <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-full rounded-full transition-all duration-500" style={{ width: `${attendanceRate}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-3xl p-5 md:p-6 shadow-sm">
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className="w-1.5 h-5 bg-emerald-500 rounded-full" />
                    <h3 className="text-sm md:text-base font-black text-slate-800">יומן נוכחות (קבוצות חודשיות)</h3>
                  </div>

                  {attendance.length === 0 ? (
                    <div className="py-20 text-center opacity-30 italic text-xs font-bold text-slate-400">אין רישומי נוכחות זמינים</div>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        interface GroupedAttendance {
                          monthKey: string;
                          monthLabel: string;
                          records: Attendance[];
                          presentCount: number;
                          absentCount: number;
                        }
                        const groupsList: GroupedAttendance[] = [];
                        attendance.forEach(att => {
                          const monthKey = att.date.substring(0, 7); // "YYYY-MM"
                          let g = groupsList.find(item => item.monthKey === monthKey);
                          if (!g) {
                            const [year, month] = monthKey.split("-");
                            const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
                            const monthLabel = format(dateObj, "MMMM yyyy", { locale: he });
                            g = {
                              monthKey,
                              monthLabel,
                              records: [],
                              presentCount: 0,
                              absentCount: 0
                            };
                            groupsList.push(g);
                          }
                          g.records.push(att);
                          if (att.status === 'present') {
                            g.presentCount++;
                          } else {
                            g.absentCount++;
                          }
                        });

                        // Sort groupsList descending (newest first)
                        groupsList.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
                        // Sort records in each group by date descending
                        groupsList.forEach(g => {
                          g.records.sort((a, b) => b.date.localeCompare(a.date));
                        });

                        return groupsList.map((g, idx) => {
                          const isExpanded = expandedAttendanceMonths[g.monthKey] ?? (idx === 0);
                          return (
                            <div key={g.monthKey} className="border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm bg-white hover:shadow-md transition-all">
                              {/* Header Card */}
                              <button
                                onClick={() => {
                                  setExpandedAttendanceMonths(prev => ({
                                    ...prev,
                                    [g.monthKey]: !isExpanded
                                  }));
                                }}
                                className="w-full text-right px-5 py-4 bg-slate-50/50 hover:bg-slate-50 flex items-center justify-between transition-colors border-none cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <Calendar className="w-4 h-4" />
                                  </div>
                                  <span className="text-xs md:text-sm font-black text-slate-800">{g.monthLabel}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="px-2.5 py-1 rounded-full text-[9px] font-black bg-emerald-100/80 text-emerald-700">
                                    {g.presentCount} נוכחות
                                  </span>
                                  {g.absentCount > 0 && (
                                    <span className="px-2.5 py-1 rounded-full text-[9px] font-black bg-rose-100/80 text-rose-700">
                                      {g.absentCount} היעדרויות
                                    </span>
                                  )}
                                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                              </button>

                              {/* Expanded list */}
                              {isExpanded && (
                                <div className="divide-y divide-slate-100 border-t border-slate-100">
                                  {g.records.map(att => (
                                    <div key={att.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50/30 transition-colors">
                                      <div className="flex items-center gap-2.5">
                                        <span className="text-xs font-bold text-slate-600">
                                          {format(new Date(att.date + "T12:00:00"), "EEEE, dd/MM/yyyy", { locale: he })}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-semibold text-slate-400">
                                          {att.status === "present" ? "☀️ הגעה לחווה" : "💤 היעדרות"}
                                        </span>
                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border uppercase tracking-tighter ${
                                          att.status === "present"
                                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                            : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                        }`}>
                                          {att.status === "present" ? "נוכח" : "נעדר"}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === "certificates" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="certificates" className="space-y-6">
                
                {/* Visual Header */}
                <div className="flex flex-col gap-1 text-right">
                  <h3 className="text-sm font-black text-slate-800">הפקת אישורים רשמיים</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">בחר את האישור הרלוונטי להפקה מיידית בפורמט Word רשמי</p>
                </div>

                {/* Manual Generation Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {/* Stay Certificate */}
                   <div className="bg-white border border-slate-200/60 rounded-3xl p-5 md:p-6 shadow-sm hover:border-emerald-500/30 hover:shadow-md transition-all group flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                             <Printer className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs md:text-sm font-black text-slate-800">הנפקת אישור שהייה</h4>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">אישור רשמי ופרטי התוכנית</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                          הפקת מסמך רשמי המאשר את חברות המשתתף בתוכנית וזמני הגעתו לחווה.
                        </p>
                      </div>
                      <button
                        onClick={() => generateReport('participation')}
                        disabled={reportLoading}
                        className="w-full bg-emerald-500 text-white py-3 rounded-2xl text-[9px] font-black uppercase tracking-wider transition-all hover:bg-emerald-600 shadow-sm active:scale-[0.98] flex items-center justify-center gap-1.5 mt-5 cursor-pointer border-none"
                      >
                        {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        להורדת אישור שהייה
                      </button>
                   </div>
 
                   {/* Monthly Attendance Certificate */}
                   <div className="bg-white border border-slate-200/60 rounded-3xl p-5 md:p-6 shadow-sm hover:border-sky-500/30 hover:shadow-md transition-all group flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                             <Shield className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs md:text-sm font-black text-slate-800">אישור נוכחות חודשי</h4>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">פירוט ימי הגעה בפועל</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                          הפקת מכתב מפורט הכולל את רשימת ימי ההגעה המדויקים בפועל של המשתתף בחודש/ים שנבחרו (ניתן לבחור מספר חודשים).
                        </p>
                      </div>
 
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-5 w-full">
                         <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 shrink-0 flex items-center justify-center">
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
                          className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-2xl text-[9px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer border-none"
                         >
                          {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          הפקת אישור נסיעות
                         </button>
                      </div>
                   </div>
                </div>
              </motion.div>
            )}
 
            {activeTab === "reports" && role !== "logistics" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="reports" className="space-y-6">
                
                {/* Visual Header */}
                <div className="flex flex-col gap-1 text-right">
                  <h3 className="text-sm font-black text-slate-800">הפקת דו״חות טיפוליים</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">הפקת דו״חות הערכה ותוכניות שיקום המבוססות על שאלוני התקדמות אינטראקטיביים</p>
                </div>

                {/* Manual Generation Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   {/* Periodic Report */}
                   <div className="bg-white border border-slate-200/60 rounded-3xl p-5 md:p-6 shadow-sm hover:border-violet-500/30 hover:shadow-md transition-all group flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-500 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                             <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs md:text-sm font-black text-slate-800">הנפקת דו״ח תקופתי</h4>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">השמה / עזיבה / חצי שנתי / הארכה</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                          דו״ח רשמי מפורט הכולל תיאור תוכנית, סיכום ליווי והמלצות המשך לאחר מענה על שאלון טיפולי.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          initPeriodicFields();
                          setShowPeriodicModal(true);
                        }}
                        disabled={reportLoading}
                        className="w-full bg-violet-500 text-white py-3 rounded-2xl text-[9px] font-black uppercase tracking-wider transition-all hover:bg-violet-600 shadow-sm active:scale-[0.98] flex items-center justify-center gap-1.5 mt-5 cursor-pointer border-none"
                      >
                        {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        למחולל דו״ח תקופתי
                      </button>
                   </div>
 
                   {/* Functional Report */}
                   <div className="bg-white border border-slate-200/60 rounded-3xl p-5 md:p-6 shadow-sm hover:border-violet-500/30 hover:shadow-md transition-all group flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-500 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                             <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs md:text-sm font-black text-slate-800">הנפקת דו״ח תפקודי</h4>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">עבור משרד הביטחון - ועדות רפואיות</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                          דו״ח תפקודי מקיף המבוסס על הערכת סימפטומים, היגדים מותאמים וליווי רגשי בחווה.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          initFunctionalFields();
                          setShowFunctionalModal(true);
                        }}
                        disabled={reportLoading}
                        className="w-full bg-violet-500 text-white py-3 rounded-2xl text-[9px] font-black uppercase tracking-wider transition-all hover:bg-violet-600 shadow-sm active:scale-[0.98] flex items-center justify-center gap-1.5 mt-5 cursor-pointer border-none"
                      >
                        {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        למחולל דו״ח תפקודי
                      </button>
                   </div>
 
                   {/* Rehab Plan */}
                   <div className="bg-white border border-slate-200/60 rounded-3xl p-5 md:p-6 shadow-sm hover:border-violet-500/30 hover:shadow-md transition-all group flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-500 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                             <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs md:text-sm font-black text-slate-800">תוכנית שיקום אישית</h4>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">מטרות, מקורות סיוע ודרכי עבודה</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                          בניית תוכנית שיקום ואינטגרציה תעסוקתית מפורטת על בסיס שאלון קצר להגשה למשרד הביטחון.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          initRehabPlanFields();
                          setShowRehabPlanModal(true);
                        }}
                        disabled={reportLoading}
                        className="w-full bg-violet-500 text-white py-3 rounded-2xl text-[9px] font-black uppercase tracking-wider transition-all hover:bg-violet-600 shadow-sm active:scale-[0.98] flex items-center justify-center gap-1.5 mt-5 cursor-pointer border-none"
                      >
                        {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        לבניית תוכנית שיקום
                      </button>
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === "tasks" && (() => {
              // Calculate stats
              const total = tasks.length;
              const completed = tasks.filter(t => t.completed).length;
              const pending = total - completed;
              const percent = total ? Math.round((completed / total) * 100) : 0;

              // Filter tasks
              const filteredTasks = tasks.filter(t => {
                const matchesFilter = 
                  taskFilter === "all" || 
                  (taskFilter === "pending" && !t.completed) || 
                  (taskFilter === "completed" && t.completed);

                const matchesSearch = t.title.toLowerCase().includes(taskSearchTerm.toLowerCase());
                return matchesFilter && matchesSearch;
              });

              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  key="tasks"
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    
                    {/* Desktop Sidebar (lg:col-span-4) - sticky */}
                    <aside className="hidden lg:flex lg:col-span-4 flex-col gap-6 sticky top-20">
                      
                      {/* Add Task Button */}
                      <button 
                        onClick={() => {
                          setEditingTask(null);
                          setTaskTitle("");
                          setTaskDueDate("");
                          setTaskType("text");
                          setSubtasks([]);
                          setNewSubtaskTitle("");
                          setIsTaskModalOpen(true);
                        }}
                        className="w-full bg-gradient-to-l from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-2xl p-4 shadow-md shadow-indigo-600/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group cursor-pointer border-none"
                      >
                        <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                        <span className="text-xs font-black">הוספת משימה למשתתף</span>
                      </button>

                      {/* Search Input */}
                      <div className="relative flex items-center">
                        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]/40" />
                        <input
                          type="text"
                          placeholder="חיפוש משימה..."
                          value={taskSearchTerm}
                          onChange={e => setTaskSearchTerm(e.target.value)}
                          className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] rounded-2xl pr-10 pl-4 h-12 text-xs font-bold outline-none focus:border-indigo-500/30 transition-all placeholder:text-[var(--foreground)]/30"
                        />
                      </div>

                      {/* Vertical Filters */}
                      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-2 shadow-sm space-y-1">
                        {[
                          { id: "all", label: "כל המשימות", count: total, color: "text-[var(--foreground)]/60 bg-[var(--foreground)]/5" },
                          { id: "pending", label: "בביצוע", count: pending, color: "text-rose-405 bg-rose-500/10 border border-rose-500/10" },
                          { id: "completed", label: "הושלמו", count: completed, color: "text-emerald-400 bg-emerald-500/10 border border-emerald-500/10" },
                        ].map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setTaskFilter(t.id as any)}
                            className={`w-full px-4 h-11 rounded-xl text-xs font-black transition-all flex items-center justify-between cursor-pointer border-none ${
                              taskFilter === t.id
                                ? "bg-[var(--foreground)]/5 text-indigo-500 font-extrabold"
                                : "text-[var(--foreground)]/60 hover:bg-[var(--foreground)]/[0.02] hover:text-[var(--foreground)] bg-transparent"
                            }`}
                          >
                            <span>{t.label}</span>
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold ${t.color}`}>{t.count}</span>
                          </button>
                        ))}
                      </div>

                      {/* Quick stats panel */}
                      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
                        <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-wider">סטטיסטיקת משימות</h4>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-bold text-[var(--muted)]">
                            <span>התקדמות כללית</span>
                            <span className="font-mono text-indigo-500">{percent}%</span>
                          </div>
                          <div className="w-full h-2 bg-[var(--foreground)]/5 rounded-full overflow-hidden border border-[var(--border)]/30">
                            <div 
                              className="h-full bg-gradient-to-l from-indigo-500 to-emerald-500 rounded-full transition-all duration-300"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border)]">
                          <div className="text-center">
                            <p className="text-lg font-black text-rose-500 leading-none">{pending}</p>
                            <p className="text-[9px] font-bold text-[var(--muted)] mt-1">בביצוע</p>
                          </div>
                          <div className="text-center border-r border-[var(--border)]">
                            <p className="text-lg font-black text-emerald-500 leading-none">{completed}</p>
                            <p className="text-[9px] font-bold text-[var(--muted)] mt-1">הושלמו</p>
                          </div>
                          <div className="text-center border-r border-[var(--border)]">
                            <p className="text-lg font-black text-[var(--foreground)]/40 leading-none">{total}</p>
                            <p className="text-[9px] font-bold text-[var(--muted)] mt-1">סה"כ</p>
                          </div>
                        </div>
                      </div>

                    </aside>

                    {/* Main Content Column (lg:col-span-8) */}
                    <div className="lg:col-span-8 space-y-6">
                      
                      {/* Mobile/Tablet View Controls (hidden on desktop) */}
                      <div className="lg:hidden space-y-4">
                        {/* Search & Add row */}
                        <div className="flex gap-3">
                          <div className="relative flex-1">
                            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]/40" />
                            <input
                              type="text"
                              placeholder="חיפוש משימה..."
                              value={taskSearchTerm}
                              onChange={e => setTaskSearchTerm(e.target.value)}
                              className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] rounded-2xl pr-10 pl-4 h-12 text-xs font-bold outline-none focus:border-indigo-500/30 transition-all placeholder:text-[var(--foreground)]/30"
                            />
                          </div>
                          
                          <button 
                            onClick={() => {
                              setEditingTask(null);
                              setTaskTitle("");
                              setTaskDueDate("");
                              setTaskType("text");
                              setSubtasks([]);
                              setNewSubtaskTitle("");
                              setIsTaskModalOpen(true);
                            }}
                            className="h-12 w-12 shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl flex items-center justify-center shadow-md shadow-indigo-600/10 active:scale-95 transition-all cursor-pointer border-none"
                            title="הוספת משימה"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>

                        {/* Compact Stats widget */}
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-xl font-black text-indigo-500 leading-none">{pending}</p>
                              <p className="text-[9px] font-black text-[var(--muted)] mt-1">בביצוע</p>
                            </div>
                            <div className="w-px h-8 bg-[var(--border)] shrink-0" />
                            <div className="text-right">
                              <p className="text-xl font-black text-emerald-500 leading-none">{completed}</p>
                              <p className="text-[9px] font-black text-[var(--muted)] mt-1">הושלמו</p>
                            </div>
                            <div className="w-px h-8 bg-[var(--border)] shrink-0" />
                            <div className="text-right">
                              <p className="text-xl font-black text-[var(--foreground)]/40 leading-none">{total}</p>
                              <p className="text-[9px] font-black text-[var(--muted)] mt-1">סה"כ</p>
                            </div>
                          </div>
                          
                          <div className="text-left shrink-0">
                            <p className="text-lg font-black leading-none">{percent}<span className="text-xs font-bold text-[var(--muted)]">%</span></p>
                            <p className="text-[9px] font-black text-[var(--muted)] mt-1">התקדמות</p>
                          </div>
                        </div>

                        {/* Horizontal scrollable Filter tabs */}
                        <div className="flex bg-[var(--foreground)]/5 p-1 rounded-xl border border-[var(--border)] w-full gap-1 overflow-x-auto">
                          {[
                            { id: "all", label: "כל המשימות", count: total },
                            { id: "pending", label: "בביצוע", count: pending, color: "text-rose-400" },
                            { id: "completed", label: "הושלמו", count: completed, color: "text-emerald-400" },
                          ].map(t => (
                            <button
                              key={t.id}
                              onClick={() => setTaskFilter(t.id as any)}
                              className={`flex-1 min-w-[90px] px-3 h-8 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none ${
                                taskFilter === t.id
                                  ? "bg-[var(--card-bg)] text-indigo-500 border border-[var(--border)] shadow-sm font-extrabold"
                                  : "text-[var(--foreground)]/50 hover:text-[var(--foreground)] bg-transparent"
                              }`}
                            >
                              <span>{t.label}</span>
                              <span className={`text-[10px] opacity-75 font-mono ${t.color || ""}`}>{t.count}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tasks List Container */}
                      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-sm">
                        {tasksLoading ? (
                          <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-30">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                            <p className="text-[10px] font-black uppercase tracking-widest">טוען משימות...</p>
                          </div>
                        ) : filteredTasks.length === 0 ? (
                          <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                            <ClipboardCheck className="w-12 h-12 text-[var(--foreground)]/30 animate-pulse" />
                            <p className="text-xs font-black italic">אין משימות להצגה עבור משתתף זה</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-[var(--border)]">
                            <AnimatePresence initial={false}>
                              {filteredTasks.map(t => {
                                const hasDue = !!t.dueDate;
                                const parsedDue = hasDue ? parseISO(t.dueDate!) : null;
                                const isDueValid = parsedDue ? isValid(parsedDue) : false;
                                const dueFormatted = isDueValid ? format(parsedDue!, "dd/MM/yyyy") : "";

                                return (
                                  <motion.div
                                    key={t.id}
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className={`p-4 md:p-5 flex items-center justify-between gap-4 hover:bg-[var(--foreground)]/[0.005] transition-colors ${
                                      t.completed ? "bg-[var(--foreground)]/[0.015]" : ""
                                    }`}
                                  >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <button
                                        onClick={() => handleTogglePatientTask(t.id, t.completed)}
                                        className="shrink-0 text-indigo-500 hover:scale-110 active:scale-95 transition-all cursor-pointer border-none bg-transparent p-0"
                                      >
                                        {t.completed ? (
                                          <CheckCircle className="w-5.5 h-5.5 text-emerald-500 fill-emerald-500/10" />
                                        ) : (
                                          <Circle className="w-5.5 h-5.5 text-[var(--muted)]/40 hover:text-indigo-400" />
                                        )}
                                      </button>

                                      <div className="min-w-0 flex-1">
                                        <p className={`text-xs font-bold leading-relaxed break-words text-[var(--foreground)] ${
                                          t.completed ? "line-through opacity-40 font-medium text-[var(--muted)]" : ""
                                        }`}>
                                          {t.title}
                                        </p>

                                        {/* Subtasks Progress & Checklist */}
                                        {t.taskType === "checklist" && t.subtasks && t.subtasks.length > 0 && (() => {
                                          const totalSub = t.subtasks.length;
                                          const completedSub = t.subtasks.filter(s => s.completed).length;
                                          const progressPercent = Math.round((completedSub / totalSub) * 100);
                                          return (
                                            <>
                                              <div className="mt-3 space-y-1.5">
                                                <div className="flex items-center gap-2 text-[9px] font-black text-[var(--muted)] uppercase tracking-wider">
                                                  <span>הושלמו: {completedSub}/{totalSub} ({progressPercent}%)</span>
                                                </div>
                                                <div className="w-full max-w-[280px] h-1.5 bg-[var(--foreground)]/5 rounded-full overflow-hidden border border-[var(--border)]/30">
                                                  <div 
                                                    className="h-full bg-gradient-to-l from-indigo-500 to-indigo-600 rounded-full transition-all duration-300"
                                                    style={{ width: `${progressPercent}%` }}
                                                  />
                                                </div>
                                              </div>
                                              <div className="mt-3 mr-1.5 space-y-2 border-r-2 border-indigo-500/20 pr-3.5 text-right">
                                                {t.subtasks.map(sub => (
                                                  <div key={sub.id} className="flex items-center gap-2.5 py-0.5">
                                                    <button
                                                      onClick={() => handleTogglePatientSubtask(t.id, sub.id, sub.completed)}
                                                      className="shrink-0 text-indigo-500 hover:scale-110 active:scale-95 transition-all cursor-pointer border-none bg-transparent p-0"
                                                    >
                                                      {sub.completed ? (
                                                        <CheckCircle className="w-4.5 h-4.5 text-emerald-500 fill-emerald-500/10" />
                                                      ) : (
                                                        <Circle className="w-4 h-4 text-[var(--muted)]/40 hover:text-indigo-400" />
                                                      )}
                                                    </button>
                                                    <span className={`text-[11px] font-bold leading-normal ${sub.completed ? "line-through opacity-45 font-medium text-[var(--muted)]" : "text-[var(--foreground)]"}`}>
                                                      {sub.title}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            </>
                                          );
                                        })()}

                                        {/* Badges row */}
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">
                                          {hasDue && (
                                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md border shrink-0 ${
                                              t.completed 
                                                ? "bg-[var(--foreground)]/5 border-[var(--border)] text-[var(--muted)]/50" 
                                                : "bg-indigo-500/8 border-indigo-500/15 text-indigo-500"
                                            }`}>
                                              <Calendar className="w-3 h-3" />
                                              <span>יעד: {dueFormatted}</span>
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        onClick={() => {
                                          setEditingTask(t);
                                          setTaskTitle(t.title);
                                          setTaskDueDate(t.dueDate || "");
                                          setTaskType(t.taskType || "text");
                                          setSubtasks(t.subtasks || []);
                                          setNewSubtaskTitle("");
                                          setIsTaskModalOpen(true);
                                        }}
                                        className="p-2 text-[var(--muted)]/40 hover:text-indigo-500 hover:bg-indigo-500/5 rounded-xl transition-all cursor-pointer border-none bg-transparent"
                                        title="ערוך משימה"
                                      >
                                        <Edit3 className="w-4 h-4" />
                                      </button>

                                      <button
                                        onClick={() => handleDeletePatientTask(t.id)}
                                        className="p-2 text-[var(--muted)]/40 hover:text-rose-500 hover:bg-rose-500/5 rounded-xl transition-all cursor-pointer border-none bg-transparent"
                                        title="מחק משימה"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>

                    </div>

                  </div>
                </motion.div>
              );
            })()}
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
                  <div style={{ textAlign: "left", marginBottom: "24px", fontSize: "16px", color: "#000000", fontWeight: "bold" }}>
                    תאריך: {stayLetterDate}
                  </div>

                  {/* Recipient */}
                  <div style={{ fontSize: "16px", marginBottom: "24px", fontWeight: 700 }}>
                    עבור: {stayRecipient}
                  </div>

                  {/* Title */}
                  <div style={{ textAlign: "center", marginBottom: "32px" }}>
                    <h3 style={{ fontSize: "26px", fontWeight: 900, margin: "0 0 8px 0", color: "#1e293b" }}>אישור שהייה בחווה שיקומית</h3>
                  </div>

                  {/* Body */}
                  <div style={{ fontSize: "16px", color: "#000000" }}>
                    <p style={{ marginBottom: "16px" }}>הנדון: <strong>{stayFirstName} {stayLastName}</strong></p>
                    <p style={{ marginBottom: "24px" }}>ת.ז: <strong>{stayIdNumber}</strong></p>
                    
                    <p style={{ marginBottom: "20px", lineHeight: 1.8 }}>
                      הרינו לאשר כי החל בהגעה לחווה מהתאריך <strong>{stayStartDate}</strong>.
                    </p>
                    <p style={{ marginBottom: "20px", lineHeight: 1.8 }}>
                      הפעילות בחווה בתוכנית {stayProgramName} מתקיימת {stayActivityDays} בין השעות {stayActivityHours}.
                    </p>
                    <p style={{ marginBottom: "36px", lineHeight: 1.8 }}>
                      {programs.find(p => p.id === (patient as any)?.programId)?.participationActivityDetail || reportSettings?.participationActivityDetail || "הפעילויות השונות המתקיימות בחווה: עבודה חקלאית, גילוף בעץ ומלאכות קדומות, דיקור, יוגה, סדנאות שונות ושיחות קבוצתיות."}
                    </p>

                    {/* Signature Area on the left */}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "40px" }}>
                      <div style={{ width: "220px", textAlign: "right" }}>
                        <p style={{ margin: "0 0 8px 0" }}>בברכה,</p>
                        
                        {signatureImage ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <img 
                              src={signatureImage} 
                              alt="חתימה דיגיטלית" 
                              style={{ maxHeight: "64px", maxWidth: "160px", objectFit: "contain", marginBottom: "4px" }} 
                            />
                            <p style={{ fontWeight: "bold", margin: 0 }}>{staySignatoryName}</p>
                            <p style={{ margin: 0 }}>{staySignatoryTitle}</p>
                            <p style={{ margin: 0 }}>{staySignatoryOrg}</p>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ height: "48px", borderBottom: "1px dashed #cbd5e1", width: "160px", marginBottom: "8px" }} />
                            <p style={{ fontWeight: "bold", margin: 0 }}>{staySignatoryName}</p>
                            <p style={{ margin: 0 }}>{staySignatoryTitle}</p>
                            <p style={{ margin: 0 }}>{staySignatoryOrg}</p>
                          </div>
                        )}
                      </div>
                    </div>
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
                    עבור: {travelRecipient}
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
                    {programs.find(p => p.id === (patient as any)?.programId)?.travelActivityDetail || reportSettings?.travelActivityDetail || "הפעילויות השונות המתקיימות בחווה: עבודה חקלאית, גילוף בעץ ומלאכות קדומות, דיקור, יוגה, סדנאות שונות ושיחות קבוצתיות."}
                  </p>

                  <p style={{ marginBottom: "50px" }}>
                    הנ"ל מבקש החזר נסיעות עבור ההגעה לחווה
                    <br />
                    בתאריכים:
                    <strong style={{ display: "block", fontWeight: "bold", textDecoration: "underline", whiteSpace: "pre-wrap", marginTop: "5px" }}>
                      {getTravelAttendanceDates()}
                    </strong>
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
                className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-[2rem] shadow-2xl overflow-hidden p-6 md:p-8 z-10 my-8"
                dir="rtl"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900">
                        הפקת מכתב החזר נסיעות חודשי
                      </h3>
                      <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {travelStep === "details" && "שלב א׳: הגדרת פרטי המשתתף והתאריכים"}
                        {travelStep === "signatory" && "שלב ב׳: הגדרת מורשה החתימה"}
                        {travelStep === "preview" && "שלב ג׳: תצוגה מקדימה ואישור סופי"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowTravelModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer border-none"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Stepper Indicator */}
                <div className="flex items-center justify-center gap-2 mb-6 select-none max-w-md mx-auto">
                  {[
                    { step: "details", label: "פרטים" },
                    { step: "signatory", label: "חתימה" },
                    { step: "preview", label: "תצוגה מקדימה" }
                  ].map((s, idx, arr) => (
                    <div key={s.step} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setTravelStep(s.step as any)}
                        className="flex items-center gap-1.5 cursor-pointer bg-transparent border-none outline-none p-0"
                      >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                          travelStep === s.step 
                            ? "bg-sky-500 text-white shadow-sm shadow-sky-500/20" 
                            : s.step === "details" || (s.step === "signatory" && travelStep === "preview")
                              ? "bg-sky-100 text-sky-700" 
                              : "bg-slate-100 text-slate-400"
                        }`}>
                          {idx + 1}
                        </span>
                        <span className={`text-[10px] font-black transition-all ${
                          travelStep === s.step ? "text-slate-900" : "text-slate-400"
                        }`}>
                          {s.label}
                        </span>
                      </button>
                      {idx < arr.length - 1 && (
                        <div className={`w-8 md:w-12 h-0.5 mx-2 rounded ${
                          (s.step === "details" && (travelStep === "signatory" || travelStep === "preview"))
                            ? "bg-sky-200"
                            : "bg-slate-100"
                        }`} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Step Content */}
                <div className="space-y-4 max-h-[50vh] overflow-y-auto px-1 scrollbar-thin">
                  {travelStep === "details" && (
                    <div className="space-y-4">
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
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">עבור (נמען):</label>
                          <input
                            type="text"
                            value={travelRecipient}
                            onChange={(e) => setTravelRecipient(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שם פרטי:</label>
                          <input
                            type="text"
                            value={travelFirstName}
                            onChange={(e) => setTravelFirstName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                          />
                        </div>
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

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שעות פעילות בחווה:</label>
                          <input
                            type="text"
                            value={travelActivityHours}
                            onChange={(e) => setTravelActivityHours(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">בחר חודשים רלוונטיים (ניתן לבחור יותר מחודש אחד):</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                          {Array.from({ length: 12 }).map((_, i) => {
                            const d = subMonths(new Date(), i);
                            const monthVal = format(d, "yyyy-MM");
                            const monthLabel = format(d, "MMMM yyyy", { locale: he });
                            const isChecked = travelSelectedMonths.includes(monthVal);
                            return (
                              <label key={i} className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer p-1 hover:bg-slate-200/50 rounded-lg select-none">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    let next;
                                    if (e.target.checked) {
                                      next = [...travelSelectedMonths, monthVal];
                                    } else {
                                      next = travelSelectedMonths.filter(m => m !== monthVal);
                                    }
                                    setTravelSelectedMonths(next);
                                    updateTravelAttendanceDates(next);
                                  }}
                                  className="rounded text-sky-500 focus:ring-sky-500 border-slate-300"
                                />
                                <span>{monthLabel}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">תאריכי הגעה בחודש:</label>
                        <textarea
                          rows={3}
                          value={travelAttendanceDatesStr}
                          onChange={(e) => setTravelAttendanceDatesStr(e.target.value)}
                          placeholder="תאריכים לכל חודש"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold resize-y text-right"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">אופן הגעה / אמצעי תחבורה:</label>
                          <input
                            type="text"
                            value={travelTransportationMethod}
                            onChange={(e) => setTravelTransportationMethod(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">סה״כ ימי הגעה בפועל בחודש (למשל: 12):</label>
                          <input
                            type="text"
                            value={travelTotalDays}
                            onChange={(e) => setTravelTotalDays(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {travelStep === "signatory" && (
                    <div className="space-y-4 py-4">
                      <h4 className="text-[11px] font-black uppercase text-slate-900 mb-2 border-b border-slate-100 pb-2">פרטי חתימה מורשית</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שם מורשה חתימה:</label>
                          <input
                            type="text"
                            value={travelSignatoryName}
                            onChange={(e) => setTravelSignatoryName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">תפקיד:</label>
                          <input
                            type="text"
                            value={travelSignatoryTitle}
                            onChange={(e) => setTravelSignatoryTitle(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">ארגון:</label>
                          <input
                            type="text"
                            value={travelSignatoryOrg}
                            onChange={(e) => setTravelSignatoryOrg(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-sky-500 transition-all font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {travelStep === "preview" && (
                    <div className="space-y-3 py-2">
                      <div className="border border-slate-200 rounded-3xl p-5 md:p-6 bg-slate-50 max-h-[40vh] overflow-y-auto font-sans leading-relaxed text-slate-800 text-right shadow-inner select-text scrollbar-thin">
                        <div className="flex justify-between items-start border-b border-slate-200/60 pb-3 mb-4">
                          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">תצוגה מקדימה רשמית</div>
                          <div className="text-xs font-bold text-slate-600">{travelLetterDate}</div>
                        </div>
                        <div className="space-y-4 text-xs">
                          <div className="font-bold">לכבוד: {travelRecipient}</div>
                          <div className="text-center font-black text-sm text-slate-900 underline my-2">אישור נוכחות והחזר נסיעות חודשי</div>
                          <div className="font-bold">הנדון: {travelFirstName} {travelLastName} — ת.ז. {travelIdNumber}</div>
                          <div className="space-y-2 text-slate-700 leading-relaxed">
                            <p>הרינו לאשר בזאת כי {travelFirstName} {travelLastName} שולב בתהליך השיקום בחוות רום החל מתאריך {travelApprovalStartDate}.</p>
                            <p>הפעילות בתוכנית "{travelProgramName}" מתקיימת בימים {travelActivityDays.replace(/^(בימים|ביום)\s+/, "")} בין השעות {travelActivityHours}.</p>
                            {travelTransportationMethod && <p>אופן ההגעה לחווה: {travelTransportationMethod}.</p>}
                            {travelTotalDays && <p>סה"כ ימי הגעה בפועל בחודש זה: {travelTotalDays}.</p>}
                            <p className="italic text-slate-500 bg-white border border-slate-100 rounded-xl p-3 text-[11px] my-2">
                              {programs.find(p => p.id === (patient as any)?.programId)?.travelActivityDetail || reportSettings?.travelActivityDetail || "הפעילות השיקומית בחווה מקיפה מגוון תחומים ובהם: עבודה חקלאית יומיומית, מלאכות יד וגילוף, סדנאות יוגה וקבוצות שיח תמיכתיות."}
                            </p>
                            <p className="font-bold mt-4">הנ"ל מבקש החזר נסיעות עבור ההגעה לחווה בתאריכים:</p>
                            <div className="mr-4 space-y-1 bg-white border border-slate-100 rounded-xl p-3">
                              {travelAttendanceDatesStr.split("\n").map((line, idx) => (
                                <div key={idx} className="font-bold underline text-slate-800">{line}</div>
                              ))}
                            </div>
                          </div>
                          <div className="border-t border-slate-200/60 pt-3 mt-4 space-y-0.5 font-bold">
                            <div>בברכה,</div>
                            <div>{travelSignatoryName}</div>
                            <div className="text-slate-500 text-[10px]">{travelSignatoryTitle}, {travelSignatoryOrg}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="pt-6 border-t border-slate-100 flex flex-row gap-3">
                  {travelStep === "details" && (
                    <>
                      <button
                        onClick={() => setTravelStep("signatory")}
                        className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] cursor-pointer border-none"
                      >
                        המשך לשלב הבא
                      </button>
                      <button
                        onClick={() => setShowTravelModal(false)}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                      >
                        ביטול
                      </button>
                    </>
                  )}

                  {travelStep === "signatory" && (
                    <>
                      <button
                        onClick={() => setTravelStep("preview")}
                        className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] cursor-pointer border-none"
                      >
                        המשך לתצוגה מקדימה
                      </button>
                      <button
                        onClick={() => setTravelStep("details")}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                      >
                        חזור
                      </button>
                    </>
                  )}

                  {travelStep === "preview" && (
                    <>
                      <button
                        onClick={executeTravelWordGeneration}
                        disabled={reportLoading}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer border-none"
                      >
                        {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        הורד קובץ Word
                      </button>
                      <button
                        onClick={() => setTravelStep("signatory")}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                      >
                        חזור
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Stay / Participation Modal */}
        <AnimatePresence>
          {showStayModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowStayModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-[2rem] shadow-2xl overflow-hidden p-6 md:p-8 z-10 my-8"
                dir="rtl"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900">
                        הפקת אישור שהייה בחווה
                      </h3>
                      <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {stayStep === "details" && "שלב א׳: הגדרת פרטי המשתתף והתאריכים"}
                        {stayStep === "signatory" && "שלב ב׳: הגדרת מורשה החתימה"}
                        {stayStep === "preview" && "שלב ג׳: תצוגה מקדימה ואישור סופי"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowStayModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer border-none"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Stepper Indicator */}
                <div className="flex items-center justify-center gap-2 mb-6 select-none max-w-md mx-auto">
                  {[
                    { step: "details", label: "פרטים" },
                    { step: "signatory", label: "חתימה" },
                    { step: "preview", label: "תצוגה מקדימה" }
                  ].map((s, idx, arr) => (
                    <div key={s.step} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setStayStep(s.step as any)}
                        className="flex items-center gap-1.5 cursor-pointer bg-transparent border-none outline-none p-0"
                      >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                          stayStep === s.step 
                            ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20" 
                            : s.step === "details" || (s.step === "signatory" && stayStep === "preview")
                              ? "bg-emerald-100 text-emerald-700" 
                              : "bg-slate-100 text-slate-400"
                        }`}>
                          {idx + 1}
                        </span>
                        <span className={`text-[10px] font-black transition-all ${
                          stayStep === s.step ? "text-slate-900" : "text-slate-400"
                        }`}>
                          {s.label}
                        </span>
                      </button>
                      {idx < arr.length - 1 && (
                        <div className={`w-8 md:w-12 h-0.5 mx-2 rounded ${
                          (s.step === "details" && (stayStep === "signatory" || stayStep === "preview"))
                            ? "bg-emerald-200"
                            : "bg-slate-100"
                        }`} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Step Content */}
                <div className="space-y-4 max-h-[50vh] overflow-y-auto px-1 scrollbar-thin">
                  {stayStep === "details" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">תאריך המכתב:</label>
                          <input
                            type="text"
                            value={stayLetterDate}
                            onChange={(e) => setStayLetterDate(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">עבור (נמען):</label>
                          <input
                            type="text"
                            value={stayRecipient}
                            onChange={(e) => setStayRecipient(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שם פרטי:</label>
                          <input
                            type="text"
                            value={stayFirstName}
                            onChange={(e) => setStayFirstName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שם משפחה:</label>
                          <input
                            type="text"
                            value={stayLastName}
                            onChange={(e) => setStayLastName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">תעודת זהות:</label>
                          <input
                            type="text"
                            value={stayIdNumber}
                            onChange={(e) => setStayIdNumber(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">החל מהתאריך (תאריך כניסה):</label>
                          <input
                            type="text"
                            value={stayStartDate}
                            onChange={(e) => setStayStartDate(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שם התוכנית:</label>
                          <input
                            type="text"
                            value={stayProgramName}
                            onChange={(e) => setStayProgramName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">ימי פעילות בחווה:</label>
                          <input
                            type="text"
                            value={stayActivityDays}
                            onChange={(e) => setStayActivityDays(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שעות פעילות:</label>
                          <input
                            type="text"
                            value={stayActivityHours}
                            onChange={(e) => setStayActivityHours(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">מסלול התוכנית (למשל: שיקום תעסוקתי):</label>
                          <input
                            type="text"
                            value={stayProgramTrack}
                            onChange={(e) => setStayProgramTrack(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">גורם מממן:</label>
                          <input
                            type="text"
                            value={stayFundingSource}
                            onChange={(e) => setStayFundingSource(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">הערות והנחיות מיוחדות:</label>
                        <textarea
                          rows={2}
                          value={staySpecialRemarks}
                          onChange={(e) => setStaySpecialRemarks(e.target.value)}
                          placeholder="למשל: הנחיות מיוחדות..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold text-right resize-y"
                        />
                      </div>
                    </div>
                  )}

                  {stayStep === "signatory" && (
                    <div className="space-y-4 py-4">
                      <h4 className="text-[11px] font-black uppercase text-slate-900 mb-2 border-b border-slate-100 pb-2">פרטי חתימה מורשית</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שם מורשה חתימה:</label>
                          <input
                            type="text"
                            value={staySignatoryName}
                            onChange={(e) => setStaySignatoryName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">תפקיד:</label>
                          <input
                            type="text"
                            value={staySignatoryTitle}
                            onChange={(e) => setStaySignatoryTitle(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">ארגון:</label>
                          <input
                            type="text"
                            value={staySignatoryOrg}
                            onChange={(e) => setStaySignatoryOrg(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {stayStep === "preview" && (
                    <div className="space-y-3 py-2">
                      <div className="border border-slate-200 rounded-3xl p-5 md:p-6 bg-slate-50 max-h-[40vh] overflow-y-auto font-sans leading-relaxed text-slate-800 text-right shadow-inner select-text scrollbar-thin">
                        <div className="flex justify-between items-start border-b border-slate-200/60 pb-3 mb-4">
                          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">תצוגה מקדימה רשמית</div>
                          <div className="text-xs font-bold text-slate-600">{stayLetterDate}</div>
                        </div>
                        <div className="space-y-4 text-xs">
                          <div className="font-bold">לכבוד: {stayRecipient}</div>
                          <div className="text-center font-black text-sm text-slate-900 underline my-2">אישור שהייה בחווה שיקומית</div>
                          <div className="font-bold">הנדון: {stayFirstName} {stayLastName} — ת.ז. {stayIdNumber}</div>
                          <div className="space-y-2 text-slate-700 leading-relaxed">
                            <p>הרינו לאשר בזאת כי {stayFirstName} {stayLastName} שולב בתהליך השיקום בחוות רום החל מתאריך {stayStartDate}.</p>
                            <p>הפעילות בתוכנית "{stayProgramName}"{stayProgramTrack ? ` (${stayProgramTrack})` : ""} מתקיימת בימים {stayActivityDays.replace(/^(בימים|ביום)\s+/, "")} בין השעות {stayActivityHours}.</p>
                            {stayFundingSource && <p>המימון לפעילות מוסדר באמצעות: {stayFundingSource}.</p>}
                            {staySpecialRemarks && <p>הערות והנחיות מיוחדות: {staySpecialRemarks}</p>}
                            <p className="italic text-slate-500 bg-white border border-slate-100 rounded-xl p-3 text-[11px] my-2">
                              {programs.find(p => p.id === (patient as any)?.programId)?.participationActivityDetail || reportSettings?.participationActivityDetail || "תחומי העשייה המגוונים במסגרת שהותו בחווה כוללים: עבודה חקלאית בשדות ובחממות, גילוף בעץ ומלאכות קדומות, סדנאות יצירה ואמנות, תרגול יוגה ונשימה בקבוצה וליווי רגשי מתמשך."}
                            </p>
                          </div>
                          <div className="border-t border-slate-200/60 pt-3 mt-4 space-y-0.5 font-bold">
                            <div>בברכה,</div>
                            <div>{staySignatoryName}</div>
                            <div className="text-slate-500 text-[10px]">{staySignatoryTitle}, {staySignatoryOrg}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="pt-6 border-t border-slate-100 flex flex-row gap-3">
                  {stayStep === "details" && (
                    <>
                      <button
                        onClick={() => setStayStep("signatory")}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] cursor-pointer border-none"
                      >
                        המשך לשלב הבא
                      </button>
                      <button
                        onClick={() => setShowStayModal(false)}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                      >
                        ביטול
                      </button>
                    </>
                  )}

                  {stayStep === "signatory" && (
                    <>
                      <button
                        onClick={() => setStayStep("preview")}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] cursor-pointer border-none"
                      >
                        המשך לתצוגה מקדימה
                      </button>
                      <button
                        onClick={() => setStayStep("details")}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                      >
                        חזור
                      </button>
                    </>
                  )}

                  {stayStep === "preview" && (
                    <>
                      <button
                        onClick={executeStayWordGeneration}
                        disabled={reportLoading}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer border-none"
                      >
                        {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        הורד קובץ Word
                      </button>
                      <button
                        onClick={() => setStayStep("signatory")}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                      >
                        חזור
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Periodic Report Modal */}
        <AnimatePresence>
          {showPeriodicModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowPeriodicModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-[2rem] shadow-2xl overflow-hidden p-6 md:p-8 z-10 my-8"
                dir="rtl"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-500 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900">
                        הפקת דו״ח תקופתי
                      </h3>
                      <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {periodicStep === "survey" && "שלב א׳: שאלון הערכה מהיר להתאמת תוכן"}
                        {periodicStep === "form" && "שלב ב׳: עריכת פרטי הדו״ח התקופתי"}
                        {periodicStep === "preview" && "שלב ג׳: תצוגה מקדימה ואישור סופי"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {periodicStep === "preview" && (
                      <button
                        onClick={() => setPeriodicStep("form")}
                        className="px-3 py-1.5 hover:bg-slate-100 text-violet-600 rounded-xl text-xs font-black transition-all border border-slate-200 flex items-center gap-1 cursor-pointer border-none shrink-0"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                        חזור לעריכה
                      </button>
                    )}
                    {periodicStep === "form" && (
                      <button
                        onClick={() => setPeriodicStep("survey")}
                        className="px-3 py-1.5 hover:bg-slate-100 text-violet-600 rounded-xl text-xs font-black transition-all border border-slate-200 flex items-center gap-1 cursor-pointer border-none shrink-0"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                        חזור לשאלון
                      </button>
                    )}
                    <button
                      onClick={() => setShowPeriodicModal(false)}
                      className="p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer border-none"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Stepper Indicator */}
                <div className="flex items-center justify-center gap-2 mb-6 select-none max-w-md mx-auto">
                  {[
                    { step: "survey", label: "שאלון" },
                    { step: "form", label: "עריכה" },
                    { step: "preview", label: "תצוגה מקדימה" }
                  ].map((s, idx, arr) => (
                    <div key={s.step} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (s.step === "survey") setPeriodicStep("survey");
                          else if (s.step === "form" && (periodicStep === "form" || periodicStep === "preview")) setPeriodicStep("form");
                          else if (s.step === "preview" && periodicStep === "preview") setPeriodicStep("preview");
                        }}
                        disabled={s.step === "preview" && periodicStep === "survey"}
                        className="flex items-center gap-1.5 cursor-pointer bg-transparent border-none outline-none p-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                          periodicStep === s.step 
                            ? "bg-violet-500 text-white shadow-sm shadow-violet-500/20" 
                            : s.step === "survey" || (s.step === "form" && periodicStep === "preview")
                              ? "bg-violet-100 text-violet-700" 
                              : "bg-slate-100 text-slate-400"
                        }`}>
                          {idx + 1}
                        </span>
                        <span className={`text-[10px] font-black transition-all ${
                          periodicStep === s.step ? "text-slate-900" : "text-slate-400"
                        }`}>
                          {s.label}
                        </span>
                      </button>
                      {idx < arr.length - 1 && (
                        <div className={`w-8 md:w-12 h-0.5 mx-2 rounded ${
                          (s.step === "survey" && (periodicStep === "form" || periodicStep === "preview"))
                            ? "bg-violet-200"
                            : "bg-slate-100"
                        }`} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Step Content */}
                <div className="space-y-4 max-h-[50vh] overflow-y-auto px-1 scrollbar-thin">
                  {periodicStep === "survey" ? (
                    <ParticipantSurveyStep
                      profile={profile}
                      onChange={setProfile}
                      onSubmit={applyPeriodicSurvey}
                      onCancel={() => setShowPeriodicModal(false)}
                    />
                  ) : periodicStep === "form" ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">סוג הדו״ח:</label>
                          <select
                            value={periodicReportType}
                            onChange={(e: any) => setPeriodicReportType(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          >
                            <option value="דו&quot;ח השמה">דו״ח השמה</option>
                            <option value="דו&quot;ח עזיבה">דו״ח עזיבה</option>
                            <option value="דו&quot;ח חצי שנתי">דו״ח חצי שנתי</option>
                            <option value="דו&quot;ח סיכום תקופה">דו״ח סיכום תקופה</option>
                            <option value="בקשה להארכה">בקשה להארכה</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">תאריך המכתב:</label>
                          <input
                            type="text"
                            value={periodicLetterDate}
                            onChange={(e) => setPeriodicLetterDate(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">תעודת זהות:</label>
                          <input
                            type="text"
                            placeholder="000000000"
                            value={periodicIdNumber}
                            onChange={(e) => setPeriodicIdNumber(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">עבור (נמען):</label>
                          <input
                            type="text"
                            value={periodicRecipient}
                            onChange={(e) => setPeriodicRecipient(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">עו״ס במשרד הביטחון:</label>
                          <input
                            type="text"
                            value={periodicRehabWorker}
                            onChange={(e) => setPeriodicRehabWorker(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">לשכת מחוז השיקום:</label>
                          <input
                            type="text"
                            value={periodicRehabDistrict}
                            onChange={(e) => setPeriodicRehabDistrict(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">מתייחס לתקופה מתאריך:</label>
                          <input
                            type="text"
                            placeholder="לדוגמה: 01.06.2026"
                            value={periodicPeriodStart}
                            onChange={(e) => setPeriodicPeriodStart(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">עד תאריך:</label>
                          <input
                            type="text"
                            placeholder="לדוגמה: 30.06.2026"
                            value={periodicPeriodEnd}
                            onChange={(e) => setPeriodicPeriodEnd(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">1. תיאור תוכנית השיקום:</label>
                        <textarea
                          value={periodicRehabDescription}
                          onChange={(e) => setPeriodicRehabDescription(e.target.value)}
                          placeholder="הזן תיאור מפורט..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold min-h-[80px] text-right"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">1א. סטטוס התקדמות כללי:</label>
                          <input
                            type="text"
                            value={periodicProgressStatus}
                            onChange={(e) => setPeriodicProgressStatus(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">1ב. מידת שיתוף פעולה:</label>
                          <input
                            type="text"
                            value={periodicCooperationLevel}
                            onChange={(e) => setPeriodicCooperationLevel(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">1ג. תפקוד בסדנאות ועבודה חקלאית:</label>
                          <input
                            type="text"
                            value={periodicWorkshopPerformance}
                            onChange={(e) => setPeriodicWorkshopPerformance(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">2. מקום ההשמה:</label>
                          <input
                            type="text"
                            value={periodicPlacementLocation}
                            onChange={(e) => setPeriodicPlacementLocation(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">3. ימי פעילות:</label>
                          <input
                            type="text"
                            value={periodicWorkDays}
                            onChange={(e) => setPeriodicWorkDays(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שעות פעילות:</label>
                          <input
                            type="text"
                            value={periodicWorkHours}
                            onChange={(e) => setPeriodicWorkHours(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">4. סיכום תהליך הליווי / השתלבות:</label>
                        <textarea
                          value={periodicSummaryProcess}
                          onChange={(e) => setPeriodicSummaryProcess(e.target.value)}
                          placeholder="הזן סיכום מפורט..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold min-h-[80px] text-right"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">5. המלצות להמשך:</label>
                          {(periodicReportType === "דו\"ח סיכום תקופה" || periodicReportType === "בקשה להארכה") && (
                            <div className="flex flex-col gap-1 my-1">
                              <span className="text-[9px] font-bold text-slate-500">המלצות מהירות להארכת שהות:</span>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPeriodicRecommendations("הארכת תקופת השהות בעוד 3 חודשים, סה״כ שהות בחווה לחצי שנה.")}
                                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${
                                    periodicRecommendations === "הארכת תקופת השהות בעוד 3 חודשים, סה״כ שהות בחווה לחצי שנה."
                                      ? "bg-violet-50 border-violet-500 text-violet-700 shadow-sm font-black"
                                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  הארכת תקופת השהות ב-3 חודשים (חצי שנה סה״כ)
                                </button>
                                {patient?.extensionReceived && (
                                  <button
                                    type="button"
                                    onClick={() => setPeriodicRecommendations("הארכת השהות בעוד חודש (נועדה לאפשר במקרים מסויימים הערכות מייטבית להמשך השיקום לאחר החווה).")}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${
                                      periodicRecommendations === "הארכת השהות בעוד חודש (נועדה לאפשר במקרים מסויימים הערכות מייטבית להמשך השיקום לאחר החווה)."
                                        ? "bg-violet-50 border-violet-500 text-violet-700 shadow-sm font-black"
                                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    }`}
                                  >
                                    הארכת השהות בחודש נוסף (לאחר קבלת חצי שנה)
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <textarea
                          value={periodicRecommendations}
                          onChange={(e) => setPeriodicRecommendations(e.target.value)}
                          placeholder="הזן המלצות להמשך..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold min-h-[80px] text-right"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">5א. יעד מרכזי לתקופה הבאה:</label>
                        <textarea
                          value={periodicNextPeriodGoal}
                          onChange={(e) => setPeriodicNextPeriodGoal(e.target.value)}
                          placeholder="הזן יעד מרכזי..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold min-h-[60px] text-right resize-y"
                        />
                      </div>

                      <div className="space-y-1.5 border-t border-slate-100 pt-3 mt-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">שם עו״ס החווה (חתימה):</label>
                        <input
                          type="text"
                          value={periodicFarmSocialWorker}
                          onChange={(e) => setPeriodicFarmSocialWorker(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 py-2">
                      <div className="border border-slate-200 rounded-3xl p-5 md:p-6 bg-slate-50 max-h-[40vh] overflow-y-auto font-sans leading-relaxed text-slate-800 text-right shadow-inner select-text scrollbar-thin">
                        <div className="flex justify-between items-start border-b border-slate-200/60 pb-3 mb-4">
                          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">תצוגה מקדימה רשמית</div>
                          <div className="text-xs font-bold text-slate-600">{periodicLetterDate}</div>
                        </div>
                        <div className="space-y-4 text-xs">
                          <div className="text-center font-black text-sm text-slate-900 underline my-2">{periodicReportType}</div>
                          <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-3">
                            <div>
                              <div className="font-bold text-slate-400 text-[9px] uppercase">לכבוד:</div>
                              <div className="font-bold">{periodicRecipient}</div>
                              <div>עו"ס במחוזה: {periodicRehabWorker}</div>
                              <div>לשכת מחוז: {periodicRehabDistrict}</div>
                            </div>
                            <div>
                              <div className="font-bold text-slate-400 text-[9px] uppercase">מאת:</div>
                              <div className="font-bold">חוות רום השקעות בע"מ</div>
                              <div>מספר ספק: 00110011722</div>
                            </div>
                          </div>
                          <div className="font-bold text-slate-900">שם הזכאי: {patient?.firstName} {patient?.lastName} | ת.ז: {periodicIdNumber || "—"}</div>
                          <div className="font-bold text-slate-900">התחיל טיפול בתאריך: {patient?.startDate ? format(parseISO(patient.startDate), "dd.MM.yyyy") : "—"}</div>
                          <div className="font-bold text-slate-900">דו"ח זה מתייחס לתקופה מ- {periodicPeriodStart} עד {periodicPeriodEnd}</div>
                          
                          <div className="space-y-4 text-slate-700 leading-relaxed pt-2">
                            <div>
                              <div className="font-black text-slate-900">1. תיאור תוכנית השיקום:</div>
                              <p className="whitespace-pre-line bg-white border border-slate-100 rounded-xl p-3 mt-1">{periodicRehabDescription}</p>
                            </div>
                            <div>
                              <div className="font-black text-slate-900">2. מקום ההשמה:</div>
                              <p className="bg-white border border-slate-100 rounded-xl p-3 mt-1">{periodicPlacementLocation}</p>
                            </div>
                            <div>
                              <div className="font-black text-slate-900">3. ימי פעילות:</div>
                              <p className="bg-white border border-slate-100 rounded-xl p-3 mt-1">ימי פעילות: {periodicWorkDays} | שעות פעילות: {periodicWorkHours}</p>
                            </div>
                            <div>
                              <div className="font-black text-slate-900">4. סיכום תהליך הליווי / השתלבות:</div>
                              <p className="whitespace-pre-line bg-white border border-slate-100 rounded-xl p-3 mt-1">{periodicSummaryProcess}</p>
                            </div>
                            <div>
                              <div className="font-black text-slate-900">5. המלצות להמשך:</div>
                              <p className="whitespace-pre-line bg-white border border-slate-100 rounded-xl p-3 mt-1">{periodicRecommendations}</p>
                            </div>
                          </div>
                          
                          <div className="border-t border-slate-200/60 pt-4 mt-6 flex justify-between font-bold text-slate-900">
                            <div>עו"ס החווה: {periodicFarmSocialWorker}</div>
                            <div>תאריך: {periodicLetterDate}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="pt-6 border-t border-slate-100 flex flex-row gap-3">
                  {periodicStep === "form" && (
                    <>
                      <button
                        onClick={() => setPeriodicStep("preview")}
                        className="flex-1 bg-violet-500 hover:bg-violet-600 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] cursor-pointer border-none"
                      >
                        המשך לתצוגה מקדימה
                      </button>
                      <button
                        onClick={() => setShowPeriodicModal(false)}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                      >
                        ביטול
                      </button>
                    </>
                  )}

                  {periodicStep === "preview" && (
                    <>
                      <button
                        onClick={executePeriodicWordGeneration}
                        disabled={reportLoading}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer border-none"
                      >
                        {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        הורד קובץ Word
                      </button>
                      <button
                        onClick={() => setPeriodicStep("form")}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                      >
                        חזור
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>


        {/* Functional Report Modal */}
        <AnimatePresence>
          {showFunctionalModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowFunctionalModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-6xl bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl overflow-hidden p-6 md:p-8 z-10 my-8 flex flex-col h-[90vh]"
                dir="rtl"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-500 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">
                        מחולל דו״ח תפקודי אינטראקטיבי
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {functionalStep === "survey"
                          ? "שלב א׳: שאלון הערכה מהיר להתאמת תוכן הדו״ח"
                          : "שלב ב׳: בחירת היגדים ועריכת הדו״ח הסופי"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {functionalStep === "editor" && (
                      <button
                        onClick={() => setFunctionalStep("survey")}
                        className="px-3 py-1.5 hover:bg-slate-100 text-violet-600 rounded-xl text-xs font-black transition-all border border-slate-200 flex items-center gap-1 cursor-pointer border-none shrink-0"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                        חזור לשאלון
                      </button>
                    )}
                    <button
                      onClick={() => setShowFunctionalModal(false)}
                      className="p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer border-none"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                {functionalStep === "survey" ? (
                  <ParticipantSurveyStep
                    profile={profile}
                    onChange={setProfile}
                    onSubmit={applyFunctionalSurvey}
                    onCancel={() => setShowFunctionalModal(false)}
                  />
                ) : (
                  <>
                    <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
                      
                      {/* Right side: Selection steps (lg:col-span-7) */}
                      <div className="lg:col-span-7 overflow-y-auto space-y-5 px-1 scrollbar-thin">
                        
                        {/* Section 1: Letter details */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                          <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5 font-bold">
                            <Calendar className="w-3.5 h-3.5 text-violet-500" />
                            פרטי מכתב וחתימה
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400">תאריך המכתב:</label>
                              <input
                                type="text"
                                value={functionalLetterDate}
                                onChange={e => setFunctionalLetterDate(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400">עבור (נמען):</label>
                              <input
                                type="text"
                                value={functionalRecipient}
                                onChange={e => setFunctionalRecipient(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400">שם עו״ס חותם:</label>
                              <input
                                type="text"
                                value={functionalSignatoryName}
                                onChange={e => setFunctionalSignatoryName(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400">תפקיד:</label>
                              <input
                                type="text"
                                value={functionalSignatoryTitle}
                                onChange={e => setFunctionalSignatoryTitle(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400">ארגון:</label>
                              <input
                                type="text"
                                value={functionalSignatoryOrg}
                                onChange={e => setFunctionalSignatoryOrg(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Section 2: Free-text report sections (pre-filled from survey, fully editable) */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                          <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5 font-bold">
                            <Info className="w-3.5 h-3.5 text-violet-500" />
                            מצב תפקודי
                          </h4>
                          <textarea
                            value={functionalTextArea}
                            onChange={e => setFunctionalTextArea(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 min-h-[70px]"
                          />
                        </div>

                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                          <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5 font-bold">
                            <AlertCircle className="w-3.5 h-3.5 text-violet-500" />
                            סימפטומים ומאפיינים
                          </h4>
                          <textarea
                            value={symptomsTextArea}
                            onChange={e => setSymptomsTextArea(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 min-h-[70px]"
                          />
                        </div>

                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                          <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5 font-bold">
                            <Users className="w-3.5 h-3.5 text-violet-500" />
                            מצב משפחתי
                          </h4>
                          <textarea
                            value={familyTextArea}
                            onChange={e => setFamilyTextArea(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 min-h-[70px]"
                          />
                        </div>

                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                          <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5 font-bold">
                            <ClipboardCheck className="w-3.5 h-3.5 text-violet-500" />
                            התקדמות בחווה
                          </h4>
                          <textarea
                            value={progressTextArea}
                            onChange={e => setProgressTextArea(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 min-h-[70px]"
                          />
                        </div>

                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                          <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5 font-bold">
                            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                            המלצות
                          </h4>
                          <textarea
                            value={recommendationsTextArea}
                            onChange={e => setRecommendationsTextArea(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-violet-500 min-h-[70px]"
                          />
                        </div>

                      </div>

                      {/* Left side: Live compiled preview text area (lg:col-span-5) */}
                      <div className="lg:col-span-5 flex flex-col h-full bg-slate-50 border border-slate-200 rounded-3xl p-4 overflow-hidden">
                        <div className="flex items-center justify-between mb-2 shrink-0">
                          <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5 font-bold">
                            <Edit3 className="w-3.5 h-3.5 text-violet-500" />
                            עריכה סופית ותצוגה מקדימה
                          </h4>
                        </div>
                        <textarea
                          value={functionalFreeText}
                          onChange={e => setFunctionalFreeText(e.target.value)}
                          className="flex-1 w-full bg-white border border-slate-200 rounded-2xl p-4 text-xs font-semibold outline-none focus:border-violet-500 transition-all resize-none text-right leading-relaxed overflow-y-auto"
                          placeholder="הדו״ח יתורגם ויופיע כאן בזמן אמת..."
                        />
                      </div>

                    </div>

                    {/* Modal Footer */}
                    <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-slate-100 mt-4 shrink-0">
                      <button
                        onClick={executeFunctionalWordGeneration}
                        disabled={reportLoading || !functionalFreeText.trim()}
                        className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-violet-600/15 cursor-pointer border-none"
                      >
                        {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        הורד קובץ Word
                      </button>
                      <button
                        onClick={() => setShowFunctionalModal(false)}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border-none"
                      >
                        ביטול
                      </button>
                    </div>
                  </>
                )}

              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Rehab Plan Modal */}
        <AnimatePresence>
          {showRehabPlanModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowRehabPlanModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl overflow-hidden p-6 md:p-8 z-10 my-8 flex flex-col max-h-[90vh]"
                dir="rtl"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-500 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">
                        מחולל תוכנית שיקום אישית
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {rehabPlanStep === "survey"
                          ? "שלב א׳: שאלון הערכה מהיר להתאמת תוכן התוכנית"
                          : "שלב ב׳: עריכת התוכנית הסופית"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {rehabPlanStep === "editor" && (
                      <button
                        onClick={() => setRehabPlanStep("survey")}
                        className="px-3 py-1.5 hover:bg-slate-100 text-violet-600 rounded-xl text-xs font-black transition-all border border-slate-200 flex items-center gap-1 cursor-pointer border-none shrink-0"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                        חזור לשאלון
                      </button>
                    )}
                    <button
                      onClick={() => setShowRehabPlanModal(false)}
                      className="p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer border-none"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                {rehabPlanStep === "survey" ? (
                  <ParticipantSurveyStep
                    profile={profile}
                    onChange={setProfile}
                    onSubmit={applyRehabPlanSurvey}
                    onCancel={() => setShowRehabPlanModal(false)}
                  />
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto space-y-4 px-1 scrollbar-thin">
                      <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                        <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5 font-bold">
                          <Calendar className="w-3.5 h-3.5 text-violet-500" />
                          פרטי מכתב וחתימה
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400">תאריך:</label>
                            <input
                              type="text"
                              value={rehabPlanDate}
                              onChange={e => setRehabPlanDate(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400">שם העו״ס במחוז:</label>
                            <input
                              type="text"
                              value={rehabPlanDistrictWorker}
                              onChange={e => setRehabPlanDistrictWorker(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400">שם איש הצוות הטיפולי בחווה:</label>
                            <input
                              type="text"
                              value={rehabPlanTherapistName}
                              onChange={e => setRehabPlanTherapistName(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400">תפקיד:</label>
                            <input
                              type="text"
                              value={rehabPlanTherapistTitle}
                              onChange={e => setRehabPlanTherapistTitle(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 transition-all font-bold"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                        <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5 font-bold">
                          <Edit3 className="w-3.5 h-3.5 text-violet-500" />
                          תוכן התוכנית (א. תחומים לשיפור / ב. מטרה ספציפית / ג. דרכים להשגת המטרה / ד. מקורות סיוע)
                        </h4>
                        <textarea
                          value={rehabPlanEditableText}
                          onChange={e => setRehabPlanEditableText(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-xs font-semibold outline-none focus:border-violet-500 transition-all text-right leading-relaxed min-h-[250px]"
                        />
                      </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-slate-100 mt-4 shrink-0">
                      <button
                        onClick={executeRehabPlanGeneration}
                        disabled={reportLoading || !rehabPlanEditableText.trim()}
                        className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-violet-600/15 cursor-pointer border-none"
                      >
                        {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        הורד קובץ Word
                      </button>
                      <button
                        onClick={() => setShowRehabPlanModal(false)}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border-none"
                      >
                        ביטול
                      </button>
                    </div>
                  </>
                )}

              </motion.div>
            </div>
          )}
        </AnimatePresence>


        {/* Add / Edit Task Modal */}
        <AnimatePresence>
          {isTaskModalOpen && (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setIsTaskModalOpen(false);
                  setEditingTask(null);
                }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />

              {/* Modal Content */}
              <motion.div
                initial={{ opacity: 0, y: "100%" }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 250 }}
                className="relative w-full h-[100dvh] md:h-auto md:max-w-xl bg-[var(--surface)] border-none md:border border-[var(--border)] rounded-none md:rounded-[2rem] shadow-2xl flex flex-col z-10 overflow-hidden"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-5 md:p-6 border-b border-[var(--border)] shrink-0 bg-[var(--surface)]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                      <ClipboardCheck className="w-4.5 h-4.5" />
                    </div>
                    <div className="text-right">
                      <h3 className="text-sm font-black text-[var(--foreground)] leading-tight">
                        {editingTask ? "עריכת משימה / תזכורת" : "הוספת משימה / תזכורת חדשה"}
                      </h3>
                      <p className="text-[9px] text-[var(--muted)] font-black uppercase tracking-wider leading-none mt-0.5">
                        {editingTask ? "עדכן את פרטי המשימה עבור המשתתף" : "רשום משימה חדשה למשתתף זה"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsTaskModalOpen(false);
                      setEditingTask(null);
                    }}
                    className="p-2 hover:bg-[var(--foreground)]/5 rounded-xl transition-all"
                  >
                    <X className="w-5 h-5 text-[var(--muted)]" />
                  </button>
                </div>

                {/* Modal Body */}
                <form onSubmit={handleSavePatientTask} className="flex-1 overflow-y-auto p-5 md:p-6 flex flex-col justify-between md:justify-start h-full">
                  <div className="space-y-4 flex-1 flex flex-col">
                    {/* Task Type Toggle */}
                    <div className="space-y-1.5 text-right shrink-0">
                      <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-wider mr-1">סוג המשימה</label>
                      <div className="flex bg-[var(--foreground)]/5 p-1 rounded-xl border border-[var(--border)] gap-1">
                        <button
                          type="button"
                          onClick={() => setTaskType("text")}
                          className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                            taskType === "text"
                              ? "bg-[var(--card-bg)] text-indigo-500 border border-[var(--border)] shadow-sm font-extrabold"
                              : "text-[var(--foreground)]/50 hover:text-[var(--foreground)]"
                          }`}
                        >
                          משימה פשוטה (טקסט)
                        </button>
                        <button
                          type="button"
                          onClick={() => setTaskType("checklist")}
                          className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                            taskType === "checklist"
                              ? "bg-[var(--card-bg)] text-indigo-500 border border-[var(--border)] shadow-sm font-extrabold"
                              : "text-[var(--foreground)]/50 hover:text-[var(--foreground)]"
                          }`}
                        >
                          רשימת תתי-משימות (Checklist)
                        </button>
                      </div>
                    </div>

                    {/* Task Title */}
                    <div className="space-y-1.5 text-right shrink-0">
                      <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-wider mr-1 shrink-0">נושא / תיאור המשימה *</label>
                      <textarea
                        required
                        placeholder="הקלד את נושא המשימה..."
                        value={taskTitle}
                        onChange={e => setTaskTitle(e.target.value)}
                        className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-2xl p-3 h-20 text-xs font-bold outline-none focus:border-indigo-500/30 transition-all placeholder:text-[var(--foreground)]/30 resize-none text-right"
                      />
                    </div>

                    {/* Sub-tasks Section (if checklist selected) */}
                    {taskType === "checklist" && (
                      <div className="space-y-3 border border-[var(--border)] p-4 rounded-2xl bg-[var(--foreground)]/[0.01] shrink-0 text-right">
                        <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-wider">תתי-משימות</label>
                        
                        {/* Add subtask input */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="הוסף תת-משימה חדשה..."
                            value={newSubtaskTitle}
                            onChange={e => setNewSubtaskTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (!newSubtaskTitle.trim()) return;
                                setSubtasks(prev => [
                                  ...prev,
                                  { id: Date.now().toString() + Math.random().toString(36).substring(2, 7), title: newSubtaskTitle.trim(), completed: false }
                                ]);
                                setNewSubtaskTitle("");
                              }
                            }}
                            className="flex-1 bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl px-3 h-10 text-xs font-bold outline-none focus:border-indigo-500/30 transition-all text-right"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!newSubtaskTitle.trim()) return;
                              setSubtasks(prev => [
                                ...prev,
                                { id: Date.now().toString() + Math.random().toString(36).substring(2, 7), title: newSubtaskTitle.trim(), completed: false }
                              ]);
                              setNewSubtaskTitle("");
                            }}
                            className="px-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-black cursor-pointer"
                          >
                            הוסף
                          </button>
                        </div>

                        {/* List of subtasks */}
                        {subtasks.length === 0 ? (
                          <p className="text-[10px] text-[var(--muted)]/50 italic text-center py-2">אין תתי-משימות ברשימה</p>
                        ) : (
                          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {subtasks.map((sub, idx) => (
                              <div key={sub.id} className="flex items-center justify-between gap-2 bg-[var(--card-bg)] border border-[var(--border)] p-2 rounded-xl">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, completed: !s.completed } : s));
                                    }}
                                    className="shrink-0 text-indigo-500 hover:scale-105 active:scale-95 transition-all"
                                  >
                                    {sub.completed ? (
                                      <CheckCircle className="w-4.5 h-4.5 text-emerald-500 fill-emerald-500/10" />
                                    ) : (
                                      <Circle className="w-4.5 h-4.5 text-[var(--muted)]/40 hover:text-indigo-400" />
                                    )}
                                  </button>
                                  <input
                                    type="text"
                                    value={sub.title}
                                    onChange={e => {
                                      const newText = e.target.value;
                                      setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, title: newText } : s));
                                    }}
                                    className={`w-full bg-transparent border-none text-xs font-bold outline-none text-right ${sub.completed ? "line-through opacity-40 font-medium" : ""}`}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSubtasks(prev => prev.filter(s => s.id !== sub.id));
                                  }}
                                  className="p-1 text-[var(--muted)]/40 hover:text-rose-500 rounded-lg transition-colors cursor-pointer shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Due Date */}
                    <div className="space-y-1.5 text-right shrink-0">
                      <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-wider mr-1">תאריך יעד (אופציונלי)</label>
                      <input
                        type="date"
                        value={taskDueDate}
                        onChange={e => setTaskDueDate(e.target.value)}
                        className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-2xl px-4 h-12 text-xs font-bold outline-none focus:border-indigo-500/30 transition-all cursor-pointer text-right"
                      />
                    </div>
                  </div>

                  {/* Footer Buttons */}
                  <div className="flex gap-3 pt-6 border-t border-[var(--border)] mt-auto shrink-0">
                    <button
                      type="submit"
                      disabled={savingTask || !taskTitle.trim()}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl h-12 text-xs font-black shadow-md shadow-indigo-600/10 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {savingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {editingTask ? "שמור שינויים" : "צור משימה"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsTaskModalOpen(false);
                        setEditingTask(null);
                      }}
                      className="flex-1 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--foreground)] rounded-2xl h-12 text-xs font-black active:scale-95 transition-all"
                    >
                      ביטול
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </RoleGuard>
  );
}
