"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useMemo, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { 
  Users, Search, Plus, Filter, MoreHorizontal, 
  Trash2, User, ChevronLeft, LayoutGrid, List,
  Loader2, ExternalLink, Calendar, Shield, Phone,
  Briefcase, CalendarDays, Check, ChevronDown, X,
  AlertCircle, Upload, Download, FileSpreadsheet,
  CheckCircle2, AlertTriangle, RefreshCw
} from "lucide-react";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  hosenType: string;
  status: string;
  assignedWorkerId?: string;
  startDate?: string;
  endDate?: string;
  phone?: string;
  fullName?: string;
  programId?: string;
  programIds?: string[];
  groupIds?: string[];
  extensionSent?: boolean;
  extensionSentAt?: string;
  extensionReceived?: boolean;
  extensionReceivedAt?: string;
}

interface Group {
  id: string;
  name: string;
  programId?: string;
}

interface Staff {
  id: string;
  name: string;
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [staff, setStaff] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<{ programs: string[]; groups: string[] }>({
    programs: [],
    groups: []
  });
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const router = useRouter();

  // Excel Import States & Functions
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<"upload" | "preview" | "importing" | "success">("upload");
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [overwriteDuplicates, setOverwriteDuplicates] = useState(true);

  function autoEndDate(startDate: string): string {
    if (!startDate) return "";
    try {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + 3);
      return d.toISOString().split("T")[0];
    } catch { return ""; }
  }

  const normalizeKey = (key: string) => key.replace(/[\s_.-]/g, "").toLowerCase();

  const getRowValue = (row: any, searchTerms: string[]) => {
    const normalizedSearch = searchTerms.map(t => t.replace(/[\s_.-]/g, "").toLowerCase());
    for (const key of Object.keys(row)) {
      const normKey = normalizeKey(key);
      if (normalizedSearch.some(term => normKey.includes(term) || term.includes(normKey))) {
        return row[key];
      }
    }
    return undefined;
  };

  const parseExcelDate = (val: any): string => {
    if (!val) return new Date().toISOString().split("T")[0];
    if (typeof val === "number") {
      try {
        const date = XLSX.SSF.parse_date_code(val);
        const d = new Date(date.y, date.m - 1, date.d);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split("T")[0];
        }
      } catch {}
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split(/[./-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
      } else {
        const day = Number(parts[0]);
        const month = Number(parts[1]);
        let year = Number(parts[2]);
        if (year < 100) year += 2000;
        const d = new Date(year, month - 1, day);
        if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
      }
    }
    return new Date().toISOString().split("T")[0];
  };

  const downloadImportTemplate = () => {
    const data = [
      {
        "שם פרטי": "ישראל",
        "שם משפחה": "ישראלי",
        "תעודת זהות": "123456789",
        "טלפון": "0501234567",
        "תאריך התחלה": "2026-05-20",
        "עו\"ס מלווה": "שם העו\"ס מהמערכת",
        "תוכנית": "חרבות ברזל בוקר",
        "קבוצה": "קבוצה א"
      },
      {
        "שם פרטי": "שרה",
        "שם משפחה": "כהן",
        "תעודת זהות": "987654321",
        "טלפון": "0547654321",
        "תאריך התחלה": "20/05/2026",
        "עו\"ס מלווה": "",
        "תוכנית": "חרבות ברזל ערב",
        "קבוצה": "קבוצה ב"
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!dir'] = 'rtl';
    const cols = [
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 }
    ];
    ws['!cols'] = cols;
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "תבנית ייבוא משתתפים");
    XLSX.writeFile(wb, "hosen_patients_import_template.xlsx");
  };

  const handleExcelImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);
        
        const parsedRows = json.map((row: any) => {
          const firstName = String(getRowValue(row, ["שם פרטי", "פרטי", "firstName", "first"]) || "").trim();
          const lastName = String(getRowValue(row, ["שם משפחה", "משפחה", "lastName", "last"]) || "").trim();
          const idNumber = String(getRowValue(row, ["תעודת זהות", "ת.ז", "מספר זהות", "idNumber", "id"]) || "").trim().replace(/\D/g, "");
          const phone = String(getRowValue(row, ["טלפון", "נייד", "phone", "mobile"]) || "").trim();
          const rawDate = getRowValue(row, ["תאריך התחלה", "תאריך", "תחילת השתתפות", "startDate", "start"]);
          const startDate = parseExcelDate(rawDate);
          
          const workerName = String(getRowValue(row, ["עו\"ס מלווה", "עוס מלווה", "עו\"ס", "עוס", "socialWorker", "worker"]) || "").trim();
          const programName = String(getRowValue(row, ["תוכנית", "תכנית", "program"]) || "").trim();
          const groupName = String(getRowValue(row, ["קבוצה", "group"]) || "").trim();
          
          let assignedWorkerId = "";
          if (workerName) {
            const staffList = Object.entries(staff).map(([id, name]) => ({ id, name }));
            const match = staffList.find(s => 
              s.name.toLowerCase().includes(workerName.toLowerCase()) || 
              workerName.toLowerCase().includes(s.name.toLowerCase())
            );
            if (match) assignedWorkerId = match.id;
          }
          
          let programId = "";
          if (programName) {
            const match = programs.find(p => 
              p.name.toLowerCase().includes(programName.toLowerCase()) ||
              programName.toLowerCase().includes(p.name.toLowerCase())
            );
            if (match) programId = match.id;
          }
          
          let groupIds: string[] = [];
          if (groupName) {
            const searchGroups = programId ? groups.filter(g => g.programId === programId) : groups;
            const match = searchGroups.find(g => 
              g.name.toLowerCase().includes(groupName.toLowerCase()) ||
              groupName.toLowerCase().includes(g.name.toLowerCase())
            );
            if (match) groupIds = [match.id];
          }
          
          let status: "valid" | "warning" | "duplicate" = "valid";
          let message = "תקין";
          
          if (!firstName || !lastName) {
            status = "warning";
            message = "שם פרטי ומשפחה הם חובה";
          } else if (!idNumber) {
            status = "warning";
            message = "תעודת זהות היא חובה";
          } else if (idNumber.length < 8 || idNumber.length > 9) {
            status = "warning";
            message = "תעודת זהות לא תקינה (צריכה להיות 8-9 ספרות)";
          }
          
          const existing = patients.find(p => p.idNumber === idNumber);
          if (existing && status === "valid") {
            status = "duplicate";
            message = `משתתף קיים במערכת (${existing.firstName} ${existing.lastName})`;
          }
          
          return {
            firstName,
            lastName,
            idNumber,
            phone,
            startDate,
            workerName,
            programName,
            groupName,
            assignedWorkerId,
            programId,
            groupIds,
            status,
            message,
            existingPatientId: existing?.id
          };
        });
        
        setImportRows(parsedRows);
        setImportStep("preview");
      } catch (err) {
        console.error("Error reading excel file:", err);
        alert("שגיאה בקריאת קובץ האקסל. וודא שהקובץ תקין ולא פגום.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleCommitImport = async () => {
    setImportStep("importing");
    setImportProgress(0);
    
    let importedCount = 0;
    let updatedCount = 0;
    
    const rowsToProcess = importRows.filter(r => r.status === "valid" || (r.status === "duplicate" && overwriteDuplicates));
    const total = rowsToProcess.length;
    
    if (total === 0) {
      alert("אין רשומות תקינות לייבוא");
      setImportStep("preview");
      return;
    }
    
    const { addDoc, doc, updateDoc, serverTimestamp, collection } = await import("firebase/firestore");
    
    for (let i = 0; i < total; i++) {
      const row = rowsToProcess[i];
      setImportProgress(Math.round(((i + 1) / total) * 100));
      
      try {
        const finalPayload = {
          firstName: row.firstName,
          lastName: row.lastName,
          idNumber: row.idNumber,
          phone: row.phone || "",
          startDate: row.startDate,
          endDate: autoEndDate(row.startDate),
          status: "active",
          assignedWorkerId: row.assignedWorkerId || "",
          programId: row.programId || "",
          programIds: row.programId ? [row.programId] : [],
          groupIds: row.groupIds || [],
          hosenType: row.groupIds?.[0] || "",
          fullName: `${row.firstName} ${row.lastName}`,
          rehabPlanCompleted: false,
          updatedAt: serverTimestamp(),
        };
        
        if (row.status === "duplicate" && row.existingPatientId) {
          await updateDoc(doc(db, "patients", row.existingPatientId), finalPayload);
          updatedCount++;
        } else {
          await addDoc(collection(db, "patients"), {
            ...finalPayload,
            createdAt: serverTimestamp(),
          });
          importedCount++;
        }
      } catch (err) {
        console.error("Error importing patient:", row, err);
      }
    }
    
    try {
      const pSnap = await getDocs(collection(db, "patients"));
      const pts = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient));
      pts.sort((a, b) => {
        const lnA = a.lastName || "";
        const lnB = b.lastName || "";
        const cmp = lnA.localeCompare(lnB, 'he');
        if (cmp !== 0) return cmp;
        return (a.firstName || "").localeCompare(b.firstName || "", 'he');
      });
      setPatients(pts);
    } catch (err) {
      console.error("Error reloading patients:", err);
    }
    
    setImportStep("success");
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setViewMode("cards");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hosen_patients_selected_filters");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && Array.isArray(parsed.programs) && Array.isArray(parsed.groups)) {
            setSelectedFilters(parsed);
          } else {
            localStorage.removeItem("hosen_patients_selected_filters");
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pSnap, gSnap, prSnap, uSnap] = await Promise.all([
          getDocs(collection(db, "patients")),
          getDocs(collection(db, "groups")),
          getDocs(collection(db, "programs")),
          getDocs(collection(db, "users"))
        ]);
        
        const pts = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient));
        pts.sort((a, b) => {
          const lnA = a.lastName || "";
          const lnB = b.lastName || "";
          const cmp = lnA.localeCompare(lnB, 'he');
          if (cmp !== 0) return cmp;
          return (a.firstName || "").localeCompare(b.firstName || "", 'he');
        });
        setPatients(pts);
        setGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
        setPrograms(prSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
        
        const staffMap: Record<string, string> = {};
        uSnap.forEach(d => {
          const data = d.data();
          staffMap[d.id] = data.displayName || data.name || data.email;
        });
        setStaff(staffMap);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getDaysRemaining = (p: Patient) => {
    let end: Date | null = null;
    if (p.endDate) {
      try {
        end = new Date(p.endDate);
      } catch {}
    } else if (p.startDate) {
      try {
        const start = new Date(p.startDate);
        end = new Date(start.setMonth(start.getMonth() + 3));
      } catch {}
    }
    if (!end || isNaN(end.getTime())) return null;
    const diffTime = end.getTime() - Date.now();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleToggleExtensionSent = async (pId: string, currentVal: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nextVal = !currentVal;
      await updateDoc(doc(db, "patients", pId), {
        extensionSent: nextVal,
        extensionSentAt: nextVal ? new Date().toISOString() : null
      });
      setPatients(prev => prev.map(p => p.id === pId ? { ...p, extensionSent: nextVal } : p));
    } catch (err) {
      console.error("Error toggling extensionSent:", err);
      alert("שגיאה בעדכון הסטטוס");
    }
  };

  const handleToggleExtensionReceived = async (pId: string, currentVal: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nextVal = !currentVal;
      await updateDoc(doc(db, "patients", pId), {
        extensionReceived: nextVal,
        extensionReceivedAt: nextVal ? new Date().toISOString() : null
      });
      setPatients(prev => prev.map(p => p.id === pId ? { ...p, extensionReceived: nextVal } : p));
    } catch (err) {
      console.error("Error toggling extensionReceived:", err);
      alert("שגיאה בעדכון הסטטוס");
    }
  };

  const handleToggleProgramFilter = (id: string) => {
    setSelectedFilters(prev => {
      const nextPrograms = prev.programs.includes(id)
        ? prev.programs.filter(x => x !== id)
        : [...prev.programs, id];
      const next = { ...prev, programs: nextPrograms };
      localStorage.setItem("hosen_patients_selected_filters", JSON.stringify(next));
      return next;
    });
  };

  const handleToggleGroupFilter = (id: string) => {
    setSelectedFilters(prev => {
      const nextGroups = prev.groups.includes(id)
        ? prev.groups.filter(x => x !== id)
        : [...prev.groups, id];
      const next = { ...prev, groups: nextGroups };
      localStorage.setItem("hosen_patients_selected_filters", JSON.stringify(next));
      return next;
    });
  };

  const handleClearFilters = () => {
    const next = { programs: [], groups: [] };
    setSelectedFilters(next);
    localStorage.setItem("hosen_patients_selected_filters", JSON.stringify(next));
  };

  const filtered = useMemo(() => {
    return patients.filter(p => {
      const nameMatch = `${p.firstName} ${p.lastName} ${p.idNumber} ${p.fullName || ""}`.toLowerCase().includes(searchTerm.toLowerCase());
      
      const noFilters = selectedFilters.programs.length === 0 && selectedFilters.groups.length === 0;
      if (noFilters) return nameMatch;

      // Resolve groups
      const patientGroups = p.groupIds || (p.hosenType ? [p.hosenType] : []);

      // Resolve both explicit programIds and implicit ones (via patient's groups)
      const explicitPrograms = p.programIds || (p.programId ? [p.programId] : []);
      const implicitPrograms = patientGroups.map(gId => {
        const g = groups.find(x => x.id === gId);
        return g?.programId;
      }).filter(Boolean) as string[];
      const patientPrograms = Array.from(new Set([...explicitPrograms, ...implicitPrograms]));

      const hasProgramFilter = selectedFilters.programs.length > 0;
      const matchesProgram = hasProgramFilter 
        ? patientPrograms.some((id: string) => selectedFilters.programs.includes(id))
        : false;

      const hasGroupFilter = selectedFilters.groups.length > 0;
      const matchesGroup = hasGroupFilter
        ? patientGroups.some((id: string) => selectedFilters.groups.includes(id))
        : false;

      if (hasProgramFilter && hasGroupFilter) {
        return nameMatch && matchesProgram && matchesGroup;
      }
      if (hasProgramFilter) {
        return nameMatch && matchesProgram;
      }
      if (hasGroupFilter) {
        return nameMatch && matchesGroup;
      }

      return nameMatch;
    });
  }, [patients, searchTerm, selectedFilters, groups]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("האם אתה בטוח שברצונך למחוק משתתף זה?")) return;
    try {
      await deleteDoc(doc(db, "patients", id));
      setPatients(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      alert("שגיאה במחיקת המשתתף");
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "dd/MM/yy", { locale: he });
    } catch {
      return dateStr;
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee"]} redirectTo="/">
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-8">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight">ניהול משתתפים</h1>
            <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-[0.2em] flex items-center gap-2">
              <Users className="w-3 h-3 text-emerald-500" />
              <span>{filtered.length} רשומות פעילות</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-[var(--foreground)]/5 p-1 rounded-lg border border-[var(--border)] mr-4">
              <button 
                onClick={() => setViewMode("table")} 
                title="תצוגת טבלה"
                className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-[var(--foreground)] text-[var(--background)] shadow-sm' : 'text-[var(--foreground)]/40'}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setViewMode("cards")} 
                title="תצוגת כרטיסים"
                className={`p-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-[var(--foreground)] text-[var(--background)] shadow-sm' : 'text-[var(--foreground)]/40'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>

            <button 
              onClick={() => {
                setImportStep("upload");
                setImportModalOpen(true);
              }}
              title="ייבוא משתתפים מרוכז מקובץ אקסל"
              className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-5 py-2.5 rounded-xl text-xs font-black transition-all hover:bg-emerald-500/20 active:scale-95 ml-2"
            >
              <Upload className="w-4 h-4" />
              ייבוא מאקסל
            </button>

            <button 
              onClick={() => router.push("/patients/new")}
              title="הוספת משתתף חדש למערכת"
              className="flex items-center gap-2 bg-[var(--foreground)] text-[var(--background)] px-5 py-2.5 rounded-xl text-xs font-black transition-all hover:opacity-90"
            >
              <Plus className="w-4 h-4" />
              משתתף חדש
            </button>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-12 gap-2 relative z-50">
          <div className="md:col-span-7 relative group">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]/40" />
            <input 
              type="text" 
              placeholder="חיפוש לפי שם או תעודת זהות..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl pr-11 pl-4 py-2.5 text-xs font-bold outline-none focus:border-[var(--muted)]/50 transition-all"
            />
          </div>
          
          <div className="md:col-span-5 relative">
            <button
              onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
              className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl px-4 py-2.5 text-xs font-black flex items-center justify-between transition-all hover:bg-[var(--foreground)]/[0.08] active:scale-[0.99]"
            >
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-emerald-500" />
                <span>{selectedFilters.programs.length + selectedFilters.groups.length > 0 
                  ? `סינון פעיל (${selectedFilters.programs.length + selectedFilters.groups.length})` 
                  : "כל התוכניות והקבוצות"}</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${filterDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Click backdrop to close */}
            {filterDropdownOpen && (
              <div 
                className="fixed inset-0 z-40 bg-transparent" 
                onClick={() => setFilterDropdownOpen(false)} 
              />
            )}

            {/* Dropdown Popover */}
            <AnimatePresence>
              {filterDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 md:left-auto md:w-[380px] top-full mt-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl p-4 z-50 text-right overflow-hidden flex flex-col"
                  dir="rtl"
                >
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3">
                    <span className="text-xs font-black text-[var(--foreground)]">סינון לפי תוכניות וקבוצות</span>
                    {(selectedFilters.programs.length > 0 || selectedFilters.groups.length > 0) && (
                      <button 
                        onClick={handleClearFilters}
                        className="text-[10px] font-black text-rose-500 hover:text-rose-600 transition-colors flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        נקה הכל
                      </button>
                    )}
                  </div>

                  <div className="overflow-y-auto max-h-[320px] pr-1 space-y-4 no-scrollbar">
                    {/* Programs Section */}
                    {programs.length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="text-[10px] font-black uppercase text-[var(--muted)] tracking-wider mb-2 pr-1 border-r-2 border-emerald-500">תוכניות</h4>
                        <div className="grid grid-cols-1 gap-1">
                          {programs.map(p => {
                            const isSelected = selectedFilters.programs.includes(p.id);
                            return (
                              <button
                                key={p.id}
                                onClick={() => handleToggleProgramFilter(p.id)}
                                className={`w-full text-right px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between active:scale-[0.98] ${
                                  isSelected 
                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                                    : 'hover:bg-[var(--foreground)]/5 border border-transparent'
                                }`}
                              >
                                <span>{p.name.startsWith("תוכנית") ? p.name : `תוכנית ${p.name}`}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[3]" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Groups Section */}
                    {groups.length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="text-[10px] font-black uppercase text-[var(--muted)] tracking-wider mb-2 pr-1 border-r-2 border-indigo-500">קבוצות</h4>
                        <div className="grid grid-cols-1 gap-1">
                          {groups.map(g => {
                            const prog = programs.find(p => p.id === g.programId);
                            const displayName = prog ? `${prog.name} - ${g.name}` : g.name;
                            const isSelected = selectedFilters.groups.includes(g.id);
                            return (
                              <button
                                key={g.id}
                                onClick={() => handleToggleGroupFilter(g.id)}
                                className={`w-full text-right px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between active:scale-[0.98] ${
                                  isSelected 
                                    ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20' 
                                    : 'hover:bg-[var(--foreground)]/5 border border-transparent'
                                }`}
                              >
                                <span className="truncate max-w-[280px]">{displayName}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-500 stroke-[3]" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4 opacity-20">
              <Loader2 className="w-10 h-10 animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest">טוען נתונים...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-40 bg-[var(--foreground)]/5 border border-dashed border-[var(--border)] rounded-[3rem] opacity-20">
              <p className="text-lg font-bold italic">לא נמצאו משתתפים העונים לחיפוש</p>
            </div>
          ) : viewMode === "table" ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-240px)] no-scrollbar">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="sticky top-0 bg-[var(--surface)]/90 backdrop-blur px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)] z-10 shadow-[inset_0_-1px_0_var(--border)]">משתתף</th>
                      <th className="sticky top-0 bg-[var(--surface)]/90 backdrop-blur px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)] z-10 shadow-[inset_0_-1px_0_var(--border)]">תעודת זהות</th>
                      <th className="sticky top-0 bg-[var(--surface)]/90 backdrop-blur px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)] z-10 shadow-[inset_0_-1px_0_var(--border)]">עו"ס מלווה</th>
                      <th className="sticky top-0 bg-[var(--surface)]/90 backdrop-blur px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)] z-10 shadow-[inset_0_-1px_0_var(--border)]">תוכנית</th>
                      <th className="sticky top-0 bg-[var(--surface)]/90 backdrop-blur px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)] z-10 shadow-[inset_0_-1px_0_var(--border)]">תאריך התחלה</th>
                      <th className="sticky top-0 bg-[var(--surface)]/90 backdrop-blur px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)] z-10 shadow-[inset_0_-1px_0_var(--border)]">תאריך סיום</th>
                      <th className="sticky top-0 bg-[var(--surface)]/90 backdrop-blur px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)] text-center z-10 shadow-[inset_0_-1px_0_var(--border)]">הוגשה הארכה</th>
                      <th className="sticky top-0 bg-[var(--surface)]/90 backdrop-blur px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)] text-center z-10 shadow-[inset_0_-1px_0_var(--border)]">התקבלה הארכה</th>
                      <th className="sticky top-0 bg-[var(--surface)]/90 backdrop-blur px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)] z-10 shadow-[inset_0_-1px_0_var(--border)]">סטטוס</th>
                      <th className="sticky top-0 bg-[var(--surface)]/90 backdrop-blur px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[var(--muted)] w-16 z-10 shadow-[inset_0_-1px_0_var(--border)]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filtered.map((p) => {
                      const daysLeft = getDaysRemaining(p);
                      const isExpiring3m = p.status === 'active' && daysLeft !== null && daysLeft <= 14 && !p.extensionReceived;
                      const isExpiring6m = p.status === 'active' && daysLeft !== null && daysLeft <= 14 && p.extensionReceived;

                      return (
                        <tr 
                          key={p.id} 
                          onClick={() => router.push(`/patients/${p.id}`)}
                          className={`transition-colors cursor-pointer group ${
                            isExpiring6m 
                              ? 'bg-rose-500/5 hover:bg-rose-500/10 border-r-4 border-r-rose-500'
                              : isExpiring3m
                              ? 'bg-amber-500/5 hover:bg-amber-500/10 border-r-4 border-r-amber-500' 
                              : 'hover:bg-[var(--foreground)]/[0.02]'
                          }`}
                        >
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                                isExpiring6m ? 'bg-rose-500/20 text-rose-600' : isExpiring3m ? 'bg-amber-500/20 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'
                              }`}>
                                {p.firstName?.[0]}{p.lastName?.[0]}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className={`font-black text-sm transition-colors ${
                                  isExpiring6m ? 'text-rose-700 group-hover:text-rose-800' : isExpiring3m ? 'text-amber-700 group-hover:text-amber-800' : 'group-hover:text-emerald-500'
                                }`}>
                                  {p.firstName} {p.lastName}
                                </span>
                                {isExpiring3m && (
                                  <span className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-md whitespace-nowrap w-fit">
                                    <AlertCircle className="w-2.5 h-2.5" />
                                    {daysLeft < 0 ? 'עבר 3 חודשים!' : `מסיים 3 חודשים (נותרו ${daysLeft} ימים)`}
                                  </span>
                                )}
                                {isExpiring6m && (
                                  <span className="flex items-center gap-1 text-[9px] font-black text-rose-600 bg-rose-500/10 px-1.5 py-0.5 rounded-md whitespace-nowrap w-fit">
                                    <AlertCircle className="w-2.5 h-2.5" />
                                    {daysLeft < 0 ? 'עבר חצי שנה (פרידה)!' : `מסיים חצי שנה (נותרו ${daysLeft} ימים)`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-xs font-bold font-mono opacity-60">{p.idNumber}</td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2">
                               <Briefcase className="w-3.5 h-3.5 text-emerald-500/40" />
                               <span className="text-xs font-bold">{staff[p.assignedWorkerId || ""] || "לא שובץ"}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className="px-3 py-1 rounded-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[10px] font-black">
                              {(() => {
                                const patientProgs = p.programIds || (p.programId ? [p.programId] : []);
                                const patientGrps = p.groupIds || (p.hosenType ? [p.hosenType] : []);
                                
                                if (patientProgs.length === 0 && patientGrps.length === 0) return "כללי";
                                
                                const grpNames = patientGrps.map((gId: string) => {
                                  const g = groups.find(x => x.id === gId);
                                  if (!g) return gId;
                                  const prog = programs.find(x => x.id === g.programId);
                                  return prog ? `${prog.name} - ${g.name}` : g.name;
                                });

                                const progNames = patientProgs.filter((pId: string) => {
                                  const hasGroupShown = groups.some(g => g.programId === pId && patientGrps.includes(g.id));
                                  return !hasGroupShown;
                                }).map((pId: string) => {
                                  const prog = programs.find(x => x.id === pId);
                                  return prog ? prog.name : pId;
                                });

                                const allNames = [...progNames, ...grpNames];
                                const display = allNames.join(", ");
                                if (display && display !== "כללי" && !display.startsWith("תוכנית")) {
                                  return `תוכנית ${display}`;
                                }
                                return display || "כללי";
                              })()}
                            </span>
                          </td>
                          <td className="px-6 py-5 text-xs font-bold opacity-60">{formatDate(p.startDate)}</td>
                          <td className="px-6 py-5 text-xs font-bold opacity-60">{formatDate(p.endDate)}</td>
                          <td className="px-6 py-5 text-center">
                            <div className="flex justify-center">
                              <button
                                onClick={(e) => handleToggleExtensionSent(p.id, !!p.extensionSent, e)}
                                className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                                  p.extensionSent 
                                    ? 'bg-amber-500 border-amber-600 text-white' 
                                    : 'border-[var(--border)] hover:border-amber-500 bg-[var(--surface)] hover:scale-105'
                                }`}
                              >
                                {p.extensionSent && <Check className="w-3.5 h-3.5 stroke-[4]" />}
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-center">
                            <div className="flex justify-center">
                              <button
                                onClick={(e) => handleToggleExtensionReceived(p.id, !!p.extensionReceived, e)}
                                className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                                  p.extensionReceived 
                                    ? 'bg-emerald-500 border-emerald-600 text-white' 
                                    : 'border-[var(--border)] hover:border-emerald-500 bg-[var(--surface)] hover:scale-105'
                                }`}
                              >
                                {p.extensionReceived && <Check className="w-3.5 h-3.5 stroke-[4]" />}
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${p.status === 'active' ? 'bg-emerald-500' : 'bg-[var(--muted)]/30'}`} />
                              <span className="text-xs font-bold">{p.status === 'active' ? 'פעיל' : 'לא פעיל'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-left">
                            <button 
                              onClick={(e) => handleDelete(p.id, e)}
                              title="מחיקת משתתף"
                              className="p-2 hover:bg-rose-500/10 text-[var(--foreground)]/20 hover:text-rose-500 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const daysLeft = getDaysRemaining(p);
                const isExpiring3m = p.status === 'active' && daysLeft !== null && daysLeft <= 14 && !p.extensionReceived;
                const isExpiring6m = p.status === 'active' && daysLeft !== null && daysLeft <= 14 && p.extensionReceived;

                return (
                  <motion.div 
                    key={p.id}
                    layout
                    onClick={() => router.push(`/patients/${p.id}`)}
                    className={`border rounded-2xl p-4 flex flex-col gap-3 active:bg-[var(--foreground)]/5 transition-all group ${
                      isExpiring6m
                        ? 'bg-rose-500/5 border-rose-500/30 shadow-lg shadow-rose-500/5'
                        : isExpiring3m 
                        ? 'bg-amber-500/5 border-amber-500/30 shadow-lg shadow-amber-500/5' 
                        : 'bg-[var(--surface)] border-[var(--border)]'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                        isExpiring6m ? 'bg-rose-500/20 text-rose-600' : isExpiring3m ? 'bg-amber-500/20 text-amber-600' : 'bg-[var(--foreground)]/5 text-[var(--muted)]/50'
                      }`}>
                        {p.firstName?.[0]}{p.lastName?.[0]}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className={`text-sm font-black transition-colors truncate ${
                            isExpiring6m ? 'text-rose-700' : isExpiring3m ? 'text-amber-700' : 'text-[var(--foreground)] group-hover:text-emerald-500'
                          }`}>
                            {p.firstName} {p.lastName}
                          </h3>
                          <div className={`w-1.5 h-1.5 rounded-full ${p.status === 'active' ? 'bg-emerald-500' : 'bg-[var(--muted)]/30'}`} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold text-[var(--muted)]/60 whitespace-nowrap">
                            {(() => {
                              const patientProgs = p.programIds || (p.programId ? [p.programId] : []);
                              const patientGrps = p.groupIds || (p.hosenType ? [p.hosenType] : []);
                              
                              if (patientProgs.length === 0 && patientGrps.length === 0) return "כללי";
                              
                              const grpNames = patientGrps.map((gId: string) => {
                                const g = groups.find(x => x.id === gId);
                                if (!g) return gId;
                                const prog = programs.find(x => x.id === g.programId);
                                return prog ? `${prog.name} - ${g.name}` : g.name;
                              });

                              const progNames = patientProgs.filter((pId: string) => {
                                const hasGroupShown = groups.some(g => g.programId === pId && patientGrps.includes(g.id));
                                return !hasGroupShown;
                              }).map((pId: string) => {
                                const prog = programs.find(x => x.id === pId);
                                return prog ? prog.name : pId;
                              });

                              const allNames = [...progNames, ...grpNames];
                              const display = allNames.join(", ");
                              if (display && display !== "כללי" && !display.startsWith("תוכנית")) {
                                return `תוכנית ${display}`;
                              }
                              return display || "כללי";
                            })()}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-[var(--border)] shrink-0" />
                          <span className="text-[10px] font-bold text-[var(--muted)]/60 truncate">
                            {staff[p.assignedWorkerId || ""] || "לא שובץ"}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        {p.phone && (
                          <a 
                            href={`tel:${p.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-2.5 text-[var(--muted)]/40 hover:text-emerald-500 transition-colors"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                        )}
                        <div className="p-2.5 text-[var(--muted)]/20">
                          <ChevronLeft className="w-4 h-4" />
                        </div>
                      </div>
                    </div>

                    {isExpiring3m && (
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-600 bg-amber-500/10 px-3 py-1.5 rounded-xl w-full">
                        <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                        {daysLeft < 0 ? 'תקופת ה-3 חודשים הסתיימה! נדרשת הארכה.' : `מסיים 3 חודשים (נותרו ${daysLeft} ימים)`}
                      </div>
                    )}

                    {isExpiring6m && (
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-rose-600 bg-rose-500/10 px-3 py-1.5 rounded-xl w-full">
                        <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                        {daysLeft < 0 ? 'תקופת החצי שנה הסתיימה! נדרשת פרידה מהתוכנית.' : `מסיים חצי שנה (פרידה) - נותרו ${daysLeft} ימים`}
                      </div>
                    )}

                    {/* Quick Action Toggle Checkboxes for Mobile */}
                    <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 mt-1">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={(e) => handleToggleExtensionSent(p.id, !!p.extensionSent, e)}
                          className="flex items-center gap-2 text-[10px] font-bold text-[var(--muted)] hover:text-amber-500 transition-colors"
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                            p.extensionSent 
                              ? 'bg-amber-500 border-amber-600 text-white' 
                              : 'border-[var(--border)] hover:border-amber-500 bg-[var(--surface)]'
                          }`}>
                            {p.extensionSent && <Check className="w-3 h-3 stroke-[4]" />}
                          </div>
                          הוגשה הארכה
                        </button>

                        <button
                          onClick={(e) => handleToggleExtensionReceived(p.id, !!p.extensionReceived, e)}
                          className="flex items-center gap-2 text-[10px] font-bold text-[var(--muted)] hover:text-emerald-500 transition-colors"
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                            p.extensionReceived 
                              ? 'bg-emerald-500 border-emerald-600 text-white' 
                              : 'border-[var(--border)] hover:border-emerald-500 bg-[var(--surface)]'
                          }`}>
                            {p.extensionReceived && <Check className="w-3 h-3 stroke-[4]" />}
                          </div>
                          התקבלה הארכה
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Import Modal */}
        <AnimatePresence>
          {importModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => importStep !== "importing" && setImportModalOpen(false)}
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
              />
              
              {/* Modal Box */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative w-full max-w-4xl bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] shadow-2xl p-6 md:p-8 flex flex-col max-h-[85vh] overflow-hidden text-right animate-in fade-in zoom-in duration-200"
                dir="rtl"
              >
                {/* Close Button */}
                {importStep !== "importing" && (
                  <button
                    onClick={() => setImportModalOpen(false)}
                    className="absolute left-6 top-6 w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--foreground)]/10 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                
                {/* Header */}
                <div className="mb-6">
                  <h2 className="text-xl font-black flex items-center gap-2">
                    <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
                    ייבוא משתתפים מקובץ אקסל
                  </h2>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    ייבוא רשימת מטופלים מרוכזת מתוך קובץ גיליון אקסל (XLSX, XLS, CSV)
                  </p>
                </div>
                
                {/* Content by step */}
                {importStep === "upload" && (
                  <div className="flex-1 overflow-y-auto min-h-[300px] flex flex-col gap-6 pr-1 no-scrollbar">
                    {/* File Upload Area */}
                    <label className="border-2 border-dashed border-[var(--border)] hover:border-emerald-500/50 bg-[var(--foreground)]/[0.01] hover:bg-[var(--foreground)]/[0.02] rounded-3xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all group min-h-[220px]">
                      <input
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleExcelImport(file);
                        }}
                        className="hidden"
                      />
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-sm font-black">לחץ להעלאת קובץ אקסל או גרור לכאן</p>
                        <p className="text-[10px] text-[var(--muted)] font-bold">XLSX, XLS, CSV עד נפח 5MB</p>
                      </div>
                    </label>
                    
                    {/* Instructions */}
                    <div className="bg-[var(--foreground)]/[0.02] border border-[var(--border)] rounded-2xl p-5 space-y-3">
                      <h4 className="text-xs font-black text-emerald-500">הנחיות ומבנה העמודות המומלץ:</h4>
                      <p className="text-xs text-[var(--muted)] leading-relaxed">
                        כדי שהמערכת תזהה את הנתונים ותבצע שיוך נכון לעו"ס מלווה וקבוצות, מומלץ להשתמש בכותרות הבאות בעברית (השיוך אינו רגיש לאותיות גדולות/קטנות או רווחים):
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                        <div className="bg-[var(--surface)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                          <p className="text-xs font-black">שם פרטי</p>
                          <p className="text-[9px] text-rose-500 font-bold mt-0.5">עמודת חובה</p>
                        </div>
                        <div className="bg-[var(--surface)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                          <p className="text-xs font-black">שם משפחה</p>
                          <p className="text-[9px] text-rose-500 font-bold mt-0.5">עמודת חובה</p>
                        </div>
                        <div className="bg-[var(--surface)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                          <p className="text-xs font-black">תעודת זהות</p>
                          <p className="text-[9px] text-rose-500 font-bold mt-0.5">עמודת חובה</p>
                        </div>
                        <div className="bg-[var(--surface)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                          <p className="text-xs font-black">טלפון</p>
                          <p className="text-[9px] text-[var(--muted)] font-bold mt-0.5">אופציונלי</p>
                        </div>
                        <div className="bg-[var(--surface)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                          <p className="text-xs font-black">תאריך התחלה</p>
                          <p className="text-[9px] text-[var(--muted)] font-bold mt-0.5">אופציונלי</p>
                        </div>
                        <div className="bg-[var(--surface)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                          <p className="text-xs font-black">עו"ס מלווה</p>
                          <p className="text-[9px] text-[var(--muted)] font-bold mt-0.5">אופציונלי</p>
                        </div>
                        <div className="bg-[var(--surface)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                          <p className="text-xs font-black">תוכנית</p>
                          <p className="text-[9px] text-[var(--muted)] font-bold mt-0.5">אופציונלי</p>
                        </div>
                        <div className="bg-[var(--surface)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                          <p className="text-xs font-black">קבוצה</p>
                          <p className="text-[9px] text-[var(--muted)] font-bold mt-0.5">אופציונלי</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row justify-between items-center border-t border-[var(--border)] pt-4 mt-2 gap-4">
                        <p className="text-[10px] text-[var(--muted)] font-bold text-center sm:text-right">הורד תבנית אקסל מוכנה ומעוצבת לצורך מילוי מהיר:</p>
                        <button
                          onClick={downloadImportTemplate}
                          type="button"
                          className="flex items-center gap-2 bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 px-4 py-2 rounded-xl text-xs font-black transition-all shadow-md active:scale-95"
                        >
                          <Download className="w-3.5 h-3.5" />
                          הורד תבנית לדוגמה
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                {importStep === "preview" && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Duplicates Toggle & Info Summary */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--foreground)]/[0.02] border border-[var(--border)] p-4 rounded-2xl mb-4 text-xs font-bold">
                      <div className="flex flex-wrap gap-4 items-center">
                        <span className="bg-emerald-500/10 text-emerald-600 px-3 py-1.5 rounded-lg">
                          {importRows.filter(r => r.status === "valid").length} רשומות חדשות
                        </span>
                        <span className="bg-indigo-500/10 text-indigo-600 px-3 py-1.5 rounded-lg">
                          {importRows.filter(r => r.status === "duplicate").length} רשומות קיימות
                        </span>
                        {importRows.filter(r => r.status === "warning").length > 0 && (
                          <span className="bg-rose-500/10 text-rose-600 px-3 py-1.5 rounded-lg flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {importRows.filter(r => r.status === "warning").length} רשומות עם שגיאות (ידולגו)
                          </span>
                        )}
                      </div>
                      
                      {importRows.some(r => r.status === "duplicate") && (
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={overwriteDuplicates}
                            onChange={(e) => setOverwriteDuplicates(e.target.checked)}
                            className="rounded border-[var(--border)] text-emerald-500 focus:ring-emerald-500 w-4 h-4 ml-2"
                          />
                          <span>עדכן פרטים עבור משתתפים קיימים (מומלץ)</span>
                        </label>
                      )}
                    </div>
                    
                    {/* Preview Table */}
                    <div className="flex-1 overflow-auto border border-[var(--border)] rounded-2xl mb-6">
                      <table className="w-full text-right border-collapse">
                        <thead>
                          <tr className="bg-[var(--foreground)]/[0.02] border-b border-[var(--border)] sticky top-0 z-10">
                            <th className="px-4 py-3 text-[10px] font-black uppercase text-[var(--muted)]">שם פרטי</th>
                            <th className="px-4 py-3 text-[10px] font-black uppercase text-[var(--muted)]">שם משפחה</th>
                            <th className="px-4 py-3 text-[10px] font-black uppercase text-[var(--muted)]">תעודת זהות</th>
                            <th className="px-4 py-3 text-[10px] font-black uppercase text-[var(--muted)]">טלפון</th>
                            <th className="px-4 py-3 text-[10px] font-black uppercase text-[var(--muted)]">עו"ס מלווה</th>
                            <th className="px-4 py-3 text-[10px] font-black uppercase text-[var(--muted)]">תוכנית</th>
                            <th className="px-4 py-3 text-[10px] font-black uppercase text-[var(--muted)]">קבוצה</th>
                            <th className="px-4 py-3 text-[10px] font-black uppercase text-[var(--muted)]">סטטוס</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {importRows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-[var(--foreground)]/[0.01] transition-colors text-xs font-bold">
                              <td className="px-4 py-3.5">{row.firstName || <span className="text-rose-500 italic">חסר</span>}</td>
                              <td className="px-4 py-3.5">{row.lastName || <span className="text-rose-500 italic">חסר</span>}</td>
                              <td className="px-4 py-3.5 font-mono">{row.idNumber || <span className="text-rose-500 italic">חסר</span>}</td>
                              <td className="px-4 py-3.5">{row.phone || "—"}</td>
                              <td className="px-4 py-3.5">
                                {row.assignedWorkerId ? (
                                  <span className="text-emerald-600">{row.workerName}</span>
                                ) : row.workerName ? (
                                  <span className="text-amber-600 flex items-center gap-1" title="לא נמצא עו'ס תואם במערכת">
                                    {row.workerName} (?)
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-3.5">
                                {row.programId ? (
                                  <span className="text-emerald-600">{row.programName}</span>
                                ) : row.programName ? (
                                  <span className="text-amber-500 flex items-center gap-1" title="לא נמצאה תוכנית תואמת">
                                    {row.programName} (?)
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-3.5">
                                {row.groupIds?.length ? (
                                  <span className="text-emerald-600">{row.groupName}</span>
                                ) : row.groupName ? (
                                  <span className="text-amber-500 flex items-center gap-1" title="לא נמצאה קבוצה תואמת">
                                    {row.groupName} (?)
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-3.5">
                                {row.status === "valid" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 text-[10px]">
                                    <Check className="w-3 h-3 stroke-[3]" />
                                    חדש
                                  </span>
                                )}
                                {row.status === "duplicate" && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] ${
                                    overwriteDuplicates 
                                      ? 'bg-indigo-500/10 text-indigo-600' 
                                      : 'bg-slate-500/10 text-slate-500 line-through'
                                  }`}>
                                    <RefreshCw className="w-3 h-3 stroke-[3]" />
                                    {overwriteDuplicates ? "עדכון" : "דילוג"}
                                  </span>
                                )}
                                {row.status === "warning" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-500/10 text-rose-600 text-[10px]" title={row.message}>
                                    <AlertTriangle className="w-3 h-3" />
                                    שגיאה
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center justify-between mt-auto">
                      <button
                        onClick={() => setImportStep("upload")}
                        className="bg-[var(--foreground)]/5 border border-[var(--border)] hover:bg-[var(--foreground)]/10 text-[var(--foreground)] px-6 py-3 rounded-2xl text-xs font-black transition-all"
                      >
                        חזור להעלאה
                      </button>
                      
                      <button
                        onClick={handleCommitImport}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 active:scale-95 shadow-xl shadow-emerald-600/10"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        אשר ובצע ייבוא ({importRows.filter(r => r.status === "valid" || (r.status === "duplicate" && overwriteDuplicates)).length} רשומות)
                      </button>
                    </div>
                  </div>
                )}
                
                {importStep === "importing" && (
                  <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center gap-6">
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="48" cy="48" r="40" stroke="var(--border)" strokeWidth="8" fill="transparent" />
                        <circle cx="48" cy="48" r="40" stroke="var(--primary)" strokeWidth="8" fill="transparent"
                          strokeDasharray={2 * Math.PI * 40}
                          strokeDashoffset={2 * Math.PI * 40 * (1 - importProgress / 100)}
                          className="transition-all duration-300"
                        />
                      </svg>
                      <span className="absolute text-sm font-black font-mono">{importProgress}%</span>
                    </div>
                    <div className="text-center space-y-1">
                      <h3 className="text-sm font-black">מייבא משתתפים למסד הנתונים...</h3>
                      <p className="text-[10px] text-[var(--muted)] font-bold">אנא המתן, לא לסגור את החלון</p>
                    </div>
                  </div>
                )}
                
                {importStep === "success" && (
                  <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center gap-6">
                    <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center animate-bounce">
                      <CheckCircle2 className="w-8 h-8 stroke-[3]" />
                    </div>
                    <div className="text-center space-y-1">
                      <h3 className="text-lg font-black">הייבוא הושלם בהצלחה!</h3>
                      <p className="text-xs text-[var(--muted)] font-bold">
                        כל הרשומות התקינות נוספו או עודכנו בהצלחה במערכת.
                      </p>
                    </div>
                    <button
                      onClick={() => setImportModalOpen(false)}
                      className="bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 px-8 py-3 rounded-2xl text-xs font-black transition-all active:scale-95 mt-4 animate-pulse"
                    >
                      סגור חלון
                    </button>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </RoleGuard>
  );
}
