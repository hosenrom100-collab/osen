"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, addDoc, getDocs, query, orderBy, doc,
  updateDoc, deleteDoc, onSnapshot, setDoc, getDoc, writeBatch
} from "firebase/firestore";
import {
  ShoppingCart, Plus, Check, X, Clock, Package, Tag, User,
  Search, Loader2, ArrowRight, Trash2, CheckCircle2, ChevronDown,
  AlertTriangle, Download, Flame
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

interface Product {
  id: string;
  name: string;
  category: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  "גבינות ומחלבה": "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  "בשר ודגים": "bg-rose-500/15 text-rose-400 border-rose-500/20",
  "פירות וירקות": "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  "חומרי ניקוי": "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  "מוצרי נייר וחד פעמי": "bg-slate-500/15 text-slate-400 border-slate-500/20",
  "לחם ומאפים": "bg-amber-700/15 text-amber-500 border-amber-700/20",
  "שימורים ובישול": "bg-orange-500/15 text-orange-400 border-orange-500/20",
  "טואלטיקה והיגיינה": "bg-purple-500/15 text-purple-400 border-purple-500/20",
  "קפואים": "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "כללי": "bg-slate-500/15 text-slate-400 border-slate-500/20",
};

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] ?? CATEGORY_COLORS["כללי"];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {category}
    </span>
  );
}

export default function ShoppingPage() {
  const { user, role, isAdmin } = useAuth();
  const router = useRouter();

  const [requests, setRequests] = useState<ShoppingRequest[]>([]);
  const [productPool, setProductPool] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"active" | "archive">("active");
  const [searchTerm, setSearchTerm] = useState("");

  // Add drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("כללי");
  const [newQuantity, setNewQuantity] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newPriority, setNewPriority] = useState<"normal" | "urgent">("normal");
  const [submitting, setSubmitting] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  // Inline delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [categories, setCategories] = useState([
    "גבינות ומחלבה", "לחם ומאפים", "חומרי ניקוי",
    "מוצרי נייר וחד פעמי", "שימורים ובישול", "פירות וירקות",
    "טואלטיקה והיגיינה", "בשר ודגים", "קפואים", "כללי",
  ]);

  const drawerSearchRef = useRef<HTMLInputElement>(null);

  const canApprove = isAdmin || role === "manager" || role === "logistics";
  const canPurchase = isAdmin || role === "manager" || role === "logistics";

  useEffect(() => {
    const loadCategories = async () => {
      const snap = await getDoc(doc(db, "settings", "shopping"));
      if (snap.exists() && snap.data().categories) setCategories(snap.data().categories);
    };
    loadCategories();
    fetchProductPool();

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
    if (drawerOpen) setTimeout(() => drawerSearchRef.current?.focus(), 100);
  }, [drawerOpen]);

  const fetchProductPool = async () => {
    const snap = await getDocs(collection(db, "product_pool"));
    const list: Product[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Product));
    list.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    setProductPool(list);
  };

  const handleStatusChange = async (
    requestId: string,
    newStatus: "pending" | "approved" | "purchased" | "deleted",
    extra: Record<string, any> = {}
  ) => {
    const req = requests.find((r) => r.id === requestId);
    try {
      if (newStatus === "deleted") {
        await deleteDoc(doc(db, "shopping_requests", requestId));
      } else {
        await updateDoc(doc(db, "shopping_requests", requestId), {
          status: newStatus, updatedAt: new Date(), updatedBy: user?.uid, ...extra,
        });
        if (newStatus === "approved" && req?.requestedBy) {
          sendPush({ userId: req.requestedBy, title: "✅ בקשת רכש אושרה", body: `"${req.name}" אושרה`, link: "/shopping" });
        }
        if (newStatus === "purchased" && req) {
          sendPush({ role: ["admin", "manager", "instructor", "employee"], title: "✔️ מוצר נרכש", body: `"${req.name}" נרכש`, link: "/shopping" });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleQuickAdd = async (product: Product) => {
    const dup = requests.some((r) => r.name === product.name && (r.status === "pending" || r.status === "approved"));
    if (dup) return;
    setJustAdded(product.id);
    setTimeout(() => setJustAdded(null), 1800);
    await addDoc(collection(db, "shopping_requests"), {
      name: product.name, category: product.category, quantity: "", notes: "",
      status: "pending", requestedBy: user?.uid,
      requestedByName: user?.displayName || user?.email, createdAt: new Date(),
    });
  };

  const handleCustomAdd = async () => {
    const name = drawerSearch.trim();
    if (!name) return;
    const dup = requests.some((r) => r.name === name && (r.status === "pending" || r.status === "approved"));
    if (dup) return;
    const docId = name.replace(/\//g, "-");
    await setDoc(doc(db, "product_pool", docId), { name, category: "כללי" }, { merge: true });
    await addDoc(collection(db, "shopping_requests"), {
      name, category: "כללי", quantity: "", notes: "",
      status: "pending", requestedBy: user?.uid,
      requestedByName: user?.displayName || user?.email, createdAt: new Date(),
    });
    setDrawerSearch("");
    fetchProductPool();
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    setSubmitting(true);
    try {
      // Add to pool if it doesn't exist
      const exists = productPool.some(p => p.name.trim() === newName.trim());
      if (!exists) {
        const docId = newName.trim().replace(/\//g, "-");
        await setDoc(doc(db, "product_pool", docId), {
          name: newName.trim(),
          category: newCategory,
        }, { merge: true });
        fetchProductPool();
      }

      await addDoc(collection(db, "shopping_requests"), {
        name: newName, category: newCategory, quantity: newQuantity, notes: newNotes,
        priority: newPriority, status: "pending",
        requestedBy: user?.uid, requestedByName: user?.displayName || user?.email,
        createdAt: new Date(),
      });
      sendPush({
        role: ["admin", "manager", "logistics"],
        title: newPriority === "urgent" ? "🔥 בקשת רכש דחופה" : "🛒 בקשת רכש חדשה",
        body: `${user?.displayName || "משתמש"}: ${newName}`,
        link: "/shopping",
      });
      setNewName(""); setNewCategory("כללי"); setNewQuantity(""); setNewNotes(""); setNewPriority("normal");
      setDrawerOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const exportToExcel = () => {
    const purchased = requests.filter((r) => r.status === "purchased");
    const data = purchased.map((r) => {
      const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      return { תאריך: d.toLocaleDateString("he-IL"), מוצר: r.name, קטגוריה: r.category, כמות: r.quantity || "1", מבקש: r.requestedByName };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ארכיון רכש");
    XLSX.writeFile(wb, `ארכיון_רכש_${new Date().toLocaleDateString("he-IL").replace(/\//g, "-")}.xlsx`);
  };

  const searchFiltered = (arr: ShoppingRequest[]) =>
    arr.filter((r) =>
      r.name.includes(searchTerm) ||
      r.category.includes(searchTerm) ||
      (r.requestedByName || "").includes(searchTerm)
    );

  const pending = searchFiltered(requests.filter((r) => r.status === "pending"));
  const approved = searchFiltered(requests.filter((r) => r.status === "approved"));
  const purchased = searchFiltered(requests.filter((r) => r.status === "purchased"));

  const poolFiltered = productPool.filter(
    (p) =>
      p.name.includes(drawerSearch) || p.category.includes(drawerSearch)
  );

  const poolByCategory = poolFiltered.reduce((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {} as Record<string, Product[]>);

  const alreadyInList = (name: string) =>
    requests.some((r) => r.name === name && (r.status === "pending" || r.status === "approved"));

  const exactMatch = productPool.some((p) => p.name === drawerSearch.trim());

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-slate-950 text-white">

        {/* ── Header ── */}
        <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-white/5 px-4 py-3 sm:px-6">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              aria-label="חזרה לדף הבית"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <ArrowRight className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <ShoppingCart className="w-5 h-5 text-blue-400 shrink-0" />
              <h1 className="text-base font-bold truncate">רשימת קניות</h1>
            </div>

            <div className="flex items-center gap-2 shrink-0 text-xs font-medium">
              {pending.length > 0 && (
                <span className="bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-full">
                  {pending.length} ממתין
                </span>
              )}
              {approved.length > 0 && (
                <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-full">
                  {approved.length} אושר
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ── Search + Tabs ── */}
        <div className="sticky top-[57px] z-20 bg-slate-950/95 backdrop-blur border-b border-white/5 px-4 pt-3 pb-0 sm:px-6">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="search"
                placeholder="חיפוש מוצר, קטגוריה או מגיש..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="חיפוש ברשימת הקניות"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pr-9 pl-4 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
              />
            </div>

            <div role="tablist" className="flex gap-0">
              {[
                { id: "active", label: "רשימה פעילה", count: pending.length + approved.length },
                { id: "archive", label: "ארכיון", count: purchased.length },
              ].map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-blue-500 text-white"
                      : "border-transparent text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`mr-1.5 text-xs ${activeTab === tab.id ? "text-blue-400" : "text-slate-600"}`}>
                      ({tab.count})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Main Content ── */}
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-32" role="tabpanel">
          {loading ? (
            <div className="flex justify-center py-24" aria-live="polite" aria-label="טוען נתונים">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : activeTab === "active" ? (
            <ActiveList
              pending={pending}
              approved={approved}
              canApprove={canApprove}
              canPurchase={canPurchase}
              userId={user?.uid}
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
              onStatusChange={handleStatusChange}
            />
          ) : (
            <ArchiveList items={purchased} onDelete={handleStatusChange} onExport={exportToExcel} />
          )}
        </main>

        {/* ── FAB ── */}
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="הוסף פריט לרשימה"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white px-6 py-3.5 rounded-2xl shadow-2xl shadow-blue-600/40 transition-all font-semibold text-sm"
        >
          <Plus className="w-5 h-5" />
          הוסף לרשימה
        </button>

        {/* ── Add Drawer ── */}
        <AnimatePresence>
          {drawerOpen && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
                onClick={() => setDrawerOpen(false)}
                aria-hidden="true"
              />
              <motion.aside
                key="drawer"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                aria-label="הוספת מוצר"
                role="dialog"
                aria-modal="true"
                dir="rtl"
                className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-white/10 rounded-t-3xl max-h-[92dvh] flex flex-col shadow-2xl"
              >
                {/* Drag handle */}
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-1 shrink-0" />

                {/* Drawer header */}
                <div className="flex items-center justify-between px-5 py-3 shrink-0">
                  <h2 className="text-base font-bold">הוסף לרשימת הקניות</h2>
                  <button
                    onClick={() => setDrawerOpen(false)}
                    aria-label="סגור"
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Search within pool */}
                <div className="px-5 pb-3 shrink-0">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input
                      ref={drawerSearchRef}
                      type="search"
                      placeholder="חפש מוצר מהרשימה..."
                      value={drawerSearch}
                      onChange={(e) => setDrawerSearch(e.target.value)}
                      aria-label="חיפוש מוצר לרשימה"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pr-9 pl-4 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                    />
                  </div>
                </div>

                {/* Custom add button when no match */}
                <AnimatePresence>
                  {drawerSearch.trim() && !exactMatch && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-5 pb-3 shrink-0"
                    >
                      <button
                        onClick={handleCustomAdd}
                        className="w-full flex items-center gap-3 bg-blue-600/15 border border-blue-500/30 text-blue-300 rounded-xl px-4 py-3 text-sm font-medium hover:bg-blue-600/25 transition-colors"
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        הוסף "{drawerSearch.trim()}" לרשימה
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Pool list */}
                <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5">
                  {Object.entries(poolByCategory).map(([cat, prods]) => (
                    <section key={cat}>
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 pb-1 border-b border-white/5">
                        {cat}
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {prods.map((p) => {
                          const inList = alreadyInList(p.name);
                          return (
                            <button
                              key={p.id}
                              onClick={() => !inList && handleQuickAdd(p)}
                              aria-label={inList ? `${p.name} כבר ברשימה` : `הוסף ${p.name}`}
                              aria-pressed={inList}
                              disabled={inList}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-right transition-all min-h-[44px] border ${
                                justAdded === p.id
                                  ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                                  : inList
                                  ? "bg-white/5 border-white/5 text-slate-600 cursor-default"
                                  : "bg-white/5 border-white/5 text-slate-300 hover:bg-white/10 hover:border-white/10 active:scale-95"
                              }`}
                            >
                              {justAdded === p.id ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : inList ? (
                                <Check className="w-4 h-4 text-slate-600 shrink-0" />
                              ) : (
                                <Plus className="w-4 h-4 text-slate-500 shrink-0" />
                              )}
                              <span className="truncate">{p.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}

                  {poolFiltered.length === 0 && drawerSearch && (
                    <p className="text-center text-slate-500 text-sm py-8">לא נמצאו מוצרים תואמים</p>
                  )}

                  {/* Divider before manual form */}
                  <div className="border-t border-white/10 pt-5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                      בקשה עם פרטים נוספים
                    </p>
                    <form onSubmit={handleFormSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="req-name" className="block text-sm font-medium text-slate-400 mb-1.5">
                          שם המוצר <span aria-hidden>*</span>
                        </label>
                        <input
                          id="req-name"
                          list="pool-datalist"
                          value={newName}
                          onChange={(e) => {
                            setNewName(e.target.value);
                            const match = productPool.find((p) => p.name === e.target.value);
                            if (match) setNewCategory(match.category);
                          }}
                          placeholder="מה צריך לקנות?"
                          required
                          className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        />
                        <datalist id="pool-datalist">
                          {productPool.map((p) => <option key={p.id} value={p.name} />)}
                        </datalist>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="req-category" className="block text-sm font-medium text-slate-400 mb-1.5">
                            קטגוריה
                          </label>
                          <select
                            id="req-category"
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors appearance-none"
                          >
                            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="req-quantity" className="block text-sm font-medium text-slate-400 mb-1.5">
                            כמות
                          </label>
                          <input
                            id="req-quantity"
                            type="text"
                            value={newQuantity}
                            onChange={(e) => setNewQuantity(e.target.value)}
                            placeholder='כמה? ק"ג, ארגז...'
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                          />
                        </div>
                      </div>

                      {/* Priority */}
                      <fieldset>
                        <legend className="text-sm font-medium text-slate-400 mb-2">דחיפות</legend>
                        <div className="flex gap-2">
                          {(["normal", "urgent"] as const).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setNewPriority(p)}
                              aria-pressed={newPriority === p}
                              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                                newPriority === p
                                  ? p === "urgent"
                                    ? "bg-rose-500/20 border-rose-500 text-rose-300"
                                    : "bg-blue-600/20 border-blue-500 text-blue-300"
                                  : "bg-white/5 border-transparent text-slate-500 hover:bg-white/10"
                              }`}
                            >
                              {p === "urgent" ? <Flame className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                              {p === "urgent" ? "דחוף" : "רגיל"}
                            </button>
                          ))}
                        </div>
                      </fieldset>

                      <div>
                        <label htmlFor="req-notes" className="block text-sm font-medium text-slate-400 mb-1.5">
                          הערות
                        </label>
                        <textarea
                          id="req-notes"
                          value={newNotes}
                          onChange={(e) => setNewNotes(e.target.value)}
                          placeholder="דגשים מיוחדים..."
                          rows={2}
                          className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submitting || !newName}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        שלח לאישור
                      </button>
                    </form>
                  </div>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </RoleGuard>
  );
}

// ─── Active List Component ───────────────────────────────────────────────────

function ActiveList({
  pending, approved, canApprove, canPurchase, userId,
  confirmDelete, setConfirmDelete, onStatusChange,
}: {
  pending: ShoppingRequest[];
  approved: ShoppingRequest[];
  canApprove: boolean;
  canPurchase: boolean;
  userId?: string;
  confirmDelete: string | null;
  setConfirmDelete: (id: string | null) => void;
  onStatusChange: (id: string, status: any, extra?: any) => void;
}) {
  const total = pending.length + approved.length;

  if (total === 0) {
    return (
      <div className="text-center py-24 text-slate-600">
        <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-base font-medium">הרשימה ריקה</p>
        <p className="text-sm mt-1">לחץ על "הוסף לרשימה" כדי להתחיל</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {approved.length > 0 && (
        <section aria-label="מאושר לרכישה">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-emerald-400">מאושר לרכישה ({approved.length})</h2>
          </div>
          {/* Progress bar */}
          <div className="mb-4">
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(approved.length / (approved.length + pending.length || 1)) * 100}%` }}
                className="h-full bg-emerald-500 rounded-full"
              />
            </div>
          </div>
          <ul className="space-y-2" role="list">
            {approved.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                canApprove={canApprove}
                canPurchase={canPurchase}
                userId={userId}
                confirmDelete={confirmDelete}
                setConfirmDelete={setConfirmDelete}
                onStatusChange={onStatusChange}
              />
            ))}
          </ul>
        </section>
      )}

      {pending.length > 0 && (
        <section aria-label="ממתין לאישור">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-amber-400">ממתין לאישור ({pending.length})</h2>
          </div>
          <ul className="space-y-2" role="list">
            {pending.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                canApprove={canApprove}
                canPurchase={canPurchase}
                userId={userId}
                confirmDelete={confirmDelete}
                setConfirmDelete={setConfirmDelete}
                onStatusChange={onStatusChange}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─── Request Card ────────────────────────────────────────────────────────────

function RequestCard({
  req, canApprove, canPurchase, userId,
  confirmDelete, setConfirmDelete, onStatusChange,
}: {
  req: ShoppingRequest;
  canApprove: boolean;
  canPurchase: boolean;
  userId?: string;
  confirmDelete: string | null;
  setConfirmDelete: (id: string | null) => void;
  onStatusChange: (id: string, status: any, extra?: any) => void;
}) {
  const isUrgent = req.priority === "urgent";
  const isConfirming = confirmDelete === req.id;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={`rounded-2xl border bg-white/5 transition-colors ${
        isUrgent ? "border-rose-500/40 shadow-sm shadow-rose-500/10" : "border-white/5"
      }`}
    >
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-sm text-white truncate">{req.name}</span>
            {isUrgent && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 bg-rose-500/15 border border-rose-500/20 px-2 py-0.5 rounded-full">
                <Flame className="w-3 h-3" />
                דחוף
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <CategoryBadge category={req.category} />
            {req.quantity && (
              <span className="bg-white/5 px-2 py-0.5 rounded-full">כמות: {req.quantity}</span>
            )}
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {req.requestedByName || "אנונימי"}
            </span>
          </div>
          {req.notes && (
            <p className="mt-1.5 text-xs text-slate-500 italic">{req.notes}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {req.status === "pending" && (
            <>
              {canApprove && (
                <>
                  <button
                    onClick={() => onStatusChange(req.id, "approved")}
                    aria-label={`אשר רכישת ${req.name}`}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  {isConfirming ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { onStatusChange(req.id, "deleted"); setConfirmDelete(null); }}
                        aria-label="אשר מחיקה"
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-rose-500 text-white transition-colors text-xs font-semibold px-3"
                      >
                        מחק
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        aria-label="ביטול מחיקה"
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/10 text-slate-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(req.id)}
                      aria-label={`דחה בקשת ${req.name}`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
              {!canApprove && req.requestedBy === userId && (
                isConfirming ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { onStatusChange(req.id, "deleted"); setConfirmDelete(null); }}
                      className="min-w-[44px] min-h-[44px] px-3 flex items-center justify-center rounded-xl bg-rose-500 text-white text-xs font-semibold"
                    >
                      מחק
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/10 text-slate-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(req.id)}
                    aria-label={`מחק בקשת ${req.name}`}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              )}
            </>
          )}
          {req.status === "approved" && canPurchase && (
            <button
              onClick={() => onStatusChange(req.id, "purchased")}
              aria-label={`סמן ${req.name} כנרכש`}
              className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 transition-all px-3 shadow-lg shadow-emerald-600/25"
            >
              <Check className="w-4 h-4" />
              <span className="text-[10px] font-bold leading-none">נרכש</span>
            </button>
          )}
        </div>
      </div>
    </motion.li>
  );
}

// ─── Archive Component ───────────────────────────────────────────────────────

function ArchiveList({
  items, onDelete, onExport,
}: {
  items: ShoppingRequest[];
  onDelete: (id: string, status: any) => void;
  onExport: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const grouped = items.reduce((acc, item) => {
    const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
    const key = d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {} as Record<string, ShoppingRequest[]>);

  if (items.length === 0) {
    return (
      <div className="text-center py-24 text-slate-600">
        <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-base font-medium">הארכיון ריק</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/20 transition-colors min-h-[44px]"
        >
          <Download className="w-4 h-4" />
          ייצוא לאקסל
        </button>
      </div>

      {Object.entries(grouped)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, dateItems]) => (
          <section key={date}>
            <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-blue-400">{date}</span>
              <span>— {dateItems.length} מוצרים</span>
            </div>
            <ul className="space-y-2" role="list">
              {dateItems.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl px-4 py-3"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-400 line-through decoration-slate-600 truncate block">
                      {req.name}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <CategoryBadge category={req.category} />
                      {req.quantity && <span className="text-xs text-slate-600">כמות: {req.quantity}</span>}
                    </div>
                  </div>
                  {confirmDelete === req.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { onDelete(req.id, "deleted"); setConfirmDelete(null); }}
                        className="text-xs font-semibold text-rose-400 bg-rose-500/10 px-3 py-2 rounded-lg min-h-[44px]"
                      >
                        מחק
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs text-slate-500 px-3 py-2 min-h-[44px]"
                      >
                        ביטול
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(req.id)}
                      aria-label={`מחק ${req.name} מהארכיון`}
                      className="p-2 text-slate-700 hover:text-rose-500 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
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
