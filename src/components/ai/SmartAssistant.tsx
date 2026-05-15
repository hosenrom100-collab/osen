"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, X, Send, Bot,
  ArrowRight, Users, ShoppingCart, Calendar,
  Loader2, Zap, Shield, Mic, MicOff, RefreshCw
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { db } from "@/lib/firebase/config";
import {
  collection, query, getDocs, limit, where, getDoc, doc,
  addDoc, serverTimestamp, deleteDoc, updateDoc, writeBatch, arrayUnion, setDoc
} from "firebase/firestore";

/* ─── Types ─── */

interface Insight {
  id: string;
  type: "info" | "warning" | "success";
  text: string;
  icon: any;
  actionPath?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AppData {
  today: string;
  schedule: {
    activities: Array<{ name: string; time?: string; location?: string }>;
    dutyInstructorName?: string;
    hasDutyInstructor: boolean;
  };
  attendance: { totalActive: number; totalPresent: number; missingCount: number };
  shopping: {
    pendingCount: number;
    pendingItems: Array<{ name: string; quantity: string }>;
    recentPurchases: Array<{ name: string; date: string }>;
  };
  absences: {
    pendingCount: number;
    pendingRequests: Array<{ id: string; userName: string; date: string }>;
  };
  staffList: Array<{ id: string; name: string; role: string }>;
  patientList: Array<{ id: string; fullName: string }>;
  validCategories: string[];
  productPool: string[];
  memory: string[];
}

interface AssistantResult {
  response: string;
  action: string;
  actionData?: Record<string, any>;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
}

/* ─── Component ─── */

export function SmartAssistant() {
  const { user, loading: authLoading, isAdmin, isManager, role, isParticipant } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [appData, setAppData] = useState<AppData | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "שלום! אני העוזר החכם של חוסן. אני מבין עברית טבעית ויכול לעזור עם קניות, נוכחות, לוז, הודעות ועוד. במה אפשר לעזור?" }
  ]);
  const [pendingResult, setPendingResult] = useState<AssistantResult | null>(null);
  const [confirmingNewProduct, setConfirmingNewProduct] = useState<AssistantResult | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && !appData) {
      loadAppData();
    }
  }, [isOpen]);

  /* ─── Load full app context ─── */
  const loadAppData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    const today = new Date().toISOString().split("T")[0];

    try {
      const [
        schedSnap, patientsSnap, attendanceSnap, shopSnap, 
        shopPurchasedSnap, absSnap, usersSnap, settingsSnap, poolSnap, memorySnap
      ] = await Promise.all([
        getDoc(doc(db, "schedules", today)),
        getDocs(query(collection(db, "patients"), where("status", "==", "active"))),
        getDocs(query(collection(db, "attendance"), where("date", "==", today), where("status", "==", "present"))),
        getDocs(query(collection(db, "shopping_requests"), where("status", "==", "pending"))),
        getDocs(query(collection(db, "shopping_requests"), where("status", "==", "purchased"), limit(20))),
        getDocs(query(collection(db, "absence_requests"), where("status", "==", "pending"))),
        getDocs(query(collection(db, "users"), limit(100))),
        getDoc(doc(db, "settings", "shopping")),
        getDocs(collection(db, "product_pool")),
        getDoc(doc(db, "settings", "ai_memory")),
      ]);

      const schedData = schedSnap.exists() ? schedSnap.data() : {};
      const dutyId = schedData.dutyInstructorId || schedData.dutyId || "";
      let dutyName: string | undefined;
      if (dutyId) {
        const dutyDoc = await getDoc(doc(db, "users", dutyId));
        dutyName = dutyDoc.exists() ? dutyDoc.data().name : undefined;
      }

      const totalActive = patientsSnap.size;
      const totalPresent = attendanceSnap.size;

      const data: AppData = {
        today,
        schedule: {
          activities: (schedData.activities || []).map((a: any) => ({
            name: a.name || a.title || "",
            time: a.time || a.startTime || "",
            location: a.location || "",
          })),
          dutyInstructorName: dutyName,
          hasDutyInstructor: !!dutyId,
        },
        attendance: {
          totalActive,
          totalPresent,
          missingCount: Math.max(0, totalActive - totalPresent),
        },
        shopping: {
          pendingCount: shopSnap.size,
          pendingItems: shopSnap.docs.map((d) => ({ name: d.data().name, quantity: d.data().quantity || "1" })),
          recentPurchases: shopPurchasedSnap.docs.map((d) => ({
            name: d.data().name,
            date: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toLocaleDateString("he-IL") : "",
          })),
        },
        absences: {
          pendingCount: absSnap.size,
          pendingRequests: absSnap.docs.map((d) => ({
            id: d.id,
            userName: d.data().userName || "",
            date: d.data().date || "",
          })),
        },
        staffList: usersSnap.docs
          .filter((d) => d.data().status !== "pending" && d.data().status !== "rejected")
          .map((d) => ({ id: d.id, name: d.data().name || d.data().email?.split("@")[0] || "", role: d.data().role || "" })),
        patientList: patientsSnap.docs.map((d) => ({ id: d.id, fullName: d.data().fullName || `${d.data().firstName} ${d.data().lastName}` })),
        validCategories: settingsSnap.exists() ? settingsSnap.data().categories || [] : [],
        productPool: poolSnap.docs.map((d) => d.data().name),
        memory: memorySnap.exists() ? memorySnap.data().facts || [] : [],
      };

      setAppData(data);
      buildInsights(data);
    } catch (e) {
      console.error("Failed to load app data:", e);
    } finally {
      setDataLoading(false);
    }
  }, [user, isAdmin, isManager]);

  /* ─── Build insights from app data ─── */
  const buildInsights = (data: AppData) => {
    const newInsights: Insight[] = [];

    if (!data.schedule.hasDutyInstructor && (isAdmin || isManager)) {
      newInsights.push({ id: "duty", type: "warning", text: "לא הוגדר מדריך תורן להיום", icon: Shield, actionPath: "/" });
    }
    if (data.attendance.missingCount > 0 && data.attendance.totalPresent > 0) {
      newInsights.push({ id: "attendance", type: "warning", text: `${data.attendance.missingCount} מטופלים נעדרים היום`, icon: Users, actionPath: "/admin/patient-attendance" });
    }
    if (data.shopping.pendingCount > 0) {
      newInsights.push({ id: "shopping", type: "warning", text: `${data.shopping.pendingCount} פריטי קניות ממתינים`, icon: ShoppingCart, actionPath: "/shopping" });
    }
    if ((isAdmin || isManager) && data.absences.pendingCount > 0) {
      newInsights.push({ id: "absences", type: "warning", text: `${data.absences.pendingCount} בקשות היעדרות ממתינות`, icon: Calendar, actionPath: "/admin/staff-attendance" });
    }
    if (data.schedule.activities.length === 0) {
      newInsights.push({ id: "schedule", type: "info", text: "אין פעילויות מתוכננות להיום", icon: Calendar, actionPath: "/calendar" });
    }

    setInsights(newInsights);
  };

  /* ─── Execute action returned by Gemini ─── */
  const executeAction = async (result: AssistantResult): Promise<string | null> => {
    const { action, actionData } = result;
    const today = new Date().toISOString().split("T")[0];

    try {
      if (action === "navigate" && actionData?.path) {
        router.push(actionData.path);
        return null;
      }

      if (action === "add_shopping_item") {
        const batch = writeBatch(db);
        let name = actionData?.name || actionData?.product || actionData?.item || "";
        name = String(name).trim();
        
        if (!name) {
          return "לא הצלחתי לזהות את שם המוצר מהבקשה. נסה שוב.";
        }

        const category = actionData?.category || "כללי";
        const docId = name.replace(/\//g, "-").replace(/\s+/g, "_");
        
        if (docId) {
          batch.set(doc(db, "product_pool", docId), { name, category }, { merge: true });
        }
        
        const reqRef = doc(collection(db, "shopping_requests"));
        batch.set(reqRef, {
          name,
          quantity: actionData?.quantity || "1",
          category,
          status: "pending",
          requestedBy: user?.uid || "system",
          requestedByName: user?.displayName || "Hosen AI",
          createdAt: serverTimestamp(),
        });
        
        await batch.commit();
        await loadAppData();
        return null;
      }

      if (action === "add_shopping_items" && actionData?.items?.length) {
        for (const item of actionData.items) {
          await addDoc(collection(db, "shopping_requests"), {
            name: item.name,
            quantity: item.quantity || "1",
            category: item.category || "כללי",
            status: "pending",
            requestedBy: user?.uid || "system",
            requestedByName: user?.displayName || "Hosen AI",
            createdAt: serverTimestamp(),
          });
        }
        await loadAppData();
        return null;
      }

      if (action === "delete_shopping_item") {
        const q = query(collection(db, "shopping_requests"), where("status", "in", ["pending", "approved"]));
        const snap = await getDocs(q);
        const term = (actionData?.searchTerm || "").toLowerCase();
        const match = snap.docs.find((d) => d.data().name?.toLowerCase().includes(term) || term.includes(d.data().name?.toLowerCase()));
        if (match) {
          await deleteDoc(match.ref);
          await loadAppData();
        }
        return null;
      }

      if (action === "add_patient") {
        await addDoc(collection(db, "patients"), {
          firstName: actionData?.firstName || "",
          lastName: actionData?.lastName || "",
          fullName: actionData?.fullName || "",
          status: "active",
          createdAt: serverTimestamp(),
          startDate: today,
          idNumber: "",
        });
        await loadAppData();
        router.push("/patients");
        return null;
      }

      if (action === "add_patients" && actionData?.patients?.length) {
        for (const p of actionData.patients) {
          await addDoc(collection(db, "patients"), {
            firstName: p.firstName || "",
            lastName: p.lastName || "",
            fullName: p.fullName || "",
            status: "active",
            createdAt: serverTimestamp(),
            startDate: today,
            idNumber: "",
          });
        }
        await loadAppData();
        router.push("/patients");
        return null;
      }

      if (action === "create_absence_request") {
        await addDoc(collection(db, "absence_requests"), {
          userId: user?.uid || "system",
          userName: user?.displayName || "User",
          date: actionData?.date || today,
          reason: actionData?.reason || "סיבה לא צוינה",
          status: "pending",
          createdAt: serverTimestamp(),
        });
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: ["admin", "manager"],
            title: "בקשת היעדרות חדשה",
            body: `${user?.displayName || "איש צוות"} ביקש היעדרות לתאריך ${actionData?.date || "היום"}`,
            link: "/admin/staff-attendance",
          }),
        }).catch(() => {});
        await loadAppData();
        return null;
      }

      if (action === "approve_absence" || action === "reject_absence") {
        const targetName = (actionData?.userName || "").toLowerCase();
        const pending = appData?.absences.pendingRequests || [];
        const match = pending.find((r) => r.userName.toLowerCase().includes(targetName) || targetName.includes(r.userName.toLowerCase()));
        if (match) {
          await updateDoc(doc(db, "absence_requests", match.id), {
            status: action === "approve_absence" ? "approved" : "rejected",
          });
          await loadAppData();
        }
        return null;
      }

      if (action === "send_notification") {
        const targetName = (actionData?.targetName || "").toLowerCase();
        const staff = appData?.staffList || [];
        const targetUser = staff.find((s) => s.name.toLowerCase().includes(targetName) || targetName.includes(s.name.toLowerCase()));
        if (targetUser) {
          await fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: targetUser.id,
              title: `הודעה מ${user?.displayName || "איש צוות"}`,
              body: actionData?.message || "",
              senderId: user?.uid,
              senderName: user?.displayName,
            }),
          });
        }
        return null;
      }
      if (action === "learn_fact") {
        const fact = actionData?.fact;
        if (fact) {
          await setDoc(doc(db, "settings", "ai_memory"), {
            facts: arrayUnion(fact)
          }, { merge: true });
          await loadAppData();
        }
        return null;
      }
    } catch (e) {
      console.error("Action execution error:", e);
      return "אירעה שגיאה בביצוע הפעולה.";
    }

    return null;
  };

  /* ─── Send message to Gemini ─── */
  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    // Handle confirmation of pending action
    const confirmWords = ["כן", "בסדר", "אוקי", "אוקי", "כן תוסיף", "תעשה זאת", "בטח", "אישור"];
    const cancelWords = ["לא", "ביטול", "בטל", "לא רוצה"];
    const lc = text.toLowerCase().trim();

    if (pendingResult) {
      if (confirmWords.some((w) => lc.includes(w))) {
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setInput("");
        setLoading(true);
        const errMsg = await executeAction(pendingResult);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: errMsg || pendingResult.response.replace("?", "") + " — בוצע! ✅",
        }]);
        setPendingResult(null);
        setLoading(false);
        return;
      } else if (cancelWords.some((w) => lc.includes(w))) {
        setMessages((prev) => [
          ...prev,
          { role: "user", content: text },
          { role: "assistant", content: "בסדר, ביטלתי את הפעולה." },
        ]);
        setInput("");
        setPendingResult(null);
        return;
      }
    }

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const userContext = {
        userName: user?.displayName || "משתמש",
        userRole: isAdmin ? "admin" : isManager ? "manager" : "instructor",
        isAdmin: !!isAdmin,
        isManager: !!(isAdmin || isManager),
      };

      const conversationMessages = [
        ...messages,
        { role: "user" as const, content: text },
      ];

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationMessages,
          userContext,
          appData: appData || { today: new Date().toISOString().split("T")[0], schedule: { activities: [], hasDutyInstructor: false }, attendance: { totalActive: 0, totalPresent: 0, missingCount: 0 }, shopping: { pendingCount: 0, pendingItems: [], recentPurchases: [] }, absences: { pendingCount: 0, pendingRequests: [] }, staffList: [], patientList: [] },
        }),
      });

      const result: AssistantResult = await res.json();

      if (result.requiresConfirmation) {
        if (result.action === "add_shopping_item" && !appData?.productPool.includes(result.actionData?.name)) {
          setConfirmingNewProduct(result);
          setSelectedCategory("כללי");
        } else {
          setPendingResult(result);
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `${result.response}\n\n_${result.confirmationMessage}_ (ענה כן/לא)`,
          }]);
        }
      } else {
        setPendingResult(null);
        const errMsg = result.action && result.action !== "none" ? await executeAction(result) : null;
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: errMsg || result.response,
        }]);
      }
    } catch (e) {
      console.error("Assistant fetch error:", e);
      setMessages((prev) => [...prev, { role: "assistant", content: "שגיאת תקשורת. בדוק את החיבור ונסה שוב." }]);
    } finally {
      setLoading(false);
    }
  };

  /* ─── Voice input ─── */
  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("הדפדפן שלך לא תומך בזיהוי קולי. נסה כרום או ספארי.");
      return;
    }
    if (isListening) { setIsListening(false); return; }

    const recognition = new SpeechRecognition();
    recognition.lang = "he-IL";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((r: any) => r[0].transcript).join("");
      setInput(transcript);
      if (event.results[0].isFinal) handleSend(transcript);
    };
    recognition.start();
  };

  if (authLoading || !user || pathname === "/login" || pathname.startsWith("/portal") || isParticipant || role === "participant") return null;

  return (
    <div className="fixed bottom-24 md:bottom-8 right-4 md:right-auto md:left-8 z-[100] font-sans pointer-events-none">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.95, y: 20, filter: "blur(10px)" }}
            className="absolute bottom-20 right-0 md:right-auto md:left-0 w-[calc(100vw-48px)] md:w-[400px] h-[calc(100vh-140px)] md:h-[600px] bg-[var(--surface)]/90 backdrop-blur-3xl border border-[var(--border-strong)] rounded-[32px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden pointer-events-auto"
          >
            {/* Header */}
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
                      {dataLoading
                        ? <span className="text-[10px] text-amber-500 font-black uppercase tracking-[0.1em]">טוען נתונים...</span>
                        : <span className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.1em]">מערכת פעילה</span>
                      }
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadAppData}
                    disabled={dataLoading}
                    title="רענן נתונים"
                    className="p-2 hover:bg-[var(--foreground)]/5 rounded-xl transition-all disabled:opacity-30"
                  >
                    <RefreshCw className={`w-4 h-4 text-[var(--text-secondary)] ${dataLoading ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2.5 hover:bg-[var(--foreground)]/5 rounded-2xl transition-all active:scale-90"
                  >
                    <X className="w-5 h-5 text-[var(--text-secondary)]" />
                  </button>
                </div>
              </div>

              {/* Insights */}
              {insights.length > 0 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {insights.map((insight) => (
                    <motion.div
                      key={insight.id}
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      onClick={() => insight.actionPath && (router.push(insight.actionPath), setIsOpen(false))}
                      className={`p-3 rounded-2xl border text-[10px] font-black flex items-center gap-2.5 transition-all cursor-pointer hover:bg-[var(--foreground)]/[0.03] group whitespace-nowrap shrink-0 ${
                        insight.type === "warning" ? "bg-amber-500/5 border-amber-500/20 text-amber-700" :
                        insight.type === "success" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700" :
                        "bg-[var(--primary)]/5 border-[var(--primary)]/20 text-[var(--primary)]"
                      }`}
                    >
                      <insight.icon className="w-4 h-4 shrink-0 opacity-70" />
                      <span className="flex-1 uppercase tracking-wider">{insight.text}</span>
                      <ArrowRight className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-all" />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Chat area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar bg-gradient-to-b from-transparent to-[var(--background)]/30">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`group relative max-w-[85%] p-4 rounded-3xl text-sm font-medium leading-relaxed shadow-sm whitespace-pre-line ${
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
              
              {/* Product Category Confirmation UI */}
              {confirmingNewProduct && (
                <div className="flex justify-end">
                  <div className="bg-[var(--surface-raised)] border border-[var(--primary)] p-4 rounded-3xl rounded-tl-none shadow-md w-[90%]">
                    <h4 className="text-sm font-bold text-[var(--foreground)] mb-2 flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-[var(--primary)]" />
                      אישור קטגוריה למוצר חדש
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)] mb-3">
                      המוצר <strong>{confirmingNewProduct.actionData?.name}</strong> אינו מוכר. אנא בחר לאיזו קטגוריה הוא שייך:
                    </p>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2 px-3 text-sm text-[var(--foreground)] mb-3 focus:outline-none focus:border-[var(--primary)]"
                    >
                      {appData?.validCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setConfirmingNewProduct(null)}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--border)] transition-colors"
                      >
                        ביטול
                      </button>
                      <button 
                        onClick={async () => {
                          const actionWithCat = {
                            ...confirmingNewProduct,
                            actionData: { ...confirmingNewProduct.actionData, category: selectedCategory }
                          };
                          setConfirmingNewProduct(null);
                          setLoading(true);
                          const errMsg = await executeAction(actionWithCat);
                          setMessages(prev => [...prev, {
                            role: "assistant",
                            content: errMsg || confirmingNewProduct.response.replace("?", "") + " — נוסף בהצלחה למערכת! ✅",
                          }]);
                          setLoading(false);
                        }}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-[var(--primary)] hover:bg-[var(--primary)]/90 transition-colors shadow-md"
                      >
                        אשר והוסף
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div className="p-6 bg-[var(--surface)] border-t border-[var(--border)]">
              <div className="relative flex items-center gap-3">
                <div className="relative flex-1 group">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend(input)}
                    placeholder={isListening ? "אני מקשיב..." : "כתוב בחופשיות — אני מבין הכל..."}
                    className={`w-full bg-[var(--background)] border ${isListening ? "border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)]" : "border-[var(--border-strong)]"} rounded-[20px] py-4 px-5 pl-14 text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--surface-raised)] outline-none transition-all duration-300`}
                  />
                  <button
                    onClick={() => handleSend(input)}
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
                <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">Hosen AI · Gemini Flash</span>
                <div className="flex items-center gap-3 text-[var(--text-muted)]">
                  <Sparkles className="w-3 h-3" />
                  <Zap className="w-3 h-3" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        title="העוזר החכם של חוסן"
        className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center shadow-[0_12px_24px_-8px_rgba(0,0,0,0.5)] transition-all relative overflow-hidden group pointer-events-auto ${
          isOpen ? "bg-[var(--surface-raised)] text-[var(--foreground)] rotate-90" : "bg-[var(--primary)] text-white"
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative z-10">
          {isOpen ? <X className="w-5 h-5" /> : <Bot className="w-6 h-6" />}
        </div>
        {!isOpen && insights.length > 0 && (
          <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-rose-500 border-2 border-[var(--primary)] rounded-full z-20 animate-bounce" />
        )}
      </motion.button>
    </div>
  );
}
