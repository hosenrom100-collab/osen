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
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{cat}</span>
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

  const inputRef       = useRef<HTMLInputElement>(null); // desktop header input
  const mobileInputRef = useRef<HTMLInputElement>(null); // mobile bottom bar
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

  // ── Status change ──────────────────────────────────────────────────────────
  // Push policy:
  //   approved  → notify requester only (skip if self-approved)
  //   purchased → notify all only when the last approved item is purchased
  //   deleted   → silent
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

  // ── Approve all pending ────────────────────────────────────────────────────
  // Batch update — one summary push to logistics instead of N individual pushes
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

  // ── Add item ───────────────────────────────────────────────────────────────
  // Push policy: urgent only — normal additions are silent (managers review on demand)
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
      // Update the request
      await updateDoc(doc(db, "shopping_requests", editItem.id), {
        name: editName,
        category: editCat,
      });

      // Update the global pool
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

  // ── Export ─────────────────────────────────────────────────────────────────
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

  // ── Filtered data ──────────────────────────────────────────────────────────
  const pending  = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const purchased = requests.filter((r) => r.status === "purchased");

  const suggestions = pool.filter((p) =>
    inputVal.trim() &&
    (p.name.includes(inputVal.trim()) || p.category.includes(inputVal.trim()))
  ).slice(0, 20);

  const exactMatch = pool.some((p) => p.name === inputVal.trim());
  const alreadyInList = (name: string) => requests.some((r) => r.name === name && r.status !== "purchased");

  // ── Archive grouped ────────────────────────────────────────────────────────
  const archiveByDate = purchased.reduce((acc, item) => {
    const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
    const key = d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {} as Record<string, ShoppingRequest[]>);

  return (
    <RoleGuard allowedRoles={["admin","manager","instructor","social_worker","employee","logistics"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-slate-950 text-white flex flex-col">

        {/* ── Header ── */}
        <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-white/[0.07] px-4 md:px-5">
          <div className="flex items-center gap-3 h-12">

            {/* Back — mobile only */}
            <button onClick={() => router.push("/")} aria-label="חזרה"
              className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/5 transition-colors shrink-0">
              <ArrowRight className="w-5 h-5" />
            </button>

            {/* Title */}
            <div className="flex items-center gap-2 shrink-0">
              <ShoppingCart className="w-4 h-4 text-blue-400 shrink-0" />
              <h1 className="text-[14px] font-semibold">רשימת קניות</h1>
            </div>

            {/* Desktop inline add input */}
            <div className="hidden md:flex flex-1 max-w-xs relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
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
                placeholder="הוסף מוצר..."
                aria-label="הוספת מוצר"
                className="w-full bg-white/5 border border-white/[0.07] rounded py-1.5 pr-8 pl-3 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
              />
            </div>

            {/* View toggle */}
            <div className="flex items-center bg-white/5 md:bg-transparent rounded-xl md:rounded-none p-0.5 md:p-0 text-xs font-semibold shrink-0 mr-auto md:mr-0 gap-0 md:gap-3 md:border-0">
              <button onClick={() => setView("list")}
                className={`px-3 py-1.5 rounded md:rounded-none transition-colors md:border-b-2 md:border-transparent ${
                  view === "list"
                    ? "bg-blue-600 md:bg-transparent text-white md:border-blue-500"
                    : "text-slate-500 hover:text-slate-300"
                }`}>
                רשימה
                {(pending.length + approved.length) > 0 && (
                  <span className={`mr-1 ${view === "list" ? "text-blue-200 md:text-blue-400" : "text-slate-600"}`}>
                    ({pending.length + approved.length})
                  </span>
                )}
              </button>
              <button onClick={() => setView("archive")}
                className={`px-3 py-1.5 rounded md:rounded-none transition-colors md:border-b-2 md:border-transparent ${
                  view === "archive"
                    ? "bg-slate-700 md:bg-transparent text-white md:border-slate-500"
                    : "text-slate-500 hover:text-slate-300"
                }`}>
                ארכיון
              </button>
            </div>
          </div>
        </header>

        {/* ── Desktop suggestions dropdown ── */}
        <AnimatePresence>
          {overlayOpen && inputVal.trim() && (
            <motion.div
              key="desktop-sugg"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.1 }}
              className="hidden md:block fixed top-12 z-50 bg-slate-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden"
              style={{ right: "220px", width: "320px" }}
            >
              <div className="max-h-72 overflow-y-auto p-1">
                {inputVal.trim() && !exactMatch && (
                  <button onClick={handleAddInput}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 transition-colors mb-1">
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    הוסף "{inputVal.trim()}"
                  </button>
                )}
                {suggestions.length > 0 ? (
                  suggestions.map((p) => {
                    const inList = alreadyInList(p.name);
                    const added  = justAdded === p.id || justAdded === p.name.replace(/\//g, "-");
                    return (
                      <button key={p.id}
                        onClick={() => { if (!inList) { addProduct(p.name, p.category); setInputVal(""); setOverlayOpen(false); inputRef.current?.blur(); } }}
                        disabled={inList}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors text-right ${
                          added    ? "bg-emerald-500/10 text-emerald-300" :
                          inList   ? "text-slate-600 cursor-default" :
                                     "text-slate-300 hover:bg-white/5"
                        }`}>
                        {added ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                               : inList ? <Check className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                               : <Plus className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                        <span className="flex-1">{p.name}</span>
                        <CatBadge cat={p.category} />
                      </button>
                    );
                  })
                ) : (
                  <p className="text-center text-slate-600 text-xs py-4">לא נמצאו תוצאות</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop click-outside to close */}
        {overlayOpen && (
          <div className="hidden md:block fixed inset-0 z-40"
            onClick={() => { setOverlayOpen(false); inputRef.current?.blur(); }} />
        )}

        {/* ── Main ── */}
        <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-5 pb-28 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : view === "list" ? (
            <ListView
              pending={pending}
              approved={approved}
              canApprove={canApprove}
              canPurchase={canPurchase}
              userId={user?.uid}
              confirmDel={confirmDel}
              setConfirmDel={setConfirmDel}
              onStatusChange={changeStatus}
              onApproveAll={approveAll}
              onEdit={(item) => {
                setEditItem(item);
                setEditName(item.name);
                setEditCat(item.category);
              }}
            />
          ) : (
            <ArchiveView items={purchased} byDate={archiveByDate} onDelete={changeStatus} onExport={exportXlsx} />
          )}
        </main>

        {/* ── Bottom add-bar — mobile only ── */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950 border-t border-white/10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto flex gap-2 items-center">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                ref={mobileInputRef}
                type="search"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onFocus={() => setOverlayOpen(true)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddInput(); if (e.key === "Escape") { setOverlayOpen(false); mobileInputRef.current?.blur(); } }}
                placeholder="הוסף מוצר לרשימה..."
                aria-label="הוספת מוצר"
                className="w-full bg-white/8 border border-white/10 rounded-xl py-3 pr-9 pl-4 text-sm focus:outline-none focus:border-blue-500 focus:bg-white/10 transition-all placeholder:text-slate-600"
              />
            </div>
            <button
              onClick={handleAddInput}
              disabled={!inputVal.trim()}
              aria-label="הוסף"
              className="min-w-[48px] min-h-[48px] flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-slate-600 text-white rounded-xl transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Suggestions overlay ── */}
        <AnimatePresence>
          {overlayOpen && (
            <>
              <motion.div
                key="sb"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-30 bg-black/50"
                onClick={() => { setOverlayOpen(false); inputRef.current?.blur(); }}
                aria-hidden="true"
              />
              <motion.div
                key="sugg"
                ref={overlayRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed bottom-[76px] left-0 right-0 z-40 max-h-[55dvh] overflow-y-auto bg-slate-900 border-t border-white/10 rounded-t-2xl shadow-2xl"
              >
                <div className="max-w-2xl mx-auto px-4 py-3">
                  {/* No-match: offer custom add */}
                  {inputVal.trim() && !exactMatch && (
                    <button
                      onClick={handleAddInput}
                      className="w-full flex items-center gap-3 py-3 px-4 mb-2 rounded-xl bg-blue-600/15 border border-blue-500/25 text-blue-300 text-sm font-medium hover:bg-blue-600/25 transition-colors active:scale-[.98]"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      הוסף "<span className="text-white">{inputVal.trim()}</span>" לרשימה
                    </button>
                  )}

                  {/* Suggestions list */}
                  {suggestions.length > 0 ? (
                    <ul className="space-y-1">
                      {suggestions.map((p) => {
                        const inList = alreadyInList(p.name);
                        const added  = justAdded === p.id || justAdded === p.name.replace(/\//g, "-");
                        return (
                          <li key={p.id}>
                            <button
                              onClick={() => {
                                if (!inList) { addProduct(p.name, p.category); setInputVal(""); setOverlayOpen(false); inputRef.current?.blur(); }
                              }}
                              disabled={inList}
                              aria-label={inList ? `${p.name} כבר ברשימה` : `הוסף ${p.name}`}
                              className={`w-full flex items-center gap-3 py-3 px-3 rounded-xl text-sm transition-all ${
                                added    ? "bg-emerald-500/15 text-emerald-300" :
                                inList   ? "text-slate-600 cursor-default" :
                                           "text-slate-200 hover:bg-white/8 active:scale-[.98]"
                              }`}
                            >
                              <span className={`w-7 h-7 flex items-center justify-center rounded-lg shrink-0 ${
                                added  ? "bg-emerald-500/20 text-emerald-400" :
                                inList ? "bg-white/5 text-slate-600" :
                                         "bg-white/5 text-slate-500"
                              }`}>
                                {added ? <CheckCircle2 className="w-4 h-4" /> : inList ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                              </span>
                              <span className="flex-1 text-right">{p.name}</span>
                              <CatBadge cat={p.category} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : inputVal.trim() ? null : (
                    <p className="text-center text-slate-600 text-sm py-6">התחל להקליד כדי לחפש מוצר</p>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Edit Modal ── */}
        <AnimatePresence>
          {editItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setEditItem(null)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative bg-slate-900 border border-white/10 rounded-3xl w-full max-w-sm p-6 shadow-2xl"
              >
                <h3 className="text-lg font-bold mb-5 flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-blue-400" />
                  עריכת מוצר
                </h3>
                
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 mr-2">שם המוצר</label>
                    <input 
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm focus:border-blue-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 mr-2">קטגוריה</label>
                    <div className="grid grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto p-1">
                      {categories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setEditCat(cat)}
                          className={`py-2 px-2 rounded-lg text-[11px] font-bold border transition-all ${
                            editCat === cat 
                              ? "bg-blue-600 border-blue-500 text-white" 
                              : "bg-white/5 border-white/5 text-slate-500 hover:border-white/10"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                      
                      {!isAddingCat ? (
                        <button 
                          onClick={() => setIsAddingCat(true)}
                          className="py-2 px-2 rounded-lg text-[11px] font-bold border border-dashed border-white/20 text-slate-500 hover:border-white/40 hover:text-slate-300 transition-all flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          חדש
                        </button>
                      ) : (
                        <div className="col-span-2 flex gap-1 mt-1">
                          <input 
                            autoFocus
                            type="text"
                            value={newCatName}
                            onChange={e => setNewCatName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleAddCategory()}
                            placeholder="שם קטגוריה..."
                            className="flex-1 bg-white/10 border border-white/20 rounded-lg py-1.5 px-3 text-[11px] outline-none focus:border-blue-500"
                          />
                          <button onClick={handleAddCategory} className="bg-blue-600 text-white px-3 rounded-lg text-[11px] font-bold">הוסף</button>
                          <button onClick={() => setIsAddingCat(false)} className="bg-white/10 text-slate-400 px-2 rounded-lg"><X className="w-3 h-3" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-8">
                  <button 
                    onClick={() => setEditItem(null)}
                    className="flex-1 py-3 bg-white/5 rounded-xl font-bold text-sm text-slate-400 hover:bg-white/10 transition-all"
                  >
                    ביטול
                  </button>
                  <button 
                    onClick={handleUpdateItem}
                    className="flex-1 py-3 bg-blue-600 rounded-xl font-bold text-sm text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all"
                  >
                    שמור שינויים
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

// ─── ListView ────────────────────────────────────────────────────────────────

function ListView({
  pending, approved, canApprove, canPurchase, userId,
  confirmDel, setConfirmDel, onStatusChange, onApproveAll, onEdit,
}: {
  pending: ShoppingRequest[];
  approved: ShoppingRequest[];
  canApprove: boolean;
  canPurchase: boolean;
  userId?: string;
  confirmDel: string | null;
  setConfirmDel: (id: string | null) => void;
  onStatusChange: (id: string, s: any, extra?: any) => void;
  onApproveAll: () => void;
  onEdit: (item: ShoppingRequest) => void;
}) {
  if (pending.length === 0 && approved.length === 0) {
    return (
      <div className="text-center py-24 text-slate-600 select-none">
        <ShoppingCart className="w-14 h-14 mx-auto mb-4 opacity-20" />
        <p className="text-lg font-semibold mb-1">הרשימה ריקה</p>
        <p className="text-sm">הקלד מוצר בשורה למטה כדי להוסיף</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Approved checklist ── */}
      {approved.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-emerald-400">לרכישה — {approved.length} מוצרים</h2>
            </div>
            {/* Progress pill */}
            <span className="text-xs text-slate-600">לחץ על שורה לסימון נרכש</span>
          </div>

          <ul className="space-y-1.5" role="list" aria-label="רשימת מוצרים לרכישה">
            {approved.map((req) => (
              <ChecklistRow
                key={req.id}
                req={req}
                canPurchase={canPurchase}
                onPurchase={() => onStatusChange(req.id, "purchased")}
              />
            ))}
          </ul>
        </section>
      )}

      {/* ── Pending for approval ── */}
      {pending.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-amber-400">ממתין לאישור — {pending.length}</h2>
            </div>
            {canApprove && pending.length > 1 && (
              <button
                onClick={onApproveAll}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition-colors min-h-[36px]"
              >
                <Check className="w-3.5 h-3.5" />
                אשר הכל
              </button>
            )}
          </div>

          <ul className="space-y-1.5" role="list" aria-label="בקשות ממתינות לאישור">
            {pending.map((req) => (
              <PendingRow
                key={req.id}
                req={req}
                canApprove={canApprove}
                userId={userId}
                confirmDel={confirmDel}
                onApprove={() => onStatusChange(req.id, "approved")}
                onDelete={() => { onStatusChange(req.id, "deleted"); setConfirmDel(null); }}
                onCancelDel={() => setConfirmDel(null)}
                onConfirmDel={() => setConfirmDel(req.id)}
                onEdit={() => onEdit(req)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─── ChecklistRow ─────────────────────────────────────────────────────────────

function ChecklistRow({ req, canPurchase, onPurchase }: {
  req: ShoppingRequest;
  canPurchase: boolean;
  onPurchase: () => void;
}) {
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    if (!canPurchase) return;
    setPressed(true);
    setTimeout(onPurchase, 180);
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: pressed ? 0.4 : 1, x: 0 }}
      exit={{ opacity: 0, x: 8, scale: 0.97 }}
      transition={{ duration: 0.15 }}
    >
      <button
        onClick={handleClick}
        disabled={!canPurchase}
        aria-label={`סמן ${req.name} כנרכש`}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all text-right ${
          canPurchase
            ? "bg-emerald-500/5 border-emerald-500/15 hover:bg-emerald-500/10 active:scale-[.98] cursor-pointer"
            : "bg-white/5 border-white/5 cursor-default"
        }`}
      >
        {/* Checkbox circle */}
        <div className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
          canPurchase ? "border-emerald-500/50 group-hover:border-emerald-400" : "border-white/15"
        }`} aria-hidden="true" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm text-white">{req.name}</span>
            {req.priority === "urgent" && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
                <Flame className="w-3 h-3" />דחוף
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <CatBadge cat={req.category} />
            {req.quantity && <span className="text-xs text-slate-500">× {req.quantity}</span>}
            <span className="text-xs text-slate-600 flex items-center gap-1">
              <User className="w-3 h-3" />{req.requestedByName || "אנונימי"}
            </span>
          </div>
        </div>

        {canPurchase && (
          <ChevronRight className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
        )}
      </button>
    </motion.li>
  );
}

// ─── PendingRow ───────────────────────────────────────────────────────────────

function PendingRow({ req, canApprove, userId, confirmDel, onApprove, onDelete, onCancelDel, onConfirmDel, onEdit }: {
  req: ShoppingRequest;
  canApprove: boolean;
  userId?: string;
  confirmDel: string | null;
  onApprove: () => void;
  onDelete: () => void;
  onCancelDel: () => void;
  onConfirmDel: () => void;
  onEdit: () => void;
}) {
  const isUrgent     = req.priority === "urgent";
  const isConfirming = confirmDel === req.id;
  const canDelete    = canApprove || req.requestedBy === userId;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={`rounded-2xl border bg-white/5 transition-colors ${isUrgent ? "border-rose-500/30" : "border-white/5"}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-sm text-white">{req.name}</span>
            {isUrgent && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
                <Flame className="w-3 h-3" />דחוף
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CatBadge cat={req.category} />
            {req.quantity && <span className="text-xs text-slate-500">× {req.quantity}</span>}
            <span className="text-xs text-slate-600 flex items-center gap-1">
              <User className="w-3 h-3" />{req.requestedByName || "אנונימי"}
            </span>
          </div>
          {req.notes && <p className="mt-1 text-xs text-slate-500 italic">{req.notes}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isConfirming ? (
            <>
              <button onClick={onDelete} className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-rose-500 text-white text-xs font-semibold hover:bg-rose-400 transition-colors">
                מחק
              </button>
              <button onClick={onCancelDel} aria-label="ביטול" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/10 text-slate-400 hover:bg-white/15 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              {canApprove && (
                <button onClick={onApprove} aria-label={`אשר ${req.name}`} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
                  <Check className="w-4 h-4" />
                </button>
              )}
              {canDelete && (
                <button onClick={onConfirmDel} aria-label={`מחק ${req.name}`} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={onEdit} aria-label={`ערוך ${req.name}`} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                <Edit3 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.li>
  );
}

// ─── ArchiveView ──────────────────────────────────────────────────────────────

function ArchiveView({ items, byDate, onDelete, onExport }: {
  items: ShoppingRequest[];
  byDate: Record<string, ShoppingRequest[]>;
  onDelete: (id: string, s: any) => void;
  onExport: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="text-center py-24 text-slate-600">
        <Clock className="w-14 h-14 mx-auto mb-4 opacity-20" />
        <p className="text-lg font-semibold">הארכיון ריק</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={onExport} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/20 transition-colors min-h-[44px]">
          <Download className="w-4 h-4" />
          ייצוא לאקסל
        </button>
      </div>

      {Object.entries(byDate).sort(([a],[b]) => b.localeCompare(a)).map(([date, list]) => (
        <section key={date}>
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-blue-400">
            <Clock className="w-3.5 h-3.5" />
            {date}
            <span className="text-slate-600 font-normal">— {list.length} מוצרים</span>
          </div>
          <ul className="space-y-1.5">
            {list.map((req) => (
              <li key={req.id} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-500 line-through decoration-slate-700 block truncate">{req.name}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <CatBadge cat={req.category} />
                    {req.quantity && <span className="text-xs text-slate-600">× {req.quantity}</span>}
                  </div>
                </div>
                {confirmDel === req.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => { onDelete(req.id, "deleted"); setConfirmDel(null); }} className="text-xs font-semibold text-rose-400 bg-rose-500/10 px-3 py-2 rounded-lg min-h-[44px]">מחק</button>
                    <button onClick={() => setConfirmDel(null)} className="text-xs text-slate-500 px-3 py-2 min-h-[44px]">ביטול</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDel(req.id)} aria-label={`מחק ${req.name}`} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-700 hover:text-rose-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
