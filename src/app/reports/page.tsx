"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { 
  Sparkles, Download, Loader2, Plus, Trash2, 
  User, FileText, X, Check, AlertCircle, Shield, 
  ArrowRight, Edit3, UserCheck, Calendar, Info, RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { generateRehabPlanWord, downloadDocx } from "@/lib/word-generator";

interface RehabPlanData {
  areasOfImprovement: string[];
  specificGoal: string;
  waysToAchieve: string[];
  sourcesOfSupport: string[];
}

const serializePlanData = (data: RehabPlanData): string => {
  const areas = data.areasOfImprovement.map((area, idx) => `${idx + 1}. ${area}`).join("\n");
  const goal = data.specificGoal;
  const ways = data.waysToAchieve.map(way => `- ${way}`).join("\n");
  const supports = data.sourcesOfSupport.map(support => `- ${support}`).join("\n");

  return `א. תחומים לשיפור:
${areas || "1. "}

ב. מטרה ספציפית:
${goal || ""}

ג. דרכים להשגת המטרה:
${ways || "- "}

ד. מקורות סיוע:
${supports || "- "}`;
};

const deserializePlanData = (text: string): RehabPlanData => {
  const result: RehabPlanData = {
    areasOfImprovement: [],
    specificGoal: "",
    waysToAchieve: [],
    sourcesOfSupport: []
  };

  const sections = text.split(/(?=^[אבגדה]\.\s)/m);

  sections.forEach(section => {
    const lines = section.split("\n");
    const header = lines[0] || "";
    const contentLines = lines.slice(1);

    if (header.includes("א.")) {
      result.areasOfImprovement = contentLines
        .map(line => line.replace(/^\d+[\.\)]\s*/, "").trim())
        .filter(Boolean);
    } else if (header.includes("ב.")) {
      result.specificGoal = contentLines.join("\n").trim();
    } else if (header.includes("ג.")) {
      result.waysToAchieve = contentLines
        .map(line => line.replace(/^[\-\*\u2022]\s*/, "").trim())
        .filter(Boolean);
    } else if (header.includes("ד.")) {
      result.sourcesOfSupport = contentLines
        .map(line => line.replace(/^[\-\*\u2022]\s*/, "").trim())
        .filter(Boolean);
    }
  });

  return result;
};

export default function ReportsPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Raw Content States
  const [rawText, setRawText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [privacyNotification, setPrivacyNotification] = useState<string | null>(null);

  // Modal & Edit States
  const [showEditModal, setShowEditModal] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientId, setPatientId] = useState("");
  const [districtWorker, setDistrictWorker] = useState("");
  const [therapistName, setTherapistName] = useState(user?.displayName || "עמיר אייל");
  const [therapistTitle, setTherapistTitle] = useState("עו'ס, MSW");
  const [planDate, setPlanDate] = useState("");
  const [editableText, setEditableText] = useState("");

  // Clinical Rehabilitation Plan Data
  const [planData, setPlanData] = useState<RehabPlanData>({
    areasOfImprovement: [],
    specificGoal: "",
    waysToAchieve: [],
    sourcesOfSupport: []
  });

  // PDF Generation Ref & Loading
  const pdfTemplateRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingWord, setIsGeneratingWord] = useState(false);

  // Initialize Hebrew Date Format: "DD/MM/YYYY" or "D/MM/YYYY"
  useEffect(() => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    setPlanDate(`${day}/${month}/${year}`);
  }, []);

  // Sync therapist name if user changes
  useEffect(() => {
    if (user?.displayName) {
      setTherapistName(user.displayName);
    }
  }, [user]);

  // Client-Side Anonymization Filter (PII Strip)
  const anonymizeText = (text: string): { cleanText: string; strippedCount: number } => {
    let strippedCount = 0;
    let cleanText = text;

    // Israeli T.Z / ID (8-9 consecutive digits)
    const idRegex = /\b\d{8,9}\b/g;
    if (idRegex.test(cleanText)) {
      cleanText = cleanText.replace(idRegex, "[ת.ז הוסרה לטובת פרטיות]");
      strippedCount++;
    }

    // Phone numbers (mobile and landline standard formats)
    const phoneRegex = /\b(05\d[-]?\d{7}|0[23489][-]?\d{7})\b/g;
    if (phoneRegex.test(cleanText)) {
      cleanText = cleanText.replace(phoneRegex, "[טלפון הוסר לטובת פרטיות]");
      strippedCount++;
    }

    // Emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    if (emailRegex.test(cleanText)) {
      cleanText = cleanText.replace(emailRegex, "[אימייל הוסר לטובת פרטיות]");
      strippedCount++;
    }

    return { cleanText, strippedCount };
  };

  // Handle AI processing
  const handleProcessWithAi = async () => {
    if (!rawText.trim()) return;

    setIsProcessing(true);
    setPrivacyNotification(null);

    // 1. Anonymize clinical transcript before transmitting to cloud API
    const { cleanText, strippedCount } = anonymizeText(rawText);
    
    if (strippedCount > 0) {
      setPrivacyNotification(`זיהינו וניקינו ${strippedCount} פרטים מזהים (ת.ז/טלפון/אימייל) מהטקסט הגולמי לטובת אבטחת מידע!`);
    }

    try {
      const response = await fetch("/api/generate-rehab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: cleanText }),
      });

      if (!response.ok) {
        throw new Error("API call failed");
      }

      const data = await response.json();
      
      // Update states with AI parsed data
      const parsed = {
        areasOfImprovement: data.areasOfImprovement || [],
        specificGoal: data.specificGoal || "",
        waysToAchieve: data.waysToAchieve || [],
        sourcesOfSupport: data.sourcesOfSupport || []
      };
      setPlanData(parsed);
      setEditableText(serializePlanData(parsed));

      // Automatically open editing modal
      setShowEditModal(true);
    } catch (error) {
      console.error("AI Generation Error:", error);
      alert("אירעה שגיאה בעיבוד הנתונים באמצעות הבינה המלאכותית. אנא נסה שנית.");
    } finally {
      setIsProcessing(false);
    }
  };

  // PDF Download Trigger
  const handleDownloadPdf = async () => {
    if (!pdfTemplateRef.current) return;

    setIsGeneratingPdf(true);
    try {
      // Small pause for rendering engine stabilization
      await new Promise((resolve) => setTimeout(resolve, 300));

      const canvas = await html2canvas(pdfTemplateRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff"
      });

      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "mm", "a4");
      
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`תוכנית_שיקום_${patientName ? patientName.replace(/\s+/g, "_") : "אישית"}.pdf`);
      
      // Close modal on success
      setShowEditModal(false);
    } catch (err) {
      console.error("PDF Compilation Error:", err);
      alert("שגיאה בהפקת קובץ ה-PDF. אנא נסה שוב.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Word Download Trigger
  const handleDownloadWord = async () => {
    setIsGeneratingWord(true);
    try {
      const doc = generateRehabPlanWord(planData, {
        date: planDate,
        patientName,
        patientId,
        therapistName,
        therapistTitle,
        districtWorker
      });
      const fileName = `תוכנית_שיקום_${patientName ? patientName.replace(/\s+/g, "_") : "אישית"}.docx`;
      await downloadDocx(doc, fileName);
      
      // Close modal on success
      setShowEditModal(false);
    } catch (err) {
      console.error("Word Generation Error:", err);
      alert("שגיאה בהפקת קובץ ה-Word. אנא נסה שוב.");
    } finally {
      setIsGeneratingWord(false);
    }
  };

  // Clinical Helpers for Plan Modification
  const handleAddArea = () => {
    setPlanData(prev => ({
      ...prev,
      areasOfImprovement: [...prev.areasOfImprovement, "תחום חדש: תיאור קצר..."]
    }));
  };

  const handleRemoveArea = (index: number) => {
    setPlanData(prev => ({
      ...prev,
      areasOfImprovement: prev.areasOfImprovement.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateArea = (index: number, val: string) => {
    setPlanData(prev => {
      const updated = [...prev.areasOfImprovement];
      updated[index] = val;
      return { ...prev, areasOfImprovement: updated };
    });
  };

  const handleAddWay = () => {
    setPlanData(prev => ({
      ...prev,
      waysToAchieve: [...prev.waysToAchieve, "פעילות בחווה: תיאור..."]
    }));
  };

  const handleRemoveWay = (index: number) => {
    setPlanData(prev => ({
      ...prev,
      waysToAchieve: prev.waysToAchieve.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateWay = (index: number, val: string) => {
    setPlanData(prev => {
      const updated = [...prev.waysToAchieve];
      updated[index] = val;
      return { ...prev, waysToAchieve: updated };
    });
  };

  const handleAddSupport = () => {
    setPlanData(prev => ({
      ...prev,
      sourcesOfSupport: [...prev.sourcesOfSupport, "גורם תומך: תיאור..."]
    }));
  };

  const handleRemoveSupport = (index: number) => {
    setPlanData(prev => ({
      ...prev,
      sourcesOfSupport: prev.sourcesOfSupport.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateSupport = (index: number, val: string) => {
    setPlanData(prev => {
      const updated = [...prev.sourcesOfSupport];
      updated[index] = val;
      return { ...prev, sourcesOfSupport: updated };
    });
  };

  return (
    <main dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-6 md:p-10 space-y-10">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black mb-2 tracking-tight">מחולל תוכנית שיקום אישית</h1>
          <p className="text-sm text-[var(--muted)] max-w-2xl font-medium">
            הזן תוכן גולמי (סיכומי פגישות, רשמים או ציטוטים) כדי לבנות באופן מיידי תוכנית שיקום מובנית, מקצועית ורשמית ליום חוסן.
          </p>
        </div>
        <button 
          onClick={() => router.push("/")}
          className="flex items-center gap-2 bg-[var(--foreground)]/5 border border-[var(--border)] px-5 py-2.5 rounded-xl hover:bg-[var(--foreground)]/10 text-xs font-black transition-all"
        >
          <ArrowRight className="w-4 h-4" /> חזרה ללוח הבקרה
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Input panel */}
        <section className="lg:col-span-8 space-y-6">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-8 shadow-sm space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 blur-3xl pointer-events-none rounded-full" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/5 blur-3xl pointer-events-none rounded-full" />

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-500 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black">1. הדבק תוכן גולמי לעיבוד</h3>
                <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-wider">בינה מלאכותית תבנה את המבנה והתוכן</p>
              </div>
            </div>

            <div className="space-y-4">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="הקלד או הדבק כאן סיכומי טיפול, שיחות גולמיות, רצונות מילוליים של המטופל, או רשמים קצרים מסדנאות הנגרות והחקלאות בחווה..."
                rows={12}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-3xl p-6 text-sm outline-none focus:border-teal-500 transition-all font-medium leading-relaxed resize-none shadow-inner"
              />

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-2">
                <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 max-w-lg">
                  <Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-emerald-700/80 leading-relaxed font-black">
                    אבטחת מידע מובטחת: תעודות זהות, מספרי טלפון וכתובות אימייל ינוקו אוטומטית בצד הלקוח ולא יישלחו ל-AI. שום מידע אינו נשמר בשרת.
                  </p>
                </div>

                <button
                  onClick={handleProcessWithAi}
                  disabled={isProcessing || !rawText.trim()}
                  className="w-full md:w-auto shrink-0 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all active:scale-[0.98] shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      מעבד ומזקק נתונים...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      עבד באמצעות בינה מלאכותית
                    </>
                  )}
                </button>
              </div>

              <AnimatePresence>
                {privacyNotification && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 flex gap-3 items-center"
                  >
                    <Info className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-800 font-bold leading-relaxed">{privacyNotification}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* Sidebar Information / Guide */}
        <section className="lg:col-span-4 space-y-6">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-8 shadow-sm space-y-6">
            <h3 className="text-lg font-black flex items-center gap-2">
              <FileText className="w-5 h-5 text-teal-500" /> מדריך עבודה
            </h3>
            
            <div className="space-y-4 text-xs font-medium text-[var(--muted)] leading-relaxed">
              <div className="flex gap-3">
                <span className="w-5 h-5 rounded-lg bg-teal-500/10 text-teal-500 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                <p>הדבק טקסט חופשי או נקודות מקצועיות בתיבת הטקסט משמאל.</p>
              </div>
              <div className="flex gap-3">
                <span className="w-5 h-5 rounded-lg bg-teal-500/10 text-teal-500 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                <p>לחץ על "עבד באמצעות בינה מלאכותית" - המערכת תנקה פרטים אישיים ותנתח את הטקסט.</p>
              </div>
              <div className="flex gap-3">
                <span className="w-5 h-5 rounded-lg bg-teal-500/10 text-teal-500 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                <p>מלא את פרטי המטופל, העו"ס במחוז והתאריך במודל שייפתח.</p>
              </div>
              <div className="flex gap-3">
                <span className="w-5 h-5 rounded-lg bg-teal-500/10 text-teal-500 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">4</span>
                <p>ערוך, שנה או הוסף סעיפים ישירות בממשק הנוח והאינטראקטיבי.</p>
              </div>
              <div className="flex gap-3">
                <span className="w-5 h-5 rounded-lg bg-teal-500/10 text-teal-500 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">5</span>
                <p>לחץ "הורד PDF" ותוכנית השיקום המעוצבת על דף הלוגו הרשמי תרד למחשבך!</p>
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--border)]">
              <div className="bg-teal-500/5 rounded-2xl p-4 flex gap-3 items-start">
                <Shield className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-black text-slate-800 mb-1">הצהרת פרטיות מוחלטת</h4>
                  <p className="text-[10px] text-slate-500 font-bold leading-normal">
                    העיבוד המקצועי מבוצע ללא שמירת נתונים זמניים או קבועים בשרת (Stateless). ה-PDF נוצר ישירות בדפדפן שלך.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Edit & PDF Generator Modal */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
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
              className="relative w-full max-w-4xl bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] shadow-2xl overflow-hidden my-8 z-10 flex flex-col max-h-[90vh]"
            >
              
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 md:p-8 border-b border-[var(--border)] shrink-0 bg-[var(--surface)] sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-500 flex items-center justify-center">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black">2. סקירה, הזנת פרטים ועריכת תוכנית השיקום</h3>
                    <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-wider">ערוך בנוחות את כל התוכן המעובד לפני הדפסה</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-2 hover:bg-[var(--foreground)]/5 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body (Scrollable content editor) */}
              <div className="p-6 md:p-8 overflow-y-auto space-y-8 flex-1">
                
                {/* 1. Personal & Administration Details */}
                <div className="bg-[var(--background)] border border-[var(--border)] rounded-3xl p-6 space-y-6">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--muted)] border-r-2 border-teal-500 pr-2">פרטי המטופל והצוות הטיפולי</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500">שם מלא של המטופל</label>
                      <input
                        type="text"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        placeholder="ישראל ישראלי"
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-4 py-3 text-xs outline-none focus:border-teal-500 font-bold transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500">תעודת זהות</label>
                      <input
                        type="text"
                        value={patientId}
                        onChange={(e) => setPatientId(e.target.value)}
                        placeholder="123456789"
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-4 py-3 text-xs outline-none focus:border-teal-500 font-bold transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500">שם העו"ס במחוז משהב"ט</label>
                      <input
                        type="text"
                        value={districtWorker}
                        onChange={(e) => setDistrictWorker(e.target.value)}
                        placeholder="מלי כהן"
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-4 py-3 text-xs outline-none focus:border-teal-500 font-bold transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500">איש הצוות הטיפולי בחווה</label>
                      <input
                        type="text"
                        value={therapistName}
                        onChange={(e) => setTherapistName(e.target.value)}
                        placeholder="עמיר אייל"
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-4 py-3 text-xs outline-none focus:border-teal-500 font-bold transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500">תואר/תפקיד המלווה</label>
                      <input
                        type="text"
                        value={therapistTitle}
                        onChange={(e) => setTherapistTitle(e.target.value)}
                        placeholder="עו'ס, MSW"
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-4 py-3 text-xs outline-none focus:border-teal-500 font-bold transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500">תאריך התוכנית</label>
                      <input
                        type="text"
                        value={planDate}
                        onChange={(e) => setPlanDate(e.target.value)}
                        placeholder="02/06/2026"
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-4 py-3 text-xs outline-none focus:border-teal-500 font-bold transition-all"
                      />
                    </div>
                  </div>
                </div>
                {/* 2. Rehabilitation Plan Content Editor (Single Area) */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--muted)] border-r-2 border-teal-500 pr-2">
                    תוכן תוכנית השיקום (ניתן לעריכה באזור אחד)
                  </h4>
                  <textarea
                    value={editableText}
                    onChange={(e) => {
                      setEditableText(e.target.value);
                      setPlanData(deserializePlanData(e.target.value));
                    }}
                    rows={18}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-3xl p-6 text-xs outline-none focus:border-teal-500 font-bold leading-relaxed resize-y transition-all font-mono text-right"
                    placeholder="הקלד את תוכנית השיקום..."
                  />
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-6 md:p-8 border-t border-[var(--border)] bg-[var(--surface-raised)] shrink-0 flex flex-col md:flex-row gap-4">
                <button
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf || isGeneratingWord || !patientName}
                  className="flex-1 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-500/20"
                >
                  {isGeneratingPdf ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      מייצר PDF ומוריד...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      הורד תוכנית שיקום (PDF)
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownloadWord}
                  disabled={isGeneratingPdf || isGeneratingWord || !patientName}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-600/20"
                >
                  {isGeneratingWord ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      מייצר Word ומוריד...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      הורד תוכנית שיקום (Word)
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 bg-[var(--background)] hover:bg-[var(--foreground)]/5 border border-[var(--border)] py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98]"
                >
                  חזור לעריכה גולמית
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PDF Template Rendering Container — OFFSCREEN ── */}
      <div style={{ position: "fixed", left: -9999, top: -9999 }}>
        <div 
          ref={pdfTemplateRef} 
          style={{
            width: "794px", 
            height: "1123px", 
            position: "relative", 
            backgroundColor: "#ffffff",
            color: "#000000", 
            fontFamily: "Arial, sans-serif", 
            fontSize: "12px",
            lineHeight: 1.5, 
            direction: "rtl"
          }}
        >
          {/* Background Letterhead Image */}
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

          {/* Letterhead content layout overlay */}
          <div 
            style={{
              position: "relative",
              zIndex: 1,
              paddingTop: "185px",
              paddingBottom: "110px",
              paddingLeft: "75px",
              paddingRight: "75px",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              justifyContent: "space-between"
            }}
          >
            <div>
              {/* Top Date - Aligned to left */}
              <div style={{ textAlign: "left", marginBottom: "15px", fontSize: "12px", color: "#000000" }}>
                תאריך: {planDate}
              </div>

              {/* Title Banner - Plain black */}
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <h2 style={{ fontSize: "14px", fontWeight: "bold", margin: 0, color: "#000000" }}>תוכנית שיקום אישית</h2>
              </div>

              {/* Administrative Details Block - Plain, one under the other, no lines */}
              <div 
                style={{ 
                  marginBottom: "20px", 
                  fontSize: "12px",
                  color: "#000000",
                  lineHeight: "1.6"
                }}
              >
                <div style={{ margin: "0 0 4px 0" }}>שם המטופל/ת: {patientName || "—"}</div>
                <div style={{ margin: "0 0 4px 0" }}>ת.ז: {patientId || "—"}</div>
                <div style={{ margin: "0 0 4px 0" }}>איש הצוות הטיפולי המלווה בחווה: {therapistName || "—"}</div>
                <div style={{ margin: 0 }}>שם העו"ס במחוז: {districtWorker || "—"}</div>
              </div>

              {/* Section א: Areas needing improvement - Plain black */}
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "12px", fontWeight: "bold", color: "#000000", marginBottom: "8px" }}>
                  א. באילו תחומים בחייך היית מעוניין לראות שיפור? ציין את התחומים על פי סדר החשיבות:
                </h3>
                <div>
                  {planData.areasOfImprovement.map((area, idx) => (
                     <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "4px", fontSize: "12px", color: "#000000" }}>
                       <span style={{ fontWeight: "bold", color: "#000000", minWidth: "16px" }}>{idx + 1}.</span>
                       <span style={{ lineHeight: 1.5 }}>{area}</span>
                     </div>
                  ))}
                  {planData.areasOfImprovement.length === 0 && (
                    <p style={{ fontStyle: "italic", color: "#666666", fontSize: "12px", margin: 0 }}>לא הוגדרו תחומים</p>
                  )}
                </div>
              </div>

              {/* Section ב: Specific Goal - Plain black */}
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "12px", fontWeight: "bold", color: "#000000", marginBottom: "8px" }}>
                  ב. הגדר את המטרה באופן ספציפי וברור:
                </h3>
                <div 
                  style={{ 
                    fontSize: "12px", 
                    color: "#000000", 
                    lineHeight: 1.5, 
                    whiteSpace: "pre-wrap" 
                  }}
                >
                  {planData.specificGoal || "לא הוגדרה מטרה ספציפית"}
                </div>
              </div>

              {/* Section 2 Structured inside a plain HTML Table element with simple borders */}
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  border: "1px solid #000000",
                  marginBottom: "24px",
                  fontSize: "12px",
                  color: "#000000"
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid #000000" }}>
                    <th
                      style={{
                        width: "50%",
                        padding: "8px 10px",
                        fontWeight: "bold",
                        borderLeft: "1px solid #000000",
                        textAlign: "right",
                        color: "#000000"
                      }}
                    >
                      דרכים אפשריות להשגת המטרה (בדגש החווה)
                    </th>
                    <th
                      style={{
                        width: "50%",
                        padding: "8px 10px",
                        fontWeight: "bold",
                        textAlign: "right",
                        color: "#000000"
                      }}
                    >
                      מקורות סיוע להשגת המטרה - מה או מי יכול לסייע?
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderLeft: "1px solid #000000",
                        verticalAlign: "top",
                        lineHeight: 1.5,
                        color: "#000000"
                      }}
                    >
                      {planData.waysToAchieve.map((way, idx) => (
                        <div key={idx} style={{ marginBottom: "6px" }}>
                          {way}
                        </div>
                      ))}
                      {planData.waysToAchieve.length === 0 && (
                        <p style={{ fontStyle: "italic", color: "#666666", fontSize: "12px", margin: 0 }}>אין רשומות</p>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        verticalAlign: "top",
                        lineHeight: 1.5,
                        color: "#000000"
                      }}
                    >
                      {planData.sourcesOfSupport.map((support, idx) => (
                        <div key={idx} style={{ marginBottom: "6px" }}>
                          {support}
                        </div>
                      ))}
                      {planData.sourcesOfSupport.length === 0 && (
                        <p style={{ fontStyle: "italic", color: "#666666", fontSize: "12px", margin: 0 }}>אין רשומות</p>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>

            </div>

            {/* Standard Signature Block - Plain black */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", fontSize: "12px", color: "#000000" }}>
              <p style={{ margin: "0 0 4px 0" }}>בברכה,</p>
              <strong style={{ fontSize: "12px", color: "#000000" }}>{therapistName}</strong>
              <span style={{ fontSize: "12px", color: "#000000", marginTop: "2px" }}>{therapistTitle}</span>
              <span style={{ fontSize: "12px", color: "#000000", marginTop: "1px" }}>צוות טיפולי, חוות רום</span>
            </div>

          </div>
        </div>
      </div>

    </main>
  );
}
