"use client";

import { useState, useRef, useEffect } from "react";
import { Product, ShoppingRequest } from "../types";
import { Plus, Search, Star, X, Check, Flame, CheckCircle2, AlertTriangle, Minus, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { rankSimilarProducts, findSimilarProduct } from "../lib/stringUtils";
import { MEASUREMENT_UNITS, CAT_COLOR, CAT_SOLID } from "../lib/constants";
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
  onAddProduct: (name: string, category?: string, priority?: "normal" | "urgent", quantity?: string, notes?: string) => Promise<boolean>;
  onRequestNewProduct: (name: string, category?: string, priority?: "normal" | "urgent", quantity?: string) => Promise<boolean>;
  requests: ShoppingRequest[];
  inputVal: string;
  setInputVal: (val: string) => void;
}

// The item currently picked, awaiting a quantity before it's actually added — this is
// the step that used to be missing: picking a product no longer adds it immediately with
// a disconnected default quantity; it opens this quantity confirmation for that product.
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
  inputVal,
  setInputVal,
  onAddProduct,
  onRequestNewProduct,
  isAdmin,
  isManager,
  isLogistics,
  isFrozen,
  categories = [],
}: AddProductOverlayProps) {
  const [pending, setPending] = useState<PendingAdd | null>(null);
  const [qtyValue, setQtyValue] = useState(1);
  const [qtyUnit, setQtyUnit] = useState("יחידות");
  const [urgent, setUrgent] = useState(false);
  const submittingRef = useRef(false);

  // Anyone who can approve/execute purchases (admin, manager, logistics) can add a
  // brand-new product straight to the list; everyone else submits it for approval.
  const canAddDirectly = isAdmin || isManager || isLogistics;
  const isUserBlockedByFreeze = isFrozen && !canAddDirectly;

  // Reset everything whenever the overlay is (re)opened, so a previous add's state
  // doesn't leak into the next one.
  useEffect(() => {
    if (isOpen) {
      submittingRef.current = false;
      setPending(null);
      setQtyValue(1);
      setQtyUnit("יחידות");
      setUrgent(false);
    }
  }, [isOpen]);

  const alreadyInList = (name: string) =>
    requests.some((r) => r.name === name && r.status !== "archived" && r.status !== "deleted");

  // Picking a product (star chip, suggestion, duplicate banner, or a brand-new typed
  // name) doesn't add it yet — it opens the quantity step for that specific item.
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

    let success: boolean;
    if (pending.isNew) {
      success = canAddDirectly
        ? await onAddProduct(pending.name, pending.category, priority, finalQty)
        : await onRequestNewProduct(pending.name, pending.category, priority, finalQty);
    } else {
      success = await onAddProduct(pending.name, pending.category, priority, finalQty, pending.defaultNotes);
    }

    submittingRef.current = false;
    if (!success) return; // keep the confirm step open so the user can retry

    setInputVal("");
    setPending(null);
    onClose();
  };

  const suggestions = rankSimilarProducts(inputVal, pool.filter((p) => p.isActive !== false), 20);
  const hasExactMatch = pool.some((p) => p.name.trim().toLowerCase() === inputVal.trim().toLowerCase());
  const starProducts = pool.filter((p) => p.isActive !== false && p.isStar === true);

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
          className="relative w-full h-[92vh] md:max-h-[85vh] md:max-w-xl bg-[var(--surface)] border-t md:border border-[var(--border)] rounded-t-[1.5rem] md:rounded-[2.5rem] p-5 md:p-6 shadow-2xl text-right flex flex-col overflow-hidden"
          dir="rtl"
        >
          <div className="w-12 h-1 bg-[var(--border)] rounded-full mx-auto mb-4 md:hidden shrink-0" />

          <div className="flex items-center justify-between mb-5 shrink-0">
            <h2 className="text-lg md:text-xl font-black flex items-center gap-2">
              {pending ? (
                <button
                  onClick={() => setPending(null)}
                  className="p-1.5 -mr-1.5 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer border-none bg-transparent"
                  title="חזרה לחיפוש"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              ) : null}
              {pending ? "כמה להוסיף?" : "הוספת מוצר לרשימה"}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer border-none bg-transparent"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {pending ? (
            /* ── Step 2: confirm quantity for the picked product ── */
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-5">
              <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/15">
                <span className="text-lg font-black text-[var(--foreground)]">{pending.name}</span>
                {!pending.isNew && (
                  <span className={`block w-fit mt-1.5 text-[10px] font-black px-2 py-0.5 rounded-md ${CAT_COLOR[pending.category] ?? CAT_COLOR["כללי"]}`}>
                    {pending.category}
                  </span>
                )}
              </div>

              {pending.isNew && (
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
                          className={`py-1.5 px-3 rounded-full text-xs font-bold border transition-all ${
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
              )}

              <div>
                <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
                  כמות
                </label>
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
            /* ── Step 1: search / pick a product ── */
            <>
              <div className="relative group mb-4 shrink-0">
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-indigo-500 pointer-events-none">
                  <Plus className="w-5 h-5" />
                </div>
                <input
                  autoFocus
                  type="text"
                  role="combobox"
                  aria-expanded={suggestions.length > 0}
                  aria-controls="add-product-suggestions"
                  aria-autocomplete="list"
                  aria-label="שם המוצר שברצונך להוסיף"
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
                  placeholder="שם המוצר שברצונך להוסיף..."
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl py-3 pr-11 pl-10 text-sm font-bold focus:outline-none focus:border-indigo-500/50 transition-all shadow-inner text-right placeholder:text-[var(--muted)]/40 text-[var(--foreground)]"
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

              {isUserBlockedByFreeze && (
                <div className="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-2 text-right">
                  <span className="text-base">🔒</span>
                  <span>הרשימה מוקפאת כרגע לקראת רכש. הזנת מוצרים חדשים תתאפשר מחדש לאחר פתיחת סבב חדש.</span>
                </div>
              )}

              {inputVal.trim() && (() => {
                const similarProduct = findSimilarProduct(inputVal, pool);
                const hasExactMatchInput = pool.some((p) => p.name.trim().toLowerCase() === inputVal.trim().toLowerCase());
                if (similarProduct && !hasExactMatchInput) {
                  return (
                    <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-3 shrink-0">
                      <div className="flex items-start gap-2.5 text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-black">⚠️ אולי כבר קיים "{similarProduct.name}" ברשימה?</p>
                          <p className="text-[10px] font-medium mt-1 opacity-90">אם זה המוצר שחיפשת, לחץ למטה כדי לבחור אותו במקום ליצור כפילות.</p>
                        </div>
                      </div>
                      <button
                        disabled={isUserBlockedByFreeze}
                        onClick={() => selectProduct(similarProduct)}
                        className="w-full px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 font-black text-xs border border-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>בחר "{similarProduct.name}"</span>
                      </button>
                    </div>
                  );
                }
                return null;
              })()}

              {starProducts.length > 0 && (
                <div className="mb-4 shrink-0">
                  <div className="flex items-center gap-1 mb-2 text-amber-500 font-black text-[11px]">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    <span>מוצרי כוכב:</span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                    {starProducts.map((starItem) => {
                      const inList = alreadyInList(starItem.name);
                      const disabled = inList || isUserBlockedByFreeze;
                      return (
                        <button
                          key={starItem.id}
                          onClick={() => selectProduct(starItem)}
                          disabled={disabled}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1 transition-all active:scale-95 cursor-pointer border ${
                            disabled
                              ? "bg-[var(--foreground)]/5 text-[var(--muted)] border-transparent opacity-50 cursor-not-allowed"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20 shadow-xs"
                          }`}
                        >
                          {inList ? <Check className="w-3 h-3 text-emerald-500" /> : <Plus className="w-3 h-3 text-amber-500" />}
                          <span>{starItem.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div
                id="add-product-suggestions"
                role="listbox"
                aria-label="הצעות מוצרים"
                className="flex-1 overflow-y-auto min-h-0 space-y-2 pb-6 pr-1 no-scrollbar"
              >
                {!hasExactMatch && inputVal.trim() && (
                  <button
                    onClick={() => selectNewProduct(inputVal)}
                    disabled={isUserBlockedByFreeze}
                    className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 !text-white font-black text-sm shadow-md shadow-indigo-600/15 active:scale-[0.98] transition-all cursor-pointer border-none shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
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
                      role="option"
                      aria-selected={false}
                      className={`w-full flex items-center justify-between px-5 py-3 rounded-xl border border-[var(--border)] transition-all active:scale-[0.98] cursor-pointer text-right shrink-0 ${
                        disabled
                          ? "opacity-35 bg-transparent cursor-not-allowed border-none"
                          : "bg-[var(--foreground)]/[0.02] hover:border-indigo-500/50 hover:bg-[var(--foreground)]/[0.04]"
                      }`}
                    >
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="text-sm font-bold text-[var(--foreground)]">{p.name}</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${CAT_COLOR[p.category] || CAT_COLOR["כללי"]}`}>
                          {p.category}
                        </span>
                      </div>
                      {inList ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Plus className="w-4 h-4 text-[var(--muted)]" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {pending && (
            <div className="pt-4 mt-2 border-t border-[var(--border)]/60 shrink-0">
              <button
                onClick={handleConfirmAdd}
                disabled={isUserBlockedByFreeze || (pending.isNew && !pending.category) || !qtyValue}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 !text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                הוסף לרשימה
              </button>
            </div>
          )}
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
