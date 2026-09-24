"use client";

import { useState, useRef, useEffect } from "react";
import { Product, ShoppingRequest, TargetFramework } from "../types";
import { Plus, Search, Star, X, Flame, CheckCircle2, AlertTriangle, Minus, ArrowRight, Sparkles, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { rankSimilarProducts, findSimilarProduct } from "../lib/stringUtils";
import { MEASUREMENT_UNITS, CAT_COLOR, CAT_SOLID, TARGET_FRAMEWORKS } from "../lib/constants";
import { DEFAULT_CATEGORIES } from "../lib/constants";
import { getQuantityStep, getMinQuantity, steppedQuantity } from "../lib/quantityUtils";

interface AddProductOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  pool: Product[];
  categories?: string[];
  isAdmin: boolean;
  isManager?: boolean;
  isLogistics?: boolean;
  isFrozen?: boolean;
  initialMode?: "favorites" | "search";
  targetFramework?: TargetFramework;
  onTargetFrameworkChange?: (fw: TargetFramework) => void;
  onAddProduct: (name: string, category?: string, priority?: "normal" | "urgent", quantity?: string, notes?: string, requestedByOverride?: { uid: string; name: string }, targetFramework?: TargetFramework) => Promise<boolean>;
  onRequestNewProduct: (name: string, category?: string, priority?: "normal" | "urgent", quantity?: string, targetFramework?: TargetFramework) => Promise<boolean>;
  requests: ShoppingRequest[];
}

interface PendingAdd {
  name: string;
  category: string;
  defaultNotes?: string;
  isNew: boolean;
}

const QUICK_QTY_CHIPS = [1, 2, 3, 5, 10];

export function AddProductOverlay({
  isOpen,
  onClose,
  pool,
  requests,
  onAddProduct,
  onRequestNewProduct,
  isAdmin,
  isManager,
  isLogistics,
  isFrozen,
  categories = [],
  initialMode = "favorites",
  targetFramework = "main",
  onTargetFrameworkChange,
}: AddProductOverlayProps) {
  const [activeMode, setActiveMode] = useState<"favorites" | "search">(initialMode);
  const [inputVal, setInputVal] = useState("");
  const [pending, setPending] = useState<PendingAdd | null>(null);
  const [qtyValue, setQtyValue] = useState(1);
  const [qtyUnit, setQtyUnit] = useState("יחידות");
  const [urgent, setUrgent] = useState(false);
  const [selectedFramework, setSelectedFramework] = useState<TargetFramework>(targetFramework);
  const [showReminder, setShowReminder] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const canAddDirectly = isAdmin || isManager || isLogistics;
  const isUserBlockedByFreeze = isFrozen && !canAddDirectly;

  // Reset state on open + check reminder preferences
  useEffect(() => {
    if (isOpen) {
      submittingRef.current = false;
      setActiveMode(initialMode);
      setInputVal("");
      setPending(null);
      setQtyValue(1);
      setQtyUnit("יחידות");
      setUrgent(false);
      setSelectedFramework(targetFramework);
      setAddedCount(0);
      setFeedback(null);

      const isDismissed = typeof window !== "undefined" && localStorage.getItem("hosen_dismiss_shopping_framework_reminder") === "true";
      if (!isDismissed) {
        setShowReminder(true);
        const timer = setTimeout(() => {
          setShowReminder(false);
        }, 7000);
        return () => clearTimeout(timer);
      }
    } else {
      setShowReminder(false);
    }
  }, [isOpen, initialMode, targetFramework]);

  // Ephemeral confirmation toast — fades on its own, never blocks the next pick
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 2200);
    return () => clearTimeout(t);
  }, [feedback]);

  const handleDismissReminder = (dontShowAgain: boolean) => {
    setShowReminder(false);
    if (dontShowAgain && typeof window !== "undefined") {
      localStorage.setItem("hosen_dismiss_shopping_framework_reminder", "true");
    }
  };

  const alreadyInList = (name: string) =>
    requests.some((r) => r.name === name && r.status !== "deleted");

  const selectProduct = (product: Pick<Product, "name" | "category" | "defaultUnit" | "defaultNotes">) => {
    if (isUserBlockedByFreeze || alreadyInList(product.name)) return;
    setPending({ name: product.name, category: product.category, defaultNotes: product.defaultNotes, isNew: false });
    setQtyValue(1);
    setQtyUnit(product.defaultUnit || "יחידות");
    setUrgent(false);
  };

  const selectNewProduct = (name: string) => {
    const cleanName = name.trim();
    if (!cleanName || isUserBlockedByFreeze) return;
    setPending({ name: cleanName, category: "", isNew: true });
    setQtyValue(1);
    setQtyUnit("יחידות");
    setUrgent(false);
  };

  const step = getQuantityStep(qtyUnit);
  const min = getMinQuantity(qtyUnit);

  const handleConfirmAdd = async () => {
    if (!pending || submittingRef.current) return;
    if (pending.isNew && !pending.category) return;
    submittingRef.current = true;

    const finalQty = qtyUnit === "יחידות" ? String(qtyValue) : `${qtyValue} ${qtyUnit}`;
    const priority = urgent ? "urgent" : "normal";
    const { name, isNew } = pending;

    let success: boolean;
    if (isNew) {
      success = canAddDirectly
        ? await onAddProduct(name, pending.category, priority, finalQty, undefined, undefined, selectedFramework)
        : await onRequestNewProduct(name, pending.category, priority, finalQty, selectedFramework);
    } else {
      success = await onAddProduct(name, pending.category, priority, finalQty, pending.defaultNotes, undefined, selectedFramework);
    }

    submittingRef.current = false;
    if (!success) return;

    // Stay open so the person can keep adding items in one continuous run.
    setAddedCount((c) => c + 1);
    setFeedback(isNew && !canAddDirectly ? `✓ הבקשה להוספת "${name}" נשלחה` : `✓ "${name}" נוסף (${finalQty})`);
    setPending(null);
    setQtyValue(1);
    setQtyUnit("יחידות");
    setUrgent(false);

    if (activeMode === "search") {
      setInputVal("");
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  };

  const starProducts = pool.filter((p) => p.isActive !== false && p.isStar === true);
  const suggestions = inputVal.trim()
    ? rankSimilarProducts(inputVal, pool.filter((p) => p.isActive !== false), 20)
    : [];
  const hasExactMatch = pool.some((p) => p.name.trim().toLowerCase() === inputVal.trim().toLowerCase());

  // Group frequent (star) products by category for Listonic-like structured layout
  const frequentByCategory = starProducts.reduce((acc, p) => {
    const cat = p.category || "כללי";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {} as Record<string, Product[]>);

  const showStep2 = pending?.isNew === true;
  const showQuickBar = pending !== null && !pending.isNew;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
          />

          <motion.div
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.5 }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="relative w-full h-[100dvh] md:h-auto md:max-h-[85vh] md:max-w-xl bg-[var(--surface)] border-t md:border border-[var(--border)] rounded-t-[1.25rem] md:rounded-[2.5rem] p-3 sm:p-5 md:p-6 shadow-2xl text-right flex flex-col overflow-hidden"
            dir="rtl"
          >
            <div className="w-12 h-1 bg-[var(--border)] rounded-full mx-auto mb-2.5 md:hidden shrink-0" />

            {/* Framework context bar — single scrollable row to save vertical space */}
            <div className="flex items-center gap-1.5 mb-2.5 shrink-0">
              <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {TARGET_FRAMEWORKS.map((fw) => {
                  const active = selectedFramework === fw.id;
                  return (
                    <button
                      key={fw.id}
                      type="button"
                      onClick={() => {
                        setSelectedFramework(fw.id);
                        if (onTargetFrameworkChange) onTargetFrameworkChange(fw.id);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer border whitespace-nowrap shrink-0 ${
                        active
                          ? `${fw.activeBg} border-transparent !text-white shadow-xs`
                          : `${fw.pillInactive} border`
                      }`}
                    >
                      {fw.shortName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between mb-3 shrink-0 gap-2">
              <h2 className="text-base md:text-xl font-black flex items-center gap-2 min-w-0">
                {showStep2 ? (
                  <button
                    onClick={() => setPending(null)}
                    className="p-1.5 -mr-1.5 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer border-none bg-transparent shrink-0"
                    title="חזרה לבחירת מוצר"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>
                ) : null}
                <span className="truncate">{showStep2 ? "כמה להוסיף?" : "הוספת מוצר לרשימה"}</span>
                {!showStep2 && addedCount > 0 && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                    נוספו {addedCount}
                  </span>
                )}
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer border-none bg-transparent shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Confirmation toast — floats over the content, never shifts layout */}
            <div className="relative shrink-0 h-0">
              <AnimatePresence>
                {feedback && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute -top-1 inset-x-0 z-30 flex justify-center pointer-events-none"
                  >
                    <span className="px-3 py-1.5 rounded-full bg-emerald-600 !text-white text-[11px] font-black shadow-lg flex items-center gap-1.5 max-w-[92%] truncate">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{feedback}</span>
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Dissolve Reminder Banner */}
            <AnimatePresence>
              {showReminder && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: "auto", marginBottom: 10 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                  className="overflow-hidden shrink-0"
                >
                  <div className="p-2.5 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-sm">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-amber-800 dark:text-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>שים לב שאתה מזין את הרשימה הנכונה!</span>
                    </div>
                    <div className="flex items-center gap-1.5 mr-auto sm:mr-0 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDismissReminder(false)}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-200 text-[11px] font-bold transition-all cursor-pointer border-none"
                      >
                        הבנתי
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissReminder(true)}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-black transition-all cursor-pointer border-none shadow-xs"
                      >
                        אל תציג שוב
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {showStep2 && pending ? (
              /* ── Step 2: new product needs a category before it can be added ── */
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-5">
                <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/15">
                  <span className="text-lg font-black text-[var(--foreground)]">{pending.name}</span>
                </div>

                <div>
                  <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
                    קטגוריה (חובה למוצר חדש)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[...DEFAULT_CATEGORIES, ...categories]
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setPending((p) => (p ? { ...p, category: c } : p))}
                          className={`py-1.5 px-3 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                            pending.category === c
                              ? `${CAT_SOLID[c] ?? CAT_SOLID["כללי"]} !text-white shadow-sm border-transparent`
                              : "bg-[var(--background)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
                    כמות
                  </label>
                  <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar">
                    {QUICK_QTY_CHIPS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQtyValue(q)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all cursor-pointer shrink-0 ${
                          qtyValue === q
                            ? "bg-indigo-600 !text-white border-transparent"
                            : "bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]"
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQtyValue((v) => steppedQuantity(v, step, -1, min))}
                      className="w-12 h-12 rounded-xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0"
                    >
                      <Minus className="w-5 h-5 stroke-[3] text-[var(--foreground)]" />
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={qtyValue}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value.replace(",", "."));
                        setQtyValue(Number.isNaN(v) ? 0 : v);
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 text-center bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 text-xl font-black focus:outline-none focus:border-indigo-500/50 text-[var(--foreground)]"
                    />
                    <button
                      onClick={() => setQtyValue((v) => steppedQuantity(v, step, 1))}
                      className="w-12 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0"
                    >
                      <Plus className="w-5 h-5 stroke-[3] text-white" />
                    </button>
                    <select
                      value={qtyUnit}
                      onChange={(e) => setQtyUnit(e.target.value)}
                      className="bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-2 text-sm font-bold focus:outline-none focus:border-indigo-500/40 text-[var(--foreground)] shrink-0"
                    >
                      {MEASUREMENT_UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => setUrgent((v) => !v)}
                  className={`w-full flex items-center justify-between border rounded-2xl p-3.5 transition-all cursor-pointer ${
                    urgent ? "border-rose-500/40 bg-rose-500/10" : "border-[var(--border)] bg-[var(--background)]/20"
                  }`}
                >
                  <span className={`flex items-center gap-2 text-sm font-black ${urgent ? "text-rose-500" : "text-[var(--foreground)]"}`}>
                    <Flame className="w-4 h-4" />
                    בקשה דחופה 🔥
                  </span>
                  <span className={`w-10 h-6 rounded-full p-0.5 transition-all flex items-center ${urgent ? "bg-rose-500 justify-end" : "bg-[var(--foreground)]/15 justify-start"}`}>
                    <span className="w-5 h-5 rounded-full bg-white shadow-sm block" />
                  </span>
                </button>
              </div>
            ) : (
              /* ── Step 1: search / choose product (Listonic Style) ── */
              <>
                {/* View Selector Tabs (Favorites vs Search) */}
                <div className="flex items-center gap-1.5 p-1 bg-[var(--background)] border border-[var(--border)] rounded-2xl mb-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMode("favorites");
                      setInputVal("");
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none ${
                      activeMode === "favorites"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-[var(--muted)] hover:text-[var(--foreground)] bg-transparent"
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${activeMode === "favorites" ? "fill-white" : ""}`} />
                    <span>מוצרים נפוצים</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveMode("search")}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none ${
                      activeMode === "search"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-[var(--muted)] hover:text-[var(--foreground)] bg-transparent"
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>חיפוש בהקלדה</span>
                  </button>
                </div>

                {/* Search Bar Input (shown in search mode, or if user starts typing in search mode) */}
                {activeMode === "search" && (
                  <div className="relative group mb-3 shrink-0">
                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      autoFocus
                      type="text"
                      role="combobox"
                      aria-expanded={suggestions.length > 0}
                      aria-autocomplete="list"
                      aria-label="חפש או הקלד מוצר להוספה"
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const exact = pool.find((p) => p.name.trim().toLowerCase() === inputVal.trim().toLowerCase());
                          if (exact) selectProduct(exact);
                          else selectNewProduct(inputVal);
                        }
                        if (e.key === "Escape") onClose();
                      }}
                      placeholder="הקלד שם מוצר להוספה..."
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl py-3 pr-11 pl-10 text-sm font-bold focus:outline-none focus:border-indigo-500/50 transition-all text-right placeholder:text-[var(--muted)]/50 text-[var(--foreground)] shadow-xs"
                    />
                    {inputVal && (
                      <button
                        type="button"
                        onClick={() => setInputVal("")}
                        className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors cursor-pointer border-none flex items-center justify-center"
                        title="נקה חיפוש"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                {isUserBlockedByFreeze && (
                  <div className="mb-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-2 text-right shrink-0">
                    <span className="text-base">🔒</span>
                    <span>הרשימה מוקפאת כרגע לקראת רכש. הזנת מוצרים חדשים תתאפשר מחדש לאחר פתיחת סבב חדש.</span>
                  </div>
                )}

                {/* Search Mode Content */}
                {activeMode === "search" ? (
                  <div className={`flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 no-scrollbar ${showQuickBar ? "pb-56" : "pb-4"}`}>
                    {!inputVal.trim() ? (
                      <div className="py-12 text-center bg-[var(--foreground)]/[0.02] border border-dashed border-[var(--border)] rounded-2xl p-6">
                        <Search className="w-8 h-8 text-indigo-500 mx-auto mb-2 opacity-60" />
                        <p className="text-xs font-bold text-[var(--foreground)] mb-1">הקלד בתיבה שלמעלה לחפש מוצר</p>
                        <p className="text-[11px] text-[var(--muted)]">תוכל לחפש מוצר מהמאגר או להוסיף מוצר חדש לגמרי.</p>
                      </div>
                    ) : (
                      (() => {
                        const similarProduct = findSimilarProduct(inputVal, pool);
                        const hasExactMatchInput = pool.some((p) => p.name.trim().toLowerCase() === inputVal.trim().toLowerCase());

                        return (
                          <>
                            {similarProduct && !hasExactMatchInput && (
                              <div className="mb-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2 shrink-0">
                                <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                  <span className="text-xs font-black">⚠️ אולי כבר קיים "{similarProduct.name}" ברשימה?</span>
                                </div>
                                <button
                                  disabled={isUserBlockedByFreeze}
                                  onClick={() => selectProduct(similarProduct)}
                                  className="w-full px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 font-black text-xs border border-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>בחר "{similarProduct.name}"</span>
                                </button>
                              </div>
                            )}

                            {!hasExactMatch && (
                              <button
                                onClick={() => selectNewProduct(inputVal)}
                                disabled={isUserBlockedByFreeze}
                                className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 !text-white font-black text-sm shadow-md shadow-indigo-600/15 active:scale-[0.98] transition-all cursor-pointer border-none shrink-0 disabled:opacity-40"
                              >
                                <span className="!text-white">
                                  {canAddDirectly ? `הוסף "${inputVal}" חדש` : `לא מצאת? בקש הוספת "${inputVal}"`}
                                </span>
                                <Plus className="w-5 h-5 !text-white" />
                              </button>
                            )}

                            {suggestions.map((p) => {
                              const inList = alreadyInList(p.name);
                              const disabled = inList || isUserBlockedByFreeze;
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => selectProduct(p)}
                                  disabled={disabled}
                                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-[var(--border)] transition-all active:scale-[0.98] cursor-pointer text-right shrink-0 ${
                                    disabled
                                      ? "opacity-40 bg-transparent cursor-not-allowed"
                                      : "bg-[var(--foreground)]/[0.02] hover:border-indigo-500/50 hover:bg-[var(--foreground)]/[0.04]"
                                  }`}
                                >
                                  <div className="flex flex-col items-start gap-0.5">
                                    <span className="text-sm font-bold text-[var(--foreground)]">{p.name}</span>
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${CAT_COLOR[p.category] || CAT_COLOR["כללי"]}`}>
                                      {p.category}
                                    </span>
                                  </div>
                                  {inList ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Plus className="w-4 h-4 text-indigo-500" />}
                                </button>
                              );
                            })}
                          </>
                        );
                      })()
                    )}
                  </div>
                ) : (
                  /* Favorites / Frequent Products View (Listonic Style Cards - No Keyboard) */
                  <div className={`flex-1 overflow-y-auto min-h-0 space-y-4 pr-1 no-scrollbar ${showQuickBar ? "pb-56" : "pb-4"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-[var(--foreground)] flex items-center gap-1.5">
                        <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                        מוצרים נפוצים לבחירה מהירה
                      </span>
                      <span className="text-[10px] font-bold text-[var(--muted)]">
                        נגיעה להוספה
                      </span>
                    </div>

                    {starProducts.length === 0 ? (
                      <div className="py-12 text-center bg-[var(--foreground)]/[0.02] border border-dashed border-[var(--border)] rounded-2xl p-6">
                        <Sparkles className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-60" />
                        <p className="text-xs font-bold text-[var(--foreground)] mb-1">אין עדיין מוצרים נפוצים</p>
                        <p className="text-[11px] text-[var(--muted)] mb-3">ניתן להגדיר מוצרים נפוצים דרך תפריט הניהול ⭐ או לעבור לחיפוש בהקלדה.</p>
                        <button
                          type="button"
                          onClick={() => setActiveMode("search")}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-500 transition cursor-pointer border-none"
                        >
                          עבור לחיפוש בהקלדה 🔍
                        </button>
                      </div>
                    ) : (
                      Object.entries(frequentByCategory).map(([catName, items]) => (
                        <div key={catName} className="space-y-2">
                          <div className="sticky -top-px z-10 bg-[var(--surface)] flex items-center gap-2 py-1">
                            <span className={`inline-block text-[10px] font-black px-2.5 py-0.5 rounded-lg ${CAT_COLOR[catName] || CAT_COLOR["כללי"]}`}>
                              {catName}
                            </span>
                            <div className="flex-1 h-[1px] bg-[var(--border)]/60" />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {items.map((p) => {
                              const inList = alreadyInList(p.name);
                              const disabled = inList || isUserBlockedByFreeze;
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => selectProduct(p)}
                                  disabled={disabled}
                                  className={`p-2.5 rounded-2xl border text-right transition-all flex flex-col justify-between gap-1.5 active:scale-95 cursor-pointer min-h-[60px] shadow-xs relative overflow-hidden group ${
                                    disabled
                                      ? "bg-[var(--foreground)]/[0.02] border-[var(--border)]/40 opacity-45 cursor-not-allowed"
                                      : "bg-[var(--surface)] hover:bg-indigo-500/5 border-[var(--border)] hover:border-indigo-500/30"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-1 w-full">
                                    <span className="text-[11px] font-black text-[var(--foreground)] line-clamp-2 leading-tight">
                                      {p.name}
                                    </span>
                                    {inList ? (
                                      <span className="p-0.5 rounded-full bg-emerald-500/10 text-emerald-500 shrink-0">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                      </span>
                                    ) : (
                                      <span className="p-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}

            {showStep2 && pending && (
              <div className="pt-4 mt-2 border-t border-[var(--border)]/60 shrink-0">
                <button
                  onClick={handleConfirmAdd}
                  disabled={isUserBlockedByFreeze || !pending.category || !qtyValue}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 !text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  הוסף לרשימה
                </button>
              </div>
            )}

            {/* ── Quick-add bar for an existing product: quantity + confirm, list stays visible behind it ── */}
            <AnimatePresence>
              {showQuickBar && pending && (
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 260 }}
                  className="absolute inset-x-0 bottom-0 z-20 bg-[var(--surface)] border-t border-[var(--border)] rounded-t-2xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
                >
                  <div className="flex items-center justify-between mb-2.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-black text-[var(--foreground)] truncate">{pending.name}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${CAT_COLOR[pending.category] ?? CAT_COLOR["כללי"]}`}>
                        {pending.category}
                      </span>
                    </div>
                    <button
                      onClick={() => setPending(null)}
                      className="p-1 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer border-none bg-transparent shrink-0"
                      title="ביטול"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 mb-2.5 overflow-x-auto no-scrollbar">
                    {QUICK_QTY_CHIPS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQtyValue(q)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all cursor-pointer shrink-0 ${
                          qtyValue === q
                            ? "bg-indigo-600 !text-white border-transparent"
                            : "bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]"
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQtyValue((v) => steppedQuantity(v, step, -1, min))}
                      className="w-11 h-11 rounded-xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0"
                    >
                      <Minus className="w-5 h-5 stroke-[3] text-[var(--foreground)]" />
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={qtyValue}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value.replace(",", "."));
                        setQtyValue(Number.isNaN(v) ? 0 : v);
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 text-center bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 text-lg font-black focus:outline-none focus:border-indigo-500/50 text-[var(--foreground)]"
                    />
                    <button
                      onClick={() => setQtyValue((v) => steppedQuantity(v, step, 1))}
                      className="w-11 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0"
                    >
                      <Plus className="w-5 h-5 stroke-[3] text-white" />
                    </button>
                    <select
                      value={qtyUnit}
                      onChange={(e) => setQtyUnit(e.target.value)}
                      className="bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-1.5 text-xs font-bold focus:outline-none focus:border-indigo-500/40 text-[var(--foreground)] shrink-0 max-w-[74px]"
                    >
                      {MEASUREMENT_UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setUrgent((v) => !v)}
                      title="בקשה דחופה"
                      className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-90 cursor-pointer border shrink-0 ${
                        urgent ? "bg-rose-500 border-transparent" : "bg-[var(--background)] border-[var(--border)]"
                      }`}
                    >
                      <Flame className={`w-5 h-5 ${urgent ? "text-white" : "text-[var(--muted)]"}`} />
                    </button>
                  </div>

                  <button
                    onClick={handleConfirmAdd}
                    disabled={isUserBlockedByFreeze || !qtyValue}
                    className="w-full mt-2.5 py-3 bg-indigo-600 hover:bg-indigo-500 !text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    הוסף לרשימה
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
