"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, doc, setDoc, deleteDoc } from "firebase/firestore";
import { 
  Loader2, ChevronRight, Download, 
  Search, Calendar as CalendarIcon,
  Check, X as XIcon, Minus, Info, FileSpreadsheet, AlertCircle,
  MessageCircle, Phone
} from "lucide-react";
import { useRouter } from "next/navigation";
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  getDay, getYear, getMonth
} from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import { MobileFriendlyGuard } from "@/components/ui/MobileFriendlyGuard";
import { useAuth } from "@/context/AuthContext";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  programId?: string;
  hosenType?: string; // Group ID
  phone?: string;
}

interface Program {
  id: string;
  name: string;
  activeDays: number[];
}

interface Group {
  id: string;
  name: string;
  programId: string;
}

interface AttendanceMap {
  [key: string]: "present" | "absent" | "unset"; // Key: patientId_yyyy-MM-dd
}

export default function AttendanceMatrixPage() {
  const router = useRouter();
  const { role, roles } = useAuth();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  
  const canEditMatrix = useMemo(() => {
    const userRoles = roles || (role ? [role] : []);
    return userRoles.some((r: string) => ["admin", "manager", "social_worker", "instructor"].includes(r));
  }, [role, roles]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProgramId, setSelectedProgramId] = useState<string>("all");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  
  // Excel export menu & loader states
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState("");

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentDate),
      end: endOfMonth(currentDate)
    });
  }, [currentDate]);

  useEffect(() => {
    fetchData();
  }, [currentDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const monthStart = format(startOfMonth(currentDate), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(currentDate), "yyyy-MM-dd");

      const [pSnap, progSnap, groupSnap, attSnap] = await Promise.all([
        getDocs(query(collection(db, "patients"), where("status", "==", "active"))),
        getDocs(collection(db, "programs")),
        getDocs(collection(db, "groups")),
        getDocs(query(
          collection(db, "attendance"), 
          where("date", ">=", monthStart),
          where("date", "<=", monthEnd)
        ))
      ]);

      const pList = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient))
        .sort((a, b) => a.lastName.localeCompare(b.lastName, 'he'));
      
      setPatients(pList);
      setPrograms(progSnap.docs.map(d => ({ id: d.id, ...d.data() } as Program)));
      setGroups(groupSnap.docs.map(d => ({ id: d.id, ...d.data() } as Group)));

      const aMap: AttendanceMap = {};
      attSnap.forEach(d => {
        const data = d.data();
        aMap[`${data.patientId}_${data.date}`] = data.status;
      });
      setAttendance(aMap);
    } catch (err) {
      console.error("Error fetching matrix data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getGroupName = (groupId?: string) => {
    return groups.find(g => g.id === groupId)?.name || "-";
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayDayOfWeek = getDay(new Date());

  const expectedPatientsToday = useMemo(() => {
    return patients.filter(p => {
      const prog = programs.find(pr => pr.id === p.programId);
      if (!prog) return false;
      return prog.activeDays.includes(todayDayOfWeek);
    });
  }, [patients, programs, todayDayOfWeek]);

  const filteredExpectedPatients = useMemo(() => {
    return expectedPatientsToday.filter(p => {
      const matchesSearch = `${p.firstName} ${p.lastName} ${p.idNumber}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProgram = selectedProgramId === "all" || p.programId === selectedProgramId;
      return matchesSearch && matchesProgram;
    });
  }, [expectedPatientsToday, searchTerm, selectedProgramId]);

  const todayStats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let unmarked = 0;
    
    expectedPatientsToday.forEach(p => {
      const status = attendance[`${p.id}_${todayStr}`];
      if (status === "present") present++;
      else if (status === "absent") absent++;
      else unmarked++;
    });
    
    return { present, absent, unmarked, total: expectedPatientsToday.length };
  }, [expectedPatientsToday, attendance, todayStr]);

  const handleToggleAttendance = async (patientId: string, status: "present" | "absent") => {
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;
    const contextId = patient.hosenType || "general";
    const attKey = `${patientId}_${todayStr}`;
    const attId = `${patientId}_${contextId}_${todayStr}`;
    const currentStatus = attendance[attKey];

    try {
      if (currentStatus === status) {
        // Unmark
        await deleteDoc(doc(db, "attendance", attId));
        setAttendance(prev => {
          const next = { ...prev };
          delete next[attKey];
          return next;
        });
      } else {
        // Mark status
        await setDoc(doc(db, "attendance", attId), {
          patientId,
          date: todayStr,
          status,
          contextId,
          updatedAt: new Date().toISOString()
        });
        setAttendance(prev => ({
          ...prev,
          [attKey]: status
        }));
      }
    } catch (err) {
      console.error("Error setting attendance:", err);
    }
  };

  const handleToggleMatrixCell = async (patientId: string, dateStr: string) => {
    if (!canEditMatrix) return;
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;
    const contextId = patient.hosenType || "general";
    const attKey = `${patientId}_${dateStr}`;
    const attId = `${patientId}_${contextId}_${dateStr}`;
    const currentStatus = attendance[attKey];

    let newStatus: "present" | "absent" | "unset";
    if (!currentStatus || currentStatus === "unset") {
      newStatus = "present";
    } else if (currentStatus === "present") {
      newStatus = "absent";
    } else {
      newStatus = "unset";
    }

    try {
      if (newStatus === "unset") {
        await deleteDoc(doc(db, "attendance", attId));
        setAttendance(prev => {
          const next = { ...prev };
          delete next[attKey];
          return next;
        });
      } else {
        await setDoc(doc(db, "attendance", attId), {
          patientId,
          date: dateStr,
          status: newStatus,
          contextId,
          updatedAt: new Date().toISOString()
        });
        setAttendance(prev => ({
          ...prev,
          [attKey]: newStatus
        }));
      }
    } catch (err) {
      console.error("Error setting matrix cell attendance:", err);
    }
  };

  const formatPhoneForWhatsApp = (phoneStr?: string) => {
    if (!phoneStr) return "";
    let clean = phoneStr.replace(/\D/g, ""); // only digits
    if (clean.startsWith("0")) {
      clean = "972" + clean.substring(1);
    }
    return clean;
  };

  const mobileAlternativeView = useMemo(() => {
    return (
      <div className="w-full text-right" dir="rtl">
        {/* Today Stats Summary Grid */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 text-center">
            <div className="text-emerald-500 font-black text-lg leading-tight">
              {todayStats.present}
            </div>
            <div className="text-[9px] font-bold text-[var(--foreground)]/60 mt-0.5">
              נוכחים
            </div>
          </div>

          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3 text-center">
            <div className="text-rose-500 font-black text-lg leading-tight">
              {todayStats.absent}
            </div>
            <div className="text-[9px] font-bold text-[var(--foreground)]/60 mt-0.5">
              נעדרים
            </div>
          </div>

          <div className="bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl p-3 text-center">
            <div className="text-[var(--foreground)]/60 font-black text-lg leading-tight">
              {todayStats.unmarked}
            </div>
            <div className="text-[9px] font-bold text-[var(--foreground)]/60 mt-0.5">
              טרם סומן
            </div>
          </div>
        </div>

        {/* Program Selector Tabs inside alternative view */}
        <div className="flex gap-1 overflow-x-auto pb-3 mb-4 no-scrollbar">
          <button
            onClick={() => setSelectedProgramId("all")}
            className={`px-3 py-1.5 rounded-full text-[10px] font-black transition-all shrink-0 ${
              selectedProgramId === "all"
                ? "bg-[var(--primary)] text-white shadow-sm"
                : "bg-[var(--foreground)]/5 text-[var(--foreground)]/60"
            }`}
          >
            הכל ({expectedPatientsToday.length})
          </button>
          {programs.map(prog => {
            const count = expectedPatientsToday.filter(p => p.programId === prog.id).length;
            if (count === 0) return null;
            return (
              <button
                key={prog.id}
                onClick={() => setSelectedProgramId(prog.id)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black transition-all shrink-0 ${
                  selectedProgramId === prog.id
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "bg-[var(--foreground)]/5 text-[var(--foreground)]/60"
                }`}
              >
                {prog.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Mobile Search input */}
        <div className="relative mb-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground)]/30" />
          <input
            type="text"
            placeholder="חיפוש לפי שם..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl pr-9 pl-3 py-2 text-xs font-bold outline-none focus:border-[var(--primary)] transition-all text-[var(--foreground)] placeholder:text-[var(--foreground)]/30"
          />
        </div>

        {/* Expected Patients List */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
          {filteredExpectedPatients.length === 0 ? (
            <div className="text-center py-8 text-[11px] font-bold text-[var(--foreground)]/40 italic">
              לא נמצאו משתתפים צפויים היום בחתך זה
            </div>
          ) : (
            filteredExpectedPatients.map(p => {
              const status = attendance[`${p.id}_${todayStr}`];
              const groupName = getGroupName(p.hosenType);
              const cleanPhone = formatPhoneForWhatsApp(p.phone);
              
              return (
                <div
                  key={p.id}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    status === "present"
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : status === "absent"
                      ? "bg-rose-500/5 border-rose-500/20"
                      : "bg-[var(--foreground)]/[0.02] border-[var(--border)]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black text-[var(--foreground)] truncate">
                      {p.firstName} {p.lastName}
                    </div>
                    <div className="text-[9px] font-bold text-[var(--foreground)]/40 mt-0.5 truncate">
                      {groupName !== "-" ? groupName : "ללא קבוצה"}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* WhatsApp Nudge button */}
                    {status !== "present" && p.phone && (
                      <a
                        href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                          `שלום ${p.firstName}, מה שלומך? שמנו לב שטרם נרשמה הגעתך היום למרכז חוסן. נשמח לעדכון!`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-600 active:scale-95 transition-all"
                        title="שלח תזכורת בוואטסאפ"
                      >
                        <MessageCircle className="w-4 h-4 fill-emerald-600/10" />
                      </a>
                    )}

                    {/* Toggle Absent Button */}
                    <button
                      onClick={() => handleToggleAttendance(p.id, "absent")}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                        status === "absent"
                          ? "bg-rose-500 text-white shadow-sm"
                          : "bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--foreground)]/40"
                      }`}
                    >
                      <XIcon className="w-3.5 h-3.5 stroke-[3]" />
                    </button>

                    {/* Toggle Present Button */}
                    <button
                      onClick={() => handleToggleAttendance(p.id, "present")}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                        status === "present"
                          ? "bg-emerald-500 text-white shadow-sm"
                          : "bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--foreground)]/40"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }, [expectedPatientsToday, filteredExpectedPatients, todayStats, selectedProgramId, searchTerm, attendance, todayStr, groups]);

  // Filter patients by search term AND selected program tab
  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      const matchesSearch = `${p.firstName} ${p.lastName} ${p.idNumber}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProgram = selectedProgramId === "all" || p.programId === selectedProgramId;
      return matchesSearch && matchesProgram;
    });
  }, [patients, searchTerm, selectedProgramId]);

  // Compute active dates columns dynamically based on selected program tab
  const activeDates = useMemo(() => {
    if (selectedProgramId === "all") {
      // Union of active days across all programs
      const unionActiveDays = new Set<number>();
      programs.forEach(p => p.activeDays.forEach(d => unionActiveDays.add(d)));
      return daysInMonth.filter(day => unionActiveDays.has(getDay(day)));
    } else {
      // Only active days for the selected program
      const prog = programs.find(p => p.id === selectedProgramId);
      const pActiveDays = prog?.activeDays || [];
      return daysInMonth.filter(day => pActiveDays.includes(getDay(day)));
    }
  }, [daysInMonth, programs, selectedProgramId]);

  // --- Excel Export Handlers ---

  // 1. Export Monthly Report for All Programs (each program is a separate tab)
  const exportMonthlyReport = () => {
    try {
      const wb = XLSX.utils.book_new();
      const year = getYear(currentDate);
      const monthLabel = format(currentDate, "MMMM", { locale: he });

      programs.forEach(prog => {
        const progPatients = patients.filter(p => p.programId === prog.id);
        if (progPatients.length === 0) return; // skip program with no active patients

        const progActiveDates = daysInMonth.filter(day => prog.activeDays.includes(getDay(day)));
        if (progActiveDates.length === 0) return; // skip if no active days in this month

        // Set up headers
        const headers = ["שם מלא", "תעודת זהות", "קבוצה"];
        progActiveDates.forEach(day => {
          headers.push(format(day, "dd/MM/yyyy"));
        });

        const rows: string[][] = [headers];

        progPatients.forEach(p => {
          const row = [
            `${p.firstName} ${p.lastName}`,
            p.idNumber,
            getGroupName(p.hosenType)
          ];

          progActiveDates.forEach(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const status = attendance[`${p.id}_${dateStr}`];
            row.push(status === "present" ? "+" : "");
          });

          rows.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!dir'] = 'rtl'; // Hebrew Right to Left

        const cleanSheetName = prog.name.substring(0, 30).replace(/[\\/?*\[\]]/g, "_");
        XLSX.utils.book_append_sheet(wb, ws, cleanSheetName || "תוכנית");
      });

      if (wb.SheetNames.length === 0) {
        alert("אין נתוני נוכחות לייצוא עבור החודש הנוכחי");
        return;
      }

      XLSX.writeFile(wb, `נוכחות_חודשית_${monthLabel}_${year}.xlsx`);
    } catch (err) {
      console.error("Error exporting monthly Excel:", err);
      alert("שגיאה במהלך הפקת דוח נוכחות חודשי");
    }
  };

  // 2. Export Annual Report for Single Selected Program (12 tabs, one for each month)
  const exportAnnualReport = async (progId: string) => {
    const prog = programs.find(p => p.id === progId);
    if (!prog) return;

    setExportLoading(true);
    setExportProgress(`טוען נתוני נוכחות שנתיים משרת Firebase עבור תוכנית ${prog.name}...`);

    try {
      const selectedYear = getYear(currentDate);
      const yearStart = `${selectedYear}-01-01`;
      const yearEnd = `${selectedYear}-12-31`;

      const attSnap = await getDocs(query(
        collection(db, "attendance"),
        where("date", ">=", yearStart),
        where("date", "<=", yearEnd)
      ));

      setExportProgress("מעבד נתונים ומייצר גיליונות חודשיים...");

      const annualAttendance: AttendanceMap = {};
      attSnap.forEach(d => {
        const data = d.data();
        annualAttendance[`${data.patientId}_${data.date}`] = data.status;
      });

      const wb = XLSX.utils.book_new();

      // Loop through all 12 months
      for (let m = 0; m < 12; m++) {
        const monthDate = new Date(selectedYear, m, 1);
        const monthName = format(monthDate, "MMMM", { locale: he });
        
        const monthDays = eachDayOfInterval({
          start: startOfMonth(monthDate),
          end: endOfMonth(monthDate)
        });

        const progActiveDates = monthDays.filter(day => prog.activeDays.includes(getDay(day)));
        const progPatients = patients.filter(p => p.programId === progId);

        if (progActiveDates.length === 0 || progPatients.length === 0) continue;

        const headers = ["שם מלא", "תעודת זהות", "קבוצה"];
        progActiveDates.forEach(day => {
          headers.push(format(day, "dd/MM/yyyy"));
        });

        const rows: string[][] = [headers];

        progPatients.forEach(p => {
          const row = [
            `${p.firstName} ${p.lastName}`,
            p.idNumber,
            getGroupName(p.hosenType)
          ];

          progActiveDates.forEach(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const status = annualAttendance[`${p.id}_${dateStr}`];
            row.push(status === "present" ? "+" : "");
          });

          rows.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!dir'] = 'rtl';

        XLSX.utils.book_append_sheet(wb, ws, monthName);
      }

      if (wb.SheetNames.length === 0) {
        alert("לא נמצאו ימי פעילות או משתתפים לייצוא בשנה זו");
        return;
      }

      XLSX.writeFile(wb, `נוכחות_שנתית_${prog.name}_${selectedYear}.xlsx`);
    } catch (err) {
      console.error("Error exporting annual Excel:", err);
      alert("שגיאה במהלך הפקת דוח נוכחות שנתי");
    } finally {
      setExportLoading(false);
      setExportProgress("");
    }
  };

  // 3. Export Complete Full Annual Report (all programs + all months)
  const exportFullAnnualReport = async () => {
    setExportLoading(true);
    setExportProgress("טוען נתוני נוכחות שנתיים משרת Firebase עבור כל התוכניות...");

    try {
      const selectedYear = getYear(currentDate);
      const yearStart = `${selectedYear}-01-01`;
      const yearEnd = `${selectedYear}-12-31`;

      const attSnap = await getDocs(query(
        collection(db, "attendance"),
        where("date", ">=", yearStart),
        where("date", "<=", yearEnd)
      ));

      setExportProgress("מעבד נתונים ומייצר גיליונות Excel שנתיים...");

      const annualAttendance: AttendanceMap = {};
      attSnap.forEach(d => {
        const data = d.data();
        annualAttendance[`${data.patientId}_${data.date}`] = data.status;
      });

      const wb = XLSX.utils.book_new();

      // Loop through all 12 months
      for (let m = 0; m < 12; m++) {
        const monthDate = new Date(selectedYear, m, 1);
        const monthLabel = format(monthDate, "MM", { locale: he }); // "01", "02"...
        const monthDays = eachDayOfInterval({
          start: startOfMonth(monthDate),
          end: endOfMonth(monthDate)
        });

        programs.forEach(prog => {
          const progActiveDates = monthDays.filter(day => prog.activeDays.includes(getDay(day)));
          const progPatients = patients.filter(p => p.programId === prog.id);

          if (progActiveDates.length === 0 || progPatients.length === 0) return;

          const headers = ["שם מלא", "תעודת זהות", "קבוצה"];
          progActiveDates.forEach(day => {
            headers.push(format(day, "dd/MM"));
          });

          const rows: string[][] = [headers];

          progPatients.forEach(p => {
            const row = [
              `${p.firstName} ${p.lastName}`,
              p.idNumber,
              getGroupName(p.hosenType)
            ];

            progActiveDates.forEach(day => {
              const dateStr = format(day, "yyyy-MM-dd");
              const status = annualAttendance[`${p.id}_${dateStr}`];
              row.push(status === "present" ? "+" : "");
            });

            rows.push(row);
          });

          const ws = XLSX.utils.aoa_to_sheet(rows);
          ws['!dir'] = 'rtl';

          // Sheet name: e.g. "05 - חרבות ברזל בוקר" (SheetJS limit is 31 chars)
          const sheetName = `${monthLabel} - ${prog.name}`.substring(0, 30).replace(/[\\/?*\[\]]/g, "_");
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
      }

      if (wb.SheetNames.length === 0) {
        alert("לא נמצאו נתוני נוכחות מוגדרים לשנה זו");
        return;
      }

      XLSX.writeFile(wb, `נוכחות_שנתית_מלאה_${selectedYear}.xlsx`);
    } catch (err) {
      console.error("Error exporting full annual Excel:", err);
      alert("שגיאה במהלך הפקת דוח נוכחות שנתי מלא");
    } finally {
      setExportLoading(false);
      setExportProgress("");
    }
  };

  const years = [2025, 2026, 2027, 2028, 2029, 2030];
  const months = Array.from({ length: 12 }, (_, i) => i);

  return (
    <RoleGuard allowedRoles={["admin", "manager", "social_worker", "instructor", "employee"]}>
      <MobileFriendlyGuard
        title="ניהול נוכחות מותאם למחשב"
        description="מטריצת הנוכחות המלאה מיועדת למסכים רחבים. לנוחיותך, ריכזנו כאן את סיכום הנוכחים של היום ועדכון מהיר לנייד."
        alternativeView={mobileAlternativeView}
        fallbackUrl="/admin"
        fallbackLabel="חזרה ללוח בקרה"
      >
        <div dir="rtl" className="h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden flex flex-col">
          
          {/* Full-Screen Export Loader Backdrop */}
          <AnimatePresence>
            {exportLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center gap-4 text-white"
              >
                <Loader2 className="w-10 h-10 text-[var(--primary)] animate-spin" />
                <h3 className="text-lg font-black text-center px-6 animate-pulse">{exportProgress}</h3>
                <p className="text-xs text-white/50">תהליך זה עשוי לקחת מספר שניות, נא לא לסגור את החלון...</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Top Header */}
          <header className="h-20 border-b border-[var(--border-subtle)] bg-[var(--background)]/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-30">
            <div className="flex items-center gap-4">
              <button onClick={() => router.back()} className="w-10 h-10 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl flex items-center justify-center hover:bg-[var(--foreground)]/10 transition-all text-[var(--foreground)]">
                <ChevronRight className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-black tracking-tight">מטריצת נוכחות חודשית</h1>
                <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest mt-0.5">Monthly Attendance Matrix</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground)]/30" />
                <input 
                  type="text" 
                  placeholder="חיפוש לפי שם או ת.ז..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-xl pr-10 pl-4 py-2.5 text-xs font-bold outline-none focus:border-[var(--primary)] transition-all w-64 text-[var(--foreground)] placeholder:text-[var(--foreground)]/30"
                />
              </div>

              {/* Premium Excel Export Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-2 bg-[var(--primary)] hover:opacity-90 text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-md shadow-[var(--primary)]/10 active:scale-95 border border-[var(--primary)]"
                >
                  <Download className="w-4 h-4" />
                  ייצא לאקסל
                </button>

                {showExportMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowExportMenu(false)}
                    />
                    <div className="absolute left-0 mt-2 w-72 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <p className="text-[10px] font-black text-[var(--foreground)]/40 p-2 border-b border-[var(--border-subtle)] uppercase">אפשרויות ייצוא לאקסל</p>
                      <div className="flex flex-col gap-1 mt-1">
                        
                        {/* Option 1: Monthly (Tabs for Programs) */}
                        <button
                          onClick={() => {
                            exportMonthlyReport();
                            setShowExportMenu(false);
                          }}
                          className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-[var(--foreground)]/5 text-right transition-all text-xs font-bold"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                          <div className="flex flex-col">
                            <span className="font-black text-[var(--foreground)]">קובץ חודשי לכל התוכניות</span>
                            <span className="text-[9px] text-[var(--foreground)]/40 mt-0.5 leading-tight">גיליון נפרד לכל תוכנית בחודש הנבחר</span>
                          </div>
                        </button>

                        {/* Option 2: Annual (Tabs for 12 Months) */}
                        <button
                          onClick={() => {
                            if (selectedProgramId === "all") {
                              alert("על מנת לייצא קובץ שנתי לתוכנית, אנא בחר תוכנית ספציפית בלשוניות למעלה תחילה.");
                            } else {
                              exportAnnualReport(selectedProgramId);
                            }
                            setShowExportMenu(false);
                          }}
                          className={`flex items-center gap-3 w-full p-2.5 rounded-xl text-right transition-all text-xs font-bold ${selectedProgramId === "all" ? "opacity-40 cursor-not-allowed hover:bg-transparent" : "hover:bg-[var(--foreground)]/5"}`}
                        >
                          <FileSpreadsheet className="w-4 h-4 text-amber-500 shrink-0" />
                          <div className="flex flex-col">
                            <span className="font-black text-[var(--foreground)]">קובץ שנתי לתוכנית הנוכחית</span>
                            <span className="text-[9px] text-[var(--foreground)]/40 mt-0.5 leading-tight">12 גיליונות (אחד לכל חודש) עבור התוכנית הנבחרת</span>
                          </div>
                        </button>

                        {/* Option 3: Full Annual for All Programs */}
                        <button
                          onClick={() => {
                            exportFullAnnualReport();
                            setShowExportMenu(false);
                          }}
                          className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-[var(--foreground)]/5 text-right transition-all text-xs font-bold"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-indigo-500 shrink-0" />
                          <div className="flex flex-col">
                            <span className="font-black text-[var(--foreground)]">קובץ שנתי מלא (כל התוכניות)</span>
                            <span className="text-[9px] text-[var(--foreground)]/40 mt-0.5 leading-tight">קובץ המאגד את כל התוכניות לכל חודשי השנה</span>
                          </div>
                        </button>

                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Date Filter Tabs (Years & Months) */}
          <div className="bg-[var(--surface)] border-b border-[var(--border-subtle)] px-6 py-3 flex items-center gap-6 shrink-0 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1 bg-[var(--foreground)]/5 p-1 rounded-xl border border-[var(--border-subtle)]">
              {years.map(y => (
                <button 
                  key={y}
                  onClick={() => setCurrentDate(new Date(y, getMonth(currentDate)))}
                  className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${getYear(currentDate) === y ? 'bg-[var(--primary)] text-white shadow-md' : 'hover:bg-[var(--foreground)]/5 text-[var(--foreground)]/50'}`}
                >
                  {y}
                </button>
              ))}
            </div>

            <div className="h-6 w-px bg-[var(--border)]" />

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {months.map(m => (
                <button 
                  key={m}
                  onClick={() => setCurrentDate(new Date(getYear(currentDate), m))}
                  className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all whitespace-nowrap ${getMonth(currentDate) === m ? 'bg-[var(--primary-faint)] text-[var(--primary)] border border-[var(--primary)]/20' : 'hover:bg-[var(--foreground)]/5 text-[var(--foreground)]/40'}`}
                >
                  {format(new Date(getYear(currentDate), m, 1), "MMMM", { locale: he })}
                </button>
              ))}
            </div>
          </div>

          {/* Program Filter Tabs with Active Days Indicators */}
          <div className="bg-[var(--surface)] border-b border-[var(--border-subtle)] px-6 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <span className="text-[10px] font-black text-[var(--foreground)]/40 ml-2 whitespace-nowrap uppercase tracking-wider">סנן לפי תוכנית:</span>
            <button
              onClick={() => setSelectedProgramId("all")}
              className={`px-4 py-1.5 rounded-full text-xs font-black transition-all whitespace-nowrap ${selectedProgramId === "all" ? 'bg-[var(--primary)] text-white shadow-sm' : 'bg-[var(--foreground)]/5 text-[var(--foreground)]/60 hover:bg-[var(--foreground)]/10'}`}
            >
              כל התוכניות ({patients.length})
            </button>
            {programs.map(prog => {
              const count = patients.filter(p => p.programId === prog.id).length;
              const daysLabel = prog.activeDays.map(d => {
                const days = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
                return days[d];
              }).join(", ");

              return (
                <button
                  key={prog.id}
                  onClick={() => setSelectedProgramId(prog.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${selectedProgramId === prog.id ? 'bg-[var(--primary)] text-white shadow-sm' : 'bg-[var(--foreground)]/5 text-[var(--foreground)]/60 hover:bg-[var(--foreground)]/10'}`}
                >
                  <span>{prog.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${selectedProgramId === prog.id ? 'bg-white/20 text-white' : 'bg-[var(--foreground)]/10 text-[var(--foreground)]/50'}`}>
                    {count}
                  </span>
                  <span className={`text-[9px] font-medium ${selectedProgramId === prog.id ? 'text-white/60' : 'text-[var(--foreground)]/40'}`}>
                    ({daysLabel})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Matrix Container */}
          <div className="flex-1 overflow-hidden relative p-6 bg-[var(--background)] flex flex-col">
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--background)]">
                <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
                <p className="text-xs font-bold text-[var(--foreground)]/40">טוען נתונים...</p>
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="h-64 border border-[var(--border)] border-dashed rounded-[2.5rem] flex flex-col items-center justify-center gap-3 bg-[var(--card-bg)] shadow-inner">
                <AlertCircle className="w-8 h-8 text-[var(--foreground)]/20 animate-bounce" />
                <p className="text-xs font-black text-[var(--foreground)]/40">לא נמצאו משתתפים בחתך שנבחר</p>
              </div>
            ) : (
              <div className="flex-1 overflow-auto border border-[var(--border)] bg-[var(--card-bg)] shadow-sm">
                <table className="border-collapse text-right w-full text-[var(--foreground)] text-xs">
                  <thead className="sticky top-0 z-20 bg-[var(--card-bg)]">
                    <tr className="bg-[var(--foreground)]/[0.02] shadow-[0_1px_0_0_var(--border)]">
                      <th className="sticky top-0 right-0 z-30 bg-[var(--card-bg)] p-3.5 border-b border-l border-[var(--border)] font-black min-w-[180px] shadow-[-1px_0_0_0_var(--border)]">משתתף</th>
                      <th className="sticky top-0 bg-[var(--card-bg)] p-3.5 border-b border-l border-[var(--border)] font-black min-w-[100px]">ת.ז</th>
                      <th className="sticky top-0 bg-[var(--card-bg)] p-3.5 border-b border-l border-[var(--border)] font-black min-w-[120px]">תוכנית</th>
                      <th className="sticky top-0 bg-[var(--card-bg)] p-3.5 border-b border-l border-[var(--border)] font-black min-w-[100px]">קבוצה</th>
                      
                      {activeDates.map(day => (
                        <th key={day.toISOString()} className="sticky top-0 bg-[var(--card-bg)] p-2 border-b border-l border-[var(--border)] text-center min-w-[38px]">
                          <p className="text-[9px] font-bold text-[var(--foreground)]/40 leading-none">{format(day, "EE", { locale: he })}</p>
                          <p className="text-xs font-black mt-1 text-[var(--foreground)]">{format(day, "d")}</p>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredPatients.map((p) => {
                      const prog = programs.find(pr => pr.id === p.programId);
                      const pActiveDays = prog?.activeDays || [];
                      const isSelected = selectedRowId === p.id;

                      return (
                        <tr 
                          key={p.id} 
                          className={`group transition-colors ${
                            isSelected 
                              ? "bg-[var(--primary)]/[0.03] hover:bg-[var(--primary)]/[0.06]" 
                              : "hover:bg-[var(--foreground)]/[0.02]"
                          }`}
                        >
                          <td 
                            onClick={() => setSelectedRowId(isSelected ? null : p.id)}
                            className={`sticky right-0 z-10 p-3 border-l border-[var(--border)] font-black shadow-[-1px_0_0_0_var(--border)] transition-colors cursor-pointer select-none ${
                              isSelected 
                                ? "bg-[var(--primary-faint)] text-[var(--primary)] border-r-4 border-r-[var(--primary)]" 
                                : "bg-[var(--card-bg)] group-hover:bg-[var(--foreground)]/[0.03] text-[var(--foreground)]"
                            }`}
                            title="לחץ כדי לנעול סימון שורה"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>{p.firstName} {p.lastName}</span>
                              {isSelected && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse shrink-0" />
                              )}
                            </div>
                          </td>
                          <td className="p-3 border-l border-[var(--border)] text-[var(--foreground)]/60 font-medium">
                            {p.idNumber}
                          </td>
                          <td className="p-3 border-l border-[var(--border)] text-[var(--foreground)]/70 font-semibold">
                            {prog?.name || "-"}
                          </td>
                          <td className="p-3 border-l border-[var(--border)] text-[var(--foreground)]/60 font-medium">
                            {getGroupName(p.hosenType)}
                          </td>

                          {activeDates.map(day => {
                            const dateStr = format(day, "yyyy-MM-dd");
                            const status = attendance[`${p.id}_${dateStr}`];
                            const isActiveForThisPatient = pActiveDays.includes(getDay(day));
                            
                            return (
                              <td 
                                key={dateStr}
                                className={`p-0 border-l border-[var(--border)] text-center ${!isActiveForThisPatient ? 'bg-[var(--foreground)]/[0.03]' : ''} ${isActiveForThisPatient && canEditMatrix ? 'cursor-pointer hover:bg-[var(--foreground)]/5 transition-colors select-none' : ''}`}
                                onClick={() => isActiveForThisPatient && canEditMatrix && handleToggleMatrixCell(p.id, dateStr)}
                              >
                                {!isActiveForThisPatient ? (
                                  <div className="w-full h-full flex items-center justify-center py-2.5 opacity-20" title="יום לא פעיל בתוכנית של משתתף זה">
                                    <Minus className="w-2.5 h-2.5 text-[var(--foreground)]/30" />
                                  </div>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center py-2.5">
                                    {status === 'present' ? (
                                      <div className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 rounded-md font-black text-[10px]">
                                        +
                                      </div>
                                    ) : status === 'absent' ? (
                                      <div className="bg-rose-500/10 text-rose-500 border border-rose-500/20 px-2 py-0.5 rounded-md font-black text-[10px]">
                                        -
                                      </div>
                                    ) : (
                                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--foreground)]/20" />
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Legend / Footer */}
          <footer className="h-12 border-t border-[var(--border-subtle)] bg-[var(--foreground)]/[0.02] flex items-center justify-between px-6 shrink-0 text-[var(--foreground)]/60 font-semibold text-[10px]">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[8px] font-black leading-none">+</div>
                <span>נוכח</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-rose-500/10 text-rose-500 border border-rose-500/20 px-1.5 py-0.5 rounded text-[8px] font-black leading-none">-</div>
                <span>נעדר</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--foreground)]/30 animate-pulse" />
                <span>טרם סומן</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-2 py-0.5 bg-[var(--foreground)]/[0.03] border border-[var(--border)] text-[8px] flex items-center justify-center rounded">
                  <Minus className="w-2.5 h-2.5 opacity-30" />
                </div>
                <span>יום לא פעיל בתוכנית</span>
              </div>
            </div>

            <div className="font-bold flex items-center gap-3">
              <span>סה"כ תוכניות: {programs.length}</span>
              <div className="h-3 w-px bg-[var(--border)]" />
              <span>סה"כ מוצגים: {filteredPatients.length} מתוך {patients.length}</span>
            </div>
          </footer>
        </div>
      </MobileFriendlyGuard>
    </RoleGuard>
  );
}
