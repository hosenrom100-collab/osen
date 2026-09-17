"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, getDoc, doc } from "firebase/firestore";
import {
  ChevronLeft, Loader2, Upload, Users, FileText,
  FileSpreadsheet, FileArchive, CheckCircle2, AlertTriangle, Download,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { getDay, parseISO, format, isValid } from "date-fns";
import { useAlert } from "@/hooks/useAlert";
import { useConfirm } from "@/hooks/useConfirm";
import { generateStayCertificateWord, generateDocxBlobWithLetterhead, StayCertData } from "@/lib/word-generator";

// ─── Types ──────────────────────────────────────────────────────────────

interface Program {
  id: string;
  name: string;
  activeDays: number[];
  activityHours?: string;
  status?: "active" | "archived";
  participationActivityDetail?: string;
}

interface Group {
  id: string;
  name: string;
  programId?: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  programIds?: string[];
  programId?: string;
  startDate?: string;
}

interface BulkParticipant {
  patientId: string;
  firstName: string;
  lastNameInitial: string;
  lastNameSystem: string;
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
  participationActivityDetail?: string;
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
  if (mapped.length === 0) return "בימים ב' ג' וד'";
  if (mapped.length === 1) return `ביום ${mapped[0]}`;
  const last = mapped.pop();
  return `בימים ${mapped.join(", ")} ו${last}`;
}

function buildLetterDateHebrew(d: Date): string {
  const dayName = DAY_NAMES[getDay(d)];
  const dayNum = d.getDate();
  const monthName = HEBREW_MONTHS[d.getMonth()];
  const yearNum = d.getFullYear();
  return `יום ${dayName} ${dayNum} ${monthName} ${yearNum}`;
}

function formatStartDateHebrew(raw?: string): string {
  if (!raw) return format(new Date(), "dd.MM.yyyy");
  try {
    const parsed = parseISO(raw);
    return isValid(parsed) ? format(parsed, "dd.MM.yyyy") : raw;
  } catch {
    return raw;
  }
}

function formatHoursHebrew(hours?: string): string {
  const h = (hours || "9:00-15:00").trim();
  const idx = h.indexOf("-");
  if (idx === -1) return h;
  return `${h.slice(0, idx).trim()} עד ${h.slice(idx + 1).trim()}`;
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function BulkStayPage() {
  const { isManager, assignedProgramIds } = useAuth();
  const router = useRouter();
  const { alert, AlertDialog } = useAlert();
  const { confirm, ConfirmDialog } = useConfirm();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [visiblePrograms, setVisiblePrograms] = useState<Program[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [reportSettings, setReportSettings] = useState<ReportSettings | null>(null);

  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [participants, setParticipants] = useState<BulkParticipant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  const [mergedData, setMergedData] = useState<BulkCertRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ done: 0, total: 0 });
  const [generationErrors, setGenerationErrors] = useState<{ name: string; error: string }[]>([]);

  const selectedProgram = useMemo(() => allPrograms.find(p => p.id === selectedProgramId), [allPrograms, selectedProgramId]);

  const programGroups = useMemo(() => {
    if (!selectedProgramId) return [];
    return allGroups.filter(g => g.programId === selectedProgramId);
  }, [allGroups, selectedProgramId]);

  // Reset selectedGroupId when selectedProgramId changes
  useEffect(() => {
    setSelectedGroupId("");
  }, [selectedProgramId]);

  // ── Load programs + settings ──
  useEffect(() => {
    async function loadInitialData() {
      setLoadingPrograms(true);
      try {
        const [progsSnap, settingsSnap, groupsSnap] = await Promise.all([
          getDocs(collection(db, "programs")),
          getDoc(doc(db, "settings", "reports")),
          getDocs(collection(db, "groups")),
        ]);
        const progs = progsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Program))
          .filter(p => p.status !== "archived");
        setAllPrograms(progs);
        setVisiblePrograms(isManager ? progs : progs.filter(p => assignedProgramIds.includes(p.id)));
        setAllGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Group)));
        if (settingsSnap.exists()) setReportSettings(settingsSnap.data());
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingPrograms(false);
      }
    }
    loadInitialData();
  }, [isManager, assignedProgramIds.join(",")]);

  async function loadParticipants(programId: string, groupId: string) {
    setLoadingParticipants(true);
    try {
      const program = allPrograms.find(p => p.id === programId);
      if (!program) { setParticipants([]); return; }

      const pSnap = await getDocs(collection(db, "patients"));
      const activePatients = pSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Patient & { groupIds?: string[]; hosenType?: string }))
        .filter(p => {
          if (p.status !== "active") return false;
          const pIds = p.programIds || (p.programId ? [p.programId] : []);
          const belongsToProgram = pIds.includes(programId);
          if (!belongsToProgram) return false;

          if (groupId) {
            const gIds = p.groupIds || (p.hosenType ? [p.hosenType] : []);
            return gIds.includes(groupId);
          }
          return true;
        });

      const built: BulkParticipant[] = activePatients.map(p => ({
        patientId: p.id,
        firstName: p.firstName,
        lastNameInitial: (p.lastName || "")[0] || "",
        lastNameSystem: p.lastName || "",
        startDate: p.startDate,
      }));
      setParticipants(built);
    } catch (e) {
      console.error(e);
      await alert({ title: "שגיאה", message: "שגיאה בטעינת רשימת המשתתפים.", type: "danger" });
    } finally {
      setLoadingParticipants(false);
    }
  }

  // ── Load participants when program/group changes ──
  useEffect(() => {
    if (!selectedProgramId) return;
    loadParticipants(selectedProgramId, selectedGroupId);
  }, [selectedProgramId, selectedGroupId]);

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
    const createdAt = format(new Date(), "yyyy-MM-dd");
    XLSX.writeFile(wb, `תבנית_אישורי_שהייה_${sanitizeFilenamePart(selectedProgram.name)}_${createdAt}.xlsx`);
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

  function downloadUpdatedTemplate() {
    if (!selectedProgram || mergedData.length === 0) return;
    const sheetRows = mergedData.map(r => ({
      "מזהה (אין לשנות)": r.patientId,
      "שם פרטי": r.firstName,
      "שם משפחה (במערכת)": r.lastNameSystem,
      "שם משפחה מלא": r.fullLastName,
      "מספר ת.ז.": r.idNumber,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "תבנית");
    const createdAt = format(new Date(), "yyyy-MM-dd");
    XLSX.writeFile(wb, `תבנית_אישורי_שהייה_${sanitizeFilenamePart(selectedProgram.name)}_${createdAt}.xlsx`);
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
    const createdAt = format(new Date(), "yyyy-MM-dd");
    const errors: { name: string; error: string }[] = [];
    const usedFilenames = new Set<string>();

    for (const row of rowsToGenerate) {
      try {
        const data: StayCertData = {
          date: buildLetterDateHebrew(new Date()),
          recipient: "עו״ס אגף השיקום משרד הביטחון",
          firstName: row.firstName,
          lastName: row.fullLastName,
          idNumber: row.idNumber,
          startDate: formatStartDateHebrew(row.startDate),
          programName: selectedProgram.name,
          activityDays: getProgramDaysText(selectedProgram.activeDays),
          activityHours: formatHoursHebrew(selectedProgram.activityHours),
          activityDetailText: selectedProgram.participationActivityDetail || reportSettings?.participationActivityDetail,
          ...BULK_SIGNATORY,
          managerName: reportSettings?.professionalManagerName,
          managerTitle: reportSettings?.professionalManagerTitle,
          managerOrg: "חוות רום - מרכז חוסן",
          managerSignature: reportSettings?.professionalManagerSignature,
        };

        const wordDoc = generateStayCertificateWord(data);
        const blob = await generateDocxBlobWithLetterhead(wordDoc);

        let filename = `אישור_שהייה_${sanitizeFilenamePart(row.fullLastName)}_${sanitizeFilenamePart(row.firstName)}_${sanitizeFilenamePart(selectedProgram.name)}.docx`;
        if (usedFilenames.has(filename)) {
          filename = `אישור_שהייה_${sanitizeFilenamePart(row.fullLastName)}_${sanitizeFilenamePart(row.firstName)}_${row.patientId}_${sanitizeFilenamePart(selectedProgram.name)}.docx`;
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
    a.download = `אישורי_שהייה_${sanitizeFilenamePart(selectedProgram.name)}_${createdAt}.zip`;
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
              <span className="text-[var(--foreground)]/70">אישורי שהייה מרוכזים</span>
            </div>
            <button onClick={() => router.push("/admin")}
              className="md:hidden p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </button>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-500" />
              <h1 className="text-sm font-semibold">אישורי שהייה מרוכזים</h1>
            </div>
          </div>
        </header>

        <main className="px-4 md:px-6 py-6 pb-24 max-w-4xl mx-auto">

          {/* ── Step indicator ── */}
          <div className="flex items-center gap-2 mb-8">
            {[
              { n: 1, label: "בחירת תוכנית" },
              { n: 2, label: "תבנית Excel" },
              { n: 3, label: "ייבוא והפקה" },
            ].map((s) => (
              <div key={s.n} className="flex items-center gap-2 flex-1">
                <div className={`flex items-center gap-2 flex-1 rounded-xl px-3 py-2 border ${step === s.n ? "border-emerald-500/40 bg-emerald-500/10" : step > s.n ? "border-emerald-500/20 bg-emerald-500/5" : "border-[var(--border)] bg-[var(--surface)]"}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${step === s.n ? "bg-emerald-500 text-white" : step > s.n ? "bg-emerald-500 text-white" : "bg-[var(--foreground)]/10 text-[var(--muted)]"}`}>
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

                {selectedProgramId && programGroups.length > 0 && (
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] mb-1.5 block">קבוצה (סינון אופציונלי)</label>
                    <select
                      value={selectedGroupId}
                      onChange={e => setSelectedGroupId(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm"
                    >
                      <option value="">כל הקבוצות</option>
                      {programGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {selectedProgramId && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-500" />
                    <h2 className="text-xs font-black">משתתפים פעילים בתוכנית ({participants.length})</h2>
                  </div>
                  {loadingParticipants ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-emerald-500" /></div>
                  ) : participants.length === 0 ? (
                    <p className="text-xs text-[var(--muted)] px-5 py-8 text-center">לא נמצאו משתתפים פעילים בתוכנית זו.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--foreground)]/[0.02]">
                            <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">שם פרטי</th>
                            <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">שם משפחה</th>
                            <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">תאריך תחילת השתתפות</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {participants.map(p => (
                            <tr key={p.patientId}>
                              <td className="px-4 py-2">{p.firstName}</td>
                              <td className="px-4 py-2">{p.lastNameInitial}.</td>
                              <td className="px-4 py-2">{formatStartDateHebrew(p.startDate)}</td>
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
                  disabled={!selectedProgramId || participants.length === 0}
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-black bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
                  <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                  הורדת תבנית Excel ({participants.length} משתתפים)
                </button>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="px-5 py-2.5 text-xs font-black bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl hover:bg-[var(--foreground)]/10 transition-all">
                  חזרה
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-black bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-all"
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
                  <Upload className="w-4 h-4 text-emerald-500" />
                  ייבוא תבנית מלאה
                  <input type="file" accept=".xlsx, .xls" onChange={handleImportFile} className="hidden" />
                </label>
              </div>

              {mergedData.length > 0 && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
                    <h2 className="text-xs font-black">תצוגה מקדימה ({matchedCount}/{mergedData.length} מוכנים להפקה)</h2>
                    <button
                      onClick={downloadUpdatedTemplate}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black bg-[var(--foreground)]/5 border border-[var(--border)] rounded-lg hover:bg-[var(--foreground)]/10 transition-all"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-500" />
                      הורדת תבנית מעודכנת
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--foreground)]/[0.02]">
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">שם פרטי</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">שם משפחה מלא</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">ת.ז.</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">תאריך תחילה</th>
                          <th className="px-4 py-2 text-[10px] font-black uppercase text-[var(--muted)]">סטטוס</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {mergedData.map(r => (
                          <tr key={r.patientId} className={!r.matched ? "bg-rose-500/[0.04]" : ""}>
                            <td className="px-4 py-2">{r.firstName}</td>
                            <td className="px-4 py-2">{r.fullLastName || "—"}</td>
                            <td className="px-4 py-2">{r.idNumber || "—"}</td>
                            <td className="px-4 py-2">{formatStartDateHebrew(r.startDate)}</td>
                            <td className="px-4 py-2">
                              {r.matched ? (
                                <span className="flex items-center gap-1 text-emerald-500 text-[11px] font-bold"><CheckCircle2 className="w-3 h-3" /> מוכן</span>
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
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
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
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-black bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
                  הפקת אישורי שהייה (ZIP)
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </RoleGuard>
  );
}
