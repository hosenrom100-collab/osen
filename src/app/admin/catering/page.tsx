"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, addDoc, deleteDoc, doc, serverTimestamp, orderBy, limit } from "firebase/firestore";
import { 
  ArrowRight, Utensils, Clipboard, Check, Plus, Trash2, 
  Users, Calendar, Info, Share2, RefreshCw, AlertTriangle, Clock, FileText,
  Archive, Save
} from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface Group {
  id: string;
  name: string;
}

interface GroupStats {
  avg: number;
  max: number;
  activeCount: number;
}

const PREDEFINED_MEATS = [
  "מוקפץ עוף",
  "סצ'ואן בקר",
  "צלי בקר",
  "מעורב ירושלמי",
  "קורדון בלו",
  "כרעיים עוף",
  "אסדו",
  "שניצל",
  "פרגית על האש",
  "פרגית ממולא"
];

const PREDEFINED_SIDES = [
  "אורז לבן",
  "אורז עם ירקות",
  "תפו\"א אפויים",
  "תפו\"א דואט עם בטטה",
  "שעועית מוקפצת",
  "אפונה",
  "לקט ירקות/זיתים",
  "קוסקוס + מרק"
];

const PREDEFINED_SALADS = [
  "מטבוחה",
  "סלק",
  "חציל מתובל",
  "חציל בטחינה",
  "חציל במיונז",
  "גזר מזרחי",
  "חמוצי הבית",
  "קפריסאי",
  "כרוב עם חמוציות",
  "עגבניות עם שום ופלפל חריף",
  "פלפל חריף מטוגן",
  "תירס עם שמיר במיונז",
  "תירס עם פטריות",
  "כרוב סגול במיונז",
  "קולסלו",
  "חומוס",
  "טחינה",
  "סלט ירקות"
];

interface CateringOrder {
  id: string;
  deliveryDate: string;
  arrivalTime: string;
  meats: string[];
  sides: string[];
  salads: string[];
  includeBread: boolean;
  portions: Record<string, number>;
  totalPortions: number;
  createdAt?: any;
  createdBy?: string;
  contactName?: string;
  contactRole?: string;
  contactPhone?: string;
}

export default function CateringOrderPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  // Menu selection states
  const [selectedMeats, setSelectedMeats] = useState<string[]>([]);
  const [selectedSides, setSelectedSides] = useState<string[]>([]);
  const [selectedSalads, setSelectedSalads] = useState<string[]>([]);
  
  // Custom items states
  const [customMeats, setCustomMeats] = useState<string[]>([]);
  const [customSides, setCustomSides] = useState<string[]>([]);
  const [customSalads, setCustomSalads] = useState<string[]>([]);
  
  // Input fields for adding custom items
  const [newMeat, setNewMeat] = useState("");
  const [newSide, setNewSide] = useState("");
  const [newSalad, setNewSalad] = useState("");
  
  // Groups and portion counts
  const [groups, setGroups] = useState<Group[]>([]);
  const [stats, setStats] = useState<Record<string, GroupStats>>({});
  const [portions, setPortions] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Delivery details (default to tomorrow)
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().split("T")[0];
  });
  const [arrivalTime, setArrivalTime] = useState("12:00");

  const [includeBread, setIncludeBread] = useState(true);

  // Archive and saving states
  const [archive, setArchive] = useState<CateringOrder[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [contactName, setContactName] = useState("מירב סארמילי");
  const [contactRole, setContactRole] = useState("מנהלת תפעול מרכז חוסן חוות רום");
  const [contactPhone, setContactPhone] = useState("052-1234567");

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const reportRef = React.useRef<HTMLDivElement>(null);

  // Load Hosen groups & attendance statistics
  const fetchStats = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      // 1. Fetch programs to identify "חרבות ברזל יום"
      const progSnap = await getDocs(collection(db, "programs"));
      let targetProgId = "j6wEsHxQ5MiQHFX5wv0U"; // Default fallback
      
      const matchedProg = progSnap.docs.find(d => {
        const name = d.data().name || "";
        return name.includes("חרבות ברזל") && !name.includes("ערב");
      });
      if (matchedProg) {
        targetProgId = matchedProg.id;
      }
      
      // 2. Fetch groups for this program
      const groupsSnap = await getDocs(collection(db, "groups"));
      let matchedGroups = groupsSnap.docs
        .filter(d => d.data().programId === targetProgId)
        .map(d => ({ id: d.id, name: d.data().name }));
        
      if (matchedGroups.length === 0) {
        // Hardcoded fallback if no database connection or collections are empty
        matchedGroups = [
          { id: "VlXEr77fVrY4kHopWcNX", name: "חוסן תחתון" },
          { id: "ZEsVts9E9ap6WFr7leKJ", name: "חוסן עליון" }
        ];
      }
      setGroups(matchedGroups);

      // 3. Fetch active patients
      const patientsSnap = await getDocs(query(collection(db, "patients"), where("status", "==", "active")));
      const activeCounts: Record<string, number> = {};
      matchedGroups.forEach(g => { activeCounts[g.id] = 0; });
      
      patientsSnap.forEach(doc => {
        const p = doc.data();
        const hType = p.hosenType;
        const gIds = p.groupIds || [];
        
        matchedGroups.forEach(g => {
          const isMember = (hType === g.id || hType === g.name || gIds.includes(g.id));
          if (isMember) {
            activeCounts[g.id]++;
          }
        });
      });

      // 4. Fetch attendance records from last 14 days
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const dateStr = fourteenDaysAgo.toISOString().split("T")[0];
      
      const attendanceSnap = await getDocs(
        query(collection(db, "attendance"), where("date", ">=", dateStr))
      );
      
      const dailyPresence: Record<string, Record<string, number>> = {};
      matchedGroups.forEach(g => { dailyPresence[g.id] = {}; });
      
      attendanceSnap.forEach(doc => {
        const data = doc.data();
        const gId = data.contextId || data.groupId || data.hosenType;
        
        const matchedG = matchedGroups.find(g => g.id === gId || g.name === gId);
        if (matchedG && data.status === "present") {
          const targetId = matchedG.id;
          dailyPresence[targetId][data.date] = (dailyPresence[targetId][data.date] || 0) + 1;
        }
      });

      // 5. Calculate statistics and suggest default portion counts
      const calculatedStats: Record<string, GroupStats> = {};
      const suggestedPortions: Record<string, number> = {};
      
      matchedGroups.forEach(g => {
        const counts = Object.values(dailyPresence[g.id]);
        const max = counts.length > 0 ? Math.max(...counts) : 0;
        const avg = counts.length > 0 ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length * 10) / 10 : 0;
        
        calculatedStats[g.id] = {
          avg,
          max,
          activeCount: activeCounts[g.id] || 0
        };
        // Suggest rounded average as default portion count
        suggestedPortions[g.id] = Math.max(0, Math.round(avg));
      });

      setStats(calculatedStats);
      setPortions(suggestedPortions);
    } catch (e) {
      console.error(e);
      setErrorMsg("שגיאה בטעינת נתוני הנוכחות. שים לב שעדיין תוכל למלא הכל ידנית.");
      
      // Load fallbacks on error
      const fallbacks = [
        { id: "VlXEr77fVrY4kHopWcNX", name: "חוסן תחתון" },
        { id: "ZEsVts9E9ap6WFr7leKJ", name: "חוסן עליון" }
      ];
      setGroups(fallbacks);
      setPortions({
        "VlXEr77fVrY4kHopWcNX": 10,
        "ZEsVts9E9ap6WFr7leKJ": 15
      });
      setStats({
        "VlXEr77fVrY4kHopWcNX": { avg: 10, max: 12, activeCount: 15 },
        "ZEsVts9E9ap6WFr7leKJ": { avg: 15, max: 18, activeCount: 20 }
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchArchive = async () => {
    setLoadingArchive(true);
    try {
      const q = query(
        collection(db, "catering_orders"), 
        orderBy("deliveryDate", "desc"), 
        limit(20)
      );
      const snap = await getDocs(q);
      const orders = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CateringOrder[];
      setArchive(orders);
    } catch (err) {
      console.error("Error fetching catering archive:", err);
    } finally {
      setLoadingArchive(false);
    }
  };

  const saveOrder = async () => {
    if (!isSelectionValid) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const totalPortions = Object.values(portions).reduce((a, b) => a + b, 0);
      const orderData = {
        deliveryDate,
        arrivalTime,
        contactName,
        contactRole,
        contactPhone,
        meats: selectedMeats,
        sides: selectedSides,
        salads: selectedSalads,
        includeBread,
        portions,
        totalPortions,
        createdAt: serverTimestamp(),
        createdBy: user?.displayName || user?.email || "משתמש מערכת"
      };
      await addDoc(collection(db, "catering_orders"), orderData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchArchive();
    } catch (err) {
      console.error("Error saving catering order:", err);
      setErrorMsg("שגיאה בשמירת ההזמנה בארכיון.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchArchive();
  }, []);

  // Selection toggle helpers
  const handleToggleMeat = (item: string) => {
    setSelectedMeats(prev => 
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  const handleToggleSide = (item: string) => {
    setSelectedSides(prev => 
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  const handleToggleSalad = (item: string) => {
    setSelectedSalads(prev => 
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  // Custom Item additions
  const addCustomMeat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeat.trim()) return;
    const item = newMeat.trim();
    if (!customMeats.includes(item) && !PREDEFINED_MEATS.includes(item)) {
      setCustomMeats(prev => [...prev, item]);
      setSelectedMeats(prev => [...prev, item]);
    }
    setNewMeat("");
  };

  const addCustomSide = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSide.trim()) return;
    const item = newSide.trim();
    if (!customSides.includes(item) && !PREDEFINED_SIDES.includes(item)) {
      setCustomSides(prev => [...prev, item]);
      setSelectedSides(prev => [...prev, item]);
    }
    setNewSide("");
  };

  const addCustomSalad = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSalad.trim()) return;
    const item = newSalad.trim();
    if (!customSalads.includes(item) && !PREDEFINED_SALADS.includes(item)) {
      setCustomSalads(prev => [...prev, item]);
      setSelectedSalads(prev => [...prev, item]);
    }
    setNewSalad("");
  };

  // Delete custom items
  const removeCustomMeat = (item: string) => {
    setCustomMeats(prev => prev.filter(i => i !== item));
    setSelectedMeats(prev => prev.filter(i => i !== item));
  };

  const removeCustomSide = (item: string) => {
    setCustomSides(prev => prev.filter(i => i !== item));
    setSelectedSides(prev => prev.filter(i => i !== item));
  };

  const removeCustomSalad = (item: string) => {
    setCustomSalads(prev => prev.filter(i => i !== item));
    setSelectedSalads(prev => prev.filter(i => i !== item));
  };

  // Portion change handler
  const handlePortionChange = (groupId: string, val: number) => {
    setPortions(prev => ({
      ...prev,
      [groupId]: Math.max(0, val)
    }));
  };

  // Check valid selections
  const meatsCount = selectedMeats.length;
  const sidesCount = selectedSides.length;
  const saladsCount = selectedSalads.length;

  const isSelectionValid = meatsCount === 2 && sidesCount === 2 && saladsCount === 6;

  // Format YYYY-MM-DD to DD/MM/YYYY
  const formatDeliveryDate = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Get day of the week in Hebrew
  const getHebrewDayOfWeek = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      const date = new Date(year, month, day);
      const days = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "יום שבת"];
      return days[date.getDay()] || "";
    }
    return "";
  };

  // Generate Whatsapp Text
  const generateWhatsAppText = () => {
    const totalPortions = Object.values(portions).reduce((a, b) => a + b, 0);
    const groupsBreakdown = groups
      .map(g => `*${g.name}:* ${portions[g.id] || 0} מנות`)
      .join("\n");
      
    const meatsList = selectedMeats.map((m, idx) => `${idx + 1}. ${m}`).join("\n");
    const sidesList = selectedSides.map((s, idx) => `${idx + 1}. ${s}`).join("\n");
    const saladsList = selectedSalads.map((s, idx) => `${idx + 1}. ${s}`).join("\n");

    const dayOfWeek = getHebrewDayOfWeek(deliveryDate);
    const dateDisplay = dayOfWeek ? `${formatDeliveryDate(deliveryDate)} (${dayOfWeek})` : formatDeliveryDate(deliveryDate);

    const breadSection = includeBread ? `\n*לחם:* לחם` : "";

    return `*הזמנת קייטרינג שבועית - מרכז חוסן חוות רום*

*פרטי משלוח:*
📅 תאריך אספקה: ${dateDisplay}
⏰ שעת הגעה: ${arrivalTime}

*פירוט מנות לפי קבוצות:*
${groupsBreakdown}
*סה"כ מנות:* ${totalPortions} מנות

------------------------
*תפריט אחיד שנבחר:*

*בשרים ומנות עיקריות:*
${meatsList || "_לא נבחרו מנות_"}

*תוספות חמות:*
${sidesList || "_לא נבחרו תוספות_"}

*סלטים:*
${saladsList || "_לא נבחרו סלטים_"}${breadSection}

בברכה,
*${contactName}* | ${contactPhone}
${contactRole}`;
  };

  const copyToClipboard = () => {
    const text = generateWhatsAppText();
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      })
      .catch(err => {
        console.error("Failed to copy text: ", err);
      });
  };

  const downloadPDF = async () => {
    if (!isSelectionValid) return;
    setGeneratingPdf(true);
    try {
      const element = reportRef.current;
      if (!element) return;
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false
      });
      
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });
      
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save(`הזמנת_קייטרינג_${formatDeliveryDate(deliveryDate).replace(/\//g, "-")}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF: ", err);
      alert("שגיאה ביצירת קובץ ה-PDF. אנא נסה שוב.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "logistics"]} redirectTo="/">
      <main dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-8">
        {/* Ambient background glow */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-amber-500/3 rounded-full blur-[120px]" />
        </div>

        <div className="max-w-5xl mx-auto space-y-6 relative">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => router.push("/admin")}
                className="p-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:bg-[var(--foreground)]/5 transition-colors shrink-0"
                title="חזרה ללוח בקרה"
              >
                <ArrowRight className="w-4 h-4 text-[var(--muted)]" />
              </button>
              <div>
                <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-amber-500" />
                  הזמנת קייטרינג
                </h1>
                <p className="text-[var(--muted)] text-[10px] font-bold uppercase tracking-wider mt-0.5">
                  הרכבת תפריט שבועי וסיכום מנות מבוסס נוכחות להעתקה לוואטסאפ
                </p>
              </div>
            </div>
            
            <button 
              onClick={fetchStats}
              title="רענן נתוני נוכחות"
              className="self-start sm:self-center flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] text-xs font-bold rounded-lg hover:bg-[var(--foreground)]/5 transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              עדכון נוכחות
            </button>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Configuration */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Delivery Details Card */}
              <div className="p-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl space-y-4">
                <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  <h2 className="text-xs font-black uppercase tracking-wider">
                    פרטי אספקה ומשלוח
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[var(--muted)] flex items-center gap-1">
                      תאריך אספקה
                    </label>
                    <input 
                      type="date" 
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 font-medium"
                    />
                    <div className="text-[10px] text-amber-500 font-bold mt-1">
                      {getHebrewDayOfWeek(deliveryDate)}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[var(--muted)] flex items-center gap-1">
                      שעת הגעה מבוקשת
                    </label>
                    <input 
                      type="time" 
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-[var(--border)]/30 pt-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[var(--muted)] flex items-center gap-1">
                      שם איש קשר לקייטרינג
                    </label>
                    <input 
                      type="text" 
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="מירב סארמילי"
                      className="w-full bg-[var(--background)] border border-[var(--border)] text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[var(--muted)] flex items-center gap-1">
                      מספר טלפון
                    </label>
                    <input 
                      type="tel" 
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="052-1234567"
                      className="w-full bg-[var(--background)] border border-[var(--border)] text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[var(--muted)] flex items-center gap-1">
                      תפקיד / תיאור איש קשר
                    </label>
                    <input 
                      type="text" 
                      value={contactRole}
                      onChange={(e) => setContactRole(e.target.value)}
                      placeholder="מנהלת תפעול מרכז חוסן חוות רום"
                      className="w-full bg-[var(--background)] border border-[var(--border)] text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 font-medium"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-[var(--border)]/50 pt-4">
                  <input 
                    type="checkbox" 
                    id="includeBread"
                    checked={includeBread}
                    onChange={(e) => setIncludeBread(e.target.checked)}
                    className="w-4 h-4 text-amber-500 bg-[var(--background)] border-[var(--border)] rounded focus:ring-amber-500 cursor-pointer"
                  />
                  <label htmlFor="includeBread" className="text-xs font-bold text-[var(--foreground)] cursor-pointer">
                    להוסיף לחם להזמנה
                  </label>
                </div>
              </div>

              {/* Portion Calculator Card */}
              <div className="p-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                  <h2 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    כמות מנות (לפי נוכחות שבועית חרבות ברזל בוקר)
                  </h2>
                  <span className="text-[9px] font-bold bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded">
                    המלצה לפי ממוצע נוכחות
                  </span>
                </div>
                
                {loading ? (
                  <div className="flex items-center justify-center py-6 text-xs text-[var(--muted)] gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                    מחשב ממוצעי נוכחות של השבועיים האחרונים...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {groups.map(group => {
                      const groupStat = stats[group.id] || { avg: 0, max: 0, activeCount: 0 };
                      return (
                        <div key={group.id} className="p-4 bg-[var(--background)] border border-[var(--border)] rounded-xl space-y-3">
                          <div className="flex justify-between items-start">
                            <span className="text-xs font-black">{group.name}</span>
                            <span className="text-[9px] text-[var(--muted)] font-medium">
                              רשומים פעילים: {groupStat.activeCount}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-[var(--muted)] font-medium">
                            <div className="bg-[var(--surface)] p-1.5 rounded border border-[var(--border)]/50">
                              ממוצע נוכחות: <strong className="text-[var(--foreground)]">{groupStat.avg}</strong>
                            </div>
                            <div className="bg-[var(--surface)] p-1.5 rounded border border-[var(--border)]/50">
                              מקסימום נוכחות: <strong className="text-[var(--foreground)]">{groupStat.max}</strong>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 pt-2">
                            <label className="text-[10px] font-bold text-[var(--muted)] shrink-0">מנות להזמנה:</label>
                            <div className="flex items-center border border-[var(--border)] bg-[var(--surface)] rounded-lg overflow-hidden w-full max-w-[120px]">
                              <button 
                                type="button"
                                onClick={() => handlePortionChange(group.id, (portions[group.id] || 0) - 1)}
                                className="w-8 py-1 text-center hover:bg-[var(--foreground)]/5 text-xs font-bold transition-colors border-l border-[var(--border)]"
                              >
                                -
                              </button>
                              <input 
                                type="number" 
                                value={portions[group.id] ?? 0}
                                onChange={(e) => handlePortionChange(group.id, parseInt(e.target.value) || 0)}
                                className="w-full text-center bg-transparent border-none text-xs font-black focus:outline-none p-1"
                                min="0"
                              />
                              <button 
                                type="button"
                                onClick={() => handlePortionChange(group.id, (portions[group.id] || 0) + 1)}
                                className="w-8 py-1 text-center hover:bg-[var(--foreground)]/5 text-xs font-bold transition-colors border-r border-[var(--border)]"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Menu Categories selection */}
              <div className="space-y-6">
                
                {/* 1. MEAT CATEGORY */}
                <div className="p-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl space-y-4">
                  <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider">בשרים ומנות עיקריות (בחר 2)</h3>
                      <p className="text-[9px] text-[var(--muted)] mt-0.5">יש לבחור בדיוק 2 מנות עיקריות מהתפריט</p>
                    </div>
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${meatsCount === 2 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                      נבחרו: {meatsCount}/2
                    </span>
                  </div>

                  {/* Predefined items */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PREDEFINED_MEATS.map(item => {
                      const isSelected = selectedMeats.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handleToggleMeat(item)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-right text-xs transition-all ${
                            isSelected 
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-500 font-bold" 
                              : "bg-[var(--background)] border-[var(--border)] hover:bg-[var(--foreground)]/5"
                          }`}
                        >
                          <span className="truncate">{item}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-amber-500 mr-2" />}
                        </button>
                      );
                    })}
                    
                    {/* Custom added items */}
                    {customMeats.map(item => {
                      const isSelected = selectedMeats.includes(item);
                      return (
                        <div
                          key={item}
                          className={`flex items-center justify-between p-1.5 pl-2.5 rounded-xl border text-xs transition-all ${
                            isSelected 
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-500 font-bold" 
                              : "bg-[var(--background)] border-[var(--border)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleMeat(item)}
                            className="flex-1 text-right truncate flex items-center justify-between py-1"
                          >
                            <span className="truncate">{item}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-amber-500 mr-2" />}
                          </button>
                          <button 
                            type="button" 
                            onClick={() => removeCustomMeat(item)}
                            className="p-1 text-[var(--muted)] hover:text-red-500 transition-colors mr-1 shrink-0"
                            title="מחק מנה שהוספה ידנית"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Manual add input */}
                  <form onSubmit={addCustomMeat} className="flex gap-2 pt-2 border-t border-[var(--border)]/50">
                    <input 
                      type="text" 
                      placeholder="הוסף מנה עיקרית מותאמת אישית..."
                      value={newMeat}
                      onChange={(e) => setNewMeat(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[var(--muted)]"
                    />
                    <button 
                      type="submit"
                      className="px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl flex items-center justify-center transition-colors shrink-0"
                      title="הוסף מנה"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </form>
                </div>

                {/* 2. SIDES CATEGORY */}
                <div className="p-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl space-y-4">
                  <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider">תוספות חמות (בחר 2)</h3>
                      <p className="text-[9px] text-[var(--muted)] mt-0.5">יש לבחור בדיוק 2 תוספות מהתפריט</p>
                    </div>
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${sidesCount === 2 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                      נבחרו: {sidesCount}/2
                    </span>
                  </div>

                  {/* Predefined items */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PREDEFINED_SIDES.map(item => {
                      const isSelected = selectedSides.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handleToggleSide(item)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-right text-xs transition-all ${
                            isSelected 
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-500 font-bold" 
                              : "bg-[var(--background)] border-[var(--border)] hover:bg-[var(--foreground)]/5"
                          }`}
                        >
                          <span className="truncate">{item}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-amber-500 mr-2" />}
                        </button>
                      );
                    })}
                    
                    {/* Custom added items */}
                    {customSides.map(item => {
                      const isSelected = selectedSides.includes(item);
                      return (
                        <div
                          key={item}
                          className={`flex items-center justify-between p-1.5 pl-2.5 rounded-xl border text-xs transition-all ${
                            isSelected 
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-500 font-bold" 
                              : "bg-[var(--background)] border-[var(--border)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleSide(item)}
                            className="flex-1 text-right truncate flex items-center justify-between py-1"
                          >
                            <span className="truncate">{item}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-amber-500 mr-2" />}
                          </button>
                          <button 
                            type="button" 
                            onClick={() => removeCustomSide(item)}
                            className="p-1 text-[var(--muted)] hover:text-red-500 transition-colors mr-1 shrink-0"
                            title="מחק תוספת שהוספה ידנית"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Manual add input */}
                  <form onSubmit={addCustomSide} className="flex gap-2 pt-2 border-t border-[var(--border)]/50">
                    <input 
                      type="text" 
                      placeholder="הוסף תוספת חמה מותאמת אישית..."
                      value={newSide}
                      onChange={(e) => setNewSide(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[var(--muted)]"
                    />
                    <button 
                      type="submit"
                      className="px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl flex items-center justify-center transition-colors shrink-0"
                      title="הוסף תוספת"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </form>
                </div>

                {/* 3. SALADS CATEGORY */}
                <div className="p-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl space-y-4">
                  <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider">סלטים (בחר 6)</h3>
                      <p className="text-[9px] text-[var(--muted)] mt-0.5">יש לבחור בדיוק 6 סוגי סלטים מהרשימה</p>
                    </div>
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${saladsCount === 6 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                      נבחרו: {saladsCount}/6
                    </span>
                  </div>

                  {/* Predefined items */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PREDEFINED_SALADS.map(item => {
                      const isSelected = selectedSalads.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handleToggleSalad(item)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-right text-xs transition-all ${
                            isSelected 
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-500 font-bold" 
                              : "bg-[var(--background)] border-[var(--border)] hover:bg-[var(--foreground)]/5"
                          }`}
                        >
                          <span className="truncate">{item}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-amber-500 mr-2" />}
                        </button>
                      );
                    })}
                    
                    {/* Custom added items */}
                    {customSalads.map(item => {
                      const isSelected = selectedSalads.includes(item);
                      return (
                        <div
                          key={item}
                          className={`flex items-center justify-between p-1.5 pl-2.5 rounded-xl border text-xs transition-all ${
                            isSelected 
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-500 font-bold" 
                              : "bg-[var(--background)] border-[var(--border)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleSalad(item)}
                            className="flex-1 text-right truncate flex items-center justify-between py-1"
                          >
                            <span className="truncate">{item}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-amber-500 mr-2" />}
                          </button>
                          <button 
                            type="button" 
                            onClick={() => removeCustomSalad(item)}
                            className="p-1 text-[var(--muted)] hover:text-red-500 transition-colors mr-1 shrink-0"
                            title="מחק סלט שהוסף ידנית"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Manual add input */}
                  <form onSubmit={addCustomSalad} className="flex gap-2 pt-2 border-t border-[var(--border)]/50">
                    <input 
                      type="text" 
                      placeholder="הוסף סלט מותאם אישית..."
                      value={newSalad}
                      onChange={(e) => setNewSalad(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[var(--muted)]"
                    />
                    <button 
                      type="submit"
                      className="px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl flex items-center justify-center transition-colors shrink-0"
                      title="הוסף סלט"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </form>
                </div>

                {/* Catering Orders Archive Card */}
                <div className="p-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl space-y-4">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                    <Archive className="w-4 h-4 text-violet-500" />
                    <h2 className="text-xs font-black uppercase tracking-wider">
                      🗄️ ארכיון הזמנות קייטרינג שבוצעו
                    </h2>
                  </div>

                  {loadingArchive ? (
                    <div className="flex items-center justify-center py-6 text-xs text-[var(--muted)] gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-violet-500" />
                      טוען ארכיון הזמנות...
                    </div>
                  ) : archive.length === 0 ? (
                    <div className="text-center py-8 text-[var(--muted)] text-xs font-bold">
                      אין הזמנות קודמות בארכיון.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                      {archive.map((order) => {
                        const dayName = getHebrewDayOfWeek(order.deliveryDate);
                        return (
                          <div 
                            key={order.id} 
                            className="p-3.5 bg-[var(--background)] border border-[var(--border)] rounded-xl space-y-2 text-xs hover:border-[var(--muted)]/20 transition-colors"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-black text-[var(--foreground)]">
                                  📅 {formatDeliveryDate(order.deliveryDate)} {dayName && `(${dayName})`}
                                </p>
                                <p className="text-[10px] text-[var(--muted)] font-bold mt-0.5">
                                  ⏰ שעת הגעה: {order.arrivalTime} | 👤 הוזמן ע"י: {order.createdBy}
                                </p>
                              </div>
                              <span className="text-[10px] font-black bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded">
                                {order.totalPortions} מנות
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-[var(--muted)] font-bold border-t border-[var(--border)]/50 pt-2">
                              <div>
                                <span className="text-[var(--foreground)] font-black">🥩 מנות:</span> {order.meats.join(", ")}
                              </div>
                              <div>
                                <span className="text-[var(--foreground)] font-black">🍚 תוספות:</span> {order.sides.join(", ")}
                              </div>
                              <div className="sm:col-span-2">
                                <span className="text-[var(--foreground)] font-black">🥗 סלטים:</span> {order.salads.join(", ")}
                                {order.includeBread && " | 🍞 כולל לחם"}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-1.5 justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedMeats(order.meats);
                                  setSelectedSides(order.sides);
                                  setSelectedSalads(order.salads);
                                  setIncludeBread(order.includeBread);
                                  setDeliveryDate(order.deliveryDate);
                                  setArrivalTime(order.arrivalTime);
                                  setPortions(order.portions);
                                  setContactName(order.contactName || "מירב סארמילי");
                                  setContactRole(order.contactRole || "מנהלת תפעול מרכז חוסן חוות רום");
                                  setContactPhone(order.contactPhone || "052-1234567");
                                }}
                                className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-[10px] font-black rounded-lg transition-colors"
                              >
                                טען מחדש לטופס
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (confirm("האם אתה בטוח שברצונך למחוק הזמנה זו מהארכיון?")) {
                                    try {
                                      await deleteDoc(doc(db, "catering_orders", order.id));
                                      await fetchArchive();
                                    } catch (err) {
                                      console.error("Error deleting catering order:", err);
                                    }
                                  }
                                }}
                                className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-black rounded-lg transition-colors"
                              >
                                מחק
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Right Column: Output Preview */}
            <div className="space-y-6">
              
              {/* Order Status & Copy Card */}
              <div className="p-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl space-y-4 sticky top-20">
                <div className="border-b border-[var(--border)] pb-3">
                  <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    <Clipboard className="w-4 h-4 text-amber-500" />
                    תצוגה מקדימה להעתקה
                  </h3>
                </div>

                {/* Validation Status message */}
                <div className="text-[11px] font-bold">
                  {!isSelectionValid ? (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl space-y-1">
                      <p className="flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        הרכבת התפריט לא הושלמה:
                      </p>
                      <ul className="list-disc list-inside mr-2 space-y-0.5 font-medium opacity-90">
                        {meatsCount !== 2 && <li>מנות עיקריות: נבחרו {meatsCount} (נדרש בדיוק 2)</li>}
                        {sidesCount !== 2 && <li>תוספות: נבחרו {sidesCount} (נדרש בדיוק 2)</li>}
                        {saladsCount !== 6 && <li>סלטים: נבחרו {saladsCount} (נדרש בדיוק 6)</li>}
                      </ul>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl flex items-center gap-1.5">
                      <Check className="w-4 h-4 shrink-0" />
                      התפריט מורכב כנדרש ומוכן להעתקה!
                    </div>
                  )}
                </div>

                {/* Text preview box */}
                <div className="p-3.5 bg-[var(--background)] border border-[var(--border)] rounded-xl text-[11px] font-medium font-sans whitespace-pre-wrap leading-relaxed max-h-[350px] overflow-y-auto select-all">
                  {generateWhatsAppText()}
                </div>

                {/* Copy Button */}
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-black transition-all ${
                    copied 
                      ? "bg-emerald-500 text-white" 
                      : "bg-amber-500 hover:bg-amber-600 text-white active:scale-[0.98]"
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      הועתק בהצלחה!
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      העתק להדבקה בוואטסאפ
                    </>
                  )}
                </button>

                {/* Save Order Button */}
                <button
                  type="button"
                  onClick={saveOrder}
                  disabled={saving || !isSelectionValid}
                  className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-black transition-all ${
                    saveSuccess 
                      ? "bg-emerald-500 text-white" 
                      : "bg-violet-600 hover:bg-violet-700 text-white active:scale-[0.98] disabled:opacity-50"
                  }`}
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      שומר הזמנה...
                    </>
                  ) : saveSuccess ? (
                    <>
                      <Check className="w-4 h-4" />
                      ההזמנה נשמרה בארכיון!
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      שמור הזמנה בארכיון
                    </>
                  )}
                </button>

                {/* PDF Download Button */}
                <button
                  type="button"
                  onClick={downloadPDF}
                  disabled={generatingPdf || !isSelectionValid}
                  className="w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-black transition-all bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--foreground)]/5 text-[var(--foreground)] active:scale-[0.98] disabled:opacity-50"
                >
                  {generatingPdf ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                      מייצר PDF...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 text-amber-500" />
                      הורד כ-PDF (דף לוגו)
                    </>
                  )}
                </button>
              </div>

            </div>

          </div>

        </div>

        {/* ── PDF Template — hidden from screen, captured by html2canvas ── */}
        <div style={{ position: "fixed", left: -9999, top: -9999 }}>
          <div 
            ref={reportRef} 
            style={{
              width: "794px", 
              height: "1123px", 
              position: "relative", 
              backgroundColor: "#ffffff",
              color: "#1e293b", 
              fontFamily: "Arial, sans-serif", 
              lineHeight: 1.6, 
              direction: "rtl"
            }}
          >
            {/* Background Logo Page */}
            <img
              src="/logopage.png"
              alt="דף לוגו"
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
              paddingTop: "160px",
              paddingBottom: "100px",
              paddingLeft: "60px",
              paddingRight: "60px",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              justifyContent: "flex-start"
            }}>
              <div>
                {/* Title */}
                <div style={{ borderBottom: "2px solid #e2e8f0", paddingBottom: "10px", marginBottom: "15px" }}>
                  <h1 style={{ fontSize: "24px", fontWeight: "900", color: "#b45309", margin: 0, letterSpacing: "-0.02em" }}>
                    הזמנת קייטרינג שבועית
                  </h1>
                  <p style={{ fontSize: "12px", color: "#64748b", margin: "4px 0 0 0", fontWeight: "bold" }}>
                    מרכז חוסן חוות רום
                  </p>
                </div>

                {/* Delivery and Quantities Grid */}
                <div style={{ display: "flex", gap: "20px", marginBottom: "15px" }}>
                  {/* Delivery details card */}
                  <div style={{ flex: 1, backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px" }}>
                    <h3 style={{ fontSize: "13px", fontWeight: "800", color: "#b45309", marginTop: 0, marginBottom: "12px", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px" }}>
                      📅 פרטי משלוח
                    </h3>
                    <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div>
                        <strong style={{ color: "#64748b" }}>תאריך אספקה:</strong> {formatDeliveryDate(deliveryDate)} ({getHebrewDayOfWeek(deliveryDate)})
                      </div>
                      <div>
                        <strong style={{ color: "#64748b" }}>שעת הגעה:</strong> {arrivalTime}
                      </div>
                      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "6px", marginTop: "4px" }}>
                        <strong style={{ color: "#64748b" }}>איש קשר:</strong> {contactName} ({contactPhone})
                        <div style={{ fontSize: "10px", color: "#64748b", fontWeight: "bold", marginTop: "2px" }}>
                          {contactRole}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Portions card */}
                  <div style={{ flex: 1, backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px" }}>
                    <h3 style={{ fontSize: "13px", fontWeight: "800", color: "#b45309", marginTop: 0, marginBottom: "12px", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px" }}>
                      📊 חלוקת מנות
                    </h3>
                    <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {groups.map(g => (
                        <div key={g.id} style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#64748b", fontWeight: "bold" }}>{g.name}:</span>
                          <span style={{ fontWeight: "800" }}>{portions[g.id] || 0} מנות</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e2e8f0", paddingTop: "6px", marginTop: "4px" }}>
                        <span style={{ fontWeight: "900", color: "#1e293b" }}>סה"כ מנות:</span>
                        <span style={{ fontWeight: "900", color: "#b45309" }}>
                          {Object.values(portions).reduce((a, b) => a + b, 0)} מנות
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Menu Details */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: "900", color: "#1e293b", margin: "0 0 10px 0", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px" }}>
                    📋 תפריט אחיד שנבחר
                  </h2>

                  {/* Meats */}
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px", backgroundColor: "#ffffff" }}>
                    <h4 style={{ fontSize: "12px", fontWeight: "900", color: "#b45309", marginTop: 0, marginBottom: "4px" }}>
                      🥩 בשרים ומנות עיקריות
                    </h4>
                    <ul style={{ listStyleType: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: "10px" }}>
                      {selectedMeats.map(m => (
                        <li key={m} style={{ fontSize: "12px", backgroundColor: "#fffbeb", border: "1px solid #fef3c7", color: "#b45309", padding: "6px 12px", borderRadius: "8px", fontWeight: "bold" }}>
                          ✓ {m}
                        </li>
                      ))}
                      {selectedMeats.length === 0 && <li style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }}>טרם נבחרו מנות עיקריות</li>}
                    </ul>
                  </div>

                  {/* Hot Sides */}
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px", backgroundColor: "#ffffff" }}>
                    <h4 style={{ fontSize: "12px", fontWeight: "900", color: "#b45309", marginTop: 0, marginBottom: "4px" }}>
                      🍚 תוספות חמות
                    </h4>
                    <ul style={{ listStyleType: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: "10px" }}>
                      {selectedSides.map(s => (
                        <li key={s} style={{ fontSize: "12px", backgroundColor: "#fffbeb", border: "1px solid #fef3c7", color: "#b45309", padding: "6px 12px", borderRadius: "8px", fontWeight: "bold" }}>
                          ✓ {s}
                        </li>
                      ))}
                      {selectedSides.length === 0 && <li style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }}>טרם נבחרו תוספות</li>}
                    </ul>
                  </div>

                  {/* Salads */}
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px", backgroundColor: "#ffffff" }}>
                    <h4 style={{ fontSize: "12px", fontWeight: "900", color: "#b45309", marginTop: 0, marginBottom: "4px" }}>
                      🥗 סלטים
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      {selectedSalads.map(s => (
                        <div key={s} style={{ fontSize: "12px", color: "#334155", display: "flex", alignItems: "center", gap: "6px", fontWeight: "500" }}>
                          <span style={{ color: "#b45309", fontWeight: "bold" }}>✓</span> {s}
                        </div>
                      ))}
                      {selectedSalads.length === 0 && <div style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic", gridColumn: "span 2" }}>טרם נבחרו סלטים</div>}
                    </div>
                  </div>

                  {/* Bread */}
                  {includeBread && (
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px", backgroundColor: "#ffffff" }}>
                      <h4 style={{ fontSize: "12px", fontWeight: "900", color: "#b45309", marginTop: 0, marginBottom: "4px" }}>
                        🍞 לחם
                      </h4>
                      <div style={{ fontSize: "12px", color: "#334155", fontWeight: "bold" }}>
                        ✓ לחם
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </RoleGuard>
  );
}
