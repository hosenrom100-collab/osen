"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Check, Minus, Plus, Loader2, PackageX, TrendingDown } from "lucide-react";

export interface SmartReorderItem {
  productId: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  minStock: number;
  suggestedQty: number;
}

interface SmartReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: SmartReorderItem[];
  onConfirm: (selected: { productId: string; name: string; category: string; unit: string; quantity: number; currentStock: number; minStock: number }[]) => Promise<void>;
}

export function SmartReorderModal({ isOpen, onClose, items, onConfirm }: SmartReorderModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Re-initialize selection & suggested quantities whenever the review list is (re)opened
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(items.map((i) => i.productId)));
      const draft: Record<string, number> = {};
      items.forEach((i) => { draft[i.productId] = i.suggestedQty; });
      setQtyDraft(draft);
    }
  }, [isOpen, items]);

  if (!isOpen) return null;

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const adjustQty = (id: string, delta: number) => {
    setQtyDraft((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + delta) }));
  };

  const handleConfirm = async () => {
    const selectedItems = items
      .filter((i) => selectedIds.has(i.productId))
      .map((i) => ({
        productId: i.productId,
        name: i.name,
        category: i.category,
        unit: i.unit,
        quantity: qtyDraft[i.productId] ?? i.suggestedQty,
        currentStock: i.currentStock,
        minStock: i.minStock,
      }));
    if (selectedItems.length === 0) {
      onClose();
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm(selectedItems);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-2xl p-6 md:p-8 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-right"
          dir="rtl"
        >
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border)] shrink-0">
            <div>
              <h3 className="text-xl font-black flex items-center gap-2 text-[var(--foreground)]">
                <Sparkles className="w-6 h-6 text-amber-500" />
                <span>סקירת מוצרים להשלמת מלאי</span>
              </h3>
              <p className="text-xs text-[var(--muted)] font-semibold mt-1">
                בחר/י אילו מוצרים להוסיף לרשימת הקניות ובאיזו כמות, לפני שהם נשלחים בפועל
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] transition-colors cursor-pointer border-none bg-transparent"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-grow overflow-y-auto pr-1 space-y-2 my-4 no-scrollbar">
            {items.length === 0 ? (
              <div className="py-12 text-center opacity-40">
                <Sparkles className="w-10 h-10 mx-auto mb-2 text-[var(--muted)]" />
                <p className="text-xs font-bold">אין כרגע מוצרים הדורשים השלמת מלאי</p>
              </div>
            ) : (
              items.map((item) => {
                const isOut = item.currentStock === 0;
                const isChecked = selectedIds.has(item.productId);
                return (
                  <div
                    key={item.productId}
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border transition-all ${
                      isChecked
                        ? "bg-[var(--foreground)]/[0.02] border-[var(--border)]"
                        : "bg-transparent border-transparent opacity-40"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        onClick={() => toggleSelected(item.productId)}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 shrink-0 transition-all cursor-pointer ${
                          isChecked
                            ? "bg-indigo-500 border-indigo-500 text-white"
                            : "border-[var(--border)] text-transparent"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-[var(--foreground)] truncate">{item.name}</span>
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border flex items-center gap-1 ${
                              isOut
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                                : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {isOut ? <PackageX className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                            <span>{isOut ? "אזל במלאי" : "מלאי נמוך"}</span>
                          </span>
                        </div>
                        <span className="text-[10px] text-[var(--muted)] font-semibold">
                          במלאי: {item.currentStock} {item.unit} · סף מינימום: {item.minStock} {item.unit}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-xl p-1 shrink-0">
                      <button
                        onClick={() => adjustQty(item.productId, -1)}
                        disabled={!isChecked}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--foreground)]/10 text-[var(--foreground)] disabled:opacity-30 transition-all cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <div className="min-w-[28px] text-center">
                        <span className="text-xs font-black text-[var(--foreground)]">{qtyDraft[item.productId] ?? item.suggestedQty}</span>
                      </div>
                      <button
                        onClick={() => adjustQty(item.productId, 1)}
                        disabled={!isChecked}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--foreground)]/10 text-[var(--foreground)] disabled:opacity-30 transition-all cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-4 border-t border-[var(--border)] shrink-0 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold text-[var(--muted)]">
              נבחרו {selectedIds.size} מתוך {items.length} מוצרים
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--foreground)]/5 text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors cursor-pointer border-none"
              >
                ביטול
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSubmitting || selectedIds.size === 0}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-500 !text-white transition-all shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-2 border-none"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Sparkles className="w-4 h-4 text-white" />}
                <span>אשר והוסף {selectedIds.size} מוצרים לרשימה</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
