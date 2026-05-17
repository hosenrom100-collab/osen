"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, addDoc, getDocs, query, orderBy, doc,
  updateDoc, deleteDoc, onSnapshot, setDoc, getDoc,
} from "firebase/firestore";
import { ShoppingCart, Plus, Check, X, Clock, User, Search, Loader2, ArrowRight, Trash2, CheckCircle2, Download, Flame, ChevronRight, Edit3, RotateCcw, Package, ShoppingBag, Barcode, ScanLine, Filter } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

interface Product { id: string; name: string; category: string }

const CAT_COLOR: Record<string, string> = {
  "גבינות ומחלבה":       "text-amber-500 bg-amber-500/10",
  "בשר ודגים":            "text-rose-500 bg-rose-500/10",
  "פירות וירקות":         "text-emerald-500 bg-emerald-500/10",
  "לחם ומאפים":           "text-orange-500 bg-orange-500/10",
  "חומרי ניקוי":          "text-cyan-500 bg-cyan-500/10",
  "מוצרי נייר וחד פעמי": "text-indigo-400 bg-indigo-500/5",
  "טואלטיקה והיגיינה":   "text-purple-400 bg-purple-500/5",
  "שימורים ובישול":       "text-slate-500 bg-slate-500/10",
  "קפואים":               "text-sky-500 bg-sky-500/10",
  "כללי":                 "text-slate-400 bg-slate-400/10",
};

function CatBadge({ cat }: { cat: string }) {
  const cls = CAT_COLOR[cat] ?? CAT_COLOR["כללי"];
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border border-current opacity-80 ${cls}`}>{cat}</span>
  );
}

export default function ShoppingPage() {
  const { user, role, isAdmin } = useAuth();
  const router = useRouter();

  const [requests, setRequests]     = useState<ShoppingRequest[]>([]);
  const [pool, setPool]             = useState<Product[]>([]);
  const [loading, setLoading]       = useState(true);
  const [view, setView]             = useState<"list" | "archive">("list");

  // Add-bar state
  const [inputVal, setInputVal]     = useState("");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [justAdded, setJustAdded]   = useState<string | null>(null);

  const [editItem, setEditItem]     = useState<ShoppingRequest | null>(null);
  const [editCat,  setEditCat]      = useState("");
  const [editName, setEditName]     = useState("");

  const [newCatName, setNewCatName] = useState("");
  const [isAddingCat, setIsAddingCat] = useState(false);

  // Per-item confirm delete
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const [categories, setCategories] = useState([
    "גבינות ומחלבה","לחם ומאפים","חומרי ניקוי",
    "מוצרי נייר וחד פעמי","שימורים ובישול","פירות וירקות",
    "טואלטיקה והיגיינה","בשר ודגים","קפואים","כללי",
  ]);

  const inputRef       = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef     = useRef<HTMLDivElement>(null);

  const canApprove  = role === "manager";
  const canPurchase = isAdmin || role === "manager" || role === "logistics";

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
    }
  }, [editItem]);

  const fetchPool = async () => {
    const snap = await getDocs(collection(db, "product_pool"));
    const list: Product[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Product));
    list.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    setPool(list);
  };

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
          sendPush({
            userId: req.requestedBy,
            title: "✅ בקשת רכש אושרה",
            body: `"${req.name}" אושרה ותצא לרכישה`,
            link: "/shopping",
          });
        }

        if (next === "purchased") {
          const remainingApproved = requests.filter((r) => r.status === "approved" && r.id !== id);
          if (remainingApproved.length === 0) {
            const totalBought = requests.filter((r) => r.status === "purchased").length + 1;
            sendPush({
              role: ["admin", "manager", "instructor", "employee", "logistics"],
              title: "🛍️ הקניות הסתיימו!",
              body: `${totalBought} מוצרים נרכשו בהצלחה`,
              link: "/shopping",
            });
          }
        }
      }
    } catch (e) { console.error(e); }
  }, [requests, user]);

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
    // product_pool write may fail for non-manager/logistics — ignore and continue
    try { await setDoc(doc(db, "product_pool", docId), { name, category }, { merge: true }); } catch { /* no permission — continue */ }
    await addDoc(collection(db, "shopping_requests"), {
      name, category, quantity: "", notes: "", priority, status: "pending",
      requestedBy: user?.uid, requestedByName: user?.displayName || user?.email,
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
    await addProduct(name, match?.category ?? "כללי");
    setInputVal("");
    setOverlayOpen(false);
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
        <div className="md:hidden pt-4 pb-4 px-4 bg-[var(--background)] border-b border-[var(--border)] z-40">
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
                 <button className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[var(--foreground)]/5 transition-colors">
                    <RotateCcw className="w-5 h-5 text-[var(--muted)]" />
                 </button>
                 <button className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[var(--foreground)]/5 transition-colors">
                    <Edit3 className="w-5 h-5 text-[var(--muted)]" />
                 </button>
                 <button className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[var(--foreground)]/5 transition-colors text-rose-500">
                    <Trash2 className="w-5 h-5" />
                 </button>
              </div>
           </div>

           <div className="relative group">
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-[var(--muted)]/40 px-2 border-l border-[var(--border)] ml-3">
                 <Plus className="w-4 h-4" />
                 <Search className="w-4 h-4" />
                 <Barcode className="w-4 h-4" />
              </div>
              <input
                ref={mobileInputRef}
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onFocus={() => setOverlayOpen(true)}
                placeholder="הוסף מוצר"
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl py-4 pr-24 pl-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-[var(--muted)]/50 shadow-sm"
              />
           </div>
        </div>

        {/* ── Desktop Header (Hidden on Mobile) ── */}
        <header className="hidden md:flex items-center justify-between px-8 h-20 shrink-0 border-b border-[var(--border)] bg-[var(--surface)]/50 backdrop-blur-md z-30">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-black flex items-center gap-3">
               <span className="text-2xl">💗🥒</span> קניות
            </h1>
            <div className="relative w-[400px]">
               <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
               <input
                 ref={inputRef}
                 type="text"
                 value={inputVal}
                 onChange={(e) => setInputVal(e.target.value)}
                 onFocus={() => setOverlayOpen(true)}
                 placeholder="חיפוש או הוספת מוצר..."
                 className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl py-3 pr-11 pl-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
               />
            </div>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={() => setView(view === "list" ? "archive" : "list")} className="px-6 py-2.5 rounded-2xl bg-[var(--foreground)]/5 border border-[var(--border)] text-xs font-black uppercase tracking-widest hover:bg-[var(--foreground)]/10 transition-all">
                {view === "list" ? "ארכיון" : "רשימה"}
             </button>
             {isAdmin && <button onClick={exportXlsx} className="p-2.5 rounded-2xl bg-[var(--foreground)]/5 border border-[var(--border)] hover:bg-[var(--foreground)]/10 transition-all"><Download className="w-5 h-5 text-[var(--muted)]" /></button>}
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col relative bg-[var(--background)]">
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <div className="max-w-[800px] mx-auto pb-32">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : view === "list" ? (
                <LayoutGroup>
                   {categories.map(cat => {
                     const catItems = [...pending, ...approved].filter(r => r.category === cat);
                     if (catItems.length === 0) return null;
                     return (
                        <CategorySection 
                           key={cat}
                           title={cat}
                           items={catItems}
                           onStatus={changeStatus}
                           onEdit={setEditItem}
                           canApprove={canApprove}
                        />
                     );
                   })}
                   
                   {/* Fallback for items with unknown categories */}
                   {[...pending, ...approved].some(r => !categories.includes(r.category)) && (
                      <CategorySection 
                         title="אחר"
                         items={[...pending, ...approved].filter(r => !categories.includes(r.category))}
                         onStatus={changeStatus}
                         onEdit={setEditItem}
                         canApprove={canApprove}
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
                   <div className="bg-[var(--surface)] border-t border-[var(--border)] shadow-[0_-20px_40px_-15px_rgba(0,0,0,0.1)] rounded-t-[2.5rem] overflow-hidden">
                      <div className="px-6 py-4 flex items-center justify-between bg-[var(--foreground)]/5">
                         <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20">
                               <ShoppingCart className="w-4 h-4" />
                            </div>
                            <h3 className="text-sm font-black uppercase tracking-widest">סל קניות</h3>
                         </div>
                         <div className="flex items-center gap-4">
                            <button 
                               onClick={() => purchased.forEach(item => changeStatus(item.id, "deleted"))}
                               className="flex items-center gap-2 text-[10px] font-black text-rose-500 uppercase tracking-widest hover:bg-rose-500/10 px-3 py-1.5 rounded-lg transition-all"
                            >
                               <Trash2 className="w-3.5 h-3.5" /> מחק סל
                            </button>
                            <div className="h-4 w-px bg-[var(--border)]" />
                            <button className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest flex items-center gap-2">
                               <RotateCcw className="w-3.5 h-3.5" /> החזר לרשימה
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
              className="fixed inset-0 z-[100] bg-[var(--background)]/80 backdrop-blur-md p-4 md:p-12 overflow-y-auto pt-24 md:pt-32"
            >
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center justify-between mb-8">
                   <h2 className="text-3xl font-black">הוסף מוצר</h2>
                   <button onClick={() => setOverlayOpen(false)} className="w-12 h-12 rounded-2xl bg-[var(--foreground)]/5 flex items-center justify-center hover:bg-[var(--foreground)]/10 transition-all">
                      <X className="w-6 h-6" />
                   </button>
                </div>

                <div className="relative group mb-8">
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
                        if (e.key === "Escape") setOverlayOpen(false);
                     }}
                     placeholder="מה לקנות?"
                     className="w-full bg-[var(--surface)] border-2 border-[var(--border)] rounded-[2rem] py-6 pr-14 pl-6 text-xl font-bold focus:outline-none focus:border-blue-500 transition-all shadow-xl text-right"
                   />
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
                           onClick={() => { if (!inList) { addProduct(p.name, p.category); setInputVal(""); setOverlayOpen(false); } }}
                           disabled={inList}
                           className={`flex items-center justify-between px-6 py-4 rounded-2xl border border-[var(--border)] transition-all active:scale-[0.98] ${
                             inList ? "opacity-30 bg-transparent" : "bg-[var(--surface)] hover:border-blue-500/50"
                           }`}
                         >
                            <div className="flex flex-col items-start gap-1 text-right">
                               <span className="text-lg font-bold">{p.name}</span>
                               <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${CAT_COLOR[p.category] || CAT_COLOR["כללי"]}`}>
                                  {p.category}
                               </span>
                            </div>
                            {inList ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> : <Plus className="w-5 h-5 text-[var(--muted)]" />}
                         </button>
                      );
                   })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {editItem && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setEditItem(null)}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md bg-slate-900 border border-white/[0.1] rounded-[2rem] p-8 shadow-2xl text-right" dir="rtl">
                <h2 className="text-xl font-black text-white mb-6">עריכת פריט</h2>
                <div className="space-y-4 text-right">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">שם המוצר</label>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-blue-500/50" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">קטגוריה</label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto no-scrollbar">
                      {categories.map(c => (
                        <button key={c} onClick={() => setEditCat(c)} className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${editCat === c ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-slate-500"}`}>{c}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 mt-8">
                  <button onClick={handleUpdateItem} className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98]">שמור שינויים</button>
                  <button onClick={() => setEditItem(null)} className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-slate-400 text-sm font-black rounded-2xl transition-all">ביטול</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isAddingCat && (
             <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddingCat(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-slate-900 border border-white/10 rounded-[2rem] w-full max-w-sm p-8 shadow-2xl text-right" dir="rtl">
                   <h3 className="text-xl font-black mb-6">קטגוריה חדשה</h3>
                   <input 
                      autoFocus
                      type="text" 
                      value={newCatName} 
                      onChange={e => setNewCatName(e.target.value)}
                      placeholder="שם הקטגוריה..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 text-sm font-bold focus:border-blue-500 outline-none mb-6"
                   />
                   <div className="flex gap-3">
                      <button onClick={handleAddCategory} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-600/20 active:scale-95 transition-all">הוסף קטגוריה</button>
                      <button onClick={() => setIsAddingCat(false)} className="flex-1 py-4 bg-white/5 text-slate-400 rounded-2xl font-black text-sm active:scale-95 transition-all">ביטול</button>
                   </div>
                </motion.div>
             </div>
          )}
        </AnimatePresence>
      </div>
    </RoleGuard>
  );
}

function DesktopRow({ req, onStatus, canApprove, onEdit, type }: { 
  req: ShoppingRequest, onStatus: any, canApprove: boolean, onEdit: any, type: "pending" | "approved"
}) {
  return (
    <motion.tr layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="group hover:bg-white/[0.02] transition-colors">
      <td className="px-6 py-4">
        {type === "approved" ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-wider border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> מאושר</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase tracking-wider border border-amber-500/20"><Clock className="w-3 h-3" /> ממתין</span>
        )}
      </td>
      <td className="px-6 py-4"><span className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">{req.name}</span></td>
      <td className="px-6 py-4"><CatBadge cat={req.category} /></td>
      <td className="px-6 py-4">{req.priority === "urgent" ? <span className="flex items-center gap-1 text-[10px] font-black text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20 w-fit"><Flame className="w-3 h-3" /> דחוף</span> : <span className="text-[10px] font-black text-slate-500 uppercase">רגיל</span>}</td>
      <td className="px-6 py-4"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400">{req.requestedByName?.charAt(0)}</div><span className="text-xs font-medium text-slate-400">{req.requestedByName}</span></div></td>
      <td className="px-6 py-4 text-left">
        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {type === "pending" && canApprove && <button onClick={() => onStatus(req.id, "approved")} title="אשר לרכישה" className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg"><Check className="w-4 h-4" /></button>}
          {type === "approved" && (
            <>
              <button onClick={() => onStatus(req.id, "purchased")} title="סמן כנרכש" className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg"><ShoppingCart className="w-4 h-4" /></button>
              <button onClick={() => onStatus(req.id, "pending")} title="בטל אישור (החזר לממתינים)" className="p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg"><RotateCcw className="w-4 h-4" /></button>
            </>
          )}
          <button onClick={() => onEdit(req)} title="ערוך מוצר" className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg"><Edit3 className="w-4 h-4" /></button>
          <button onClick={() => onStatus(req.id, "deleted")} title="מחק" className="p-2 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400/50 hover:text-rose-400 rounded-lg"><Trash2 className="w-4 h-4" /></button>
        </div>
      </td>
    </motion.tr>
  );
}

function CategorySection({ title, items, onStatus, onEdit, canApprove }: {
  title: string, items: ShoppingRequest[], onStatus: any, onEdit: any, canApprove: boolean
}) {
  return (
    <div className="mb-8 last:mb-0">
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface)]/50 backdrop-blur-sm sticky top-0 z-10 border-y border-[var(--border)]">
        <h3 className="text-xs font-black text-[var(--muted)] uppercase tracking-widest flex items-center gap-2">
          <Filter className="w-3 h-3" />
          {title}
        </h3>
        <span className="text-[10px] font-bold bg-[var(--foreground)]/5 px-2 py-0.5 rounded-full">{items.length} פריטים</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {items.map(item => (
          <MobileItemRow key={item.id} item={item} onStatus={onStatus} onEdit={onEdit} canApprove={canApprove} />
        ))}
      </div>
    </div>
  );
}

function MobileItemRow({ item, onStatus, onEdit, canApprove }: {
  item: ShoppingRequest, onStatus: any, onEdit: any, canApprove: boolean
}) {
  const isApproved = item.status === "approved";
  const isUrgent   = item.priority === "urgent";

  return (
    <motion.div
      layout
      className={`group relative flex items-center gap-4 px-4 py-4 bg-[var(--surface)] active:bg-[var(--foreground)]/5 transition-colors`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[15px] font-bold ${isApproved ? 'text-[var(--foreground)]' : 'text-[var(--foreground)]/70'}`}>
            {item.name}
          </span>
          {isUrgent && <Flame className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${CAT_COLOR[item.category] || CAT_COLOR["כללי"]}`}>
            {item.category}
          </span>
          <span className="text-[10px] text-[var(--muted)] font-medium">
             מאת {item.requestedByName}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
         <div className="text-left">
            <span className="text-sm font-black text-[var(--foreground)] opacity-40">{item.quantity || "1.0"}</span>
            <p className="text-[8px] font-black uppercase text-[var(--muted)] -mt-1">יח׳</p>
         </div>

         <button
            onClick={() => onStatus(item.id, isApproved ? "purchased" : "approved")}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all border-2 ${
              isApproved 
                ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20" 
                : "border-[var(--border)] text-[var(--border)]"
            }`}
          >
            {isApproved ? <Check className="w-5 h-5 stroke-[3]" /> : <div className="w-2.5 h-2.5 rounded-full bg-[var(--border)]" />}
          </button>
      </div>

      {/* Quick Edit Overlay or long press? Let's stick to a simple edit button for now but make it clean */}
      <button 
        onClick={() => onEdit(item)}
        className="absolute top-1/2 left-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg bg-[var(--foreground)]/5"
      >
        <Edit3 className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

function PurchasedRow({ item, onStatus }: { item: ShoppingRequest, onStatus: any }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-4 px-4 py-3 bg-[var(--foreground)]/5 border-b border-[var(--border)] last:border-0"
    >
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-[var(--muted)] line-through decoration-2 decoration-[var(--muted)]/30">
          {item.name}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-[var(--muted)] opacity-50">{item.quantity || "1.0"} יח׳</span>
        <button
          onClick={() => onStatus(item.id, "approved")}
          className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-md active:scale-90 transition-all"
        >
          <Check className="w-4 h-4 stroke-[3]" />
        </button>
      </div>
    </motion.div>
  );
}
