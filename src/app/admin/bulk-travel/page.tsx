"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, getDoc, doc, query, where, orderBy, limit } from "firebase/firestore";
import {
  ChevronLeft, Loader2, Upload, Users, Car,
  FileSpreadsheet, FileArchive, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { getDay, parseISO, format, subMonths } from "date-fns";
import { he } from "date-fns/locale";
import { useAlert } from "@/hooks/useAlert";
import { useConfirm } from "@/hooks/useConfirm";
import { generateTravelReimbursementWord, generateDocxBlobWithLetterhead, TravelReimbData } from "@/lib/word-generator";

// ─── Types ──────────────────────────────────────────────────────────────

interface Program {
  id: string;
  name: string;
  activeDays: number[];
  activityHours?: string;
  status?: "active" | "archived";
  travelActivityDetail?: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  arrivalMethod?: "private_car" | "taxi";
  programIds?: string[];
  programId?: string;
  startDate?: string;
}

interface AttendanceRecord {
  date: string;
  status: string;
}

interface BulkParticipant {
  patientId: string;
  firstName: string;
  lastNameInitial: string;
  lastNameSystem: string;
  qualifyingDates: string[]; // attendance dates already filtered by program active days + selected months
  startDate?: string;
}

interface ImportedRow {
  patientId: string;
  fullLastName: string;
  idNumber: string;
}

interface BulkCertRow extends BulkParticipant {
  fullLastName: string;
  idNumber: string;
  matched: boolean;
}

interface ReportSettings {
  professionalManagerName?: string;
  professionalManagerTitle?: string;
  professionalManagerSignature?: string;
  travelActivityDetail?: string;
}

type RawExcelRow = Record<string, string | number | undefined>;

// ─── Constants ──────────────────────────────────────────────────────────

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const HEBREW_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const BULK_SIGNATORY = {
  signatoryName: "מירב סארמילי",
  signatoryTitle: "מנהלת תפעול",
  signatoryOrg: "מרכז חוסן חוות רום",
};

// ─── Pure helpers ───────────────────────────────────────────────────────

function sanitizeFilenamePart(s: string): string {
  return (s || "").replace(/[\\/:*?"<>|]/g, "_").trim();
}

function getProgramDaysText(activeDays: number[]): string {
  const mapped = [...(activeDays || [])].sort((a, b) => a - b).map(d => DAY_NAMES[d]).filter(Boolean);
  if (mapped.length === 0) return "";
  if (mapped.length === 1) return `ביום ${mapped[0]}`;
  const last = mapped.pop();
  return `בימים ${mapped.join(", ")} ו${last}`;
}

function filterAttendanceByProgramDays(
  records: AttendanceRecord[],
  programActiveDays: number[],
  months: string[]
): string[] {
  const monthSet = new Set(months);
  return records
    .filter(r => r.status === "present")
    .filter(r => monthSet.has(r.date.slice(0, 7)))
    .filter(r => {
      try {
        const dow = getDay(parseISO(r.date));
        return !programActiveDays || programActiveDays.length === 0 || programActiveDays.includes(dow);
      } catch { return false; }
    })
    .map(r => r.date)
    .sort();
}

function buildAttendanceDatesStr(qualifyingDates: string[], months: string[]): string {
  const sortedMonths = [...months].sort();
  return sortedMonths.map(m => {
    const [year, monthStr] = m.split("-");
    const monthName = HEBREW_MONTHS[parseInt(monthStr, 10) - 1];
    const daysInMonth = qualifyingDates
      .filter(d => d.startsWith(m))
      .map(d => parseInt(d.split("-")[2], 10));
    return daysInMonth.length > 0
      ? `${daysInMonth.join(",")} לחודש ${monthName} ${year}`
      : `לא נמצאו ימי נוכחות התואמים את ימי הפעילות לחודש ${monthName} ${year}`;
  }).join("\n");
}

function monthSuffixFromMonths(months: string[]): string {
  return [...months].sort().map(m => {
    const [year, monthStr] = m.split("-");
    return `${HEBREW_MONTHS[parseInt(monthStr, 10) - 1]}_${year}`;
  }).join("_");
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function BulkTravelPage() {
  const { isManager, assignedProgramIds } = useAuth();
  const router = useRouter();
  const { alert, AlertDialog } = useAlert();
  const { confirm, ConfirmDialog } = useConfirm();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [visiblePrograms, setVisiblePrograms] = useState<Program[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [reportSettings, setReportSettings] = useState<ReportSettings | null>(null);

  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [participants, setParticipants] = useState<BulkParticipant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  const [mergedData, setMergedData] = useState<BulkCertRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ done: 0, total: 0 });
  const [generationErrors, setGenerationErrors] = useState<{ name: string; error: string }[]>([]);

  const selectedProgram = useMemo(() => allPrograms.find(p => p.id === selectedProgramId), [allPrograms, selectedProgramId]);

  const trailingMonths = useMemo(() => Array.from({ length: 6 }).map((_, i) => {
    const d = subMonths(new Date(), i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy", { locale: he }) };
  }), []);

  // ── Load programs + settings ──
  useEffect(() => {
    async function loadInitialData() {
      setLoadingPrograms(true);
      try {
        const [progsSnap, settingsSnap] = await Promise.all([
          getDocs(collection(db, "programs")),
          getDoc(doc(db, "settings", "reports")),
        ]);
        const progs = progsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Program))
          .filter(p => p.status !== "archived");
        setAllPrograms(progs);
        setVisiblePrograms(isManager ? progs : progs.filter(p => assignedProgramIds.includes(p.id)));
        if (settingsSnap.exists()) setReportSettings(settingsSnap.data());
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingPrograms(false);
      }
    }
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, assignedProgramIds.join(",")]);

  async function loadParticipants(programId: string, months: string[]) {
    setLoadingParticipants(true);
    try {
      const program = allPrograms.find(p => p.id === programId);
      if (!program) { setParticipants([]); return; }

      const pSnap = await getDocs(collection(db, "patients"));
      const patients = pSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Patient))
        .filter(p => {
          if (p.status !== "active") return false;
          if (p.arrivalMethod !== "private_car") return false;
          const pIds = p.programIds || (p.programId ? [p.programId] : []);
          return pIds.includes(programId);
        });

      if (patients.length === 0) { setParticipants([]); return; }

      const attSnaps = await Promise.all(patients.map(p => getDocs(query(
        collection(db, "attendance"),
        where("patientId", "==", p.id),
        orderBy("date", "desc"),
        limit(1000)
      ))));

      const built = patients.map((p, i) => {
        const records = attSnaps[i].docs.map(d => d.data() as AttendanceRecord);
        const qualifyingDates = filterAttendanceByProgramDays(records, program.activeDays, months);
        return {
          patientId: p.id,
          firstName: p.firstName,
          lastNameInitial: (p.lastName || "")[0] || "",
          lastNameSystem: p.lastName || "",
          qualifyingDates,
          startDate: p.startDate,
        } as BulkParticipant;
      });
      setParticipants(built);
    } catch (e) {
      console.error(e);
      await alert({ title: "שגיאה", message: "שגיאה בטעינת רשימת המשתתפים.", type: "danger" });
    } finally {
      setLoadingParticipants(false);
    }
  }

  // ── Load participants when program/months change ──
  useEffect(() => {
    if (!selectedProgramId || selectedMonths.length === 0) return;
    loadParticipants(selectedProgramId, selectedMonths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProgramId, selectedMonths.join(",")]);

  // ── Step 2: Excel template ──
  function downloadTemplate() {
    if (!selectedProgram) return;
    const sheetRows = participants.map(p => ({
      "מזהה (אין לשנות)": p.patientId,
      "שם פרטי": p.firstName,
      "שם משפחה (במערכת)": p.lastNameSystem,
      "שם משפחה מלא": "",
      "מספר ת.ז.": "",
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "תבנית");
    const suffix = monthSuffixFromMonths(selectedMonths);
    XLSX.writeFile(wb, `תבנית_אישורי_נסיעות_${sanitizeFilenamePart(selectedProgram.name)}_${suffix}.xlsx`);
  }

  // ── Step 3: Import + reconcile ──
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<RawExcelRow>(ws);
        const rows: ImportedRow[] = json.map(row => ({
          patientId: String(row["מזהה (אין לשנות)"] ?? "").trim(),
          fullLastName: String(row["שם משפחה מלא"] ?? "").trim(),
          idNumber: String(row["מספר ת.ז."] ?? "").trim(),
        })).filter(r => r.patientId);

        const byId = new Map(rows.map(r => [r.patientId, r]));
        const merged: BulkCertRow[] = participants.map(p => {
          const imp = byId.get(p.patientId);
          return {
            ...p,
            fullLastName: imp?.fullLastName || "",
            idNumber: imp?.idNumber || "",
            matched: !!imp && !!imp.fullLastName && !!imp.idNumber,
          };
        });
        setMergedData(merged);
      } catch (err) {
        console.error(err);
        await alert({ title: "שגיאה", message: "לא ניתן לקרוא את הקובץ. ודא שזהו קובץ Excel תקין שהופק מהתבנית.", type: "danger" });
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsBinaryString(file);
  }

  // ── Generate + zip ──
  async function generateAll() {
    if (!selectedProgram) return;
    const rowsToGenerate = mergedData.filter(r => r.matched);
    const unmatchedCount = mergedData.length - rowsToGenerate.length;

    if (rowsToGenerate.length === 0) {
      await alert({ title: "אין נתונים", message: "לא נמצאו משתתפים עם שם משפחה מלא ות.ז. שהוזנו כראוי.", type: "danger" });
      return;
    }
    if (unmatchedCount > 0) {
      const proceed = await confirm({
        title: "משתתפים חסרים",
        message: `${unmatchedCount} משתתפים חסרים שם משפחה מלא ו/או ת.ז. ולא יופק להם אישור. להמשיך עם ${rowsToGenerate.length} השאר?`,
        confirmLabel: "המשך",
        cancelLabel: "ביטול",
      });
      if (!proceed) return;
    }

    setGenerating(true);
    setGenerationErrors([]);
    setGenerationProgress({ done: 0, total: rowsToGenerate.length });

    const zip = new JSZip();
    const monthSuffix = monthSuffixFromMonths(selectedMonths);
    const errors: { name: string; error: string }[] = [];
    const usedFilenames = new Set<string>();

    for (const row of rowsToGenerate) {
      try {
        const data: TravelReimbData = {
          date: format(new Date(), "dd/MM/yyyy"),
          recipient: "עבור משרד הביטחון - אגף השיקום",
          firstName: row.firstName,
          lastName: row.fullLastName,
          idNumber: row.idNumber,
          startDate: row.startDate || "",
          programName: selectedProgram.name,
          activityDays: getProgramDaysText(selectedProgram.activeDays),
          activityHours: selectedProgram.activityHours,
          activityDetailText: selectedProgram.travelActivityDetail || reportSettings?.travelActivityDetail,
          attendanceDatesStr: buildAttendanceDatesStr(row.qualifyingDates, selectedMonths),
          totalDays: String(row.qualifyingDates.length),
          ...BULK_SIGNATORY,
          managerName: reportSettings?.professionalManagerName,
          managerTitle: reportSettings?.professionalManagerTitle,
          managerOrg: "חוות רום - מרכז חוסן",
          managerSignature: reportSettings?.professionalManagerSignature,
        };

        const wordDoc = generateTravelReimbursementWord(data);
        const blob = await generateDocxBlobWithLetterhead(wordDoc);

        let filename = `החזר_נסיעות_${sanitizeFilenamePart(row.fullLastName)}_${sanitizeFilenamePart(row.firstName)}_${sanitizeFilenamePart(selectedProgram.name)}_${monthSuffix}.docx`;
        if (usedFilenames.has(filename)) {
          filename = `החזר_נסיעות_${sanitizeFilenamePart(row.fullLastName)}_${sanitizeFilenamePart(row.firstName)}_${row.patientId}_${sanitizeFilenamePart(selectedProgram.name)}_${monthSuffix}.docx`;
        }
        usedFilenames.add(filename);
        zip.file(filename, blob);
      } catch (err) {
        console.error(err);
        errors.push({ name: `${row.firstName} ${row.fullLastName}`, error: String(err instanceof Error ? err.message : err) });
      } finally {
        setGenerationProgress(prev => ({ ...prev, done: prev.done + 1 }));
      }
    }

    setGenerationErrors(errors);

    const successCount = rowsToGenerate.length - errors.length;
    if (successCount === 0) {
      setGenerating(false);
      await alert({ title: "שגיאה", message: "לא הופק אף מסמך.", type: "danger" });
      return;
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = window.URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `אישורי_נסיעות_${sanitizeFilenamePart(selectedProgram.name)}_${monthSuffix}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    setGenerating(false);
    await alert({
      title: "הופק בהצלחה",
      message: `הופקו ${successCount} מתוך ${rowsToGenerate.length} אישורים.${errors.length > 0 ? ` (${errors.length} נכשלו — ראה פירוט למטה)` : ""}`,
      type: "success",
    });
  }

  const matchedCount = mergedData.filter(r => r.matched).length;

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <AlertDialog />
        <ConfirmDialog />

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6">
          <div className="flex items-center gap-3 h-12">
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <Link href="/admin" className="hover:text-[var(--foreground)] transition-colors">ניהול</Link>
              <ChevronLeft className="w-3 h-3 opacity-30 rotate-180" />
              <span className="text-[var(--foreground)]/70">אישורי נסיעות מרוכזים</span>
            </div>
            <button onClick={() => router.push("/admin")}
              className="md:hidden p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </button>
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-cyan-400" />
              <h1 className="text-sm font-semibold">אישורי נסיעות מרוכזים</h1>
            </div>
          </div>
        </header>

        <main className="px-4 md:px-6 py-6 pb-24 max-w-4xl mx-auto">

          {/* ── Step indicator ── */}
          <div className="flex items-center gap-2 mb-8">
            {[
              { n: 1, label: "בחירת תוכנית וחודש" },
              { n: 2, label: "תבנית Excel" },
              { n: 3, label: "ייבוא והפקה" },
            ].map((s) => (
              <div key={s.n} className="flex items-center gap-2 flex-1">
                <div className={`flex items-center gap-2 flex-1 rounded-xl px-3 py-2 border ${step === s.n ? "border-cyan-500/40 bg-cyan-500/10" : step > s.n ? "border-emerald-500/20 bg-emerald-500/5" : "border-[var(--border)] bg-[var(--surface)]"}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${step === s.n ? "bg-cyan-500 text-white" : step > s.n ? "bg-emerald-500 text-white" : "bg-[var(--foreground)]/10 text-[var(--muted)]"}`}>
                    {step > s.n ? <CheckCircle2 className="w-3 h-3" /> : s.n}
                  </span>
                  <span className="text-[11px] font-bold hidden sm:inline">{s.label}</span>
                </div>
              </div>
            ))}
          </div>

          {/* ── Step 1 ── */}
          {step === 1 && (
            <section className="space-y-5">
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-5">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] mb-1.5 block">תוכנית</label>
                  {loadingPrograms ? (
                    <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> טוען תוכניות...</div>
                  ) : visiblePrograms.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">לא נמצאו תוכניות המשויכות אליך.</p>
                  ) : (
                    <select
                      value={selectedProgramId}
                      onChange={e => setSelectedProgramId(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm"
                    >
                      <option value="">בחר תוכנית...</option>
                      {visiblePrograms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] mb-1.5 block">חודש/ים</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-[var(--background)] p-3 rounded-xl border border-[var(--border)]">
                    {trailingMonths.map(m => {
                      const isChecked = selectedMonths.includes(m.value);
                      return (
                        <label key={m.value} className="flex items-center gap-2 text-xs font-bold cursor-pointer p-1 hover:bg-[var(--foreground)]/5 rounded-lg select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              setSelectedMonths(prev => e.target.checked ? [...prev, m.value] : prev.filter(v => v !== m.value));
                            }}
                            className="rounded text-cyan-500 focus:ring-cyan-500 border-[var(--border)]"
                          />
                          <span>{m.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {selectedProgramId && selectedMonths.length > 0 && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-xs font-black">משתתפים מתאימים ({participants.length})</h2>
                  </div>
                  {loadingParticipants ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-cyan-400" /></div>
                  ) : participants.length === 0 ? (
                    <p className="text-xs text-[var(--muted)] px-5 py-8 text-center">לא נמצאו משתתפים פעילים עם הגעה ברכב פרטי בתוכנית זו.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--foreground)]/[0.02]">
                            <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">שם פרטי</th>
                            <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">שם משפחה</th>
                            <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">ימי נוכחות תואמים</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {participants.map(p => (
                            <tr key={p.patientId}>
                              <td className="px-4 py-2">{p.firstName}</td>
                              <td className="px-4 py-2">{p.lastNameInitial}.</td>
                              <td className="px-4 py-2">{p.qualifyingDates.length}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  disabled={!selectedProgramId || selectedMonths.length === 0 || participants.length === 0}
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-black bg-cyan-500 text-white rounded-xl hover:bg-cyan-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  המשך לשלב הבא
                </button>
              </div>
            </section>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && selectedProgram && (
            <section className="space-y-5">
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  הורד את תבנית האקסל, מלא ידנית עבור כל משתתף את שם המשפחה המלא ומספר תעודת הזהות (מידע רגיש שאינו נשמר במערכת), ולאחר מכן חזור לכאן וייבא את הקובץ המלא בשלב הבא.
                </p>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-black bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl hover:bg-[var(--foreground)]/10 transition-all"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  הורדת תבנית Excel ({participants.length} משתתפים)
                </button>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="px-5 py-2.5 text-xs font-black bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl hover:bg-[var(--foreground)]/10 transition-all">
                  חזרה
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-black bg-cyan-500 text-white rounded-xl hover:bg-cyan-600 transition-all"
                >
                  המשך לייבוא
                </button>
              </div>
            </section>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && selectedProgram && (
            <section className="space-y-5">
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
                <label className="flex items-center gap-2 px-5 py-2.5 text-xs font-black bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl hover:bg-[var(--foreground)]/10 transition-all cursor-pointer w-fit">
                  <Upload className="w-4 h-4 text-cyan-400" />
                  ייבוא תבנית מלאה
                  <input type="file" accept=".xlsx, .xls" onChange={handleImportFile} className="hidden" />
                </label>
              </div>

              {mergedData.length > 0 && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
                    <h2 className="text-xs font-black">תצוגה מקדימה ({matchedCount}/{mergedData.length} מוכנים להפקה)</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--foreground)]/[0.02]">
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">שם פרטי</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">שם משפחה מלא</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">ת.ז.</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">ימי נוכחות</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">סטטוס</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {mergedData.map(r => (
                          <tr key={r.patientId} className={!r.matched ? "bg-rose-500/[0.04]" : ""}>
                            <td className="px-4 py-2">{r.firstName}</td>
                            <td className="px-4 py-2">{r.fullLastName || "—"}</td>
                            <td className="px-4 py-2">{r.idNumber || "—"}</td>
                            <td className="px-4 py-2">{r.qualifyingDates.length}</td>
                            <td className="px-4 py-2">
                              {r.matched ? (
                                <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-bold"><CheckCircle2 className="w-3 h-3" /> מוכן</span>
                              ) : (
                                <span className="flex items-center gap-1 text-rose-400 text-[11px] font-bold"><AlertTriangle className="w-3 h-3" /> חסר מידע</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {generating && (
                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span className="text-xs font-bold">מפיק אישורים... {generationProgress.done}/{generationProgress.total}</span>
                </div>
              )}

              {generationErrors.length > 0 && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 space-y-1">
                  <p className="text-xs font-black text-rose-400">שגיאות בהפקה:</p>
                  {generationErrors.map((e, i) => (
                    <p key={i} className="text-[11px] text-[var(--muted)]">{e.name}: {e.error}</p>
                  ))}
                </div>
              )}

              <div className="flex justify-between">
                <button onClick={() => setStep(2)} disabled={generating} className="px-5 py-2.5 text-xs font-black bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl hover:bg-[var(--foreground)]/10 transition-all disabled:opacity-40">
                  חזרה
                </button>
                <button
                  onClick={generateAll}
                  disabled={generating || mergedData.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-black bg-cyan-500 text-white rounded-xl hover:bg-cyan-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
                  הפקת אישורי נסיעות (ZIP)
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </RoleGuard>
  );
}
