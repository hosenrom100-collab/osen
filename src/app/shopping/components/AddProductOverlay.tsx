"use client";

import { useState, useRef, useEffect } from "react";
import { Product, ShoppingRequest } from "../types";
import { Plus, Search, Star, X, Check, Flame, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const MEASUREMENT_UNITS = [
  "יחידות",
  "ק״ג",
  "גרם",
  "ליטר",
  "מ״ל",
  "אריזה",
  "ארגז",
  "בקבוק",
  "פחית",
  "שקית",
];

const CAT_COLOR: Record<string, string> = {
  "גבינות ומחלבה":       "text-amber-500 bg-amber-500/10 border-amber-500/20",
  "בשר ודגים":            "text-rose-500 bg-rose-500/10 border-rose-500/20",
  "פירות וירקות":         "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  "לחם ומאפים":           "text-orange-500 bg-orange-500/10 border-orange-500/20",
  "חומרי ניקוי":          "text-cyan-500 bg-cyan-500/10 border-cyan-500/20",
  "מוצרי נייר וחד פעמי": "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
  "טואלטיקה והיגיינה":   "text-teal-500 bg-teal-500/10 border-teal-500/20",
  "שימורים ובישול":       "text-slate-500 bg-slate-500/10 border-slate-500/20",
  "קפואים":               "text-sky-500 bg-sky-500/10 border-sky-500/20",
  "כללי":                 "text-slate-400 bg-slate-400/10 border-slate-400/20",
};

interface AddProductOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  pool: Product[];
  requests: ShoppingRequest[];
  inputVal: string;
  setInputVal: (val: string) => void;
  onAddProduct: (name: string, category?: string, priority?: "normal" | "urgent", quantity?: string) => void;
}

export function AddProductOverlay({
  isOpen,
  onClose,
  pool,
  requests,
  inputVal,
  setInputVal,
  onAddProduct,
}: AddProductOverlayProps) {
  const [addUrgent, setAddUrgent] = useState(false);
  const [addQty, setAddQty] = useState("1");
  const [addUnit, setAddUnit] = useState("יחידות");

  useEffect(() => {
    if (inputVal.trim()) {
      const match = pool.find((p) => p.name.trim().toLowerCase() === inputVal.trim().toLowerCase());
      if (match && match.defaultUnit) {
        setAddUnit(match.defaultUnit);
      }
    }
  }, [inputVal, pool]);

  if (!isOpen) return null;

  const handleAddInput = () => {
    const name = inputVal.trim();
    if (!name) return;
    const match = pool.find((p) => p.name === name);
    const finalQty = addUnit === "יחידות" ? addQty : `${addQty} ${addUnit}`;
    onAddProduct(name, match?.category ?? "כללי", addUrgent ? "urgent" : "normal", finalQty);
    setInputVal("");
    setAddUrgent(false);
    onClose();
  };

  const suggestions = pool
    .filter(
      (p) =>
        p.isActive !== false &&
        inputVal.trim() &&
        (p.name.includes(inputVal.trim()) || p.category.includes(inputVal.trim()))
    )
    .slice(0, 20);

  const exactMatch = pool.some((p) => p.name === inputVal.trim());
  const alreadyInList = (name: string) =>
    requests.some((r) => r.name === name && r.status !== "archived" && r.status !== "deleted");

  const starProducts = pool.filter((p) => p.isActive !== false && p.isStar === true);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            onClose();
            setAddUrgent(false);
          }}
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
            <h2 className="text-lg md:text-xl font-black flex items-center gap-2">הוספת מוצר לרשימה</h2>
            <button
              onClick={() => {
                onClose();
                setAddUrgent(false);
              }}
              className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative group mb-4 shrink-0">
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-indigo-500 pointer-events-none">
              <Plus className="w-5 h-5" />
            </div>
            <input
              autoFocus
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddInput();
                if (e.key === "Escape") {
                  onClose();
                  setAddUrgent(false);
                }
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

          {/* Star / Favorite Quick-Add Chips */}
          {starProducts.length > 0 && (
            <div className="mb-4 shrink-0">
              <div className="flex items-center gap-1 mb-2 text-amber-500 font-black text-[11px]">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                <span>מוצרי כוכב – בלחיצה אחת:</span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                {starProducts.map((starItem) => {
                  const inList = alreadyInList(starItem.name);
                  return (
                    <button
                      key={starItem.id}
                      onClick={() => {
                        if (!inList) {
                          const unitToUse = starItem.defaultUnit || addUnit;
                          const finalQty = unitToUse === "יחידות" ? addQty : `${addQty} ${unitToUse}`;
                          onAddProduct(starItem.name, starItem.category, addUrgent ? "urgent" : "normal", finalQty);
                          setInputVal("");
                          onClose();
                          setAddUrgent(false);
                        }
                      }}
                      disabled={inList}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1 transition-all active:scale-95 cursor-pointer border ${
                        inList
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

          {/* Quantity & Unit Pickers */}
          <div className="grid grid-cols-2 gap-3 mb-4 shrink-0" dir="rtl">
            <div>
              <label className="text-[10px] font-black text-[var(--muted)] text-right uppercase tracking-widest mb-1.5 block">
                כמות
              </label>
              <input
                type="text"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                placeholder="1"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-3 text-sm font-bold text-center focus:outline-none focus:border-indigo-500/40 text-[var(--foreground)]"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-[var(--muted)] text-right uppercase tracking-widest mb-1.5 block">
                יחידה
              </label>
              <select
                value={addUnit}
                onChange={(e) => setAddUnit(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-3 text-sm font-bold focus:outline-none focus:border-indigo-500/40 text-right cursor-pointer text-[var(--foreground)]"
              >
                {MEASUREMENT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Urgent Priority Toggle */}
          <div className="flex items-center justify-between border border-[var(--border)] rounded-2xl p-4 mb-4 shrink-0 bg-[var(--background)]/20">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center ${
                  addUrgent ? "bg-rose-500/10 text-rose-500" : "bg-[var(--foreground)]/5 text-[var(--muted)]"
                }`}
              >
                <Flame className={`w-4 h-4 ${addUrgent ? "animate-pulse" : ""}`} />
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-[var(--foreground)]">בקשה דחופה 🔥</p>
                <p className="text-[9px] text-[var(--muted)] font-semibold">יישלח פוש מיידי למנהלים וללוגיסטיקה</p>
              </div>
            </div>
            <button
              onClick={() => setAddUrgent(!addUrgent)}
              className={`w-10 h-6 rounded-full p-0.5 transition-all flex items-center cursor-pointer border-none ${
                addUrgent ? "bg-rose-500 justify-end" : "bg-[var(--foreground)]/10 justify-start"
              }`}
            >
              <motion.div layout className="w-5 h-5 rounded-full bg-white shadow-sm" />
            </button>
          </div>

          {/* Suggestions & Add Custom Product List */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pb-6 pr-1 no-scrollbar">
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
                      const unitToUse = p.defaultUnit || addUnit;
                      const finalQty = unitToUse === "יחידות" ? addQty : `${addQty} ${unitToUse}`;
                      onAddProduct(p.name, p.category, addUrgent ? "urgent" : "normal", finalQty);
                      setInputVal("");
                      onClose();
                      setAddUrgent(false);
                    }
                  }}
                  disabled={inList}
                  className={`w-full flex items-center justify-between px-5 py-3 rounded-xl border border-[var(--border)] transition-all active:scale-[0.98] cursor-pointer text-right shrink-0 ${
                    inList
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
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
