"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, addDoc, getDocs, query, orderBy, doc,
  updateDoc, deleteDoc, onSnapshot, setDoc, getDoc,
} from "firebase/firestore";
import { 
  ShoppingCart, Plus, Minus, Check, X, Clock, User, Search, Loader2, 
  ArrowRight, Trash2, CheckCircle2, Download, Flame, ChevronRight, 
  Edit3, RotateCcw, Package, ShoppingBag, Filter,
  ChevronDown, Settings
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { sendPush } from "@/lib/notify";
import { generateShoppingListWord, generateDocxWithLetterhead } from "@/lib/word-generator";
import { format } from "date-fns";

interface ShoppingRequest {
  id: string;
  name: string;
  category: string;
  quantity: string;
  status: "pending" | "approved" | "purchased" | "archived";
  requestedBy: string;
  requestedByName: string;
  createdAt: any;
  notes?: string;
  priority?: "low" | "normal" | "urgent";
  listType?: "supermarket" | "large";
}

interface Product { 
  id: string; 
  name: string; 
  category: string; 
  isRecurring?: boolean;
  recurringQuantity?: string;
}

const CAT_COLOR: Record<string, string> = {
  "גבינות ומחלבה":       "text-amber-500 bg-amber-500/10 border border-amber-500/20",
  "בשר ודגים":            "text-rose-500 bg-rose-500/10 border border-rose-500/20",
  "פירות וירקות":         "text-emerald-500 bg-emerald-500/10 border border-emerald-500/20",
  "לחם ומאפים":           "text-orange-500 bg-orange-500/10 border border-orange-500/20",
  "חומרי ניקוי":          "text-cyan-500 bg-cyan-500/10 border border-cyan-500/20",
  "מוצרי נייר וחד פעמי": "text-indigo-500 bg-indigo-500/10 border border-indigo-500/20",
  "טואלטיקה והיגיינה":   "text-emerald-500 bg-emerald-500/10 border border-emerald-500/20",
  "שימורים ובישול":       "text-slate-500 bg-slate-500/10 border border-slate-500/20",
  "קפואים":               "text-sky-500 bg-sky-500/10 border border-sky-500/20",
  "כללי":                 "text-slate-400 bg-slate-400/10 border border-slate-400/20",
};

const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const normalizeHebrewString = (str: string): string => {
  return str
    .trim()
    .replace(/["'׳״\-]/g, "") // remove quotes, hyphens, apostrophes
    .replace(/\s+/g, " ")    // collapse multiple spaces
    .toLowerCase()
    .split(" ")
    .map(word => {
      if (word.startsWith("ה") && word.length > 3) {
        return word.substring(1);
      }
      return word;
    })
    .join(" ");
};

const findSimilarRequest = (name: string, activeRequestsList: { name: string }[]): string | null => {
  const normName = normalizeHebrewString(name);
  if (!normName) return null;

  for (const r of activeRequestsList) {
    const normActive = normalizeHebrewString(r.name);
    if (normName === normActive) return r.name;

    const distance = getLevenshteinDistance(normName, normActive);
    const minLength = Math.min(normName.length, normActive.length);

    const maxAllowedDistance = minLength >= 6 ? 2 : (minLength >= 4 ? 1 : 0);

    if (distance <= maxAllowedDistance && minLength > 2) {
      return r.name;
    }
  }
  return null;
};

function CatBadge({ cat }: { cat: string }) {
  const cls = CAT_COLOR[cat] ?? CAT_COLOR["כללי"];
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{cat}</span>
  );
}

export default function ShoppingPage() {
  const { user, role, isAdmin, isManager } = useAuth();
  const router = useRouter();

  const [requests, setRequests]     = useState<ShoppingRequest[]>([]);
  const [pool, setPool]             = useState<Product[]>([]);
  const [loading, setLoading]       = useState(true);
  const [view, setView]             = useState<"list" | "archive">("list");
  const [showArchivePrompt, setShowArchivePrompt] = useState(false);
  const [listType, setListType]     = useState<"supermarket" | "large">("supermarket");
  const [isEditingRecurring, setIsEditingRecurring] = useState(false);
  const [recurringSearchVal, setRecurringSearchVal] = useState("");
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [purchasedCollapsed, setPurchasedCollapsed] = useState(true);


  // Add-bar state
  const [inputVal, setInputVal]     = useState("");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [addUrgent, setAddUrgent]   = useState(false);
  const [addQty, setAddQty]         = useState("1");
  const [addUnit, setAddUnit]       = useState("יחידות");
  const [justAdded, setJustAdded]   = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "warning" } | null>(null);

  const openAddOverlay = () => {
    setAddQty("1");
    setAddUnit("יחידות");
    setOverlayOpen(true);
  };

  const showToast = (message: string, type: "success" | "warning") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Quick edit modal state
  const [editItem, setEditItem]     = useState<ShoppingRequest | null>(null);
  const [editCat,  setEditCat]      = useState("");
  const [editName, setEditName]     = useState("");
  const [editQty,  setEditQty]      = useState("");
  const [editNotes, setEditNotes]   = useState("");
  const [editPriority, setEditPriority] = useState<"low" | "normal" | "urgent">("normal");

  const [newCatName, setNewCatName] = useState("");
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [editingCatNewValue, setEditingCatNewValue] = useState("");

  // Category Filter State
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [categories, setCategories] = useState([
    "גבינות ומחלבה","לחם ומאפים","חומרי ניקוי",
    "מוצרי נייר וחד פעמי","שימורים ובישול","פירות וירקות",
    "טואלטיקה והיגיינה","בשר ודגים","קפואים","כללי",
  ]);

  const inputRef       = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const canPurchase = isAdmin || role === "manager" || role === "admin" || role === "logistics" || isManager;

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    getDoc(doc(db, "settings", "shopping")).then((s) => {
      if (s.exists() && s.data().categories) setCategories(s.data().categories);
    });
    fetchPool();
    const q = query(collection(db, "shopping_requests"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: ShoppingRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ShoppingRequest));
      setRequests(list);
      setLoading(false);
    }, (err) => {
      console.error("Uncaught Error in snapshot listener:", err);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (editItem) {
      setEditName(editItem.name);
      setEditCat(editItem.category);
      setEditQty(editItem.quantity || "");
      setEditNotes(editItem.notes || "");
      setEditPriority(editItem.priority || "normal");
    }
  }, [editItem]);



  const fetchPool = async () => {
    const snap = await getDocs(collection(db, "product_pool"));
    const list: Product[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Product));
    list.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    setPool(list);
  };

  const toggleRecurring = async (productId: string, name: string, category: string, shouldBeRecurring: boolean) => {
    try {
      await setDoc(doc(db, "product_pool", productId), {
        name,
        category,
        isRecurring: shouldBeRecurring,
        recurringQuantity: shouldBeRecurring ? "1" : ""
      }, { merge: true });
      await fetchPool();
    } catch (e) {
      console.error("Error toggling recurring product:", e);
    }
  };

  const updateRecurringQuantity = async (productId: string, currentQtyStr: string, increment: number) => {
    const currentVal = parseFloat(currentQtyStr) || 1;
    const nextVal = Math.max(1, currentVal + increment);
    const nextQty = String(nextVal);
    try {
      await updateDoc(doc(db, "product_pool", productId), {
        recurringQuantity: nextQty
      });
      await fetchPool();
    } catch (e) {
      console.error("Error updating recurring quantity:", e);
    }
  };

  const generateRecurringList = async () => {
    const recurringItems = pool.filter(p => p.isRecurring);
    if (recurringItems.length === 0) {
      showToast("לא הוגדרו מוצרים ברשימה הקבועה. לחץ על 'עריכת רשימה קבועה' כדי להוסיף.", "warning");
      return;
    }
    
    setLoading(true);
    try {
      const sortedItems = [...recurringItems].sort((a, b) => a.category.localeCompare(b.category));
      
      const itemsToExport = sortedItems.map(item => ({
        name: item.name,
        category: item.category || "כללי",
        quantity: item.recurringQuantity || "1",
        notes: "",
        requestedByName: "רשימה קבועה"
      }));

      const dateStr = format(new Date(), "dd/MM/yyyy");
      const doc = generateShoppingListWord(itemsToExport, {
        date: dateStr,
        title: "רשימת קניות קבועה - חוות רום"
      });

      const fileName = `רשימת_קניות_קבועה_${format(new Date(), "yyyy-MM-dd")}.docx`;
      await generateDocxWithLetterhead(doc, fileName);
      showToast("הופק קובץ Word עבור הרשימה הקבועה והורד בהצלחה!", "success");
    } catch (e) {
      console.error(e);
      showToast("שגיאה בהפקת הרשימה הקבועה.", "warning");
    } finally {
      setLoading(false);
    }
  };

  const changeStatus = useCallback(async (
    id: string,
    next: "pending" | "approved" | "purchased" | "archived" | "deleted",
    extra: Record<string, any> = {}
  ) => {
    try {
      if (next === "deleted") {
        await deleteDoc(doc(db, "shopping_requests", id));
      } else {
        await updateDoc(doc(db, "shopping_requests", id), {
          status: next, updatedAt: new Date(), updatedBy: user?.uid, ...extra,
        });

        if (next === "purchased") {
          const remainingApproved = requests.filter((r) => (r.status === "approved" || r.status === "pending") && r.id !== id);
          if (remainingApproved.length === 0) {
            // Notify managers and logistics
            sendPush({
              role: ["admin", "manager", "logistics"],
              title: "🛍️ הקניות הסתיימו!",
              body: "כל הפריטים המאושרים נרכשו בהצלחה",
              link: "/shopping",
            });

            // Show confirmation prompt to archive current session purchases
            setShowArchivePrompt(true);

            // Target notifications ONLY to the users whose items were in this batch of purchased items!
            const purchasedItems = requests.filter((r) => r.status === "purchased" || r.id === id);
            const requesters = Array.from(new Set(purchasedItems.map((r) => r.requestedBy).filter(Boolean)));
            
            requesters.forEach((reqUserId) => {
              if (reqUserId === user?.uid) return;
              
              const userItems = purchasedItems.filter((r) => r.requestedBy === reqUserId);
              const itemsList = userItems.map((r) => r.name).join(", ");
              
              sendPush({
                userId: reqUserId,
                title: "🛍️ הפריטים שביקשת נרכשו!",
                body: `הפריטים הבאים נרכשו עבורך: ${itemsList}`,
                link: "/shopping",
              });
            });
          }
        }
      }
    } catch (e) { console.error(e); }
  }, [requests, user]);

  const updateQuantity = async (id: string, currentQtyStr: string, increment: number) => {
    const currentVal = parseFloat(currentQtyStr) || 1;
    const nextVal = Math.max(1, currentVal + increment);
    const nextQty = String(nextVal);
    try {
      await updateDoc(doc(db, "shopping_requests", id), {
        quantity: nextQty,
        updatedAt: new Date(),
        updatedBy: user?.uid
      });
    } catch (e) { console.error(e); }
  };

  const archiveCurrentSession = async () => {
    const sessionPurchased = requests.filter((r) => r.status === "purchased" && (listType === "large" ? r.listType === "large" : r.listType !== "large"));
    if (sessionPurchased.length === 0) return;
    try {
      setLoading(true);
      await Promise.all(
        sessionPurchased.map((r) =>
          updateDoc(doc(db, "shopping_requests", r.id), {
            status: "archived",
            archivedAt: new Date(),
            archivedBy: user?.uid,
          })
        )
      );
      setShowArchivePrompt(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const addProduct = async (name: string, category = "כללי", priority: "normal" | "urgent" = "normal", quantity = "1") => {
    const activeRequestsList = requests.filter((r) => r.status !== "archived");
    const similarName = findSimilarRequest(name, activeRequestsList);
    if (similarName) {
      showToast(`המוצר כבר הוזמן לרשימה בשם דומה: "${similarName}"! ניתן להגדיל את הכמות שלו ברשימה.`, "warning");
      const match = pool.find((p) => p.name === similarName || p.name === name);
      flash(match?.id ?? "dup");
      return;
    }
    const docId = name.replace(/\//g, "-");
    try { await setDoc(doc(db, "product_pool", docId), { name, category }, { merge: true }); } catch { /* ignore pool write fail for non-managers */ }
    await addDoc(collection(db, "shopping_requests"), {
      name, category, quantity, notes: "", priority, status: "approved",
      requestedBy: user?.uid, requestedByName: user?.displayName || user?.email || "משתמש",
      createdAt: new Date(),
      listType,
    });
    if (priority === "urgent") {
      sendPush({
        role: ["admin", "manager", "logistics"],
        title: "🔥 בקשת רכש דחופה",
        body: `${user?.displayName || "משתמש"}: ${name}`,
        link: "/shopping",
      });
    }
    showToast("המוצר הוזמן בהצלחה! ניתן להגדיל את הכמות שלו ברשימה במידת הצורך.", "success");
    flash(docId);
    if (!pool.some((p) => p.name === name)) fetchPool();
  };

  const flash = (id: string) => {
    setJustAdded(id);
    setTimeout(() => setJustAdded(null), 1600);
  };

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    if (!name || categories.includes(name)) return;
    const next = [...categories, name];
    setCategories(next);
    setNewCatName("");
    try {
      await setDoc(doc(db, "settings", "shopping"), { categories: next }, { merge: true });
      showToast("קטגוריה נוספה בהצלחה!", "success");
    } catch (e) {
      console.error(e);
      showToast("שגיאה בהוספת קטגוריה", "warning");
    }
  };

  const handleRenameCategory = async (oldName: string, newName: string) => {
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedNew === oldName || categories.includes(trimmedNew)) {
      setEditingCatName(null);
      return;
    }
    const next = categories.map(c => c === oldName ? trimmedNew : c);
    setCategories(next);
    setEditingCatName(null);
    try {
      await setDoc(doc(db, "settings", "shopping"), { categories: next }, { merge: true });
      
      // Update existing active and purchased requests' category
      const activeToUpdate = requests.filter(r => r.category === oldName);
      await Promise.all(activeToUpdate.map(r => 
        updateDoc(doc(db, "shopping_requests", r.id), { category: trimmedNew })
      ));
      
      // Update existing product pool categories
      const poolToUpdate = pool.filter(p => p.category === oldName);
      await Promise.all(poolToUpdate.map(p => 
        updateDoc(doc(db, "product_pool", p.id), { category: trimmedNew })
      ));
      
      showToast("הקטגוריה עודכנה בהצלחה!", "success");
    } catch (e) {
      console.error(e);
      showToast("שגיאה בעדכון הקטגוריה", "warning");
    }
  };

  const handleDeleteCategory = async (catName: string) => {
    if (categories.length <= 1) {
      alert("חייבת להיות לפחות קטגוריה אחת במערכת");
      return;
    }
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הקטגוריה "${catName}"? מוצרים המשויכים אליה יועברו לקטגוריה "כללי".`)) return;
    
    const next = categories.filter(c => c !== catName);
    setCategories(next);
    try {
      await setDoc(doc(db, "settings", "shopping"), { categories: next }, { merge: true });
      
      // Update requests
      const activeToUpdate = requests.filter(r => r.category === catName);
      await Promise.all(activeToUpdate.map(r => 
        updateDoc(doc(db, "shopping_requests", r.id), { category: "כללי" })
      ));
      
      // Update product pool
      const poolToUpdate = pool.filter(p => p.category === catName);
      await Promise.all(poolToUpdate.map(p => 
        updateDoc(doc(db, "product_pool", p.id), { category: "כללי" })
      ));
      
      showToast("הקטגוריה נמחקה בהצלחה!", "success");
    } catch (e) {
      console.error(e);
      showToast("שגיאה במחיקת הקטגוריה", "warning");
    }
  };

  const handleUpdateItem = async () => {
    if (!editItem) return;
    try {
      await updateDoc(doc(db, "shopping_requests", editItem.id), {
        name: editName,
        category: editCat,
        quantity: editQty,
        notes: editNotes,
        priority: editPriority
      });
      const docId = editName.replace(/\//g, "-");
      await setDoc(doc(db, "product_pool", docId), {
        name: editName,
        category: editCat
      }, { merge: true });
      setEditItem(null);
      fetchPool();
    } catch (e) { console.error(e); }
  };

  const handleAddInput = async () => {
    const name = inputVal.trim();
    if (!name) return;
    const match = pool.find((p) => p.name === name);
    const finalQty = addUnit === "יחידות" ? addQty : `${addQty} ${addUnit}`;
    await addProduct(name, match?.category ?? "כללי", addUrgent ? "urgent" : "normal", finalQty);
    setInputVal("");
    setOverlayOpen(false);
    setAddUrgent(false);
    inputRef.current?.blur();
  };

  const exportXlsx = () => {
    const data = requests.filter((r) => r.status === "archived").map((r) => {
      const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      return { תאריך: d.toLocaleDateString("he-IL"), מוצר: r.name, קטגוריה: r.category, כמות: r.quantity || "1", מבקש: r.requestedByName };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ארכיון רכש");
    XLSX.writeFile(wb, `ארכיון_רכש_${new Date().toLocaleDateString("he-IL").replace(/\//g, "-")}.xlsx`);
  };

  const exportProcurementList = async () => {
    try {
      const activeSession = requests.filter((r) => r.status !== "archived" && r.listType === "large");
      const sortedItems = [...activeSession].sort((a, b) => a.category.localeCompare(b.category));
      const itemsToExport = sortedItems.map(r => ({
        name: r.name,
        category: r.category,
        quantity: r.quantity || "1",
        notes: r.notes || "",
        requestedByName: r.requestedByName || ""
      }));
      const dateStr = format(new Date(), "dd/MM/yyyy");
      const doc = generateShoppingListWord(itemsToExport, {
        date: dateStr,
        title: "רשימת רכש וציוד - חוות רום"
      });
      await generateDocxWithLetterhead(doc, `רשימת_רכש_${format(new Date(), "yyyy-MM-dd")}.docx`);
      showToast("הופקה רשימת רכש והורדה בהצלחה!", "success");
    } catch (e) {
      console.error("Failed to generate procurement Word document", e);
      showToast("שגיאה בהפקת רשימת רכש.", "warning");
    }
  };

  const exportOngoingList = async () => {
    try {
      const activeSession = requests.filter((r) => r.status !== "archived" && r.listType !== "large");
      const sortedItems = [...activeSession].sort((a, b) => a.category.localeCompare(b.category));
      const itemsToExport = sortedItems.map(r => ({
        name: r.name,
        category: r.category,
        quantity: r.quantity || "1",
        notes: r.notes || "",
        requestedByName: r.requestedByName || ""
      }));
      const dateStr = format(new Date(), "dd/MM/yyyy");
      const doc = generateShoppingListWord(itemsToExport, {
        date: dateStr,
        title: "רשימת קניות שוטפת סופר - חוות רום"
      });
      await generateDocxWithLetterhead(doc, `רשימת_קניות_סופר_${format(new Date(), "yyyy-MM-dd")}.docx`);
      showToast("הופקה רשימה שוטפת והורדה בהצלחה!", "success");
    } catch (e) {
      console.error("Failed to generate ongoing Word document", e);
      showToast("שגיאה בהפקת רשימה שוטפת.", "warning");
    }
  };

  const activeRequests = requests.filter((r) => (r.status === "approved" || r.status === "pending") && (listType === "large" ? r.listType === "large" : r.listType !== "large"));
  const sessionPurchased = requests.filter((r) => r.status === "purchased" && (listType === "large" ? r.listType === "large" : r.listType !== "large"));
  const archived = requests.filter((r) => r.status === "archived" && (listType === "large" ? r.listType === "large" : r.listType !== "large"));

  const suggestions = pool.filter((p) =>
    inputVal.trim() &&
    (p.name.includes(inputVal.trim()) || p.category.includes(inputVal.trim()))
  ).slice(0, 20);

  const exactMatch = pool.some((p) => p.name === inputVal.trim());
  const alreadyInList = (name: string) => requests.some((r) => r.name === name && r.status !== "archived");

  const archiveByDate = archived.reduce((acc, item) => {
    const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
    const key = d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {} as Record<string, ShoppingRequest[]>);

  return (
    <RoleGuard allowedRoles={["admin","manager","instructor","social_worker","employee","logistics"]} redirectTo="/">
      <div dir="rtl" className="flex flex-col h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden font-sans">
        
        {/* ── Mobile Action Bar (Top) ── */}
        <div className="md:hidden pt-2 pb-2 px-3 bg-[var(--background)] border-b border-[var(--border)] z-40 shrink-0">
           <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                 <button onClick={() => router.push("/")} className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--foreground)]/5 border border-[var(--border)] active:scale-95 transition-all">
                    <ArrowRight className="w-4 h-4 text-[var(--muted)]" />
                 </button>
                 <h1 className="text-base font-black flex items-center gap-1.5">
                    <span className="text-lg">💗🥒</span> קניות
                 </h1>
              </div>
              <div className="flex items-center gap-1.5">
                 <button 
                   onClick={() => setView(view === "list" ? "archive" : "list")}
                   className="px-3 py-1.5 rounded-lg bg-[var(--foreground)]/5 border border-[var(--border)] text-[11px] font-black transition-all hover:bg-[var(--foreground)]/10"
                 >
                    {view === "list" ? "ארכיון" : "רשימה"}
                 </button>
                 <button 
                   onClick={() => setActionsMenuOpen(true)}
                   className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--foreground)]/5 border border-[var(--border)] active:scale-95 transition-all"
                   title="פעולות נוספות"
                 >
                    <Settings className="w-4 h-4 text-[var(--muted)]" />
                 </button>
              </div>
           </div>

           <div className="relative group">
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[var(--muted)]/40 px-1.5 border-l border-[var(--border)] ml-2">
                 <Plus className="w-3.5 h-3.5" />
                 <Search className="w-3.5 h-3.5" />
              </div>
              <input
                ref={mobileInputRef}
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onFocus={openAddOverlay}
                placeholder="הוסף מוצר..."
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl py-2.5 pr-16 pl-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-[var(--muted)]/50 shadow-sm"
              />
           </div>
        </div>

        {/* ── Desktop Header (Hidden on Mobile) ── */}
        <header className="hidden md:flex items-center justify-between px-8 h-20 shrink-0 border-b border-[var(--border)] bg-[var(--surface)]/50 backdrop-blur-md z-30">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-black flex items-center gap-3">
               <span className="text-2xl">💗🥒</span> קניות
            </h1>
            <div className="relative w-[360px]">
               <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
               <input
                 ref={inputRef}
                 type="text"
                 value={inputVal}
                 onChange={(e) => setInputVal(e.target.value)}
                 onFocus={openAddOverlay}
                 placeholder="חיפוש או הוספת מוצר..."
                 className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl py-2.5 pr-11 pl-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner"
               />
            </div>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={() => setView(view === "list" ? "archive" : "list")} className="px-6 py-2.5 rounded-2xl bg-[var(--foreground)]/5 border border-[var(--border)] text-xs font-black hover:bg-[var(--foreground)]/10 transition-all">
                {view === "list" ? "ארכיון קניות" : "רשימה פעילה"}
             </button>
              <button 
                onClick={exportProcurementList} 
                title="יצוא רשימת רכש ל-Word" 
                className="px-4 py-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all flex items-center gap-1.5 text-xs font-black cursor-pointer"
              >
                <Download className="w-4 h-4 text-blue-400" />
                <span>יצוא רשימת רכש</span>
              </button>
              <button 
                onClick={exportOngoingList} 
                title="יצוא רשימה שוטפת ל-Word" 
                className="px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 text-xs font-black cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>יצוא רשימה שוטפת</span>
              </button>
              <button 
                onClick={generateRecurringList} 
                title="יצוא רשימה קבועה ל-Word" 
                className="px-4 py-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-all flex items-center gap-1.5 text-xs font-black cursor-pointer"
              >
                <Download className="w-4 h-4 text-purple-400" />
                <span>יצוא רשימה קבועה</span>
              </button>
             {isAdmin && <button onClick={exportXlsx} title="ייצוא לאקסל" className="p-2.5 rounded-2xl bg-[var(--foreground)]/5 border border-[var(--border)] hover:bg-[var(--foreground)]/10 transition-all cursor-pointer"><Download className="w-5 h-5 text-[var(--muted)]" /></button>}
          </div>
        </header>

        {/* ── List Type Tabs (Supermarket vs Large Products) ── */}
        {view === "list" && !loading && (
          <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface)] border-b border-[var(--border)] shrink-0 gap-3 flex-wrap">
            {/* Sliding tabs control */}
            <div className="flex w-full md:w-auto bg-[var(--foreground)]/[0.04] p-1 rounded-xl border border-[var(--border)] relative shrink-0">
              <button
                onClick={() => { setListType("supermarket"); setActiveCategory(null); }}
                className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-[11px] font-black transition-all flex items-center justify-center gap-1.5 select-none cursor-pointer ${
                  listType === "supermarket"
                    ? "bg-[var(--surface)] text-indigo-500 shadow-sm border border-[var(--border)] scale-100"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>קניות סופר</span>
              </button>
              <button
                onClick={() => { setListType("large"); setActiveCategory(null); }}
                className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-[11px] font-black transition-all flex items-center justify-center gap-1.5 select-none cursor-pointer ${
                  listType === "large"
                    ? "bg-[var(--surface)] text-indigo-500 shadow-sm border border-[var(--border)] scale-100"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>ציוד ורכש</span>
              </button>
            </div>

            {/* Action buttons (Only for Supermarket tab) */}
            {listType === "supermarket" && (
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={() => setIsEditingRecurring(true)}
                  className="px-4 py-2.5 rounded-xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-[var(--muted)]" />
                  <span>עריכת רשימה קבועה</span>
                </button>
                <button
                  onClick={generateRecurringList}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-500 border border-indigo-500/20 text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer"
                  title="ייצוא הרשימה הקבועה לקובץ Word נפרד"
                >
                  <Download className="w-4 h-4 text-indigo-500" />
                  <span>ייצוא רשימה קבועה</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Category Scrolling Filters Bar (Visible in list view) ── */}
        {view === "list" && !loading && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2 px-3 bg-[var(--surface)]/50 backdrop-blur-md border-b border-[var(--border)] shrink-0 scroll-smooth">
            <button 
              onClick={() => setActiveCategory(null)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all shrink-0 border select-none cursor-pointer active:scale-95 ${
                activeCategory === null 
                  ? "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)] shadow-sm font-black" 
                  : "bg-[var(--foreground)]/[0.03] text-[var(--muted)] border-[var(--border)] hover:text-[var(--foreground)]"
              }`}
            >
              הכל ({activeRequests.length})
            </button>
            {categories.map(cat => {
              const count = activeRequests.filter(r => r.category === cat).length;
              if (count === 0) return null;
              const cls = CAT_COLOR[cat] ?? CAT_COLOR["כללי"];
              const isSelected = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold transition-all shrink-0 flex items-center gap-1 select-none cursor-pointer active:scale-95 ${
                    isSelected 
                      ? `${cls} shadow-sm font-black border-current`
                      : "bg-[var(--foreground)]/[0.03] text-[var(--muted)] border border-[var(--border)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        )}

        <main className="flex-1 overflow-hidden flex flex-col relative bg-[var(--background)]">
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <div className="max-w-[800px] mx-auto pb-36">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
              ) : view === "list" ? (
                <>
                  <LayoutGroup>
                     {categories.map(cat => {
                       if (activeCategory !== null && activeCategory !== cat) return null;
                       const catItems = activeRequests.filter(r => r.category === cat);
                       if (catItems.length === 0) return null;
                       return (
                          <CategorySection 
                             key={cat}
                             title={cat}
                             items={catItems}
                             onStatus={changeStatus}
                             onEdit={setEditItem}
                             onUpdateQuantity={updateQuantity}
                             canPurchase={canPurchase}
                             currentUser={user}
                             activeCategory={activeCategory}
                          />
                       );
                     })}
                     
                     {/* Fallback for items with unknown categories */}
                     {(activeCategory === null || activeCategory === "אחר") && 
                      activeRequests.some(r => !categories.includes(r.category)) && (
                        <CategorySection 
                           title="אחר"
                           items={activeRequests.filter(r => !categories.includes(r.category))}
                           onStatus={changeStatus}
                           onEdit={setEditItem}
                           onUpdateQuantity={updateQuantity}
                           canPurchase={canPurchase}
                           currentUser={user}
                            activeCategory={activeCategory}
                        />
                     )}

                     {activeRequests.length === 0 && sessionPurchased.length === 0 && (
                        <div className="py-32 px-12 text-center opacity-30 flex flex-col items-center gap-4">
                           <div className="w-20 h-20 rounded-[2.5rem] bg-[var(--foreground)]/5 flex items-center justify-center">
                              <ShoppingBag className="w-10 h-10" />
                           </div>
                           <p className="text-sm font-black uppercase tracking-[0.2em]">הרשימה ריקה</p>
                        </div>
                     )}
                   </LayoutGroup>

                   {sessionPurchased.length > 0 && (
                      <div className="mt-8 px-4 pb-12">
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-3">
                          <button
                            onClick={() => setPurchasedCollapsed(!purchasedCollapsed)}
                            className="text-sm font-black text-emerald-500 flex items-center gap-2 hover:opacity-80 active:scale-95 transition-all border-none bg-transparent"
                          >
                            <ShoppingBag className="w-4.5 h-4.5" />
                            <span>מצרכים שנקנו ({sessionPurchased.length})</span>
                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${purchasedCollapsed ? "" : "rotate-180"}`} />
                          </button>
                          
                          <button
                            onClick={() => setShowArchivePrompt(true)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all active:scale-95 shadow-lg shadow-emerald-600/10 flex items-center gap-1 border-none cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3] text-white" />
                            <span>סיום וארכוב</span>
                          </button>
                        </div>
                        
                        {!purchasedCollapsed && (
                          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden divide-y divide-[var(--border)]/50 shadow-sm">
                            {sessionPurchased.map(item => (
                              <PurchasedRow 
                                key={item.id} 
                                item={item} 
                                onStatus={changeStatus} 
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                </>
              ) : (
                <div className="p-4 space-y-6">
                   <h2 className="text-2xl font-black px-2">ארכיון רכישות</h2>
                   {Object.entries(archiveByDate).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => (
                     <div key={date} className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-sm">
                        <div className="px-6 py-4 bg-[var(--foreground)]/5 border-b border-[var(--border)] flex items-center justify-between">
                           <span className="text-sm font-bold">{date}</span>
                           <span className="text-xs font-black opacity-30">{items.length} מוצרים</span>
                        </div>
                        <div className="divide-y divide-[var(--border)]">
                           {items.map(item => (
                             <div key={item.id} className="px-6 py-4 flex items-center justify-between group">
                                <span className="text-sm font-bold text-[var(--muted)]">{item.name}</span>
                                <CatBadge cat={item.category} />
                             </div>
                           ))}
                        </div>
                     </div>
                   ))}
                </div>
              )}
            </div>
          </div>
        </main>

        <AnimatePresence>
          {overlayOpen && (
            <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => { setOverlayOpen(false); setAddUrgent(false); }}
                className="absolute inset-0"
              />
              
              <motion.div 
                initial={{ y: "100%", opacity: 0.5 }} 
                animate={{ y: 0, opacity: 1 }} 
                exit={{ y: "100%", opacity: 0.5 }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="relative w-full md:max-w-xl bg-[var(--surface)] border-t md:border border-[var(--border)] rounded-t-[2.5rem] md:rounded-[2.5rem] p-6 shadow-2xl text-right flex flex-col max-h-[92vh] md:max-h-[85vh] overflow-hidden" 
                dir="rtl"
              >
                {/* Pull handle indicator on mobile */}
                <div className="w-12 h-1 bg-[var(--border)] rounded-full mx-auto mb-4 md:hidden shrink-0" />

                <div className="flex items-center justify-between mb-5 shrink-0">
                  <h2 className="text-lg md:text-xl font-black flex items-center gap-2">הוספת מוצר לרשימה</h2>
                  <button 
                    onClick={() => { setOverlayOpen(false); setAddUrgent(false); }} 
                    className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer"
                  >
                     <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="relative group mb-4 shrink-0">
                   <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-indigo-500">
                      <Plus className="w-5 h-5" />
                   </div>
                   <input
                     autoFocus
                     type="text"
                     value={inputVal}
                     onChange={(e) => setInputVal(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddInput();
                        if (e.key === "Escape") { setOverlayOpen(false); setAddUrgent(false); }
                     }}
                     placeholder="שם המוצר שברצונך להוסיף..."
                     className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl py-3 pr-11 pl-4 text-sm font-bold focus:outline-none focus:border-indigo-500/50 transition-all shadow-inner text-right placeholder:text-[var(--muted)]/40"
                   />
                </div>

                {/* Quantity and Unit Inputs */}
                <div className="grid grid-cols-2 gap-3 mb-4 shrink-0" dir="rtl">
                  <div>
                    <label className="text-[10px] font-black text-[var(--muted)] text-right uppercase tracking-widest mb-1.5 block">כמות</label>
                    <input 
                      type="text" 
                      value={addQty} 
                      onChange={(e) => setAddQty(e.target.value)}
                      placeholder="1"
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-3 text-sm font-bold text-center focus:outline-none focus:border-indigo-500/40" 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-[var(--muted)] text-right uppercase tracking-widest mb-1.5 block">יחידה</label>
                    <select 
                      value={addUnit} 
                      onChange={(e) => setAddUnit(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-3 text-sm font-bold focus:outline-none focus:border-indigo-500/40 text-right cursor-pointer"
                    >
                      <option value="יחידות">יחידות</option>
                      <option value="ק״ג">ק״ג</option>
                      <option value="גרם">גרם</option>
                    </select>
                  </div>
                </div>

                {/* Quick Priority Toggle inside Add Overlay */}
                <div className="flex items-center justify-between border border-[var(--border)] rounded-2xl p-4 mb-4 shrink-0 bg-[var(--background)]/20">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center ${addUrgent ? "bg-rose-500/10 text-rose-500" : "bg-[var(--foreground)]/5 text-[var(--muted)]"}`}>
                      <Flame className={`w-4 h-4 ${addUrgent ? "animate-pulse" : ""}`} />
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black">בקשה דחופה 🔥</p>
                      <p className="text-[9px] text-[var(--muted)] font-semibold">יישלח פוש מיידי למנהלים</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAddUrgent(!addUrgent)}
                    className={`w-10 h-6 rounded-full p-0.5 transition-all flex items-center cursor-pointer border-none ${addUrgent ? "bg-rose-500 justify-end" : "bg-[var(--foreground)]/10 justify-start"}`}
                  >
                    <motion.div layout className="w-5 h-5 rounded-full bg-white shadow-sm" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pb-6">
                   {!exactMatch && inputVal.trim() && (
                      <button 
                         onClick={handleAddInput}
                         className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 !text-white font-black text-sm shadow-md shadow-indigo-600/15 active:scale-[0.98] transition-all cursor-pointer border-none shrink-0"
                      >
                         <span className="!text-white">הוסף "{inputVal}" חדש</span>
                         <Plus className="w-5 h-5 !text-white" />
                      </button>
                   )}

                   {suggestions.map((p) => {
                      const inList = alreadyInList(p.name);
                      return (
                         <button
                           key={p.id}
                           onClick={() => { 
                             if (!inList) { 
                               const finalQty = addUnit === "יחידות" ? addQty : `${addQty} ${addUnit}`;
                               addProduct(p.name, p.category, addUrgent ? "urgent" : "normal", finalQty);
                               setInputVal(""); 
                               setOverlayOpen(false); 
                               setAddUrgent(false);
                             } 
                           }}
                           disabled={inList}
                           className={`w-full flex items-center justify-between px-5 py-3 rounded-xl border border-[var(--border)] transition-all active:scale-[0.98] cursor-pointer text-right shrink-0 ${
                             inList ? "opacity-35 bg-transparent cursor-not-allowed border-none" : "bg-[var(--foreground)]/[0.02] hover:border-indigo-500/50 hover:bg-[var(--foreground)]/[0.04]"
                           }`}
                         >
                            <div className="flex flex-col items-start gap-0.5">
                               <span className="text-sm font-bold">{p.name}</span>
                               <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${CAT_COLOR[p.category] || CAT_COLOR["כללי"]}`}>
                                  {p.category}
                               </span>
                            </div>
                            {inList ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Plus className="w-4 h-4 text-[var(--muted)]" />}
                         </button>
                      );
                   })}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Enhanced Edit Item Modal */}
        <AnimatePresence>
          {editItem && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setEditItem(null)}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-8 shadow-2xl text-right" dir="rtl">
                
                <h2 className="text-xl font-black mb-6 flex items-center gap-2">
                   <Edit3 className="w-5 h-5 text-indigo-500" /> עריכת פריט
                </h2>
                
                <div className="space-y-5 text-right">
                  <div>
                    <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">שם המוצר</label>
                    <input 
                      type="text" 
                      value={editName} 
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-indigo-500/50" 
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">כמות</label>
                      <input 
                        type="text" 
                        value={editQty} 
                        onChange={(e) => setEditQty(e.target.value)}
                        placeholder="למשל: 1, 2.5, 3"
                        className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-indigo-500/50" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">עדיפות</label>
                      <select 
                        value={editPriority} 
                        onChange={(e) => setEditPriority(e.target.value as any)}
                        className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-indigo-500/50"
                      >
                        <option value="normal">רגיל</option>
                        <option value="urgent">דחוף 🔥</option>
                      </select>
                    </div>
                  </div>



                  <div>
                    <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">הערות / הנחיות מיוחדות</label>
                    <textarea 
                      value={editNotes} 
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="סוג ספציפי, צבע, או תחליף מועדף..."
                      rows={2}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-indigo-500/50 resize-none placeholder:text-[var(--muted)]/40" 
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">קטגוריה</label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto no-scrollbar border border-[var(--border)] p-2 rounded-xl bg-[var(--background)]/50">
                      {categories.map(c => (
                        <button 
                          key={c} 
                          type="button"
                          onClick={() => setEditCat(c)} 
                          className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                            editCat === c 
                              ? "bg-indigo-600 border-indigo-500 !text-white shadow-md shadow-indigo-500/10" 
                              : "bg-[var(--background)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3 mt-8">
                  <button 
                    onClick={handleUpdateItem} 
                    className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 !text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98]"
                  >
                    שמור שינויים
                  </button>
                  <button 
                    onClick={() => setEditItem(null)} 
                    className="flex-1 py-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--muted)] text-sm font-black rounded-2xl transition-all"
                  >
                    ביטול
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Category Management Dialog */}
        <AnimatePresence>
          {isAddingCat && (
             <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddingCat(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} 
                  className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl text-right flex flex-col max-h-[85vh] overflow-hidden" dir="rtl">
                   
                   <div className="flex items-center justify-between mb-6 shrink-0">
                      <h3 className="text-xl font-black flex items-center gap-2">
                        <Edit3 className="w-5 h-5 text-indigo-500" />
                        ניהול קטגוריות רכש
                      </h3>
                      <button onClick={() => setIsAddingCat(false)} className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)]">
                        <X className="w-5 h-5" />
                      </button>
                   </div>

                   {/* Add new category form */}
                   <div className="mb-6 shrink-0">
                      <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">הוסף קטגוריה חדשה</label>
                      <div className="flex gap-2">
                         <input 
                            type="text" 
                            value={newCatName} 
                            onChange={e => setNewCatName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleAddCategory()}
                            placeholder="שם הקטגוריה..."
                            className="flex-grow bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-xs font-bold focus:border-indigo-500 outline-none text-[var(--foreground)]"
                         />
                         <button 
                            onClick={handleAddCategory}
                            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 !text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 shrink-0 shadow-md shadow-indigo-600/10 active:scale-95 border-none"
                         >
                            <Plus className="w-4 h-4 text-white" />
                            <span>הוסף</span>
                         </button>
                      </div>
                   </div>

                   {/* List of current categories */}
                   <div className="flex-grow overflow-y-auto divide-y divide-[var(--border)]/60 pr-1 no-scrollbar mb-6">
                      <span className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-2 block shrink-0">קטגוריות קיימות:</span>
                      <div className="space-y-1">
                         {categories.map(cat => {
                            const isEditing = editingCatName === cat;
                            return (
                              <div key={cat} className="py-2.5 flex items-center justify-between gap-3">
                                 {isEditing ? (
                                   <div className="flex items-center gap-2 flex-grow">
                                      <input
                                        type="text"
                                        value={editingCatNewValue}
                                        onChange={e => setEditingCatNewValue(e.target.value)}
                                        className="flex-grow bg-[var(--background)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:border-indigo-500/50 text-[var(--foreground)]"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") handleRenameCategory(cat, editingCatNewValue);
                                          else if (e.key === "Escape") setEditingCatName(null);
                                        }}
                                      />
                                      <button
                                        onClick={() => handleRenameCategory(cat, editingCatNewValue)}
                                        className="p-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                                        title="שמור שם"
                                      >
                                        <Check className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => setEditingCatName(null)}
                                        className="p-1.5 bg-[var(--foreground)]/5 text-[var(--muted)] hover:bg-[var(--foreground)]/10 border border-[var(--border)] rounded-lg transition-colors cursor-pointer"
                                        title="ביטול"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                   </div>
                                 ) : (
                                   <>
                                      <span className="text-xs font-bold text-[var(--foreground)]">{cat}</span>
                                      <div className="flex items-center gap-1 shrink-0">
                                         <button
                                           onClick={() => {
                                             setEditingCatName(cat);
                                             setEditingCatNewValue(cat);
                                           }}
                                           className="p-1.5 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-indigo-500 border border-[var(--border)] rounded-lg transition-all cursor-pointer"
                                           title="ערוך קטגוריה"
                                         >
                                           <Edit3 className="w-3.5 h-3.5" />
                                         </button>
                                         <button
                                           onClick={() => handleDeleteCategory(cat)}
                                           className="p-1.5 bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 border border-rose-500/10 rounded-lg transition-all cursor-pointer"
                                           title="מחק קטגוריה"
                                         >
                                           <Trash2 className="w-3.5 h-3.5" />
                                         </button>
                                      </div>
                                   </>
                                 )}
                              </div>
                            );
                         })}
                      </div>
                   </div>

                   <button
                     onClick={() => setIsAddingCat(false)}
                     className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 !text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] shrink-0 cursor-pointer border-none"
                   >
                     סגור
                   </button>
                </motion.div>
             </div>
          )}
         </AnimatePresence>

        {/* Recurring List Edit Modal */}
        <AnimatePresence>
          {isEditingRecurring && (
             <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsEditingRecurring(false)} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                  className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl text-right flex flex-col max-h-[90vh] overflow-hidden" dir="rtl">
                   
                   <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-black flex items-center gap-2">
                        <Settings className="w-5 h-5 text-indigo-500" />
                        עריכת רשימה קבועה (שבועית)
                      </h3>
                      <button onClick={() => setIsEditingRecurring(false)} className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)]">
                        <X className="w-5 h-5" />
                      </button>
                   </div>

                   {/* Add product to recurring list section */}
                   <div className="mb-6 relative shrink-0">
                      <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">הוסף מוצר לרשימה הקבועה</label>
                      <div className="relative">
                         <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                         <input
                            type="text"
                            value={recurringSearchVal}
                            onChange={e => setRecurringSearchVal(e.target.value)}
                            placeholder="חיפוש או הוספת מוצר..."
                            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl py-3 pr-11 pl-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                         />
                      </div>

                      {/* Suggestions list */}
                      {recurringSearchVal.trim() && (
                        <div className="absolute z-20 left-0 right-0 mt-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl max-h-48 overflow-y-auto divide-y divide-[var(--border)]">
                          {(() => {
                            const term = recurringSearchVal.trim().toLowerCase();
                            const matches = pool.filter(p => p.name.toLowerCase().includes(term) && !p.isRecurring);
                            const hasExact = pool.some(p => p.name === recurringSearchVal.trim());
                            
                            return (
                              <>
                                {matches.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => {
                                      toggleRecurring(p.id, p.name, p.category, true);
                                      setRecurringSearchVal("");
                                    }}
                                    className="w-full text-right px-4 py-3 text-xs font-bold hover:bg-[var(--foreground)]/5 flex items-center justify-between"
                                  >
                                    <span>{p.name}</span>
                                    <span className="text-[9px] text-[var(--muted)]">{p.category}</span>
                                  </button>
                                ))}
                                {!hasExact && (
                                  <button
                                    onClick={() => {
                                      const name = recurringSearchVal.trim();
                                      const docId = name.replace(/\//g, "-");
                                      toggleRecurring(docId, name, "כללי", true);
                                      setRecurringSearchVal("");
                                    }}
                                    className="w-full text-right px-4 py-3 text-xs font-black text-indigo-500 hover:bg-[var(--foreground)]/5 flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5 text-indigo-500" />
                                    <span>צור והוסף מוצר חדש: "{recurringSearchVal.trim()}"</span>
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                   </div>

                   {/* List of current recurring products */}
                   <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/60 pr-1 no-scrollbar mb-6">
                      {pool.filter(p => p.isRecurring).length === 0 ? (
                        <div className="py-12 text-center opacity-40">
                           <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-[var(--muted)]" />
                           <p className="text-xs font-black">אין מוצרים קבועים ברשימה</p>
                        </div>
                      ) : (
                        pool.filter(p => p.isRecurring).map(p => (
                          <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-bold text-[var(--foreground)]">{p.name}</span>
                              <span className="mr-2 text-[9px] font-black bg-[var(--foreground)]/5 text-[var(--muted)] px-1.5 py-0.5 rounded-md">{p.category}</span>
                            </div>

                            {/* Stepper & Trash */}
                            <div className="flex items-center gap-3 shrink-0">
                               <div className="flex items-center gap-1 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl p-0.5 shadow-sm">
                                 <button
                                   onClick={() => updateRecurringQuantity(p.id, p.recurringQuantity || "1", -1)}
                                   className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] transition-all"
                                 >
                                   <Minus className="w-3 h-3 stroke-[2.5]" />
                                 </button>
                                 <span className="text-xs font-black min-w-[20px] text-center">{p.recurringQuantity || "1"}</span>
                                 <button
                                   onClick={() => updateRecurringQuantity(p.id, p.recurringQuantity || "1", 1)}
                                   className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] transition-all"
                                 >
                                   <Plus className="w-3 h-3 stroke-[2.5]" />
                                 </button>
                               </div>

                               <button
                                 onClick={() => toggleRecurring(p.id, p.name, p.category, false)}
                                 className="w-8 h-8 rounded-xl bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/10 transition-all cursor-pointer"
                                 title="הסר מהרשימה הקבועה"
                               >
                                 <Trash2 className="w-4 h-4" />
                               </button>
                            </div>
                          </div>
                        ))
                      )}
                   </div>

                   <button
                     onClick={() => setIsEditingRecurring(false)}
                     className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 !text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] shrink-0 cursor-pointer"
                   >
                     סגור
                   </button>
                </motion.div>
             </div>
          )}
        </AnimatePresence>

         {/* Archive Current Session Prompt Dialog */}
         <AnimatePresence>
            {showArchivePrompt && (
               <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    onClick={() => setShowArchivePrompt(false)} 
                    className="absolute inset-0 bg-black/65 backdrop-blur-md" 
                  />
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    exit={{ opacity: 0, scale: 0.95 }} 
                    className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl text-right overflow-hidden" 
                    dir="rtl"
                  >
                     <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-l from-emerald-500 via-teal-500 to-indigo-500" />
                     
                     <div className="flex items-center gap-3 mb-4 mt-2">
                       <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                         <CheckCircle2 className="w-6 h-6" />
                       </div>
                       <div>
                         <h3 className="text-lg font-black text-[var(--foreground)]">סיום הרכישה הנוכחית</h3>
                         <p className="text-xs text-[var(--muted)] font-bold">כל המוצרים סומנו כנקנו!</p>
                       </div>
                     </div>

                     <p className="text-sm font-bold text-[var(--foreground)]/80 mb-6 leading-relaxed">
                       האם ברצונך להעביר את {sessionPurchased.length} המוצרים שנקנו לארכיון הרכישות הכללי ולנקות את הרשימה הפעילה?
                     </p>

                     <div className="flex gap-3">
                        <button 
                          onClick={archiveCurrentSession} 
                          className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 !text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                        >
                          כן, ארכב ונקה
                        </button>
                        <button 
                          onClick={() => setShowArchivePrompt(false)} 
                          className="flex-1 py-4 bg-[var(--foreground)]/5 text-[var(--muted)] hover:bg-[var(--foreground)]/10 rounded-2xl font-black text-sm active:scale-95 transition-all"
                        >
                          לא כרגע
                        </button>
                     </div>
                  </motion.div>
               </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 max-w-md w-[90%] border backdrop-blur-md ${
                  toast.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                }`}
              >
                {toast.type === "success" ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                ) : (
                  <Flame className="w-5 h-5 shrink-0 text-amber-600 animate-pulse" />
                )}
                <span className="text-xs font-black leading-relaxed">{toast.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions Menu Drawer / Modal (Mobile & Desktop) */}
          <AnimatePresence>
            {actionsMenuOpen && (
              <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-4">
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }} 
                  onClick={() => setActionsMenuOpen(false)} 
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                />
                <motion.div 
                  initial={{ y: "100%", scale: 1 }} 
                  animate={{ y: 0, scale: 1 }} 
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="relative bg-[var(--surface)] border-t md:border border-[var(--border)] rounded-t-[2rem] md:rounded-[2.5rem] w-full max-w-md p-6 md:p-8 shadow-2xl text-right flex flex-col max-h-[85vh] overflow-hidden z-10" 
                  dir="rtl"
                >
                  <div className="w-12 h-1.5 bg-[var(--border)] rounded-full mx-auto mb-5 md:hidden" />
                  
                  <div className="flex items-center justify-between mb-6 shrink-0">
                    <h3 className="text-xl font-black flex items-center gap-2">
                      <Settings className="w-5 h-5 text-indigo-500" />
                      <span>פעולות ניהול וייצוא</span>
                    </h3>
                    <button onClick={() => setActionsMenuOpen(false)} className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)]">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-3 overflow-y-auto no-scrollbar pb-6">
                    {listType === "supermarket" && (
                      <>
                        <button
                          onClick={() => {
                            setActionsMenuOpen(false);
                            setIsEditingRecurring(true);
                          }}
                          className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none"
                        >
                          <Settings className="w-5 h-5 text-indigo-500" />
                          <span>עריכת רשימה קבועה (שבועית)</span>
                        </button>

                        <button
                          onClick={() => {
                            setActionsMenuOpen(false);
                            generateRecurringList();
                          }}
                          className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none"
                        >
                          <Download className="w-5 h-5 text-purple-500" />
                          <span>ייצוא רשימה קבועה ל-Word</span>
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => {
                        setActionsMenuOpen(false);
                        exportProcurementList();
                      }}
                      className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none"
                    >
                      <Download className="w-5 h-5 text-blue-500" />
                      <span>ייצוא רשימת רכש ל-Word</span>
                    </button>

                    <button
                      onClick={() => {
                        setActionsMenuOpen(false);
                        exportOngoingList();
                      }}
                      className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none"
                    >
                      <Download className="w-5 h-5 text-emerald-500" />
                      <span>ייצוא רשימה שוטפת ל-Word</span>
                    </button>

                    {isAdmin && (
                      <button
                        onClick={() => {
                          setActionsMenuOpen(false);
                          exportXlsx();
                        }}
                        className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none"
                      >
                        <Download className="w-5 h-5 text-amber-500" />
                        <span>ייצוא ארכיון לאקסל (Excel)</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setActionsMenuOpen(false);
                        setIsAddingCat(true);
                      }}
                      className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none"
                    >
                      <Edit3 className="w-5 h-5 text-indigo-500" />
                      <span>ניהול קטגוריות רכש</span>
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

const formatQuantityAndUnit = (qtyStr: string) => {
  if (!qtyStr) return { qty: "1.0", unit: "יח׳" };
  const trimmed = qtyStr.trim();
  const match = trimmed.match(/^([\d\.]+)\s*(.*)$/);
  if (match) {
    const qty = match[1];
    let unit = match[2] || "יח׳";
    if (unit === "יחידות") unit = "יח׳";
    return { qty, unit };
  }
  return { qty: qtyStr, unit: "יח׳" };
};

function CategorySection({ title, items, onStatus, onEdit, onUpdateQuantity, canPurchase, currentUser, activeCategory }: {
  title: string, items: ShoppingRequest[], onStatus: any, onEdit: any, onUpdateQuantity: any, canPurchase: boolean, currentUser: any, activeCategory: string | null
}) {
  return (
    <div className="mb-6 last:mb-0 px-4 md:px-0">
      <div className="flex items-center justify-between py-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-5 rounded-full bg-indigo-600 shadow-sm shadow-indigo-600/30" />
          <h3 className="text-sm font-extrabold text-[var(--foreground)]">
            {title}
          </h3>
          <span className="text-[10px] font-bold bg-[var(--foreground)]/5 px-2 py-0.5 rounded-full text-[var(--muted)]">
            {items.length}
          </span>
        </div>
      </div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm divide-y divide-[var(--border)]/55">
        {items.map(item => (
          <MobileItemRow 
            key={item.id} 
            item={item} 
            onStatus={onStatus} 
            onEdit={onEdit} 
            onUpdateQuantity={onUpdateQuantity}
            canPurchase={canPurchase}
            currentUser={currentUser}
            activeCategory={activeCategory}
          />
        ))}
      </div>
    </div>
  );
}

function MobileItemRow({ item, onStatus, onEdit, onUpdateQuantity, canPurchase, currentUser, activeCategory }: {
  item: ShoppingRequest, onStatus: any, onEdit: any, onUpdateQuantity: any, canPurchase: boolean, currentUser: any, activeCategory: string | null
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isApproved = item.status === "approved" || item.status === "pending";
  const isUrgent   = item.priority === "urgent";
  const isOwnItem  = item.requestedBy === currentUser?.uid;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`האם ברצונך למחוק את "${item.name}" מהרשימה?`)) {
      onStatus(item.id, "deleted");
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isApproved && canPurchase) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(15);
      }
      onStatus(item.id, "purchased");
    }
  };

  return (
    <motion.div
      layout
      onClick={() => setIsExpanded(!isExpanded)}
      className={`group relative flex flex-col px-3 py-2 bg-[var(--surface)] even:bg-[var(--foreground)]/[0.012] transition-all cursor-pointer ${
        isExpanded ? "bg-[var(--foreground)]/[0.025]! ring-2 ring-indigo-500/20" : "hover:bg-[var(--foreground)]/[0.01]"
      } ${
        isUrgent 
          ? "bg-gradient-to-l from-rose-500/[0.02] to-transparent border-r-4 border-r-rose-500 pr-2.5" 
          : ""
      }`}
    >
      {/* Upper Row: Main Information & Checkbox */}
      <div className="flex items-center justify-between gap-2.5 w-full">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Custom Checkbox/Action Square - rounded-lg */}
          <button
            onClick={handleCheckboxClick}
            disabled={!canPurchase}
            className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all shrink-0 active:scale-90 cursor-pointer ${
              isApproved
                ? canPurchase
                  ? "border-[var(--muted)]/50 hover:border-indigo-500 hover:bg-indigo-500/5 text-indigo-500"
                  : "border-[var(--border)] text-[var(--muted)]/20 cursor-not-allowed"
                : "border-indigo-500 bg-indigo-500 text-white"
            }`}
          >
            <Check className="w-3.5 h-3.5 opacity-0 hover:opacity-100 transition-opacity" />
          </button>

          {/* Item details */}
          <div className="min-w-0 flex-1 text-right">
            <div className="flex items-center gap-1.5 justify-start flex-wrap">
              <span className="text-xs font-bold text-[var(--foreground)] leading-tight whitespace-normal">
                {item.name}
              </span>
              
              {isUrgent && (
                <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">דחוף 🔥</span>
              )}

              {item.notes && (
                <span className="text-[10px] text-amber-500" title={item.notes}>💬</span>
              )}
            </div>
          </div>
        </div>

        {/* Left Side: Quantity and Expand indicator */}
        <div className="flex items-center gap-3 shrink-0">
          {(() => {
            const { qty, unit } = formatQuantityAndUnit(item.quantity);
            return (
              <div className="flex flex-col items-center justify-center text-left min-w-[32px] shrink-0">
                <span className="text-sm font-black text-[var(--foreground)] leading-tight">
                  {qty}
                </span>
                <span className="text-[10px] text-[var(--muted)] font-extrabold mt-0.5 leading-none">
                  {unit}
                </span>
              </div>
            );
          })()}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-[var(--muted)]/40"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.div>
        </div>
      </div>

      {/* Expanded details container */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 10 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden w-full border-t border-[var(--border)]/40 pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Requester name & Category info when expanded */}
            <div className="grid grid-cols-2 gap-2 mb-3.5 p-3 rounded-xl bg-[var(--foreground)]/[0.02] border border-[var(--border)]/40 text-xs text-[var(--muted)]">
              <div>מבקש/ת: <span className="font-bold text-[var(--foreground)]">{item.requestedByName}</span></div>
              <div>קטגוריה: <span className="font-bold text-[var(--foreground)]">{item.category}</span></div>
              {item.notes && (
                <div className="col-span-2 border-t border-[var(--border)]/30 pt-2 mt-1">
                  <span className="font-bold text-[var(--foreground)]/70">הערות:</span> <span className="text-[var(--foreground)]/90">{item.notes}</span>
                </div>
              )}
            </div>

            {/* Action buttons and Stepper */}
            <div className="flex items-center justify-between gap-2.5 flex-wrap">
              {/* Inline Quantity Stepper */}
              <div className="flex items-center gap-1.5 bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-xl p-1 shadow-sm shrink-0">
                <button
                  onClick={() => onUpdateQuantity(item.id, item.quantity || "1", -1)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] transition-all active:scale-75 shadow-sm cursor-pointer"
                  title="הפחת כמות"
                >
                  <Minus className="w-3.5 h-3.5 stroke-[3]" />
                </button>
                <div className="min-w-[36px] text-center px-1">
                  <span className="text-sm font-black text-[var(--foreground)]">{item.quantity || "1"}</span>
                  <span className="text-[9px] text-[var(--muted)] block -mt-1 font-bold">יח׳</span>
                </div>
                <button
                  onClick={() => onUpdateQuantity(item.id, item.quantity || "1", 1)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] transition-all active:scale-75 shadow-sm cursor-pointer"
                  title="הוסף כמות"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 flex-grow justify-end">
                <button
                  onClick={() => onEdit(item)}
                  className="px-3 py-2 rounded-xl flex items-center justify-center gap-1 bg-[var(--foreground)]/[0.04] hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] transition-all active:scale-95 border border-[var(--border)] text-xs font-bold cursor-pointer"
                  title="ערוך מוצר"
                >
                  <Edit3 className="w-3.5 h-3.5" /> עריכה
                </button>

                <button
                  onClick={handleDelete}
                  className="px-3 py-2 rounded-xl flex items-center justify-center gap-1 bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 border border-rose-500/10 transition-all active:scale-95 text-xs font-bold cursor-pointer"
                  title="מחק מהרשימה"
                >
                  <Trash2 className="w-3.5 h-3.5" /> מחיקה
                </button>

                {isApproved && canPurchase && (
                  <button
                    onClick={() => onStatus(item.id, "purchased")}
                    className="bg-indigo-600 hover:bg-indigo-500 !text-white rounded-xl px-4.5 py-2 text-xs font-black transition-all flex items-center justify-center gap-1 active:scale-95 shadow-md shadow-indigo-600/15 cursor-pointer border-none"
                  >
                    <ShoppingCart className="w-3.5 h-3.5 !text-white" /> קנה
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PurchasedRow({ item, onStatus }: { item: ShoppingRequest, onStatus: any }) {
  const handleDelete = () => {
    if (confirm(`האם ברצונך למחוק את "${item.name}" לחלוטין מסל הקניות?`)) {
      onStatus(item.id, "deleted");
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-between gap-4 px-6 py-3.5 bg-[var(--surface)]/90 backdrop-blur-sm border-b border-[var(--border)] last:border-0"
    >
      <div className="flex-1 min-w-0">
        <span className="text-sm font-bold text-[var(--muted)] line-through decoration-2 decoration-rose-500/40">
          {item.name}
        </span>
        <div className="text-[10px] text-[var(--muted)]/60 font-semibold mt-0.5">
          נרכש • ביקש/ה {item.requestedByName}
        </div>
      </div>
      
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs font-black text-[var(--muted)] bg-[var(--foreground)]/5 px-2 py-1 rounded-lg">
          {item.quantity || "1"} יח׳
        </span>
        
        <button
          onClick={() => onStatus(item.id, "approved")}
          className="w-8 h-8 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 flex items-center justify-center shadow-sm transition-all active:scale-75 border border-amber-500/20"
          title="החזר לרשימה הפעילה"
        >
          <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>

        <button
          onClick={handleDelete}
          className="w-8 h-8 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 flex items-center justify-center shadow-sm transition-all active:scale-75 border border-rose-500/20"
          title="מחק לחלוטין מהקניות"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}