"use client";

import { useState, useEffect, memo } from "react";
import { User } from "firebase/auth";
import { Product, CutoffConfig } from "../types";
import { findSimilarProduct } from "../lib/stringUtils";
import {
  Edit3, Settings, X, Plus, Minus, Trash2, Check, ShoppingBag, CheckCircle2,
  Receipt, Star, Upload, Loader2, Search, MessageSquare, Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

interface ShoppingModalsProps {
  isAddingCat: boolean;
  setIsAddingCat: (val: boolean) => void;
  categories: string[];
  onAddCategory: (newCatName: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (catName: string) => void;

  isEditingRecurring: boolean;
  setIsEditingRecurring: (val: boolean) => void;
  pool: Product[];
  onToggleRecurring: (productId: string, name: string, category: string, shouldBeRecurring: boolean) => void;
  onUpdateRecurringQuantity: (productId: string, currentQtyStr: string, increment: number, directValue?: string) => void;

  showArchivePrompt: boolean;
  setShowArchivePrompt: (val: boolean) => void;
  sessionPurchasedCount: number;
  hasRemainingActiveItems?: boolean;
  onArchiveCurrentSession: () => void;

  isAdmin: boolean;
  isLogistics: boolean;

  receiptScanOpen: boolean;
  setReceiptScanOpen: (val: boolean) => void;
  currentUser: User | null;
  onSaveReceipt: (file: File, notes: string) => Promise<void>;

  showManageStarModal: boolean;
  setShowManageStarModal: (val: boolean) => void;
  onToggleStarProduct: (productId: string, currentIsStar?: boolean) => void;

  cutoffConfig?: CutoffConfig;
  onSaveCutoffConfig?: (config: CutoffConfig) => Promise<void>;
}

const RecurringProductRow = memo(function RecurringProductRow({
  product,
  onToggleRecurring,
  onUpdateRecurringQuantity,
}: {
  product: Product;
  onToggleRecurring: (productId: string, name: string, category: string, shouldBeRecurring: boolean) => void;
  onUpdateRecurringQuantity: (productId: string, currentQtyStr: string, increment: number, directValue?: string) => void;
}) {
  const [qtyDraft, setQtyDraft] = useState(product.recurringQuantity || "1");

  useEffect(() => {
    setQtyDraft(product.recurringQuantity || "1");
  }, [product.recurringQuantity]);

  const commitQtyEdit = () => {
    const cleanVal = qtyDraft.trim().replace(",", ".");
    if (cleanVal !== product.recurringQuantity) {
      onUpdateRecurringQuantity(product.id, "0", 0, cleanVal || "1");
    }
  };

  return (
    <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 border-b border-[var(--border)]/50 last:border-0">
      <div className="min-w-0 flex-1 text-right">
        <div className="flex items-center gap-2 flex-wrap justify-start">
          <span className="text-sm font-bold text-[var(--foreground)]">{product.name}</span>
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${CAT_COLOR[product.category] ?? CAT_COLOR["כללי"]}`}>
            {product.category}
          </span>
          {product.defaultNotes && product.defaultNotes.trim() !== "" && (
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1 max-w-full sm:max-w-[200px] truncate shadow-xs"
              title={`הערה קבועה: ${product.defaultNotes}`}
            >
              <MessageSquare className="w-2.5 h-2.5 text-amber-500 shrink-0" />
              <span className="truncate">{product.defaultNotes}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
        <div className="flex items-center gap-1 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl p-0.5 shadow-sm">
          <button
            onClick={() => onUpdateRecurringQuantity(product.id, product.recurringQuantity || "1", -1)}
            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] transition-all"
            title="הפחת כמות"
          >
            <Minus className="w-3 h-3 stroke-[2.5]" />
          </button>
          <div className="flex items-center gap-1 px-1">
            <input
              type="text"
              inputMode="decimal"
              value={qtyDraft}
              onChange={(e) => setQtyDraft(e.target.value)}
              onBlur={commitQtyEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="w-8 text-center bg-transparent border-none text-xs font-black text-[var(--foreground)] focus:outline-none p-0 outline-none"
              title="הקלד כמות"
            />
            <span className="text-[9px] font-bold text-[var(--muted)]">
              {product.defaultUnit || "יחידות"}
            </span>
          </div>
          <button
            onClick={() => onUpdateRecurringQuantity(product.id, product.recurringQuantity || "1", 1)}
            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] transition-all"
            title="הוסף כמות"
          >
            <Plus className="w-3 h-3 stroke-[2.5]" />
          </button>
        </div>

        <button
          onClick={() => onToggleRecurring(product.id, product.name, product.category, false)}
          className="w-8 h-8 rounded-xl bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/10 transition-all cursor-pointer"
          title="הסר מהרשימה הקבועה"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

export function ShoppingModals({
  isAddingCat,
  setIsAddingCat,
  categories,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  isEditingRecurring,
  setIsEditingRecurring,
  pool,
  onToggleRecurring,
  onUpdateRecurringQuantity,
  showArchivePrompt,
  setShowArchivePrompt,
  sessionPurchasedCount,
  hasRemainingActiveItems,
  onArchiveCurrentSession,
  isAdmin,
  isLogistics,
  receiptScanOpen,
  setReceiptScanOpen,
  currentUser,
  onSaveReceipt,
  showManageStarModal,
  setShowManageStarModal,
  onToggleStarProduct,
  cutoffConfig,
  onSaveCutoffConfig,
}: ShoppingModalsProps) {
  // Local state for category management
  const [newCatName, setNewCatName] = useState("");
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [editingCatNewValue, setEditingCatNewValue] = useState("");

  // Local state for cutoff config
  const [cutoffEnabled, setCutoffEnabled] = useState(cutoffConfig?.enabled ?? true);
  const [cutoffDay, setCutoffDay] = useState(cutoffConfig?.day ?? 2);
  const [cutoffTime, setCutoffTime] = useState(cutoffConfig?.time ?? "12:00");
  const [isSavingCutoff, setIsSavingCutoff] = useState(false);

  useEffect(() => {
    if (cutoffConfig) {
      setCutoffEnabled(cutoffConfig.enabled);
      setCutoffDay(cutoffConfig.day);
      setCutoffTime(cutoffConfig.time || "12:00");
    }
  }, [cutoffConfig]);

  // Local state for recurring search
  const [recurringSearchVal, setRecurringSearchVal] = useState("");

  // Local state for receipts
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receiptUploading, setReceiptUploading] = useState(false);

  // Local state for star products search
  const [starModalSearchVal, setStarModalSearchVal] = useState("");

  const handleSaveReceiptClick = async () => {
    if (!receiptImage) return;
    try {
      setReceiptUploading(true);
      await onSaveReceipt(receiptImage, receiptNotes);
      setReceiptScanOpen(false);
      setReceiptImage(null);
      setReceiptPreviewUrl(null);
      setReceiptNotes("");
    } catch (e) {
      console.error(e);
    } finally {
      setReceiptUploading(false);
    }
  };

  return (
    <>
      {/* ── CATEGORY MANAGEMENT DIALOG ── */}
      <AnimatePresence>
        {isAddingCat && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingCat(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl text-right flex flex-col max-h-[85vh] overflow-hidden"
              dir="rtl"
            >
              <div className="flex items-center justify-between mb-6 shrink-0">
                <h3 className="text-xl font-black flex items-center gap-2 text-[var(--foreground)]">
                  <Edit3 className="w-5 h-5 text-indigo-500" />
                  ניהול קטגוריות רכש
                </h3>
                <button
                  onClick={() => setIsAddingCat(false)}
                  className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-6 shrink-0">
                <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
                  הוסף קטגוריה חדשה
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newCatName.trim()) {
                        onAddCategory(newCatName.trim());
                        setNewCatName("");
                      }
                    }}
                    placeholder="שם הקטגוריה..."
                    className="flex-grow bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-xs font-bold focus:border-indigo-500 outline-none text-[var(--foreground)]"
                  />
                  <button
                    onClick={() => {
                      if (newCatName.trim()) {
                        onAddCategory(newCatName.trim());
                        setNewCatName("");
                      }
                    }}
                    className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 !text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 shrink-0 shadow-md shadow-indigo-600/10 active:scale-95 border-none"
                  >
                    <Plus className="w-4 h-4 text-white" />
                    <span>הוסף</span>
                  </button>
                </div>
              </div>

              <div className="flex-grow overflow-y-auto divide-y divide-[var(--border)]/60 pr-1 no-scrollbar mb-6">
                <span className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-2 block shrink-0">
                  קטגוריות קיימות:
                </span>
                <div className="space-y-1">
                  {categories.map((cat) => {
                    const isEditing = editingCatName === cat;
                    return (
                      <div key={cat} className="py-2.5 flex items-center justify-between gap-3">
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-grow">
                            <input
                              type="text"
                              value={editingCatNewValue}
                              onChange={(e) => setEditingCatNewValue(e.target.value)}
                              className="flex-grow bg-[var(--background)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:border-indigo-500/50 text-[var(--foreground)]"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  onRenameCategory(cat, editingCatNewValue);
                                  setEditingCatName(null);
                                } else if (e.key === "Escape") setEditingCatName(null);
                              }}
                            />
                            <button
                              onClick={() => {
                                onRenameCategory(cat, editingCatNewValue);
                                setEditingCatName(null);
                              }}
                              className="p-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                              title="שמור שם"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingCatName(null)}
                              className="p-1.5 bg-[var(--foreground)]/5 text-[var(--muted)] hover:bg-[var(--foreground)]/10 border border-[var(--border)] rounded-lg transition-colors cursor-pointer"
                              title="ביטול"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-xs font-bold text-[var(--foreground)]">{cat}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setEditingCatName(cat);
                                  setEditingCatNewValue(cat);
                                }}
                                className="p-1.5 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-indigo-500 border border-[var(--border)] rounded-lg transition-all cursor-pointer"
                                title="ערוך קטגוריה"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onDeleteCategory(cat)}
                                className="p-1.5 bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 border border-rose-500/10 rounded-lg transition-all cursor-pointer"
                                title="מחק קטגוריה"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cutoff Deadline Settings Section */}
              {onSaveCutoffConfig && (
                <div className="pt-3 border-t border-[var(--border)] mb-4 shrink-0 text-right" dir="rtl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black flex items-center gap-1.5 text-[var(--foreground)]">
                      <Clock className="w-4 h-4 text-indigo-500" />
                      מועד קציבה שבועי (Cutoff)
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cutoffEnabled}
                        onChange={(e) => setCutoffEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[var(--foreground)]/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {cutoffEnabled && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <label className="text-[10px] font-bold text-[var(--muted)] mb-1 block">יום בשבוע:</label>
                        <select
                          value={cutoffDay}
                          onChange={(e) => setCutoffDay(Number(e.target.value))}
                          className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2 px-2 text-xs font-bold text-[var(--foreground)]"
                        >
                          <option value={0}>יום ראשון</option>
                          <option value={1}>יום שני</option>
                          <option value={2}>יום שלישי</option>
                          <option value={3}>יום רביעי</option>
                          <option value={4}>יום חמישי</option>
                          <option value={5}>יום שישי</option>
                          <option value={6}>יום שבת</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-[var(--muted)] mb-1 block">שעת סגירה:</label>
                        <input
                          type="time"
                          value={cutoffTime}
                          onChange={(e) => setCutoffTime(e.target.value)}
                          className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2 px-2 text-xs font-bold text-center text-[var(--foreground)]"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      setIsSavingCutoff(true);
                      await onSaveCutoffConfig({ enabled: cutoffEnabled, day: cutoffDay, time: cutoffTime });
                      setIsSavingCutoff(false);
                    }}
                    disabled={isSavingCutoff}
                    className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 text-xs font-bold rounded-xl transition-all cursor-pointer border-none flex items-center justify-center gap-1.5"
                  >
                    {isSavingCutoff ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>שמור הגדרות קציבה</span>
                  </button>
                </div>
              )}

              <button
                onClick={() => setIsAddingCat(false)}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 !text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] shrink-0 cursor-pointer border-none"
              >
                סגור
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* ── RECURRING LIST EDIT MODAL ── */}
      <AnimatePresence>
        {isEditingRecurring && (isAdmin || isLogistics) && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditingRecurring(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl text-right flex flex-col max-h-[90vh] overflow-hidden"
              dir="rtl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black flex items-center gap-2 text-[var(--foreground)]">
                  <Settings className="w-5 h-5 text-indigo-500" />
                  עריכת רשימה קבועה (שבועית)
                </h3>
                <button
                  onClick={() => setIsEditingRecurring(false)}
                  className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-6 relative shrink-0">
                <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
                  הוסף מוצר לרשימה הקבועה
                </label>
                <div className="relative">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] pointer-events-none" />
                  <input
                    type="text"
                    value={recurringSearchVal}
                    onChange={(e) => setRecurringSearchVal(e.target.value)}
                    placeholder="חיפוש או הוספת מוצר..."
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl py-3 pr-11 pl-10 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-[var(--foreground)]"
                  />
                  {recurringSearchVal && (
                    <button
                      type="button"
                      onClick={() => setRecurringSearchVal("")}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors cursor-pointer border-none flex items-center justify-center"
                      title="נקה חיפוש"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {recurringSearchVal.trim() && (
                  <div className="absolute z-20 left-0 right-0 mt-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl max-h-48 overflow-y-auto divide-y divide-[var(--border)]">
                    {(() => {
                      const term = recurringSearchVal.trim().toLowerCase();
                      const matches = pool.filter((p) => p.name.toLowerCase().includes(term) && !p.isRecurring);
                      const similar = findSimilarProduct(recurringSearchVal, pool);
                      const hasExact = !!similar;

                      return (
                        <>
                          {matches.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => {
                                onToggleRecurring(p.id, p.name, p.category, true);
                                setRecurringSearchVal("");
                              }}
                              className="w-full text-right px-4 py-3 text-xs font-bold hover:bg-[var(--foreground)]/5 flex items-center justify-between gap-2 text-[var(--foreground)]"
                            >
                              <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                                <span className="truncate">{p.name}</span>
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${CAT_COLOR[p.category] ?? CAT_COLOR["כללי"]}`}>
                                  {p.category}
                                </span>
                                {p.defaultNotes && p.defaultNotes.trim() !== "" && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 flex items-center gap-1 shrink-0">
                                    <MessageSquare className="w-2.5 h-2.5 text-amber-500" />
                                    <span className="truncate max-w-[120px]">{p.defaultNotes}</span>
                                  </span>
                                )}
                              </div>
                            </button>
                          ))}
                          {!hasExact && isAdmin && (
                            <button
                              onClick={() => {
                                const name = recurringSearchVal.trim();
                                const docId = name.replace(/\//g, "-");
                                onToggleRecurring(docId, name, "כללי", true);
                                setRecurringSearchVal("");
                              }}
                              className="w-full text-right px-4 py-3 text-xs font-black text-indigo-500 hover:bg-[var(--foreground)]/5 flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 text-indigo-500" />
                              <span>צור והוסף מוצר חדש: "{recurringSearchVal.trim()}"</span>
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/60 pr-1 no-scrollbar mb-6">
                {pool.filter((p) => p.isRecurring).length === 0 ? (
                  <div className="py-12 text-center opacity-40">
                    <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-[var(--muted)]" />
                    <p className="text-xs font-black">אין מוצרים קבועים ברשימה</p>
                  </div>
                ) : (
                  pool
                    .filter((p) => p.isRecurring)
                    .map((p) => (
                      <RecurringProductRow
                        key={p.id}
                        product={p}
                        onToggleRecurring={onToggleRecurring}
                        onUpdateRecurringQuantity={onUpdateRecurringQuantity}
                      />
                    ))
                )}
              </div>

              <button
                onClick={() => setIsEditingRecurring(false)}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 !text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] shrink-0 cursor-pointer"
              >
                סגור
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── ARCHIVE SESSION PROMPT DIALOG ── */}
      <AnimatePresence>
        {showArchivePrompt && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowArchivePrompt(false)}
              className="absolute inset-0 bg-black/65 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl text-right overflow-hidden"
              dir="rtl"
            >
              <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-l from-emerald-500 via-teal-500 to-indigo-500" />

              <div className="flex items-center gap-3 mb-4 mt-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[var(--foreground)]">סיום הרכישה הנוכחית</h3>
                  <p className="text-xs text-[var(--muted)] font-bold">
                    {hasRemainingActiveItems ? "חלק מהמוצרים נרכשו" : "כל המוצרים סומנו כנקנו!"}
                  </p>
                </div>
              </div>

              <p className="text-sm font-bold text-[var(--foreground)]/80 mb-6 leading-relaxed">
                {hasRemainingActiveItems
                  ? `האם ברצונך להעביר את ${sessionPurchasedCount} המוצרים שנקנו לארכיון הרכישות הכללי ולנקות אותם מהרשימה הפעילה? (שאר המוצרים שלא נקנו יישארו ברשימה)`
                  : `האם ברצונך להעביר את ${sessionPurchasedCount} המוצרים שנקנו לארכיון הרכישות הכללי ולנקות את הרשימה הפעילה?`}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={onArchiveCurrentSession}
                  className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 !text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                >
                  כן, ארכב ונקה
                </button>
                <button
                  onClick={() => setShowArchivePrompt(false)}
                  className="flex-1 py-4 bg-[var(--foreground)]/5 text-[var(--muted)] hover:bg-[var(--foreground)]/10 rounded-2xl font-black text-sm active:scale-95 transition-all"
                >
                  לא כרגע
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── RECEIPT SCAN / UPLOAD MODAL ── */}
      <AnimatePresence>
        {receiptScanOpen && (
          <div className="fixed inset-0 z-[130] flex items-end md:items-center justify-center p-0 md:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!receiptUploading) {
                  setReceiptScanOpen(false);
                  setReceiptImage(null);
                  setReceiptPreviewUrl(null);
                  setReceiptNotes("");
                }
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ y: "100%", scale: 1 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative bg-[var(--surface)] border-t md:border border-[var(--border)] rounded-t-[2rem] md:rounded-[2.5rem] w-full max-w-md p-6 md:p-8 shadow-2xl text-right flex flex-col max-h-[90vh] overflow-hidden z-10"
              dir="rtl"
            >
              <div className="w-12 h-1.5 bg-[var(--border)] rounded-full mx-auto mb-5 md:hidden" />

              <div className="flex items-center justify-between mb-6 shrink-0">
                <h3 className="text-xl font-black flex items-center gap-2 text-[var(--foreground)]">
                  <Receipt className="w-5 h-5 text-rose-500" />
                  <span>צילום והעלאת חשבונית</span>
                </h3>
                <button
                  onClick={() => {
                    if (!receiptUploading) {
                      setReceiptScanOpen(false);
                      setReceiptImage(null);
                      setReceiptPreviewUrl(null);
                      setReceiptNotes("");
                    }
                  }}
                  disabled={receiptUploading}
                  className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto no-scrollbar pb-6 flex-1">
                {!receiptPreviewUrl ? (
                  <div className="space-y-3">
                    <label
                      htmlFor="camera-capture-input"
                      className="w-full py-8 px-4 border-2 border-dashed border-[var(--border)] hover:border-rose-500/40 rounded-2xl transition-all flex flex-col items-center justify-center gap-3 cursor-pointer bg-[var(--foreground)]/[0.02]"
                    >
                      <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center">
                        <Plus className="w-6 h-6 text-rose-500" />
                      </div>
                      <span className="text-sm font-black text-[var(--foreground)]">צלם חשבונית מהמצלמה</span>
                      <span className="text-xs text-[var(--muted)]">הפעלת מצלמת המכשיר ישירות</span>
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setReceiptImage(file);
                          setReceiptPreviewUrl(URL.createObjectURL(file));
                        }
                      }}
                      id="camera-capture-input"
                      className="hidden"
                    />

                    <label
                      htmlFor="file-upload-input"
                      className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-center cursor-pointer text-[var(--foreground)]"
                    >
                      <Upload className="w-4 h-4 text-[var(--muted)]" />
                      <span>בחר קובץ קיים מהגלריה</span>
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setReceiptImage(file);
                          setReceiptPreviewUrl(URL.createObjectURL(file));
                        }
                      }}
                      id="file-upload-input"
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative rounded-2xl overflow-hidden border border-[var(--border)] bg-black max-h-[250px] flex items-center justify-center">
                      <img src={receiptPreviewUrl} alt="תצוגה מקדימה" className="object-contain max-h-[250px] w-full" />
                      <button
                        onClick={() => {
                          setReceiptImage(null);
                          setReceiptPreviewUrl(null);
                        }}
                        type="button"
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/75 text-white hover:bg-black transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="bg-[var(--foreground)]/[0.02] border border-[var(--border)] rounded-2xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)] font-bold">מתעד:</span>
                    <span className="font-black text-[var(--foreground)]">
                      {currentUser?.displayName || currentUser?.email || "מערכת"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)] font-bold">תאריך:</span>
                    <span className="font-black text-[var(--foreground)]">{new Date().toLocaleDateString("he-IL")}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-[var(--foreground)]">הערות לחשבונית / פירוט רכש:</label>
                  <textarea
                    value={receiptNotes}
                    onChange={(e) => setReceiptNotes(e.target.value)}
                    placeholder="רשום הערות כגון: סניף, פריטים מיוחדים או לאיזה פרויקט..."
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all min-h-[80px] resize-none text-[var(--foreground)]"
                  />
                </div>

                <button
                  onClick={handleSaveReceiptClick}
                  disabled={receiptUploading || !receiptImage}
                  className="w-full py-4 px-4 bg-rose-600 hover:bg-rose-700 disabled:bg-[var(--border)] text-white disabled:text-[var(--muted)] rounded-2xl text-sm font-black transition-all flex items-center justify-center gap-2 shadow-md shadow-rose-600/10 cursor-pointer"
                >
                  {receiptUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>שומר חשבונית בארכיון...</span>
                    </>
                  ) : (
                    <span>שמור חשבונית בארכיון הקבלות</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MANAGE STAR PRODUCTS MODAL ── */}
      <AnimatePresence>
        {showManageStarModal && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowManageStarModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-lg p-6 md:p-8 shadow-2xl text-right flex flex-col max-h-[90vh] overflow-hidden z-10"
              dir="rtl"
            >
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h3 className="text-lg md:text-xl font-black flex items-center gap-2 text-[var(--foreground)]">
                  <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                  <span>ניהול מוצרי כוכב (מתוך הפול)</span>
                </h3>
                <button
                  onClick={() => setShowManageStarModal(false)}
                  className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] border-none cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-[var(--muted)] font-bold mb-4 shrink-0">
                סמן מוצרים מתוך פול המוצרים הקיים כדי להציג אותם כצ׳יפים מהירים בחלונית הוספת מוצר.
              </p>

              <div className="relative mb-4 shrink-0">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] pointer-events-none" />
                <input
                  type="text"
                  value={starModalSearchVal}
                  onChange={(e) => setStarModalSearchVal(e.target.value)}
                  placeholder="חיפוש מוצר בפול..."
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-2xl py-2.5 pr-11 pl-10 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-[var(--foreground)]"
                />
                {starModalSearchVal && (
                  <button
                    type="button"
                    onClick={() => setStarModalSearchVal("")}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors cursor-pointer border-none flex items-center justify-center"
                    title="נקה חיפוש"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-[var(--border)]/60 pr-1 no-scrollbar mb-4">
                {(() => {
                  const term = starModalSearchVal.trim().toLowerCase();
                  const filtered = pool.filter(
                    (p) =>
                      p.isActive !== false &&
                      (!term || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term))
                  );

                  if (filtered.length === 0) {
                    return (
                      <div className="py-12 text-center opacity-40">
                        <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-[var(--muted)]" />
                        <p className="text-xs font-black">לא נמצאו מוצרים תואמים בפול</p>
                      </div>
                    );
                  }

                  return filtered.map((p) => {
                    const isStar = !!p.isStar;
                    return (
                      <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                        <div className="flex flex-col items-start gap-1 min-w-0 flex-1">
                          <span className="text-xs font-bold text-[var(--foreground)] truncate">{p.name}</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${CAT_COLOR[p.category] ?? CAT_COLOR["כללי"]}`}>
                            {p.category}
                          </span>
                        </div>
                        <button
                          onClick={() => onToggleStarProduct(p.id, isStar)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border flex items-center gap-1.5 border-none ${
                            isStar
                              ? "bg-amber-500 text-white shadow-sm"
                              : "bg-[var(--foreground)]/5 text-[var(--muted)] hover:bg-[var(--foreground)]/10"
                          }`}
                        >
                          <Star className={`w-3.5 h-3.5 ${isStar ? "fill-white" : ""}`} />
                          <span>{isStar ? "מוצר כוכב ⭐" : "+ הגדר ככוכב"}</span>
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>

              <button
                onClick={() => setShowManageStarModal(false)}
                className="w-full py-4 bg-amber-500 hover:bg-amber-600 !text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] shrink-0 cursor-pointer border-none"
              >
                סיום
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


    </>
  );
}
