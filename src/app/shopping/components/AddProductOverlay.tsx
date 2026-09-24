"use client";

import { useState, useRef, useEffect } from "react";
import { CycleItemSnapshot, Product, ShoppingRequest, TargetFramework } from "../types";
import { Plus, Search, X, Flame, CheckCircle2, AlertTriangle, Minus, ArrowRight, Sparkles, MapPin, History } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { rankSimilarProducts, findSimilarProduct } from "../lib/stringUtils";
import { MEASUREMENT_UNITS, CAT_COLOR, CAT_SOLID, TARGET_FRAMEWORKS } from "../lib/constants";
import { DEFAULT_CATEGORIES } from "../lib/constants";
import { getQuantityStep, getMinQuantity, steppedQuantity, parseQuantity, getQuickQtyChips, formatUnitShort } from "../lib/quantityUtils";

interface AddProductOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  pool: Product[];
  categories?: string[];
  isAdmin: boolean;
  isManager?: boolean;
  isLogistics?: boolean;
  isFrozen?: boolean;
  targetFramework?: TargetFramework;
  onTargetFrameworkChange?: (fw: TargetFramework) => void;
  onAddProduct: (name: string, category?: string, priority?: "normal" | "urgent", quantity?: string, notes?: string, requestedByOverride?: { uid: string; name: string }, targetFramework?: TargetFramework) => Promise<boolean>;
  onRequestNewProduct: (name: string, category?: string, priority?: "normal" | "urgent", quantity?: string, targetFramework?: TargetFramework) => Promise<boolean>;
  /** Powers the inline +/− stepper on the favorites list — adjusts an already-requested item's quantity in place. */
  onUpdateQuantity: (id: string, currentQtyStr: string, increment: number) => void;
  /** Called when the stepper is decremented down to zero — removes the item from the list. */
  onRemoveItem: (id: string) => void;
  requests: ShoppingRequest[];
  /** Items of the last closed cycle — offered as one-tap re-orders for what isn't on the list yet. */
  lastCycleItems?: CycleItemSnapshot[];
}

interface PendingAdd {
  name: string;
  category: string;
  defaultNotes?: string;
  isNew: boolean;
}

export function AddProductOverlay({
  isOpen,
  onClose,
  pool,
  requests,
  onAddProduct,
  onRequestNewProduct,
  onUpdateQuantity,
  onRemoveItem,
  isAdmin,
  isManager,
  isLogistics,
  isFrozen,
  categories = [],
  lastCycleItems = [],
  targetFramework = "main",
  onTargetFrameworkChange,
}: AddProductOverlayProps) {
  const [inputVal, setInputVal] = useState("");
  const [pending, setPending] = useState<PendingAdd | null>(null);
  const [qtyValue, setQtyValue] = useState(1);
  const [qtyUnit, setQtyUnit] = useState("יחידות");
  const [urgent, setUrgent] = useState(false);
  const [selectedFramework, setSelectedFramework] = useState<TargetFramework>(targetFramework);
  const [addedCount, setAddedCount] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const canAddDirectly = isAdmin || isManager || isLogistics;
  const isUserBlockedByFreeze = isFrozen && !canAddDirectly;

  // Reset state on open
  useEffect(() => {
    if (!isOpen) return;
    submittingRef.current = false;
    setInputVal("");
    setPending(null);
    setQtyValue(1);
    setQtyUnit("יחידות");
    setUrgent(false);
    setSelectedFramework(targetFramework);
    setAddedCount(0);
    setFeedback(null);
  }, [isOpen, targetFramework]);

  // Autofocus the search box only on desktop-class devices: on a phone the keyboard would
  // pop up over the favorites the person most likely came here to tap.
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    if (window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen]);

  // Ephemeral confirmation toast — fades on its own, never blocks the next pick
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 2200);
    return () => clearTimeout(t);
  }, [feedback]);

  // Scoped to the currently selected framework — the same product can be requested
  // separately for each framework, so a "lower" request must not block "main", etc.
  const alreadyInList = (name: string) =>
    requests.some(
      (r) => r.name === name && r.status !== "deleted" && (r.targetFramework || "main") === selectedFramework
    );

  const getActiveRequest = (name: string) =>
    requests.find(
      (r) => r.name === name && r.status !== "deleted" && (r.targetFramework || "main") === selectedFramework
    );

  // Favorites tap-to-add: one tap adds qty 1 directly, no quantity screen in between.
  // Further taps become +/− on the same row once it's in the list. Uses its own busy
  // flag (state, not a ref) so the guard never runs into "ref read during render" lint.
  const [favBusy, setFavBusy] = useState(false);
  const quickAdd = async (product: Pick<Product, "name" | "category" | "defaultUnit" | "defaultNotes">) => {
    if (isUserBlockedByFreeze || favBusy) return;
    setFavBusy(true);
    const success = await onAddProduct(product.name, product.category, "normal", "1", product.defaultNotes, undefined, selectedFramework);
    setFavBusy(false);
    if (!success) return;
    setAddedCount((c) => c + 1);
    setFeedback(`✓ "${product.name}" נוסף`);
  };

  // "Ordered last cycle" suggestions: only what this framework ordered last time and that
  // isn't on its list now (any status but deleted, matching alreadyInList's notion of "in").
  const normName = (s: string) => s.trim().toLowerCase();
  const namesInList = new Set(
    requests
      .filter((r) => r.status !== "deleted" && (r.targetFramework || "main") === selectedFramework)
      .map((r) => normName(r.name))
  );
  const lastOrdered = lastCycleItems.filter((item, idx, all) => {
    const key = normName(item.name);
    return (
      item.targetFramework === selectedFramework &&
      !namesInList.has(key) &&
      all.findIndex((o) => o.targetFramework === selectedFramework && normName(o.name) === key) === idx
    );
  });

  const addFromLast = async (item: CycleItemSnapshot) => {
    if (isUserBlockedByFreeze || favBusy) return;
    setFavBusy(true);
    const success = await onAddProduct(item.name, item.category, "normal", item.quantity, item.notes || undefined, undefined, selectedFramework);
    setFavBusy(false);
    if (!success) return;
    setAddedCount((c) => c + 1);
    setFeedback(`✓ "${item.name}" נוסף (${item.quantity})`);
  };

  const addAllFromLast = async () => {
    if (isUserBlockedByFreeze || favBusy) return;
    setFavBusy(true);
    let added = 0;
    for (const item of lastOrdered) {
      const success = await onAddProduct(item.name, item.category, "normal", item.quantity, item.notes || undefined, undefined, selectedFramework);
      if (success) added++;
    }
    setFavBusy(false);
    if (added === 0) return;
    setAddedCount((c) => c + added);
    setFeedback(`✓ נוספו ${added} מוצרים מהסבב הקודם`);
  };

  const quickInc = (request: ShoppingRequest) => onUpdateQuantity(request.id, request.quantity, 1);

  const quickDec = (request: ShoppingRequest) => {
    const { value } = parseQuantity(request.quantity);
    if (value <= 1) onRemoveItem(request.id);
    else onUpdateQuantity(request.id, request.quantity, -1);
  };

  const selectProduct = (product: Pick<Product, "name" | "category" | "defaultUnit" | "defaultNotes">) => {
    if (isUserBlockedByFreeze || alreadyInList(product.name)) return;
    const unit = product.defaultUnit || "יחידות";
    const initialQty = unit === "גרם" || unit === "מ״ל" ? 200 : 1;
    setPending({ name: product.name, category: product.category, defaultNotes: product.defaultNotes, isNew: false });
    setQtyValue(initialQty);
    setQtyUnit(unit);
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

  const handleUnitChange = (newUnit: string) => {
    setQtyUnit(newUnit);
    if ((newUnit === "גרם" || newUnit === "מ״ל") && qtyValue < 50) {
      setQtyValue(200);
    } else if ((newUnit === "יחידות" || newUnit === "ק״ג" || newUnit === "ליטר" || newUnit === "אריזות" || newUnit === "קופסאות" || newUnit === "בקבוקים") && qtyValue >= 50) {
      setQtyValue(1);
    }
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

    if (inputVal.trim()) {
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
            className="relative w-full h-[100dvh] md:h-auto md:max-h-[85vh] md:max-w-xl bg-[var(--surface)] border-t md:border border-[var(--border)] rounded-t-[1.25rem] md:rounded-3xl p-3 sm:p-5 md:p-6 shadow-2xl text-right flex flex-col overflow-hidden"
            dir="rtl"
          >
            <div className="w-12 h-1 bg-[var(--border)] rounded-full mx-auto mb-2.5 md:hidden shrink-0" />

            {/* Header: title, close, and the framework being ordered for. The framework is a
                context switch, not a decision to make each time — so it's a quiet chip row
                (colored dot on the active one), not a full-width colored banner. */}
            {(() => {
              return (
                <div className="shrink-0 mb-3">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-lg font-extrabold text-[var(--foreground)] flex items-center gap-2 min-w-0">
                      <span className="truncate">הוספה לרשימה</span>
                      {!showStep2 && addedCount > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0">
                          נוספו {addedCount}
                        </span>
                      )}
                    </h2>
                    <button
                      onClick={onClose}
                      aria-label="סגור"
                      className="w-10 h-10 -ml-1.5 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer border-none bg-transparent shrink-0 flex items-center justify-center"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar" role="radiogroup" aria-label="מזמין עבור">
                    <span className="flex items-center gap-1 text-[13px] font-semibold text-[var(--muted)] shrink-0">
                      <MapPin className="w-4 h-4" />
                      עבור
                    </span>
                    {TARGET_FRAMEWORKS.map((f) => {
                      const active = selectedFramework === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            setSelectedFramework(f.id);
                            if (onTargetFrameworkChange) onTargetFrameworkChange(f.id);
                          }}
                          className={`h-9 px-3.5 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 border transition-colors cursor-pointer ${
                            active
                              ? `${f.activeBg} !text-white border-transparent`
                              : "bg-[var(--surface)] text-[var(--foreground)]/80 border-[var(--border)] hover:bg-[var(--foreground)]/[0.05]"
                          }`}
                        >
                          {!active && <span aria-hidden className={`w-2 h-2 rounded-full ${f.dot}`} />}
                          {f.shortName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {showStep2 && (
              <div className="flex items-center gap-2 mb-3 shrink-0">
                <button
                  onClick={() => setPending(null)}
                  className="p-1.5 -mr-1.5 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer border-none bg-transparent shrink-0"
                  title="חזרה לבחירת מוצר"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
                <h2 className="text-base font-bold truncate">כמה להוסיף?</h2>
              </div>
            )}

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
                    <span className="px-3 py-1.5 rounded-full bg-emerald-600 !text-white text-xs font-bold shadow-lg flex items-center gap-1.5 max-w-[92%] truncate">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{feedback}</span>
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {showStep2 && pending ? (
              /* ── Step 2: new product needs a category before it can be added ── */
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-5">
                <div className="p-4 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-line)]">
                  <span className="text-lg font-bold text-[var(--foreground)]">{pending.name}</span>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--muted)] mb-1.5 block">
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
                  <label className="text-xs font-bold text-[var(--muted)] mb-1.5 block">
                    כמות
                  </label>
                  <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar">
                    {getQuickQtyChips(qtyUnit).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQtyValue(q)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                          qtyValue === q
                            ? "bg-[var(--accent)] !text-white border-transparent"
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
                      className="flex-1 min-w-0 text-center bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 text-xl font-bold focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]"
                    />
                    <button
                      onClick={() => setQtyValue((v) => steppedQuantity(v, step, 1))}
                      className="w-12 h-12 rounded-xl bg-[var(--accent)] hover:brightness-110 flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0"
                    >
                      <Plus className="w-5 h-5 stroke-[3] text-white" />
                    </button>
                    <select
                      value={qtyUnit}
                      onChange={(e) => handleUnitChange(e.target.value)}
                      className="bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-2 text-sm font-bold focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)] shrink-0"
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
                  <span className={`flex items-center gap-2 text-sm font-bold ${urgent ? "text-rose-500" : "text-[var(--foreground)]"}`}>
                    <Flame className="w-4 h-4" />
                    בקשה דחופה 🔥
                  </span>
                  <span className={`w-10 h-6 rounded-full p-0.5 transition-all flex items-center ${urgent ? "bg-rose-500 justify-end" : "bg-[var(--foreground)]/15 justify-start"}`}>
                    <span className="w-5 h-5 rounded-full bg-white shadow-sm block" />
                  </span>
                </button>
              </div>
            ) : (
              /* ── Step 1: one search box, always visible. Empty = your favorites and last cycle's
                 items to tap; typing = matching products (or add a new one). No tabs to choose between. ── */
              <>
                <div className="relative mb-3 shrink-0">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted)] pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={suggestions.length > 0}
                    aria-controls="add-product-results"
                    aria-autocomplete="list"
                    aria-label="חפש מוצר או הקלד שם חדש"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && inputVal.trim()) {
                        const exact = pool.find((p) => p.name.trim().toLowerCase() === inputVal.trim().toLowerCase());
                        if (exact) selectProduct(exact);
                        else selectNewProduct(inputVal);
                      }
                      if (e.key === "Escape") onClose();
                    }}
                    placeholder="חפש מוצר או הקלד שם חדש…"
                    className="w-full h-12 rounded-2xl bg-[var(--foreground)]/[0.05] border border-transparent focus:border-[var(--accent)] focus:bg-[var(--surface)] pr-12 pl-11 text-base font-medium focus:outline-none transition-colors text-right placeholder:text-[var(--muted)] text-[var(--foreground)]"
                  />
                  {inputVal && (
                    <button
                      type="button"
                      onClick={() => {
                        setInputVal("");
                        searchInputRef.current?.focus();
                      }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors cursor-pointer border-none bg-transparent flex items-center justify-center"
                      title="נקה חיפוש"
                      aria-label="נקה חיפוש"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {isUserBlockedByFreeze && (
                  <div className="mb-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-sm font-medium flex items-center gap-2 text-right shrink-0">
                    <span className="text-base">🔒</span>
                    <span>הרשימה מוקפאת כרגע לקראת רכש. הזנת מוצרים חדשים תתאפשר מחדש לאחר פתיחת סבב חדש.</span>
                  </div>
                )}

                {inputVal.trim() ? (
                  /* Search results */
                  <div
                    id="add-product-results"
                    className={`flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 no-scrollbar ${showQuickBar ? "pb-56" : "pb-4"}`}
                  >
                    {(() => {
                      const similarProduct = findSimilarProduct(inputVal, pool);
                      const hasExactMatchInput = pool.some((p) => p.name.trim().toLowerCase() === inputVal.trim().toLowerCase());

                      return (
                        <>
                          {similarProduct && !hasExactMatchInput && (
                            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2 shrink-0">
                              <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <span className="text-sm font-semibold">אולי כבר קיים &quot;{similarProduct.name}&quot; ברשימה?</span>
                              </div>
                              <button
                                disabled={isUserBlockedByFreeze}
                                onClick={() => selectProduct(similarProduct)}
                                className="w-full h-10 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 font-bold text-sm border border-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                              >
                                <Plus className="w-4 h-4" />
                                <span>בחר &quot;{similarProduct.name}&quot;</span>
                              </button>
                            </div>
                          )}

                          {!hasExactMatch && (
                            <button
                              onClick={() => selectNewProduct(inputVal)}
                              disabled={isUserBlockedByFreeze}
                              className="w-full h-14 flex items-center justify-between px-5 rounded-2xl bg-[var(--accent)] hover:brightness-110 !text-white font-bold text-[15px] shadow-[var(--shadow-card)] active:scale-[0.98] transition-all cursor-pointer border-none shrink-0 disabled:opacity-40"
                            >
                              <span className="!text-white truncate">
                                {canAddDirectly ? `הוסף "${inputVal}" כמוצר חדש` : `לא מצאת? בקש הוספת "${inputVal}"`}
                              </span>
                              <Plus className="w-5 h-5 !text-white shrink-0" />
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
                                className={`w-full min-h-[56px] flex items-center justify-between gap-3 px-4 py-2 rounded-2xl border transition-all active:scale-[0.99] text-right shrink-0 ${
                                  disabled
                                    ? "opacity-50 bg-transparent border-[var(--border)] cursor-not-allowed"
                                    : "bg-[var(--surface)] border-[var(--border)] shadow-[var(--shadow-card)] hover:border-[var(--accent-line)] cursor-pointer"
                                }`}
                              >
                                <div className="flex flex-col items-start gap-0.5 min-w-0">
                                  <span className="text-[15px] font-semibold text-[var(--foreground)] truncate max-w-full">{p.name}</span>
                                  <span className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
                                    <span aria-hidden className={`w-2 h-2 rounded-full ${CAT_SOLID[p.category] ?? CAT_SOLID["כללי"]}`} />
                                    {p.category}
                                  </span>
                                </div>
                                {inList ? (
                                  <span className="flex items-center gap-1 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                                    <CheckCircle2 className="w-5 h-5" /> ברשימה
                                  </span>
                                ) : (
                                  <span className="w-9 h-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                                    <Plus className="w-5 h-5" />
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  /* Browse: last cycle's items, then favorites as tap-to-add tiles. A tile already
                     on the list turns green and grows a +/− stepper right there, so adjusting a
                     quantity never needs a separate screen. */
                  <div className={`flex-1 overflow-y-auto min-h-0 space-y-4 pr-1 no-scrollbar ${showQuickBar ? "pb-56" : "pb-4"}`}>
                    {lastOrdered.length > 0 && (
                      <div className="rounded-2xl border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3.5">
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className="text-[13px] font-bold text-[var(--accent-text)] flex items-center gap-1.5">
                            <History className="w-4 h-4" />
                            הוזמנו בסבב הקודם ({lastOrdered.length})
                          </span>
                          <button
                            type="button"
                            onClick={addAllFromLast}
                            disabled={isUserBlockedByFreeze || favBusy}
                            className="h-9 px-3.5 rounded-lg bg-[var(--accent)] hover:brightness-110 !text-white text-[13px] font-bold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            הוסף הכל
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {lastOrdered.map((item) => {
                            const { value, unit } = parseQuantity(item.quantity);
                            return (
                              <button
                                key={item.name}
                                type="button"
                                onClick={() => addFromLast(item)}
                                disabled={isUserBlockedByFreeze || favBusy}
                                className="h-10 flex items-center gap-1.5 pr-2.5 pl-3 rounded-xl border border-[var(--accent-line)] bg-[var(--surface)] text-sm font-semibold text-[var(--foreground)] cursor-pointer hover:bg-[var(--accent-soft-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Plus className="w-4 h-4 text-[var(--accent-text)] stroke-[2.5]" />
                                <span>{item.name}</span>
                                <span className="text-[13px] font-medium text-[var(--muted)]">{value} {formatUnitShort(unit)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {starProducts.length === 0 ? (
                      <div className="py-10 px-6 text-center rounded-2xl border border-dashed border-[var(--border-strong)]">
                        <Sparkles className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-70" />
                        <p className="text-sm font-bold text-[var(--foreground)] mb-1">אין עדיין מוצרים נפוצים</p>
                        <p className="text-[13px] text-[var(--muted)]">הקלד שם מוצר בתיבת החיפוש כדי להוסיף. מנהל יכול להגדיר מוצרים נפוצים מתפריט הניהול ⭐</p>
                      </div>
                    ) : (
                      Object.entries(frequentByCategory).map(([catName, items]) => (
                        <div key={catName}>
                          <div className="sticky top-0 z-10 bg-[var(--surface)] py-2 flex items-center gap-2 text-[13px] font-bold text-[var(--muted)]">
                            <span aria-hidden className={`w-2 h-2 rounded-full ${CAT_SOLID[catName] ?? CAT_SOLID["כללי"]}`} />
                            {catName}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {items.map((p) => {
                              const request = getActiveRequest(p.name);
                              if (request) {
                                const qty = parseQuantity(request.quantity).value;
                                return (
                                  <div
                                    key={p.id}
                                    className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3 min-h-[92px] flex flex-col justify-between gap-2"
                                  >
                                    <span className="text-[15px] font-semibold leading-snug line-clamp-2 text-[var(--foreground)]">{p.name}</span>
                                    <div className="flex items-center justify-between">
                                      <span aria-hidden className="text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="w-5 h-5" /></span>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          aria-label={`הפחת ${p.name}`}
                                          onClick={() => quickDec(request)}
                                          disabled={isUserBlockedByFreeze}
                                          className="w-9 h-9 rounded-full border border-emerald-500/40 bg-[var(--surface)] text-emerald-700 dark:text-emerald-400 flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                          <Minus className="w-4 h-4 stroke-[3]" />
                                        </button>
                                        <span className="min-w-[22px] text-center text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{qty}</span>
                                        <button
                                          type="button"
                                          aria-label={`הוסף עוד ${p.name}`}
                                          onClick={() => quickInc(request)}
                                          disabled={isUserBlockedByFreeze}
                                          className="w-9 h-9 rounded-full border-none bg-emerald-600 text-white flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                          <Plus className="w-4 h-4 stroke-[3]" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  aria-label={`הוסף ${p.name}`}
                                  onClick={() => quickAdd(p)}
                                  disabled={isUserBlockedByFreeze || favBusy}
                                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)] p-3 min-h-[92px] flex flex-col justify-between gap-2 text-right cursor-pointer transition-all active:scale-[0.97] hover:border-[var(--accent-line)] disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <span className="text-[15px] font-semibold leading-snug line-clamp-2 text-[var(--foreground)]">{p.name}</span>
                                  <span className="self-end w-9 h-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center">
                                    <Plus className="w-5 h-5 stroke-[2.5]" />
                                  </span>
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
                  className="w-full py-4 bg-[var(--accent)] hover:brightness-110 !text-white text-sm font-bold rounded-2xl shadow-lg transition-all active:scale-[0.98] cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
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
                      <span className="text-sm font-bold text-[var(--foreground)] truncate">{pending.name}</span>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-lg shrink-0 ${CAT_COLOR[pending.category] ?? CAT_COLOR["כללי"]}`}>
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
                    {getQuickQtyChips(qtyUnit).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQtyValue(q)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                          qtyValue === q
                            ? "bg-[var(--accent)] !text-white border-transparent"
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
                      className="flex-1 min-w-0 text-center bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 text-lg font-bold focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)]"
                    />
                    <button
                      onClick={() => setQtyValue((v) => steppedQuantity(v, step, 1))}
                      className="w-11 h-11 rounded-xl bg-[var(--accent)] hover:brightness-110 flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0"
                    >
                      <Plus className="w-5 h-5 stroke-[3] text-white" />
                    </button>
                    <select
                      value={qtyUnit}
                      onChange={(e) => handleUnitChange(e.target.value)}
                      className="bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-1.5 text-xs font-bold focus:outline-none focus:border-[var(--accent)] text-[var(--foreground)] shrink-0 max-w-[74px]"
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
                    className="w-full mt-2.5 py-3 bg-[var(--accent)] hover:brightness-110 !text-white text-sm font-bold rounded-2xl shadow-lg transition-all active:scale-[0.98] cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
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
