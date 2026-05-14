"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, addDoc, getDocs, query, orderBy, doc,
  updateDoc, deleteDoc, onSnapshot, setDoc, getDoc,
} from "firebase/firestore";
import {
  ShoppingCart, Plus, Check, X, Clock, User,
  Search, Loader2, ArrowRight, Trash2, CheckCircle2,
  Download, Flame, ChevronRight, Edit3
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
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
  "גבינות ומחלבה": "text-yellow-400 bg-yellow-500/10",
  "בשר ודגים":      "text-rose-400 bg-rose-500/10",
  "פירות וירקות":   "text-emerald-400 bg-emerald-500/10",
  "חומרי ניקוי":    "text-cyan-400 bg-cyan-500/10",
  "מוצרי נייר וחד פעמי": "text-slate-400 bg-slate-500/10",
  "לחם ומאפים":     "text-amber-500 bg-amber-700/10",
  "שימורים ובישול": "text-orange-400 bg-orange-500/10",
  "טואלטיקה והיגיינה": "text-purple-400 bg-purple-500/10",
  "קפואים":         "text-blue-400 bg-blue-500/10",
  "כללי":           "text-slate-400 bg-slate-500/10",
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

  const canApprove  = isAdmin || role === "manager" || role === "logistics";
  const canPurchase = isAdmin || role === "manager" || role === "logistics";

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
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
    });
    return () => unsub();
  }, []);

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
    await setDoc(doc(db, "product_pool", docId), { name, category }, { merge: true });
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
      <div dir="rtl" className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-blue-500/30">
        
        {/* ── Desktop CRM Header ── */}
        <header className="hidden md:flex items-center justify-between px-8 h-16 shrink-0 border-b border-border bg-card-bg/40 backdrop-blur-md z-30">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                <Link href="/" className="hover:text-blue-400 transition-colors">בית</Link>
                <ChevronRight className="w-2.5 h-2.5 opacity-30" />
                <span className="text-slate-400">לוגיסטיקה</span>
              </div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-blue-400" />
                רשימת קניות
              </h1>
            </div>

            {/* Desktop Search/Add */}
            <div className="relative w-80 group">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
              <input
                ref={inputRef}
                type="search"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onFocus={() => setOverlayOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { handleAddInput(); }
                  if (e.key === "Escape") { setOverlayOpen(false); inputRef.current?.blur(); }
                }}
                placeholder="הוסף מוצר (לדוגמה: לחם, חלב...)"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg py-1.5 pr-9 pl-4 text-xs focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.05] transition-all placeholder:text-slate-600"
              />
              
              <AnimatePresence>
                {overlayOpen && inputVal.trim() && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute top-full right-0 left-0 mt-2 bg-slate-900 border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden z-50 backdrop-blur-xl"
                  >
                    <div className="max-h-64 overflow-y-auto p-1.5 no-scrollbar">
                      {!exactMatch && (
                        <button onClick={handleAddInput}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-bold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-all mb-1 text-right">
                          <Plus className="w-3.5 h-3.5 shrink-0" />
                          הוסף "{inputVal.trim()}" לרשימה
                        </button>
                      )}
                      {suggestions.map((p) => {
                        const inList = alreadyInList(p.name);
                        return (
                          <button key={p.id}
                            onClick={() => { if (!inList) { addProduct(p.name, p.category); setInputVal(""); setOverlayOpen(false); } }}
                            disabled={inList}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-all text-right ${
                              inList ? "opacity-40 cursor-default" : "text-slate-300 hover:bg-white/[0.05]"
                            }`}>
                            {inList ? <Check className="w-3.5 h-3.5 text-slate-500" /> : <Plus className="w-3.5 h-3.5 text-slate-600" />}
                            <span className="flex-1 font-medium text-right">{p.name}</span>
                            <CatBadge cat={p.category} />
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white/[0.03] p-1 rounded-lg border border-white/[0.05]">
              <button onClick={() => setView("list")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                  view === "list" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-500 hover:text-slate-300"
                }`}>
                רשימה פעילה
              </button>
              <button onClick={() => setView("archive")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                  view === "archive" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"
                }`}>
                ארכיון רכישות
              </button>
            </div>

            <div className="w-px h-6 bg-white/[0.07] mx-1" />

            {view === "list" && canApprove && pending.length > 0 && (
              <button onClick={approveAll}
                className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold transition-all">
                <CheckCircle2 className="w-3.5 h-3.5" />
                אשר הכל
              </button>
            )}

            {view === "archive" && (
              <button onClick={exportXlsx}
                className="flex items-center gap-2 px-4 py-1.5 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 border border-white/[0.07] rounded-lg text-xs font-bold transition-all">
                <Download className="w-3.5 h-3.5" />
                ייצוא Excel
              </button>
            )}
          </div>
        </header>

        {/* ── Mobile Header ── */}
        <header className="md:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-lg border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push("/")} className="p-2 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all">
                <ArrowRight className="w-4 h-4" />
              </button>
              <h1 className="text-base font-bold">רשימת קניות</h1>
            </div>
            <div className="flex items-center bg-white/5 rounded-lg p-0.5">
              <button onClick={() => setView("list")} className={`px-3 py-1 rounded text-[11px] font-bold ${view === "list" ? "bg-blue-600 text-white" : "text-slate-500"}`}>רשימה</button>
              <button onClick={() => setView("archive")} className={`px-3 py-1 rounded text-[11px] font-bold ${view === "archive" ? "bg-slate-700 text-white" : "text-slate-500"}`}>ארכיון</button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-background/20 no-scrollbar">
            <div className="max-w-[1400px] mx-auto p-4 md:p-8">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <p className="text-slate-500 text-sm animate-pulse">טוען רשימה...</p>
                </div>
              ) : view === "list" ? (
                <div className="space-y-8">
                  {(pending.length > 0 || approved.length > 0) ? (
                    <div className="space-y-6">
                      <div className="hidden md:block bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden backdrop-blur-sm">
                        <table className="w-full text-right border-collapse">
                          <thead>
                            <tr className="bg-white/[0.02] border-b border-white/[0.05]">
                              <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">סטטוס</th>
                              <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">מוצר</th>
                              <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">קטגוריה</th>
                              <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">עדיפות</th>
                              <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">מבקש</th>
                              <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest text-left">פעולות</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.03]">
                            {approved.map(req => (
                              <DesktopRow key={req.id} req={req} onStatus={changeStatus} canApprove={canApprove} onEdit={setEditItem} type="approved" />
                            ))}
                            {pending.map(req => (
                              <DesktopRow key={req.id} req={req} onStatus={changeStatus} canApprove={canApprove} onEdit={setEditItem} type="pending" />
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="md:hidden space-y-4 pb-20">
                        {approved.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-[11px] font-bold text-emerald-500 px-1 uppercase tracking-widest">ממתין לרכישה ({approved.length})</p>
                            {approved.map(req => <MobileCard key={req.id} req={req} onStatus={changeStatus} onEdit={setEditItem} />)}
                          </div>
                        )}
                        {pending.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-[11px] font-bold text-amber-500 px-1 uppercase tracking-widest">ממתין לאישור ({pending.length})</p>
                            {pending.map(req => <MobileCard key={req.id} req={req} onStatus={changeStatus} onEdit={setEditItem} />)}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-40 text-center opacity-40 grayscale group">
                      <div className="w-20 h-20 rounded-full bg-white/[0.02] flex items-center justify-center mb-6 border border-white/[0.05] group-hover:scale-110 transition-transform duration-500">
                        <ShoppingCart className="w-8 h-8 text-slate-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">הרשימה ריקה</h3>
                      <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">הקלד שם מוצר בתיבת החיפוש למעלה כדי להוסיף פריטים חדשים.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-black text-white">ארכיון רכישות</h2>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{purchased.length} מוצרים נרכשו</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.entries(archiveByDate).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => (
                      <div key={date} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden backdrop-blur-sm group hover:border-white/[0.1] transition-all">
                        <div className="bg-white/[0.03] px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-300">{date}</span>
                          <span className="text-[10px] font-bold text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{items.length} פריטים</span>
                        </div>
                        <div className="p-4 space-y-2">
                          {items.map(item => (
                            <div key={item.id} className="flex items-center justify-between group/item">
                              <span className="text-sm text-slate-300 font-medium">{item.name}</span>
                              <CatBadge cat={item.category} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="hidden xl:flex w-80 shrink-0 border-r border-border bg-card-bg/40 p-6 flex-col gap-8">
            <div>
              <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">סטטיסטיקה מהירה</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-blue-400/70 mb-1 uppercase">ממתינים</p>
                  <p className="text-2xl font-black text-white leading-none">{pending.length}</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-emerald-400/70 mb-1 uppercase">מאושרים</p>
                  <p className="text-2xl font-black text-white leading-none">{approved.length}</p>
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest">קטגוריות</h3>
                <button onClick={() => setIsAddingCat(true)} className="p-1 hover:bg-white/5 rounded transition-colors"><Plus className="w-3 h-3 text-slate-400" /></button>
              </div>
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto no-scrollbar pr-1">
                {categories.map(cat => (
                  <div key={cat} className="group flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.03] hover:bg-white/[0.05] transition-all cursor-default">
                    <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200">{cat}</span>
                    <span className="text-[10px] text-slate-600 bg-black/20 px-1.5 py-0.5 rounded">{requests.filter(r => r.category === cat && r.status !== "purchased").length}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </main>

        <div className="md:hidden fixed bottom-16 left-0 right-0 p-4 z-40 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent">
          <button onClick={() => setOverlayOpen(true)} className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-blue-600/30 transition-all active:scale-[0.98]">
            <Plus className="w-5 h-5" /> הוסף מוצר חדש
          </button>
        </div>

        <AnimatePresence>
          {editItem && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditItem(null)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="relative bg-slate-900 border border-white/[0.1] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
                <div className="px-6 py-5 border-b border-white/[0.07] flex items-center justify-between bg-white/[0.02]">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2"><Edit3 className="w-4 h-4 text-blue-400" /> עריכת מוצר</h3>
                  <button onClick={() => setEditItem(null)} className="p-2 hover:bg-white/5 rounded-xl transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-6 space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">שם המוצר</label>
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 px-4 text-sm font-medium focus:border-blue-500/50 outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">קטגוריה</label>
                    <div className="grid grid-cols-2 gap-2 max-h-[30vh] overflow-y-auto custom-scrollbar pr-1">
                      {categories.map(cat => (
                        <button key={cat} onClick={() => setEditCat(cat)} className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${editCat === cat ? "bg-blue-600 border-blue-500 text-white" : "bg-white/[0.03] border-white/5 text-slate-500"}`}>{cat}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-6 border-t border-white/[0.07] bg-white/[0.01] flex gap-3">
                  <button onClick={() => setEditItem(null)} className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-sm text-slate-400">ביטול</button>
                  <button onClick={handleUpdateItem} className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-bold text-sm text-white shadow-lg shadow-blue-600/20">שמור</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {overlayOpen && !inputRef.current?.matches(":focus") && (
            <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-slate-950">
              <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.07]">
                <button onClick={() => { setOverlayOpen(false); setInputVal(""); }} className="p-2"><ArrowRight className="w-5 h-5" /></button>
                <div className="flex-1 relative">
                   <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                   <input autoFocus type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder="חפש או הוסף..." className="w-full bg-white/5 border-0 rounded-xl py-2.5 pr-10 pl-4 text-base focus:ring-0" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {inputVal.trim() && !exactMatch && (
                  <button onClick={handleAddInput} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 font-bold text-sm text-right"><Plus className="w-5 h-5" /> הוסף "{inputVal.trim()}"</button>
                )}
                {suggestions.map(p => (
                   <button key={p.id} onClick={() => { addProduct(p.name, p.category); setOverlayOpen(false); setInputVal(""); }} className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 text-right active:bg-white/10 transition-all">
                     <span className="font-bold text-slate-200">{p.name}</span>
                     <CatBadge cat={p.category} />
                   </button>
                ))}
              </div>
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
          {type === "pending" && canApprove && <button onClick={() => onStatus(req.id, "approved")} className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg"><Check className="w-4 h-4" /></button>}
          {type === "approved" && <button onClick={() => onStatus(req.id, "purchased")} className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg"><ShoppingCart className="w-4 h-4" /></button>}
          <button onClick={() => onEdit(req)} className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg"><Edit3 className="w-4 h-4" /></button>
          <button onClick={() => onStatus(req.id, "deleted")} className="p-2 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400/50 hover:text-rose-400 rounded-lg"><Trash2 className="w-4 h-4" /></button>
        </div>
      </td>
    </motion.tr>
  );
}

function MobileCard({ req, onStatus, onEdit }: { req: ShoppingRequest, onStatus: any, onEdit: any }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-4 active:bg-white/[0.05] transition-all">
      <div className="flex justify-between items-start mb-3">
        <div><h4 className="text-sm font-bold text-white mb-1">{req.name}</h4><div className="flex items-center gap-2"><CatBadge cat={req.category} />{req.priority === "urgent" && <span className="text-[10px] font-black text-rose-400">דחוף</span>}</div></div>
        <div className="flex gap-1"><button onClick={() => onEdit(req)} className="p-2 bg-white/5 rounded-xl"><Edit3 className="w-4 h-4 text-slate-500" /></button><button onClick={() => onStatus(req.id, "deleted")} className="p-2 bg-white/5 rounded-xl"><Trash2 className="w-4 h-4 text-rose-500/50" /></button></div>
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]"><span className="text-[10px] text-slate-500">{req.requestedByName}</span>{req.status === "approved" ? <button onClick={() => onStatus(req.id, "purchased")} className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold">רכשתי</button> : <button onClick={() => onStatus(req.id, "approved")} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold">אשר</button>}</div>
    </div>
  );
}
