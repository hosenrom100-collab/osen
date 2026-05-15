"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, X, Send, Search, Bot, Lightbulb, 
  ArrowRight, Users, ShoppingCart, Calendar, 
  MessageSquare, Loader2, Command, Zap, Shield, Mic, MicOff
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase/config";
import { collection, query, getDocs, limit, where, getDoc, doc, addDoc, serverTimestamp, deleteDoc } from "firebase/firestore";

/* ─── Types ─── */

interface Insight {
  id: string;
  type: "info" | "warning" | "success";
  text: string;
  icon: any;
  actionLabel?: string;
  actionPath?: string;
}

interface Command {
  keywords: string[];
  response: string;
  action?: () => void;
  icon: any;
}

/* ─── Component ─── */

export function SmartAssistant() {
  const { user, isAdmin, isManager, isLogistics } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [messages, setMessages] = useState<{ role: "user" | "assistant", content: string }[]>([
    { role: "assistant", content: "שלום! אני העוזר החכם של חוסן. איך אני יכול לעזור לך היום?" }
  ]);
  const [pendingAction, setPendingAction] = useState<{ type: string, data: any } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("הדפדפן שלך לא תומך בזיהוי קולי. נסה להשתמש בכרום או ספארי.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "he-IL";
    recognition.continuous = false;
    recognition.interimResults = true; // Show text while speaking

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") {
        console.warn("לא זוהה דיבור. נסה שוב.");
      } else if (event.error === "not-allowed") {
        alert("גישה למיקרופון נדחתה. יש לאשר גישה בהגדרות הדפדפן.");
      } else {
        console.error("Speech Recognition Error", event.error);
      }
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result: any) => result.transcript)
        .join("");
      
      setInput(transcript);

      if (event.results[0].isFinal) {
        handleCommand(transcript);
      }
    };

    recognition.start();
  };

  // Load insights once open
  useEffect(() => {
    if (isOpen) {
      loadInsights();
    }
  }, [isOpen]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadInsights = async () => {
    const newInsights: Insight[] = [];
    const today = new Date().toISOString().split("T")[0];
    
    try {
      // 1. Check Schedule & Duty Instructor
      const schedSnap = await getDoc(doc(db, "schedules", today));
      const schedData = schedSnap.exists() ? schedSnap.data() : {};
      const dailyActivities = schedData.activities || [];
      const dutyId = schedData.dutyInstructorId || schedData.dutyId || "";

      if (!dutyId && (isAdmin || isManager)) {
        // Find available instructors
        const [usersSnap, staffAttSnap] = await Promise.all([
          getDocs(query(collection(db, "users"), where("role", "==", "instructor"))),
          getDocs(query(collection(db, "staff_attendance"), where("date", "==", today)))
        ]);

        const absentIds = new Set(staffAttSnap.docs
          .filter(d => d.data().status === "absent" || d.data().status === "leave")
          .map(d => d.data().userId));
        
        const available = usersSnap.docs
          .filter(d => !absentIds.has(d.id))
          .map(d => d.data().name || d.data().email.split("@")[0]);

        if (available.length > 0) {
          newInsights.push({
            id: "missing-duty",
            type: "warning",
            text: `טרם הוגדר מדריך תורן להיום. המדריכים הזמינים כרגע: ${available.slice(0, 2).join(", ")}`,
            icon: Shield,
            actionLabel: "הגדר תורן",
            actionPath: "/"
          });
        }
      }
      
      if (dailyActivities.length === 0) {
        newInsights.push({
          id: "no-schedule",
          type: "info",
          text: "אין פעילויות מתוכננות להיום בלוח הזמנים",
          icon: Calendar,
          actionPath: "/calendar"
        });
      }

      // 2. Check Attendance (Missing patients)
      const [patientsSnap, attendanceSnap] = await Promise.all([
        getDocs(query(collection(db, "patients"), where("status", "==", "active"))),
        getDocs(query(collection(db, "attendance"), where("date", "==", today), where("status", "==", "present")))
      ]);
      
      const totalActive = patientsSnap.size;
      const totalPresent = attendanceSnap.size;
      const missing = totalActive - totalPresent;

      if (missing > 0 && totalPresent > 0) {
        newInsights.push({
          id: "missing-patients",
          type: "warning",
          text: `שים לב: ${missing} מטופלים רשומים כנעדרים היום`,
          icon: Users,
          actionPath: "/admin/patient-attendance"
        });
      }

      // 3. Check Shopping Requests
      const shopSnap = await getDocs(query(collection(db, "shopping_requests"), where("status", "==", "pending"), limit(5)));
      if (!shopSnap.empty) {
        newInsights.push({
          id: "shopping",
          type: "warning",
          text: `ישנן ${shopSnap.size} בקשות רכש הממתינות לאישור`,
          icon: ShoppingCart,
          actionPath: "/shopping"
        });
      }

      // 4. Check Absence Requests (For Managers)
      if (isAdmin || isManager) {
        const absSnap = await getDocs(query(collection(db, "absence_requests"), where("status", "==", "pending")));
        if (!absSnap.empty) {
          newInsights.push({
            id: "pending-absences",
            type: "warning",
            text: `ישנן ${absSnap.size} בקשות היעדרות הממתינות לאישורך`,
            icon: Calendar,
            actionLabel: "נהל",
            actionPath: "/admin/staff-attendance"
          });
        }
      }

      setInsights(newInsights);
    } catch (e) {
      console.error("Failed to load insights:", e);
    }
  };

  const handleCommand = async (text: string) => {
    if (!text.trim()) return;
    
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    const normalized = text.toLowerCase();
    let response = "אני לא בטוח שהבנתי, תוכל לנסות שוב? אני יכול לעזור עם חיפוש מטופלים, רשימת קניות, או הצגת הלוז.";
    const today = new Date().toISOString().split("T")[0];

    // Simulate AI thinking
    await new Promise(resolve => setTimeout(resolve, 600));

    // Check for pending actions (confirmations)
    if (pendingAction && (normalized === "כן" || normalized.includes("כן") || normalized.includes("תוסיף") || normalized.includes("תעשה זאת") || normalized.includes("עוד"))) {
      if (pendingAction.type === "add_meat") {
        try {
          await addDoc(collection(db, "shopping_requests"), {
            name: `בשר לקציצות (${pendingAction.data.people} איש)`,
            quantity: `${pendingAction.data.kg} ק"ג`,
            status: "pending", category: "בשר ודגים",
            requestedBy: user?.uid || "system", requestedByName: user?.displayName || "Hosen AI", createdAt: serverTimestamp()
          });
          response = `הוספתי ${pendingAction.data.kg} ק"ג בשר לרשימת הקניות.`;
          setPendingAction(null);
          router.push("/shopping");
        } catch (e) { response = "שגיאה בהוספת הפריט."; }
      } else if (pendingAction.type === "approve_absence") {
        try {
          const { updateDoc } = await import("firebase/firestore");
          await updateDoc(doc(db, "absence_requests", pendingAction.data.id), { status: "approved" });
          response = `אישרתי את בקשת ההיעדרות של ${pendingAction.data.userName}.`;
          setPendingAction(null);
        } catch (e) { response = "שגיאה באישור הבקשה."; }
      } else if (pendingAction.type === "item_ref") {
        try {
          await addDoc(collection(db, "shopping_requests"), {
            name: pendingAction.data.name,
            quantity: "1", status: "pending", category: "כללי",
            requestedBy: user?.uid || "system", requestedByName: user?.displayName || "Hosen AI", createdAt: serverTimestamp()
          });
          response = `הוספתי עוד ${pendingAction.data.name} לרשימת הקניות.`;
          setPendingAction(null);
          router.push("/shopping");
        } catch (e) { response = "שגיאה בהוספת הפריט."; }
      }
    }
    // Command Logic: Deletion (Shopping)
    else if (normalized.includes("מחק") || normalized.includes("תמחוק") || normalized.includes("תוריד") || normalized.includes("אל תקנה")) {
      const itemToDelete = text.replace(/מחק|תמחוק|תוריד|אל תקנה|מהרשימה|מרשימת הקניות|של|ה/g, "").trim();
      if (itemToDelete) {
        try {
          const q = query(collection(db, "shopping_requests"), where("status", "in", ["pending", "approved"]));
          const snap = await getDocs(q);
          const match = snap.docs.find(d => d.data().name.includes(itemToDelete));
          if (match) {
            await deleteDoc(match.ref);
            response = `בסדר גמור, מחקתי את ${itemToDelete} מרשימת הקניות.`;
          } else {
            response = `חיפשתי ${itemToDelete} ברשימת הקניות ולא מצאתי פריט כזה.`;
          }
        } catch (e) { response = "הייתה תקלה במחיקה."; }
      }
    } 
    // Command Logic: Addition (Patients / Shopping / Calculation)
    else if (normalized.includes("הוסף") || normalized.includes("תרשום") || normalized.includes("תקים") || normalized.includes("תוסיף") || normalized.includes("תקנה") || normalized.includes("לקנות") || normalized.includes("חסר")) {
      if (normalized.includes("מטופל") || normalized.includes("חולה") || normalized.includes("אדם")) {
        const cleanText = text.replace(/הוסף|תרשום|תקים|מטופל|מטופלים|חדש|חדשים|:/g, "").trim();
        const names = cleanText.split(/,|\n/).map(n => n.trim()).filter(Boolean);
        if (names.length > 0) {
          try {
            let addedCount = 0;
            for (const fullName of names) {
              const parts = fullName.split(" ");
              await addDoc(collection(db, "patients"), {
                firstName: parts[0], lastName: parts.slice(1).join(" ") || "", fullName,
                status: "active", createdAt: serverTimestamp(), startDate: today, idNumber: ""
              });
              addedCount++;
            }
            response = `הוספתי את ${addedCount === 1 ? names[0] : `${addedCount} מטופלים`} למערכת.`;
            router.push("/patients");
          } catch (e) { response = "שגיאה בהוספת המטופלים."; }
        } else response = "תכתוב לי את השמות של המטופלים.";
      } 
      else {
        const clean = text.replace(/הוסף|תוסיף|תקנה|לקנות|חסר|לרשימה|של|ה|/g, "").trim();
        if (clean && clean.length > 1) {
          try {
            await addDoc(collection(db, "shopping_requests"), {
              name: clean, quantity: "1", status: "pending", category: "כללי",
              requestedBy: user?.uid || "system", requestedByName: user?.displayName || "Hosen AI", createdAt: serverTimestamp()
            });
            response = `הוספתי ${clean} לרשימת הקניות.`;
            router.push("/shopping");
          } catch (e) { response = "שגיאה בהוספת הפריט."; }
        } else response = "מה חסר? תכתוב לי את שם הפריט.";
      }
    }
    // Command Logic: Calculation
    else if (normalized.includes("בשר") && normalized.includes("איש") && (normalized.includes("כמה") || normalized.includes("כמות") || normalized.includes("קציצות"))) {
      const peopleMatch = text.match(/\d+/);
      const people = peopleMatch ? parseInt(peopleMatch[0]) : 20;
      const kgNeeded = (people * 0.2).toFixed(1);
      response = `בשביל ${people} איש, אני ממליץ לקנות כ-${kgNeeded} ק"ג בשר (מחושב לפי 200 גרם לאדם). האם תרצה שאוסיף את זה לרשימת הקניות?`;
      setPendingAction({ type: "add_meat", data: { people, kg: kgNeeded } });
    }
    // Command Logic: History Search
    else if (normalized.includes("קנינו") || normalized.includes("רכשנו") || normalized.includes("הוזמן") || normalized.includes("היה")) {
      const itemName = text.replace(/האם|קנינו|לאחרונה|רכשנו|הוזמן|היה|כבר|את|ה/g, "").replace(/[?!.,:]/g, "").trim();
      if (itemName) {
        try {
          const q = query(collection(db, "shopping_requests"), where("status", "==", "purchased"));
          const snap = await getDocs(q);
          const match = snap.docs
            .filter(d => d.data().name.includes(itemName) || itemName.includes(d.data().name))
            .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))[0];
          
          if (match) {
            const date = match.data().createdAt?.toDate ? match.data().createdAt.toDate().toLocaleDateString("he-IL") : "לאחרונה";
            response = `כן, רכשנו ${match.data().name} בתאריך ${date}. האם תרצה שאוסיף עוד חבילה לרשימת הקניות?`;
            setPendingAction({ type: "item_ref", data: { name: match.data().name } });
          } else {
            response = `לא מצאתי תיעוד לרכישה של ${itemName} בתקופה האחרונה.`;
          }
        } catch (e) { response = "שגיאה בחיפוש בהיסטוריה."; }
      }
    }
    // Command Logic: Absence Approval (For Managers)
    else if ((isAdmin || isManager) && (normalized.includes("תאשר") || normalized.includes("תדחה") || normalized.includes("אישור") || normalized.includes("דחייה") || normalized.includes("תאשרי")) && (normalized.includes("היעדרות") || normalized.includes("העדרות") || normalized.includes("בקשה"))) {
      const name = text.replace(/תאשר|תדחה|אישור|דחייה|תאשרי|את|הבקשה|של|היעדרות|העדרות|ל|/g, "").trim();
      const isApprove = normalized.includes("תאשר") || normalized.includes("אישור") || normalized.includes("תאשרי");
      try {
        const q = query(collection(db, "absence_requests"), where("status", "==", "pending"));
        const snap = await getDocs(q);
        const matches = snap.docs.filter(d => d.data().userName.includes(name) || name.includes(d.data().userName));
        
        if (matches.length === 1) {
          const match = matches[0];
          const data = match.data();
          const { updateDoc } = await import("firebase/firestore");
          await updateDoc(match.ref, { status: isApprove ? "approved" : "rejected" });
          response = `${isApprove ? "אישרתי" : "דחיתי"} את בקשת ההיעדרות של ${data.userName} לתאריך ${data.date}.`;
        } else if (matches.length > 1) {
          response = `מצאתי מספר בקשות עבור ${name}. לאיזה מהן התכוונת? (${matches.map(m => m.data().date).join(", ")})`;
        } else if (!name) {
          response = `מצאתי ${snap.size} בקשות ממתינות: ${snap.docs.map(d => d.data().userName).join(", ")}. את מי לאשר?`;
        } else {
          response = `לא מצאתי בקשת היעדרות ממתינה עבור ${name}.`;
        }
      } catch (e) { response = "שגיאה בגישה לבקשות."; }
    }
    // Command Logic: Show Absences (For Managers)
    else if ((isAdmin || isManager) && (normalized.includes("מי") || normalized.includes("תראה") || normalized.includes("איזה")) && (normalized.includes("נעדר") || normalized.includes("מבקש") || normalized.includes("היעדרות"))) {
      try {
        const q = query(collection(db, "absence_requests"), where("status", "==", "pending"));
        const snap = await getDocs(q);
        if (snap.empty) {
          response = "אין בקשות היעדרות ממתינות כרגע.";
        } else {
          const list = snap.docs.map(d => `${d.data().userName} (${d.data().date})`).join(", ");
          response = `ישנן ${snap.size} בקשות ממתינות: ${list}. האם תרצה לאשר מישהו מהם?`;
        }
      } catch (e) { response = "שגיאה בטעינת הבקשות."; }
    }
    // Command Logic: Absence Submission (For Users)
    else if (normalized.includes("היעדרות") || normalized.includes("העדרות") || normalized.includes("חופש") || normalized.includes("חופשה") || (normalized.includes("לא") && normalized.includes("אהיה"))) {
      const dateMatch = text.match(/(\d{1,2})[\/.](\d{1,2})/);
      const day = dateMatch ? dateMatch[1].padStart(2, "0") : null;
      const month = dateMatch ? dateMatch[2].padStart(2, "0") : null;
      const absenceDate = day && month ? `${new Date().getFullYear()}-${month}-${day}` : today;
      try {
        await addDoc(collection(db, "absence_requests"), {
          userId: user?.uid || "system", userName: user?.displayName || "User",
          date: absenceDate, reason: text.replace(/תשלח|לי|בקשת|היעדרות|העדרות|חופש|חופשה|ל|בתאריך/g, "").trim() || "סיבה לא צוינה",
          status: "pending", createdAt: serverTimestamp()
        });

        // Trigger push notification for managers
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: ["admin", "manager"],
            title: "בקשת היעדרות חדשה",
            body: `${user?.displayName || "איש צוות"} ביקש היעדרות לתאריך ${day ? `${day}.${month}` : "היום"}`,
            link: "/admin/staff-attendance"
          })
        }).catch(e => console.error("Notification failed", e));

        response = `הגשתי עבורך בקשת היעדרות לתאריך ${day ? `${day}.${month}` : "היום"}.`;
        router.push("/profile");
      } catch (e) { response = "שגיאה בהגשת הבקשה."; }
    }
    else if (normalized.includes("מטופל") || normalized.includes("חולה") || normalized.includes("רשימה")) {
      response = "מעביר אותך לרשימת המטופלים.";
      router.push("/patients");
    } else if (normalized.includes("קניות") || normalized.includes("אוכל") || normalized.includes("חוסר")) {
      const shopSnap = await getDocs(query(collection(db, "shopping_requests"), where("status", "==", "pending")));
      response = shopSnap.empty ? "אין בקשות רכש ממתינות." : `ישנן ${shopSnap.size} בקשות רכש הממתינות לאישור.`;
      router.push("/shopping");
    } else if (normalized.includes("לוז") || normalized.includes("לוח זמנים") || normalized.includes("פעילות")) {
      const schedSnap = await getDoc(doc(db, "schedules", today));
      const count = schedSnap.exists() ? (schedSnap.data().activities || []).length : 0;
      response = count > 0 ? `ישנן ${count} פעילויות בלוז היום.` : "לוח הזמנים להיום ריק.";
      router.push("/");
    } else if (normalized.includes("תורן") || normalized.includes("מי אחראי")) {
      const schedSnap = await getDoc(doc(db, "schedules", today));
      const dutyId = schedSnap.exists() ? (schedSnap.data().dutyInstructorId || schedSnap.data().dutyId) : null;
      if (dutyId) {
        const userDoc = await getDoc(doc(db, "users", dutyId));
        response = `המדריך התורן היום הוא ${userDoc.exists() ? userDoc.data().name : "לא ידוע"}.`;
      } else {
        const [uSnap, aSnap] = await Promise.all([
          getDocs(query(collection(db, "users"), where("role", "==", "instructor"))),
          getDocs(query(collection(db, "staff_attendance"), where("date", "==", today)))
        ]);
        const absIds = new Set(aSnap.docs.filter(d => d.data().status !== "present").map(d => d.data().userId));
        const avail = uSnap.docs.filter(d => !absIds.has(d.id)).map(d => d.data().name);
        response = avail.length > 0 ? `טרם הוגדר תורן. מומלץ לשבץ את: ${avail.join(", ")}.` : "אין מדריכים זמינים.";
      }
      router.push("/");
    } else if (normalized.includes("דוח") || normalized.includes("דיווח") || normalized.includes("אקסל")) {
      response = "אני פותח את עמוד הדוחות.";
      router.push("/reports");
    } else if (normalized.includes("שלום") || normalized.includes("היי") || normalized.includes("בוקר טוב")) {
      response = `שלום ${user?.displayName?.split(" ")[0] || ""}! איך אני יכול לעזור?`;
    } else if (normalized.includes("מי חסר") || normalized.includes("נוכחות")) {
      const [aSnap, pSnap] = await Promise.all([
        getDocs(query(collection(db, "attendance"), where("date", "==", today), where("status", "==", "present"))),
        getDocs(query(collection(db, "patients"), where("status", "==", "active")))
      ]);
      const miss = pSnap.size - aSnap.size;
      response = miss > 0 ? `ישנם ${miss} מטופלים שטרם נרשמו כנוכחים.` : "כל המטופלים נוכחים היום.";
      router.push("/admin/patient-attendance");
    }

    setMessages(prev => [...prev, { role: "assistant", content: response }]);
    setLoading(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] font-sans pointer-events-none">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.95, y: 20, filter: "blur(10px)" }}
            className="absolute bottom-20 right-0 w-[calc(100vw-48px)] md:w-[400px] h-[calc(100vh-140px)] md:h-[600px] bg-[var(--surface)]/90 backdrop-blur-3xl border border-[var(--border-strong)] rounded-[32px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden pointer-events-auto"
          >
            {/* Header: Premium Gradient & Glass */}
            <div className="relative p-6 border-b border-[var(--border)] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)]/10 to-transparent pointer-events-none" />
              
              <div className="relative flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--primary)] flex items-center justify-center shadow-[0_8px_16px_-4px_rgba(var(--primary-rgb),0.4)]">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[var(--surface)]" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[var(--foreground)] tracking-tight">Hosen AI</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.1em]">מערכת פעילה</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2.5 hover:bg-[var(--foreground)]/5 rounded-2xl transition-all active:scale-90"
                >
                  <X className="w-5 h-5 text-[var(--text-secondary)]" />
                </button>
              </div>

              {/* Proactive Insights: Sleek List */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {insights.map(insight => (
                  <motion.div 
                    key={insight.id}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    onClick={() => insight.actionPath && (router.push(insight.actionPath), setIsOpen(false))}
                    className={`p-3 rounded-2xl border text-[10px] font-black flex items-center gap-2.5 transition-all cursor-pointer hover:bg-[var(--foreground)]/[0.03] group whitespace-nowrap shrink-0 ${
                      insight.type === "warning" ? "bg-amber-500/5 border-amber-500/10 text-amber-200" :
                      insight.type === "success" ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-200" :
                      "bg-[var(--primary)]/5 border-[var(--primary)]/10 text-blue-200"
                    }`}
                  >
                    <insight.icon className="w-4 h-4 shrink-0 opacity-70" />
                    <span className="flex-1 uppercase tracking-wider">{insight.text}</span>
                    <ArrowRight className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-all" />
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Chat Area: Clean Typography */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar bg-gradient-to-b from-transparent to-[var(--background)]/30">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`group relative max-w-[85%] p-4 rounded-3xl text-sm font-medium leading-relaxed shadow-sm ${
                    m.role === "user" 
                      ? "bg-[var(--surface-raised)] text-[var(--foreground)] rounded-tr-none border border-[var(--border)]" 
                      : "bg-[var(--primary)] text-white rounded-tl-none shadow-[0_8px_16px_-4px_rgba(var(--primary-rgb),0.3)]"
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-end">
                  <div className="bg-[var(--primary)]/10 p-3 rounded-2xl rounded-tl-none border border-[var(--primary)]/20">
                    <Loader2 className="w-4 h-4 text-[var(--primary)] animate-spin" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area: Integrated & High-End */}
            <div className="p-6 bg-[var(--surface)] border-t border-[var(--border)]">
              <div className="relative flex items-center gap-3">
                <div className="relative flex-1 group">
                  <input 
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCommand(input)}
                    placeholder={isListening ? "אני מקשיב..." : "איך אני יכול לעזור היום?"}
                    className={`w-full bg-[var(--background)] border ${isListening ? "border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)]" : "border-[var(--border-strong)]"} rounded-[20px] py-4 px-5 pl-14 text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--surface-raised)] outline-none transition-all duration-300`}
                  />
                  <button 
                    onClick={() => handleCommand(input)}
                    disabled={!input.trim() || loading || isListening}
                    className="absolute left-2.5 top-2.5 w-9 h-9 bg-[var(--primary)] hover:bg-[var(--primary)]/90 disabled:opacity-20 text-white rounded-xl transition-all flex items-center justify-center shadow-lg active:scale-90"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <button 
                  onClick={toggleListening}
                  className={`p-4 rounded-[20px] transition-all duration-300 ${
                    isListening 
                      ? "bg-rose-500 text-white animate-pulse shadow-[0_0_20px_rgba(244,63,94,0.3)]" 
                      : "bg-[var(--background)] text-[var(--text-secondary)] border border-[var(--border-strong)] hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-90"
                  }`}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              </div>
              <div className="flex items-center justify-between mt-5 px-1">
                <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">Hosen AI v2.0</span>
                <div className="flex items-center gap-3 text-[var(--text-muted)]">
                  <Command className="w-3 h-3" />
                  <Zap className="w-3 h-3" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button: Professional & Animated */}
      <motion.button
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-16 h-16 rounded-[24px] flex items-center justify-center shadow-[0_20px_40px_-12px_rgba(0,0,0,0.4)] transition-all relative overflow-hidden group pointer-events-auto ${
          isOpen ? "bg-[var(--surface-raised)] text-[var(--foreground)] rotate-90" : "bg-[var(--primary)] text-white"
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative z-10">
          {isOpen ? <X className="w-7 h-7" /> : <Bot className="w-8 h-8" />}
        </div>
        
        {/* Unread / Attention Indicator */}
        {!isOpen && insights.length > 0 && (
          <span className="absolute top-4 right-4 w-3.5 h-3.5 bg-rose-500 border-[3px] border-[var(--primary)] rounded-full z-20 animate-bounce" />
        )}
      </motion.button>
    </div>
  );
}
