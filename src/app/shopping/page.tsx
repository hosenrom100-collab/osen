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
  Download, Flame, ChevronRight, Edit3, RotateCcw
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
  "גבינות ומחלבה": "text-amber-400 bg-amber-500/8",
  "בשר ודגים":      "text-amber-400 bg-amber-500/8",
  "פירות וירקות":   "text-amber-400 bg-amber-500/8",
  "לחם ומאפים":     "text-amber-400 bg-amber-500/8",
  "חומרי ניקוי":    "text-blue-400 bg-blue-500/8",
  "מוצרי נייר וחד פעמי": "text-blue-400 bg-blue-500/8",
  "טואלטיקה והיגיינה": "text-blue-400 bg-blue-500/8",
  "שימורים ובישול": "text-[var(--muted)] bg-[var(--foreground)]/4",
  "קפואים":         "text-[var(--muted)] bg-[var(--foreground)]/4",
  "כללי":           "text-[var(--muted)] bg-[var(--foreground)]/4",
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
            <div className="relative w-full max-w-xl group">
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
        <header className="md:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-lg border-b border-border">
          <div className="flex items-center justify-between px-4 h-12">
            <div className="flex items-center gap-2">
              <button onClick={() => router.push("/")} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5">
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </button>
              <h1 className="text-sm font-black">רשימת קניות</h1>
            </div>
            <div className="flex items-center bg-white/5 rounded-xl p-0.5 border border-white/[0.06]">
              <button onClick={() => setView("list")} className={`px-4 py-1.5 rounded-lg text-[11px] font-black transition-all ${view === "list" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-500"}`}>רשימה</button>
              <button onClick={() => setView("archive")} className={`px-4 py-1.5 rounded-lg text-[11px] font-black transition-all ${view === "archive" ? "bg-slate-700 text-white" : "text-slate-500"}`}>ארכיון</button>
            </div>
          </div>

          {/* Mobile stats strip */}
          {view === "list" && (
            <div className="flex items-center gap-3 px-4 pb-3 pt-1">
              {pending.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[11px] font-black text-amber-400">{pending.length} ממתינים לאישור</span>
                </div>
              )}
              {approved.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[11px] font-black text-emerald-400">{approved.length} לרכישה</span>
                </div>
              )}
              {canApprove && pending.length > 0 && (
                <button onClick={approveAll}
                  className="mr-auto flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/15 border border-emerald-500/25 text-emerald-400 rounded-xl text-[11px] font-black">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  אשר הכל
                </button>
              )}
            </div>
          )}
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

                      <div className="md:hidden space-y-6 pb-24">
                        {approved.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-black text-slate-500 px-1 uppercase tracking-[0.2em]">ממתין לרכישה ({approved.length})</p>
                            {approved.map(req => <MobileCard key={req.id} req={req} onStatus={changeStatus} onEdit={setEditItem} canApprove={canApprove} />)}
                          </div>
                        )}
                        {pending.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-black text-slate-500 px-1 uppercase tracking-[0.2em]">ממתין לאישור ({pending.length})</p>
                            {pending.map(req => <MobileCard key={req.id} req={req} onStatus={changeStatus} onEdit={setEditItem} canApprove={canApprove} />)}
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

        <div className="md:hidden fixed bottom-[5.5rem] left-4 right-4 z-40">
          <button onClick={() => setOverlayOpen(true)}
            className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black text-sm shadow-2xl shadow-blue-600/30 transition-all active:scale-[0.97]">
            <Plus className="w-5 h-5" />
            הוסף מוצר לרשימה
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
          {overlayOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
              className="md:hidden fixed inset-0 z-50 flex flex-col bg-slate-950"
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/[0.07] shrink-0">
                <button onClick={() => { setOverlayOpen(false); setInputVal(""); }}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5">
                  <ArrowRight className="w-5 h-5 text-slate-300" />
                </button>
                <div className="flex-1 relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    autoFocus
                    type="text"
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddInput(); }}
                    placeholder="שם מוצר..."
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl py-2.5 pr-10 pl-4 text-[15px] font-bold focus:outline-none focus:border-blue-500/50 text-white placeholder:text-slate-600"
                  />
                </div>
              </div>

              {/* Suggestions list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-8">
                {inputVal.trim() && (
                  <button onClick={handleAddInput}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-blue-600 text-white font-bold text-base text-right active:bg-blue-700 transition-all shadow-lg shadow-blue-600/30">
                    <Plus className="w-5 h-5 shrink-0" />
                    הוסף "{inputVal.trim()}" לרשימה
                  </button>
                )}
                {!inputVal.trim() && (
                  <p className="text-center text-slate-400 text-sm py-8">הקלד שם מוצר לחיפוש או הוספה</p>
                )}
                {suggestions.map(p => {
                  const inList = alreadyInList(p.name);
                  return (
                    <button key={p.id}
                      onClick={() => { if (!inList) { addProduct(p.name, p.category); setOverlayOpen(false); setInputVal(""); } }}
                      disabled={inList}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl border text-right transition-all ${
                        inList
                          ? "bg-slate-800 border-slate-700 opacity-50 cursor-default"
                          : "bg-slate-800 border-slate-700 hover:bg-slate-700 active:bg-slate-600"
                      }`}>
                      <div className="flex items-center gap-3">
                        {inList
                          ? <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          : <Plus className="w-4 h-4 text-blue-400 shrink-0" />}
                        <span className="font-bold text-[15px] text-white">{p.name}</span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">{p.category}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
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

function MobileCard({ req, onStatus, onEdit, canApprove }: {
  req: ShoppingRequest, onStatus: any, onEdit: any, canApprove: boolean
}) {
  const isApproved = req.status === "approved";
  const isUrgent   = req.priority === "urgent";

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all active:scale-[0.99] ${
      isApproved
        ? "bg-emerald-500/[0.04] border-emerald-500/15"
        : "bg-white/[0.02] border-white/[0.06]"
    }`}>
      {/* Main content row */}
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${
          isApproved ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
        }`} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-black text-white leading-tight truncate">{req.name}</span>
            {isUrgent && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-rose-500/15 border border-rose-500/25 rounded-md text-[9px] font-black text-rose-400 shrink-0">
                <Flame className="w-2.5 h-2.5" />
                דחוף
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CAT_COLOR[req.category] ?? CAT_COLOR["כללי"]}`}>
              {req.category}
            </span>
            <span className="text-[10px] text-slate-500 truncate">· {req.requestedByName}</span>
          </div>
        </div>

        {/* Secondary actions */}
        <div className="flex items-center gap-1 shrink-0">
          {isApproved && (
            <button onClick={() => onStatus(req.id, "pending")} title="בטל אישור"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-amber-500/30 hover:text-amber-500 hover:bg-amber-500/10 transition-all">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => onEdit(req)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onStatus(req.id, "deleted")}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-rose-500/25 hover:text-rose-500 hover:bg-rose-500/10 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Action button — full width bottom strip */}
      {isApproved ? (
        <button onClick={() => onStatus(req.id, "purchased")}
          className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black transition-colors active:bg-emerald-700">
          <Check className="w-4 h-4" />
          רכשתי ✓
        </button>
      ) : canApprove ? (
        <button onClick={() => onStatus(req.id, "approved")}
          className="w-full flex items-center justify-center gap-2 py-3 bg-white/[0.04] hover:bg-blue-600/80 text-slate-400 hover:text-white text-sm font-black border-t border-white/[0.05] transition-all active:bg-blue-700">
          <CheckCircle2 className="w-4 h-4" />
          אשר לרכישה
        </button>
      ) : null}
    </div>
  );
}
