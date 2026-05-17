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
  Edit3, RotateCcw, Package, ShoppingBag, Barcode, ScanLine, Filter 
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { sendPush } from "@/lib/notify";

interface ShoppingRequest {
  id: string;
  name: string;
  category: string;
  quantity: string;
  status: "pending" | "approved" | "purchased";
  requestedBy: string;
  requestedByName: string;
  createdAt: any;
  notes?: string;
  priority?: "low" | "normal" | "urgent";
}

interface Product { 
  id: string; 
  name: string; 
  category: string; 
}

const CAT_COLOR: Record<string, string> = {
  "גבינות ומחלבה":       "text-amber-500 bg-amber-500/10 border border-amber-500/20",
  "בשר ודגים":            "text-rose-500 bg-rose-500/10 border border-rose-500/20",
  "פירות וירקות":         "text-emerald-500 bg-emerald-500/10 border border-emerald-500/20",
  "לחם ומאפים":           "text-orange-500 bg-orange-500/10 border border-orange-500/20",
  "חומרי ניקוי":          "text-cyan-500 bg-cyan-500/10 border border-cyan-500/20",
  "מוצרי נייר וחד פעמי": "text-indigo-500 bg-indigo-500/10 border border-indigo-500/20",
  "טואלטיקה והיגיינה":   "text-emerald-500 bg-emerald-500/10 border border-emerald-500/20", // Gentle pastel emerald green
  "שימורים ובישול":       "text-slate-500 bg-slate-500/10 border border-slate-500/20",
  "קפואים":               "text-sky-500 bg-sky-500/10 border border-sky-500/20",
  "כללי":                 "text-slate-400 bg-slate-400/10 border border-slate-400/20",
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

  // Add-bar state
  const [inputVal, setInputVal]     = useState("");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [addUrgent, setAddUrgent]   = useState(false);
  const [justAdded, setJustAdded]   = useState<string | null>(null);

  // Quick edit modal state
  const [editItem, setEditItem]     = useState<ShoppingRequest | null>(null);
  const [editCat,  setEditCat]      = useState("");
  const [editName, setEditName]     = useState("");
  const [editQty,  setEditQty]      = useState("");
  const [editNotes, setEditNotes]   = useState("");
  const [editPriority, setEditPriority] = useState<"low" | "normal" | "urgent">("normal");

  const [newCatName, setNewCatName] = useState("");
  const [isAddingCat, setIsAddingCat] = useState(false);

  // Category Filter State
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [categories, setCategories] = useState([
    "גבינות ומחלבה","לחם ומאפים","חומרי ניקוי",
    "מוצרי נייר וחד פעמי","שימורים ובישול","פירות וירקות",
    "טואלטיקה והיגיינה","בשר ודגים","קפואים","כללי",
  ]);

  const inputRef       = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const pendingNotificationsRef = useRef<Record<string, {
    userId: string;
    names: string[];
    timeoutId: NodeJS.Timeout;
  }>>({});

  const canApprove  = role === "manager" || role === "admin" || isAdmin || isManager;
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

  // Debounced push notification for single-item approvals to avoid spamming the requester
  const queueApprovalNotification = useCallback((userId: string, itemName: string) => {
    if (!userId || userId === user?.uid) return;

    const queue = pendingNotificationsRef.current;
    if (queue[userId]) {
      if (!queue[userId].names.includes(itemName)) {
        queue[userId].names.push(itemName);
      }
      clearTimeout(queue[userId].timeoutId);
    } else {
      queue[userId] = {
        userId,
        names: [itemName],
        timeoutId: null as any,
      };
    }

    queue[userId].timeoutId = setTimeout(() => {
      const data = queue[userId];
      if (data) {
        const listStr = data.names.join(", ");
        const count = data.names.length;
        
        sendPush({
          userId: data.userId,
          title: count === 1 ? "✅ בקשת רכש אושרה" : `✅ ${count} בקשות רכש אושרו`,
          body: count === 1 
            ? `"${data.names[0]}" אושרה ותצא לרכישה` 
            : `הבקשות הבאות אושרו: ${listStr}`,
          link: "/shopping",
        });
        
        delete queue[userId];
      }
    }, 4000); // 4 seconds debounce window
  }, [user]);

  const changeStatus = useCallback(async (
    id: string,
    next: "pending" | "approved" | "purchased" | "deleted",
    extra: Record<string, any> = {}
  ) => {
    const req = requests.find((r) => r.id === id);
    try {
      if (next === "deleted") {
        await deleteDoc(doc(db, "shopping_requests", id));
      } else {
        await updateDoc(doc(db, "shopping_requests", id), {
          status: next, updatedAt: new Date(), updatedBy: user?.uid, ...extra,
        });

        if (next === "approved" && req?.requestedBy && req.requestedBy !== user?.uid) {
          queueApprovalNotification(req.requestedBy, req.name);
        }

        if (next === "purchased") {
          const remainingApproved = requests.filter((r) => r.status === "approved" && r.id !== id);
          if (remainingApproved.length === 0) {
            // Notify managers and logistics
            sendPush({
              role: ["admin", "manager", "logistics"],
              title: "🛍️ הקניות הסתיימו!",
              body: "כל הפריטים המאושרים נרכשו בהצלחה",
              link: "/shopping",
            });

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
  }, [requests, user, queueApprovalNotification]);

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

  const approveAll = async () => {
    const pendingItems = requests.filter((r) => r.status === "pending");
    if (pendingItems.length === 0) return;
    await Promise.all(
      pendingItems.map((r) =>
        updateDoc(doc(db, "shopping_requests", r.id), {
          status: "approved", updatedAt: new Date(), updatedBy: user?.uid,
        })
      )
    );
    sendPush({
      role: ["logistics", "manager"],
      title: "🛒 רשימת קניות מוכנה",
      body: `${pendingItems.length} פריטים אושרו ומחכים לרכישה`,
      link: "/shopping",
    });
  };

  const addProduct = async (name: string, category = "כללי", priority: "normal" | "urgent" = "normal") => {
    const dup = requests.some((r) => r.name === name && r.status !== "purchased");
    if (dup) { flash(pool.find((p) => p.name === name)?.id ?? "dup"); return; }
    const docId = name.replace(/\//g, "-");
    try { await setDoc(doc(db, "product_pool", docId), { name, category }, { merge: true }); } catch { /* ignore pool write fail for non-managers */ }
    await addDoc(collection(db, "shopping_requests"), {
      name, category, quantity: "1", notes: "", priority, status: "pending",
      requestedBy: user?.uid, requestedByName: user?.displayName || user?.email || "משתמש",
      createdAt: new Date(),
    });
    if (priority === "urgent") {
      sendPush({
        role: ["admin", "manager", "logistics"],
        title: "🔥 בקשת רכש דחופה",
        body: `${user?.displayName || "משתמש"}: ${name}`,
        link: "/shopping",
      });
    }
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
    setIsAddingCat(false);
    try {
      await setDoc(doc(db, "settings", "shopping"), { categories: next }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const handleUpdateItem = async () => {
    if (!editItem) return;
    try {
      await updateDoc(doc(db, "shopping_requests", editItem.id), {
        name: editName,
        category: editCat,
        quantity: editQty,
        notes: editNotes,
        priority: editPriority,
      });
      const docId = editName.replace(/\//g, "-");
      await setDoc(doc(db, "product_pool", docId), {
        name: editName,
        category: editCat,
      }, { merge: true });
      setEditItem(null);
      fetchPool();
    } catch (e) { console.error(e); }
  };

  const handleAddInput = async () => {
    const name = inputVal.trim();
    if (!name) return;
    const match = pool.find((p) => p.name === name);
    await addProduct(name, match?.category ?? "כללי", addUrgent ? "urgent" : "normal");
    setInputVal("");
    setOverlayOpen(false);
    setAddUrgent(false);
    inputRef.current?.blur();
  };

  const exportXlsx = () => {
    const data = requests.filter((r) => r.status === "purchased").map((r) => {
      const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      return { תאריך: d.toLocaleDateString("he-IL"), מוצר: r.name, קטגוריה: r.category, כמות: r.quantity || "1", מבקש: r.requestedByName };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ארכיון רכש");
    XLSX.writeFile(wb, `ארכיון_רכש_${new Date().toLocaleDateString("he-IL").replace(/\//g, "-")}.xlsx`);
  };

  const pending  = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const purchased = requests.filter((r) => r.status === "purchased");

  const suggestions = pool.filter((p) =>
    inputVal.trim() &&
    (p.name.includes(inputVal.trim()) || p.category.includes(inputVal.trim()))
  ).slice(0, 20);

  const exactMatch = pool.some((p) => p.name === inputVal.trim());
  const alreadyInList = (name: string) => requests.some((r) => r.name === name && r.status !== "purchased");

  const archiveByDate = purchased.reduce((acc, item) => {
    const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
    const key = d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {} as Record<string, ShoppingRequest[]>);

  return (
    <RoleGuard allowedRoles={["admin","manager","instructor","social_worker","employee","logistics"]} redirectTo="/">
      <div dir="rtl" className="flex flex-col h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden font-sans">
        
        {/* ── Mobile Action Bar (Top) ── */}
        <div className="md:hidden pt-4 pb-4 px-4 bg-[var(--background)] border-b border-[var(--border)] z-40 shrink-0">
           <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                 <button onClick={() => router.push("/")} className="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] active:scale-95 transition-all">
                    <ArrowRight className="w-5 h-5 text-[var(--muted)]" />
                 </button>
                 <h1 className="text-lg font-black flex items-center gap-2">
                    <span className="text-xl">💗🥒</span> קניות
                 </h1>
              </div>
              <div className="flex items-center gap-2">
                 <button 
                   onClick={() => setView(view === "list" ? "archive" : "list")}
                   className="px-4 py-2 rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] text-xs font-black transition-all hover:bg-[var(--foreground)]/10"
                 >
                    {view === "list" ? "ארכיון" : "רשימה"}
                 </button>
                 {canApprove && pending.length > 0 && (
                   <button 
                     onClick={approveAll}
                     className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all shadow-sm"
                   >
                     אשר הכל ({pending.length})
                   </button>
                 )}
              </div>
           </div>

           <div className="relative group">
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-[var(--muted)]/40 px-2 border-l border-[var(--border)] ml-3">
                 <Plus className="w-4 h-4" />
                 <Search className="w-4 h-4" />
              </div>
              <input
                ref={mobileInputRef}
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onFocus={() => setOverlayOpen(true)}
                placeholder="הוסף מוצר..."
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl py-3.5 pr-20 pl-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-[var(--muted)]/50 shadow-sm"
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
                 onFocus={() => setOverlayOpen(true)}
                 placeholder="חיפוש או הוספת מוצר..."
                 className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl py-2.5 pr-11 pl-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
               />
            </div>
          </div>
          <div className="flex items-center gap-4">
             {canApprove && pending.length > 0 && (
                <button 
                   onClick={approveAll} 
                   className="px-6 py-2.5 rounded-2xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/10 flex items-center gap-1.5"
                >
                   <Check className="w-4 h-4 stroke-[3]" /> אשר את כל הממתינים ({pending.length})
                </button>
             )}
             <button onClick={() => setView(view === "list" ? "archive" : "list")} className="px-6 py-2.5 rounded-2xl bg-[var(--foreground)]/5 border border-[var(--border)] text-xs font-black hover:bg-[var(--foreground)]/10 transition-all">
                {view === "list" ? "ארכיון קניות" : "רשימה פעילה"}
             </button>
             {isAdmin && <button onClick={exportXlsx} title="ייצוא לאקסל" className="p-2.5 rounded-2xl bg-[var(--foreground)]/5 border border-[var(--border)] hover:bg-[var(--foreground)]/10 transition-all"><Download className="w-5 h-5 text-[var(--muted)]" /></button>}
          </div>
        </header>

        {/* ── Category Scrolling Filters Bar (Visible in list view) ── */}
        {view === "list" && !loading && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-3 px-4 bg-[var(--surface)]/30 border-b border-[var(--border)] shrink-0 scroll-smooth">
            <button 
              onClick={() => setActiveCategory(null)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 border ${
                activeCategory === null 
                  ? "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)] shadow-sm" 
                  : "bg-transparent text-[var(--muted)] border-[var(--border)] hover:text-[var(--foreground)]"
              }`}
            >
              הכל ({[...pending, ...approved].length})
            </button>
            {categories.map(cat => {
              const count = [...pending, ...approved].filter(r => r.category === cat).length;
              if (count === 0) return null;
              const cls = CAT_COLOR[cat] ?? CAT_COLOR["כללי"];
              const isSelected = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                    isSelected 
                      ? `${cls} ring-2 ring-current/40 shadow-sm`
                      : "bg-transparent text-[var(--muted)] border border-[var(--border)] hover:text-[var(--foreground)]"
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
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : view === "list" ? (
                <LayoutGroup>
                   {categories.map(cat => {
                     if (activeCategory !== null && activeCategory !== cat) return null;
                     const catItems = [...pending, ...approved].filter(r => r.category === cat);
                     if (catItems.length === 0) return null;
                     return (
                        <CategorySection 
                           key={cat}
                           title={cat}
                           items={catItems}
                           onStatus={changeStatus}
                           onEdit={setEditItem}
                           onUpdateQuantity={updateQuantity}
                           canApprove={canApprove}
                           canPurchase={canPurchase}
                           currentUser={user}
                        />
                     );
                   })}
                   
                   {/* Fallback for items with unknown categories */}
                   {(activeCategory === null || activeCategory === "אחר") && 
                    [...pending, ...approved].some(r => !categories.includes(r.category)) && (
                      <CategorySection 
                         title="אחר"
                         items={[...pending, ...approved].filter(r => !categories.includes(r.category))}
                         onStatus={changeStatus}
                         onEdit={setEditItem}
                         onUpdateQuantity={updateQuantity}
                         canApprove={canApprove}
                         canPurchase={canPurchase}
                         currentUser={user}
                      />
                   )}

                   {pending.length === 0 && approved.length === 0 && (
                      <div className="py-32 px-12 text-center opacity-30 flex flex-col items-center gap-4">
                         <div className="w-20 h-20 rounded-[2.5rem] bg-[var(--foreground)]/5 flex items-center justify-center">
                            <ShoppingBag className="w-10 h-10" />
                         </div>
                         <p className="text-sm font-black uppercase tracking-[0.2em]">הרשימה ריקה</p>
                      </div>
                   )}
                </LayoutGroup>
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

          {/* ── Cart / Purchased Drawer (Sticky Bottom) ── */}
          {view === "list" && purchased.length > 0 && (
             <div className="fixed bottom-0 left-0 right-0 z-[45]">
                <div className="max-w-[800px] mx-auto">
                   <div className="bg-[var(--surface)]/95 backdrop-blur-xl border-t border-[var(--border)] shadow-[0_-20px_40px_-15px_rgba(0,0,0,0.2)] rounded-t-[2.5rem] overflow-hidden">
                      <div className="px-6 py-4 flex items-center justify-between bg-[var(--foreground)]/5 border-b border-[var(--border)]">
                         <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20 animate-pulse">
                               <ShoppingCart className="w-4 h-4" />
                            </div>
                            <h3 className="text-sm font-black uppercase tracking-widest">סל קניות ({purchased.length})</h3>
                         </div>
                         <div className="flex items-center gap-4">
                            <button 
                               onClick={() => {
                                 if (confirm("האם למחוק לחלוטין את כל סל הקניות?")) {
                                   purchased.forEach(item => changeStatus(item.id, "deleted"));
                                 }
                               }}
                               className="flex items-center gap-2 text-[10px] font-black text-rose-500 uppercase tracking-widest hover:bg-rose-500/10 px-3 py-1.5 rounded-lg transition-all"
                            >
                               <Trash2 className="w-3.5 h-3.5" /> רוקן סל
                            </button>
                            <div className="h-4 w-px bg-[var(--border)]" />
                            <button 
                               onClick={() => purchased.forEach(item => changeStatus(item.id, "approved"))}
                               className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest flex items-center gap-2 hover:bg-[var(--foreground)]/5 px-3 py-1.5 rounded-lg transition-all"
                            >
                               <RotateCcw className="w-3.5 h-3.5" /> החזר הכל לרשימה
                            </button>
                         </div>
                      </div>
                      <div className="max-h-[25vh] overflow-y-auto no-scrollbar pb-6 divide-y divide-[var(--border)]">
                         <LayoutGroup>
                            {purchased.map(item => (
                               <PurchasedRow key={item.id} item={item} onStatus={changeStatus} />
                            ))}
                         </LayoutGroup>
                      </div>
                   </div>
                </div>
             </div>
          )}
        </main>

        <AnimatePresence>
          {overlayOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-[var(--background)]/85 backdrop-blur-md p-4 md:p-12 overflow-y-auto pt-24 md:pt-32"
            >
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center justify-between mb-8">
                   <h2 className="text-3xl font-black">הוסף מוצר</h2>
                   <button 
                     onClick={() => { setOverlayOpen(false); setAddUrgent(false); }} 
                     className="w-12 h-12 rounded-2xl bg-[var(--foreground)]/5 flex items-center justify-center hover:bg-[var(--foreground)]/10 transition-all border border-[var(--border)]"
                   >
                      <X className="w-6 h-6" />
                   </button>
                </div>

                <div className="relative group mb-4">
                   <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-blue-500">
                      <Plus className="w-6 h-6" />
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
                     placeholder="מה לקנות?"
                     className="w-full bg-[var(--surface)] border-2 border-[var(--border)] rounded-[2rem] py-6 pr-14 pl-6 text-xl font-bold focus:outline-none focus:border-blue-500 transition-all shadow-xl text-right placeholder:text-[var(--muted)]/40"
                   />
                </div>

                {/* Quick Priority Toggle inside Add Overlay */}
                <div className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-5 mb-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${addUrgent ? "bg-rose-500/10" : "bg-[var(--foreground)]/5"}`}>
                      <Flame className={`w-5 h-5 ${addUrgent ? "text-rose-500 animate-pulse" : "text-[var(--muted)]"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-black">בקשה דחופה 🔥</p>
                      <p className="text-[10px] text-[var(--muted)] font-semibold">יישלח פוש מיידי למנהלים על בקשה זו</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAddUrgent(!addUrgent)}
                    className={`w-12 h-7 rounded-full p-1 transition-all flex items-center ${addUrgent ? "bg-rose-500 justify-end" : "bg-[var(--foreground)]/10 justify-start"}`}
                  >
                    <motion.div layout className="w-5 h-5 rounded-full bg-white shadow-sm" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                   {!exactMatch && inputVal.trim() && (
                      <button 
                         onClick={handleAddInput}
                         className="flex items-center justify-between px-6 py-5 rounded-2xl bg-blue-600 text-white font-black text-lg shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all"
                      >
                         <span>הוסף "{inputVal}" חדש</span>
                         <Plus className="w-6 h-6" />
                      </button>
                   )}

                   {suggestions.map((p) => {
                      const inList = alreadyInList(p.name);
                      return (
                         <button
                           key={p.id}
                           onClick={() => { 
                             if (!inList) { 
                               addProduct(p.name, p.category, addUrgent ? "urgent" : "normal"); 
                               setInputVal(""); 
                               setOverlayOpen(false); 
                               setAddUrgent(false);
                             } 
                           }}
                           disabled={inList}
                           className={`flex items-center justify-between px-6 py-4 rounded-2xl border border-[var(--border)] transition-all active:scale-[0.98] ${
                             inList ? "opacity-35 bg-transparent" : "bg-[var(--surface)] hover:border-blue-500/50"
                           }`}
                         >
                            <div className="flex flex-col items-start gap-1 text-right">
                               <span className="text-lg font-bold">{p.name}</span>
                               <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${CAT_COLOR[p.category] || CAT_COLOR["כללי"]}`}>
                                  {p.category}
                               </span>
                            </div>
                            {inList ? <CheckCircle2 className="w-6 h-6 text-emerald-500 animate-bounce" /> : <Plus className="w-5 h-5 text-[var(--muted)]" />}
                         </button>
                      );
                   })}
                </div>
              </div>
            </motion.div>
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
                   <Edit3 className="w-5 h-5 text-blue-500" /> עריכת פריט
                </h2>
                
                <div className="space-y-5 text-right">
                  <div>
                    <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">שם המוצר</label>
                    <input 
                      type="text" 
                      value={editName} 
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-blue-500/50" 
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
                        className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-blue-500/50" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">עדיפות</label>
                      <select 
                        value={editPriority} 
                        onChange={(e) => setEditPriority(e.target.value as any)}
                        className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-blue-500/50"
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
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-blue-500/50 resize-none placeholder:text-[var(--muted)]/40" 
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
                              ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/10" 
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
                    className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98]"
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

        {/* Category Add Dialog */}
        <AnimatePresence>
          {isAddingCat && (
             <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddingCat(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] w-full max-w-sm p-8 shadow-2xl text-right" dir="rtl">
                   <h3 className="text-xl font-black mb-6">קטגוריה חדשה</h3>
                   <input 
                      autoFocus
                      type="text" 
                      value={newCatName} 
                      onChange={e => setNewCatName(e.target.value)}
                      placeholder="שם הקטגוריה..."
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-4 px-4 text-sm font-bold focus:border-blue-500 outline-none mb-6"
                   />
                   <div className="flex gap-3">
                      <button onClick={handleAddCategory} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-600/20 active:scale-95 transition-all">הוסף קטגוריה</button>
                      <button onClick={() => setIsAddingCat(false)} className="flex-1 py-4 bg-[var(--foreground)]/5 text-[var(--muted)] rounded-2xl font-black text-sm active:scale-95 transition-all">ביטול</button>
                   </div>
                </motion.div>
             </div>
          )}
        </AnimatePresence>
      </div>
    </RoleGuard>
  );
}

function CategorySection({ title, items, onStatus, onEdit, onUpdateQuantity, canApprove, canPurchase, currentUser }: {
  title: string, items: ShoppingRequest[], onStatus: any, onEdit: any, onUpdateQuantity: any, canApprove: boolean, canPurchase: boolean, currentUser: any
}) {
  return (
    <div className="mb-8 last:mb-0">
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface)]/50 backdrop-blur-sm sticky top-0 z-10 border-y border-[var(--border)]">
        <h3 className="text-xs font-black text-[var(--muted)] uppercase tracking-widest flex items-center gap-2">
          <Filter className="w-3 h-3 text-blue-500" />
          {title}
        </h3>
        <span className="text-[10px] font-bold bg-[var(--foreground)]/5 px-2 py-0.5 rounded-full">{items.length} פריטים</span>
      </div>
      <div className="divide-y divide-[var(--border)]/50">
        {items.map(item => (
          <MobileItemRow 
            key={item.id} 
            item={item} 
            onStatus={onStatus} 
            onEdit={onEdit} 
            onUpdateQuantity={onUpdateQuantity}
            canApprove={canApprove} 
            canPurchase={canPurchase}
            currentUser={currentUser}
          />
        ))}
      </div>
    </div>
  );
}

function MobileItemRow({ item, onStatus, onEdit, onUpdateQuantity, canApprove, canPurchase, currentUser }: {
  item: ShoppingRequest, onStatus: any, onEdit: any, onUpdateQuantity: any, canApprove: boolean, canPurchase: boolean, currentUser: any
}) {
  const isApproved = item.status === "approved";
  const isPending  = item.status === "pending";
  const isUrgent   = item.priority === "urgent";
  const isOwnItem  = item.requestedBy === currentUser?.uid;
  const canDelete  = canApprove || isOwnItem;

  const handleDelete = () => {
    if (confirm(`האם ברצונך למחוק את "${item.name}" מהרשימה?`)) {
      onStatus(item.id, "deleted");
    }
  };

  return (
    <motion.div
      layout
      className="group relative flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-4 bg-[var(--surface)] hover:bg-[var(--foreground)]/5 transition-colors border-b border-[var(--border)]/50 last:border-0"
    >
      <div className="flex-1 min-w-0 flex items-start gap-3">
        {/* Urgent Icon */}
        {isUrgent && (
          <div className="mt-1 flex-shrink-0 animate-pulse">
            <Flame className="w-5 h-5 text-rose-500 fill-rose-500" />
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[15px] font-bold tracking-tight ${isApproved ? 'text-[var(--foreground)]' : 'text-[var(--foreground)]/80'}`}>
              {item.name}
            </span>
            <CatBadge cat={item.category} />
            {isUrgent && (
              <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">דחוף 🔥</span>
            )}
          </div>
          
          {/* Notes display */}
          {item.notes && (
            <p className="text-xs text-[var(--muted)] font-medium mt-1 pr-2 border-r border-[var(--border)] leading-relaxed">
              💬 {item.notes}
            </p>
          )}

          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[var(--muted)] font-medium">
            <span>מאת: {item.requestedByName}</span>
            <span>•</span>
            {isPending ? (
              <span className="flex items-center gap-1 text-amber-500 font-bold bg-amber-500/5 px-1.5 py-0.5 rounded border border-amber-500/10">
                <Clock className="w-2.5 h-2.5" /> ממתין לאישור מנהלת
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-500 font-bold bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10">
                <CheckCircle2 className="w-2.5 h-2.5" /> מאושר לרכישה
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between md:justify-end gap-3 mt-2 md:mt-0 shrink-0">
         {/* Inline Quantity Controls */}
         <div className="flex items-center gap-1 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl p-1 shadow-sm shrink-0">
            <button 
              onClick={() => onUpdateQuantity(item.id, item.quantity || "1", -1)}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] transition-all active:scale-75"
              title="הפחת כמות"
            >
              <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
            <div className="min-w-[32px] text-center px-1">
              <span className="text-xs font-black text-[var(--foreground)]">{item.quantity || "1"}</span>
              <span className="text-[9px] text-[var(--muted)] block -mt-1 font-bold">יח׳</span>
            </div>
            <button 
              onClick={() => onUpdateQuantity(item.id, item.quantity || "1", 1)}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] transition-all active:scale-75"
              title="הוסף כמות"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
         </div>

         {/* Actions Bar */}
         <div className="flex items-center gap-2">
            {/* Quick Edit */}
            <button 
              onClick={() => onEdit(item)}
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] transition-all active:scale-90 border border-[var(--border)]"
              title="ערוך מוצר"
            >
              <Edit3 className="w-4 h-4" />
            </button>

            {/* Delete button */}
            {canDelete && (
              <button 
                onClick={handleDelete}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-rose-500/5 hover:bg-rose-500/10 text-rose-500/80 hover:text-rose-500 transition-all active:scale-90 border border-rose-500/10"
                title="מחק מהרשימה"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {/* Status Change Buttons */}
            {isPending && canApprove && (
              <button
                onClick={() => onStatus(item.id, "approved")}
                className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-3 h-9 text-xs font-black transition-all flex items-center gap-1 hover:scale-105 active:scale-95 shadow-md shadow-emerald-600/10 border border-emerald-500/20"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" /> אשר
              </button>
            )}

            {isApproved && canPurchase && (
              <button
                onClick={() => onStatus(item.id, "purchased")}
                className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-3 h-9 text-xs font-black transition-all flex items-center gap-1.5 hover:scale-105 active:scale-95 shadow-md shadow-blue-600/15"
              >
                <ShoppingCart className="w-3.5 h-3.5" /> קנה
              </button>
            )}
         </div>
      </div>
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
        
        {/* Undo/Restore Button */}
        <button
          onClick={() => onStatus(item.id, "approved")}
          className="w-8 h-8 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 flex items-center justify-center shadow-sm transition-all active:scale-75 border border-amber-500/20"
          title="החזר לרשימה הפעילה"
        >
          <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>

        {/* Delete Button */}
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
