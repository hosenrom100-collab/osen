"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Package, FileText, Trash2, Plus, X, AlertCircle, CheckCircle2, ShoppingBag, Edit2
} from "lucide-react";
import { ShoppingRequest, Product } from "../types";

export interface CycleClosureModalProps {
  isOpen: boolean;
  onClose: () => void;
  listType: "supermarket" | "large";
  requests: ShoppingRequest[];
  pool: Product[];
  categories: string[];
  onAddProduct: (name: string, category: string, priority?: "low" | "normal" | "urgent", qty?: string, notes?: string) => Promise<void>;
  onExportAndArchive: () => Promise<void>;
  onArchiveOnly: () => Promise<void>;
  onRemoveItem: (id: string) => Promise<void>;
  onUpdateQuantity: (id: string, newQty: string) => Promise<void>;
}

export function CycleClosureModal({
  isOpen,
  onClose,
  listType,
  requests,
  pool,
  categories,
  onAddProduct,
  onExportAndArchive,
  onArchiveOnly,
  onRemoveItem,
  onUpdateQuantity,
}: CycleClosureModalProps) {
  // Quick Add State (Last minute items)
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState(categories[0] || "כללי");
  const [newQty, setNewQty] = useState("1");
  const [newNotes, setNewNotes] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Edit quantity inline state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingQtyVal, setEditingQtyVal] = useState("");

  if (!isOpen) return null;

  const activeItems = requests.filter(
    (r) =>
      (r.status === "approved" || r.status === "pending" || r.status === "purchased") &&
      (listType === "large" ? r.listType === "large" : r.listType !== "large")
  );

  // Group by category
  const grouped = activeItems.reduce((acc, item) => {
    const cat = item.category || "כללי";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, ShoppingRequest[]>);

  const handleQuickAdd = async () => {
    if (!newName.trim()) return;
    setIsAdding(true);
    try {
      await onAddProduct(newName.trim(), newCat, "normal", newQty, newNotes);
      setNewName("");
      setNewNotes("");
      setNewQty("1");
    } catch (err) {
      console.error("Error quick adding item:", err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleExportAndClose = async () => {
    setIsProcessing(true);
    try {
      await onExportAndArchive();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleArchiveOnly = async () => {
    setIsProcessing(true);
    try {
      await onArchiveOnly();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
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
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border)] shrink-0">
            <div>
              <h3 className="text-xl font-black flex items-center gap-2 text-[var(--foreground)]">
                <Package className="w-6 h-6 text-indigo-500" />
                <span>סגירת סבב קניות וייצוא להדפסה</span>
              </h3>
              <p className="text-xs text-[var(--muted)] font-semibold mt-1">
                בדיקה סופית ואישור עבור <strong>{listType === "large" ? "ציוד ורכש" : "קניות סופר"}</strong> לפני ארכוב הסבב
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] transition-colors cursor-pointer border-none bg-transparent"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Add Bar - "מוצרי דקה ה-90" */}
          <div className="my-4 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 shrink-0">
            <span className="text-xs font-black text-amber-600 dark:text-amber-400 block mb-2">
              ⚡ הוספת מוצר של הרגע האחרון (דקה ה-90):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleQuickAdd();
                }}
                placeholder="שם המוצר..."
                className="bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-[var(--foreground)]"
              />
              <select
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                className="bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none text-[var(--foreground)]"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                type="text"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                placeholder="כמות..."
                className="bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none text-[var(--foreground)]"
              />
              <button
                onClick={handleQuickAdd}
                disabled={isAdding || !newName.trim()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 !text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 border-none shadow-xs"
              >
                <Plus className="w-4 h-4 text-white" />
                <span>הוסף לסבב</span>
              </button>
            </div>
          </div>

          {/* Interactive Pre-Flight Review List */}
          <div className="flex-grow overflow-y-auto pr-1 space-y-4 my-2 no-scrollbar">
            {activeItems.length === 0 ? (
              <div className="py-12 text-center opacity-40">
                <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-[var(--muted)]" />
                <p className="text-xs font-bold">אין מוצרים בסבב זה לסגירה</p>
              </div>
            ) : (
              Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="bg-[var(--foreground)]/[0.02] border border-[var(--border)] rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-[var(--foreground)]/5 border-b border-[var(--border)] flex items-center justify-between">
                    <span className="text-xs font-black text-[var(--foreground)]">{category}</span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[var(--foreground)]/10 text-[var(--muted)]">
                      {items.length} מוצרים
                    </span>
                  </div>

                  <div className="divide-y divide-[var(--border)]/60">
                    {items.map((item) => {
                      const poolMatch = pool.find((p) => (p.name || "").trim().toLowerCase() === (item.name || "").trim().toLowerCase());
                      const effectiveNotes = item.notes || poolMatch?.defaultNotes || "";

                      return (
                        <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 flex-grow min-w-0">
                            <span className="font-bold text-[var(--foreground)] truncate">{item.name}</span>
                            {effectiveNotes && (
                              <span className="text-[10px] font-semibold text-[var(--muted)] bg-[var(--foreground)]/5 px-2 py-0.5 rounded-md truncate max-w-[160px]">
                                💬 {effectiveNotes}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {editingId === item.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editingQtyVal}
                                  onChange={(e) => setEditingQtyVal(e.target.value)}
                                  className="w-16 bg-[var(--background)] border border-indigo-500 rounded-lg px-2 py-1 text-xs font-bold text-center text-[var(--foreground)]"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      onUpdateQuantity(item.id, editingQtyVal);
                                      setEditingId(null);
                                    }
                                  }}
                                />
                                <button
                                  onClick={() => {
                                    onUpdateQuantity(item.id, editingQtyVal);
                                    setEditingId(null);
                                  }}
                                  className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded cursor-pointer border-none bg-transparent"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingId(item.id);
                                  setEditingQtyVal(item.quantity || "1");
                                }}
                                className="px-2 py-1 rounded-lg bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 font-bold text-[var(--foreground)] flex items-center gap-1 cursor-pointer border-none"
                              >
                                <span>{item.quantity || "1"}</span>
                                <Edit2 className="w-3 h-3 text-[var(--muted)]" />
                              </button>
                            )}

                            <button
                              onClick={() => onRemoveItem(item.id)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer border-none bg-transparent"
                              title="הסר מוצר מסבב זה"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Summary & Action Buttons */}
          <div className="pt-4 border-t border-[var(--border)] shrink-0 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-[var(--muted)]">
              <span>סה"כ {activeItems.length} מוצרים ב-{Object.keys(grouped).length} קטגוריות</span>
              {activeItems.length > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> מוכן להדפסה וסגירה
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 flex-wrap">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--foreground)]/5 text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors cursor-pointer border-none"
              >
                ביטול / המשך עריכה
              </button>

              <button
                onClick={handleArchiveOnly}
                disabled={isProcessing || activeItems.length === 0}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-all cursor-pointer disabled:opacity-50 border-none"
              >
                סגור וארכב סבב בלבד
              </button>

              <button
                onClick={handleExportAndClose}
                disabled={isProcessing || activeItems.length === 0}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-500 !text-white transition-all shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-2 border-none"
              >
                <FileText className="w-4 h-4 text-white" />
                <span>ייצא רשימה להדפסה (Word) וסגור סבב</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
