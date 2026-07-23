"use client";

import { useState, useEffect } from "react";
import { ShoppingRequest, Product, InventoryItem } from "../types";
import { findSimilarProduct } from "../lib/stringUtils";
import { 
  Edit3, Settings, X, Plus, Minus, Trash2, Check, RotateCcw, Download, 
  Receipt, Star, Flame, ShoppingBag, CheckCircle2, Upload, Loader2, Search, MessageSquare 
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

const CAT_SOLID: Record<string, string> = {
  "גבינות ומחלבה":       "bg-amber-500 border-amber-400",
  "בשר ודגים":            "bg-rose-500 border-rose-400",
  "פירות וירקות":         "bg-emerald-500 border-emerald-400",
  "לחם ומאפים":           "bg-orange-500 border-orange-400",
  "חומרי ניקוי":          "bg-cyan-500 border-cyan-400",
  "מוצרי נייר וחד פעמי": "bg-indigo-500 border-indigo-400",
  "טואלטיקה והיגיינה":   "bg-teal-500 border-teal-400",
  "שימורים ובישול":       "bg-slate-500 border-slate-400",
  "קפואים":               "bg-sky-500 border-sky-400",
  "כללי":                 "bg-slate-400 border-slate-300",
};

interface ShoppingModalsProps {
  editItem: ShoppingRequest | null;
  setEditItem: (item: ShoppingRequest | null) => void;
  onUpdateItem: (id: string, name: string, category: string, quantity: string, notes: string, priority: "low" | "normal" | "urgent") => void;

  isAddingCat: boolean;
  setIsAddingCat: (val: boolean) => void;
  categories: string[];
  onAddCategory: (newCatName: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (catName: string) => void;

  editingInvItem: { productId: string; name: string; minStock: number; unit: string } | null;
  setEditingInvItem: (val: any) => void;
  onSaveInventorySettings: (productId: string, minStockVal: number, unitVal: string) => void;

  isEditingRecurring: boolean;
  setIsEditingRecurring: (val: boolean) => void;
  pool: Product[];
  onToggleRecurring: (productId: string, name: string, category: string, shouldBeRecurring: boolean) => void;
  onUpdateRecurringQuantity: (productId: string, currentQtyStr: string, increment: number) => void;

  showArchivePrompt: boolean;
  setShowArchivePrompt: (val: boolean) => void;
  sessionPurchasedCount: number;
  onArchiveCurrentSession: () => void;

  actionsMenuOpen: boolean;
  setActionsMenuOpen: (val: boolean) => void;
  listType: "supermarket" | "large";
  canPurchase: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isLogistics: boolean;
  onImportRecurringList: () => void;
  onExportProcurementList: () => void;
  onExportOngoingList: () => void;
  onExportXlsx: () => void;
  onClearAllArchive: () => void;

  receiptScanOpen: boolean;
  setReceiptScanOpen: (val: boolean) => void;
  currentUser: any;
  onSaveReceipt: (file: File, notes: string) => Promise<void>;

  showManageStarModal: boolean;
  setShowManageStarModal: (val: boolean) => void;
  onToggleStarProduct: (productId: string, currentIsStar?: boolean) => void;

  showManageTrackModal: boolean;
  setShowManageTrackModal: (val: boolean) => void;
  onToggleTrackInventory: (productId: string, currentTrack?: boolean) => void;
}

export function ShoppingModals({
  editItem,
  setEditItem,
  onUpdateItem,
  isAddingCat,
  setIsAddingCat,
  categories,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  editingInvItem,
  setEditingInvItem,
  onSaveInventorySettings,
  isEditingRecurring,
  setIsEditingRecurring,
  pool,
  onToggleRecurring,
  onUpdateRecurringQuantity,
  showArchivePrompt,
  setShowArchivePrompt,
  sessionPurchasedCount,
  onArchiveCurrentSession,
  actionsMenuOpen,
  setActionsMenuOpen,
  listType,
  canPurchase,
  isAdmin,
  isManager,
  isLogistics,
  onImportRecurringList,
  onExportProcurementList,
  onExportOngoingList,
  onExportXlsx,
  onClearAllArchive,
  receiptScanOpen,
  setReceiptScanOpen,
  currentUser,
  onSaveReceipt,
  showManageStarModal,
  setShowManageStarModal,
  onToggleStarProduct,
  showManageTrackModal,
  setShowManageTrackModal,
  onToggleTrackInventory,
}: ShoppingModalsProps) {
  // Local state for edit item
  const [editName, setEditName] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPriority, setEditPriority] = useState<"low" | "normal" | "urgent">("normal");

  // Local state for category management
  const [newCatName, setNewCatName] = useState("");
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [editingCatNewValue, setEditingCatNewValue] = useState("");

  // Local state for inventory settings
  const [editMinStock, setEditMinStock] = useState("1");
  const [editUnit, setEditUnit] = useState("יחידות");

  // Local state for recurring search
  const [recurringSearchVal, setRecurringSearchVal] = useState("");

  // Local state for receipts
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receiptUploading, setReceiptUploading] = useState(false);

  // Local state for star products search
  const [starModalSearchVal, setStarModalSearchVal] = useState("");

  // Local state for tracked products search
  const [trackModalSearch, setTrackModalSearch] = useState("");

  useEffect(() => {
    if (editItem) {
      setEditName(editItem.name);
      setEditCat(editItem.category);
      setEditQty(editItem.quantity || "");
      setEditNotes(editItem.notes || "");
      setEditPriority(editItem.priority || "normal");
    }
  }, [editItem]);

  useEffect(() => {
    if (editingInvItem) {
      setEditMinStock(String(editingInvItem.minStock));
      setEditUnit(editingInvItem.unit);
    }
  }, [editingInvItem]);

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
      {/* ── EDIT ITEM MODAL ── */}
      <AnimatePresence>
        {editItem && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditItem(null)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-8 shadow-2xl text-right"
              dir="rtl"
            >
              <h2 className="text-xl font-black mb-6 flex items-center gap-2 text-[var(--foreground)]">
                <Edit3 className="w-5 h-5 text-indigo-500" /> עריכת פריט
              </h2>

              <div className="space-y-5 text-right">
                <div>
                  <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
                    שם המוצר
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-indigo-500/50 text-[var(--foreground)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
                      כמות
                    </label>
                    <input
                      type="text"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      placeholder="למשל: 1, 2.5, 3"
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-indigo-500/50 text-[var(--foreground)]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
                      עדיפות
                    </label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as any)}
                      className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-indigo-500/50 text-[var(--foreground)]"
                    >
                      <option value="normal">רגיל</option>
                      <option value="urgent">דחוף 🔥</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
                    הערות / הנחיות מיוחדות
                  </label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="סוג ספציפי, צבע, או תחליף מועדף..."
                    rows={2}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:border-indigo-500/50 resize-none placeholder:text-[var(--muted)]/40 text-[var(--foreground)]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
                    קטגוריה
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto no-scrollbar border border-[var(--border)] p-2 rounded-xl bg-[var(--background)]/50">
                    {categories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditCat(c)}
                        className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                          editCat === c
                            ? `${CAT_SOLID[c] ?? CAT_SOLID["כללי"]} !text-white shadow-md`
                            : "bg-[var(--background)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => {
                    if (editItem) {
                      onUpdateItem(editItem.id, editName, editCat, editQty, editNotes, editPriority);
                      setEditItem(null);
                    }
                  }}
                  className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 !text-white text-sm font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                >
                  שמור שינויים
                </button>
                <button
                  onClick={() => setEditItem(null)}
                  className="flex-1 py-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--muted)] text-sm font-black rounded-2xl transition-all cursor-pointer"
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

      {/* ── INVENTORY ITEM SETTINGS DIALOG ── */}
      <AnimatePresence>
        {editingInvItem && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingInvItem(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl text-right flex flex-col"
              dir="rtl"
            >
              <div className="flex items-center justify-between mb-6 shrink-0">
                <h3 className="text-lg font-black flex items-center gap-2 text-[var(--foreground)]">
                  <Settings className="w-5 h-5 text-indigo-500" />
                  <span>הגדרות מלאי: {editingInvItem.name}</span>
                </h3>
                <button
                  onClick={() => setEditingInvItem(null)}
                  className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-black text-[var(--muted)] mb-1 block">
                    סף מינימום להתרעה (מינ׳ מלאי):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editMinStock}
                    onChange={(e) => setEditMinStock(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-4 text-xs font-bold text-[var(--foreground)] focus:border-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-[var(--muted)] mb-1 block">יחידת מידה:</label>
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-4 text-xs font-bold text-[var(--foreground)] focus:border-indigo-500 outline-none"
                  >
                    <option value="יחידות">יחידות</option>
                    <option value="חבילות">חבילות</option>
                    <option value="בקבוקים">בקבוקים</option>
                    <option value="ק״ג">ק״ג</option>
                    <option value="ליטר">ליטר</option>
                    <option value="מארזים">מארזים</option>
                    <option value="קופסאות">קופסאות</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onSaveInventorySettings(editingInvItem.productId, parseFloat(editMinStock) || 1, editUnit);
                    setEditingInvItem(null);
                  }}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 !text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-indigo-600/10 active:scale-95 border-none"
                >
                  שמור שינויים
                </button>
                <button
                  onClick={() => setEditingInvItem(null)}
                  className="py-3 px-5 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--muted)] rounded-xl text-xs font-black transition-all cursor-pointer border-none"
                >
                  ביטול
                </button>
              </div>
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
                      <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 border-b border-[var(--border)]/50 last:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-[var(--foreground)]">{p.name}</span>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${CAT_COLOR[p.category] ?? CAT_COLOR["כללי"]}`}>
                              {p.category}
                            </span>
                            {p.defaultNotes && p.defaultNotes.trim() !== "" && (
                              <span
                                className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1 max-w-full sm:max-w-[200px] truncate shadow-xs"
                                title={`הערה קבועה: ${p.defaultNotes}`}
                              >
                                <MessageSquare className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                <span className="truncate">{p.defaultNotes}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                          <div className="flex items-center gap-1 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl p-0.5 shadow-sm">
                            <button
                              onClick={() => onUpdateRecurringQuantity(p.id, p.recurringQuantity || "1", -1)}
                              className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] transition-all"
                            >
                              <Minus className="w-3 h-3 stroke-[2.5]" />
                            </button>
                            <span className="text-xs font-black min-w-[20px] text-center text-[var(--foreground)]">
                              {p.recurringQuantity || "1"}
                            </span>
                            <button
                              onClick={() => onUpdateRecurringQuantity(p.id, p.recurringQuantity || "1", 1)}
                              className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] transition-all"
                            >
                              <Plus className="w-3 h-3 stroke-[2.5]" />
                            </button>
                          </div>

                          <button
                            onClick={() => onToggleRecurring(p.id, p.name, p.category, false)}
                            className="w-8 h-8 rounded-xl bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/10 transition-all cursor-pointer"
                            title="הסר מהרשימה הקבועה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
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
                  <p className="text-xs text-[var(--muted)] font-bold">כל המוצרים סומנו כנקנו!</p>
                </div>
              </div>

              <p className="text-sm font-bold text-[var(--foreground)]/80 mb-6 leading-relaxed">
                האם ברצונך להעביר את {sessionPurchasedCount} המוצרים שנקנו לארכיון הרכישות הכללי ולנקות את הרשימה הפעילה?
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

      {/* ── ACTIONS MENU DRAWER / MODAL ── */}
      <AnimatePresence>
        {actionsMenuOpen && (
          <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActionsMenuOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%", scale: 1 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative bg-[var(--surface)] border-t md:border border-[var(--border)] rounded-t-[2rem] md:rounded-[2.5rem] w-full max-w-md p-6 md:p-8 shadow-2xl text-right flex flex-col max-h-[85vh] overflow-hidden z-10"
              dir="rtl"
            >
              <div className="w-12 h-1.5 bg-[var(--border)] rounded-full mx-auto mb-5 md:hidden" />

              <div className="flex items-center justify-between mb-6 shrink-0">
                <h3 className="text-xl font-black flex items-center gap-2 text-[var(--foreground)]">
                  <Settings className="w-5 h-5 text-indigo-500" />
                  <span>פעולות ניהול וייצוא</span>
                </h3>
                <button
                  onClick={() => setActionsMenuOpen(false)}
                  className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto no-scrollbar pb-6">
                {listType === "supermarket" && (
                  <>
                    {(isAdmin || isLogistics) && (
                      <button
                        onClick={() => {
                          setActionsMenuOpen(false);
                          setIsEditingRecurring(true);
                        }}
                        className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none text-[var(--foreground)]"
                      >
                        <Settings className="w-5 h-5 text-indigo-500" />
                        <span>עריכת רשימה קבועה (שבועית)</span>
                      </button>
                    )}

                    {(isAdmin || isManager || isLogistics) && (
                      <button
                        onClick={() => {
                          setActionsMenuOpen(false);
                          onImportRecurringList();
                        }}
                        className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none text-[var(--foreground)]"
                      >
                        <RotateCcw className="w-5 h-5 text-purple-500" />
                        <span>שאיבת רשימה קבועה לסופר</span>
                      </button>
                    )}
                  </>
                )}

                <button
                  onClick={() => {
                    setActionsMenuOpen(false);
                    onExportProcurementList();
                  }}
                  className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none text-[var(--foreground)]"
                >
                  <Download className="w-5 h-5 text-blue-500" />
                  <span>ייצוא רשימת רכש ל-Word</span>
                </button>

                <button
                  onClick={() => {
                    setActionsMenuOpen(false);
                    onExportOngoingList();
                  }}
                  className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none text-[var(--foreground)]"
                >
                  <Download className="w-5 h-5 text-emerald-500" />
                  <span>ייצוא רשימה שוטפת ל-Word</span>
                </button>

                {isAdmin && (
                  <button
                    onClick={() => {
                      setActionsMenuOpen(false);
                      onExportXlsx();
                    }}
                    className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none text-[var(--foreground)]"
                  >
                    <Download className="w-5 h-5 text-amber-500" />
                    <span>ייצוא ארכיון לאקסל (Excel)</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setActionsMenuOpen(false);
                    setIsAddingCat(true);
                  }}
                  className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none text-[var(--foreground)]"
                >
                  <Edit3 className="w-5 h-5 text-indigo-500" />
                  <span>ניהול קטגוריות רכש</span>
                </button>

                {(isAdmin || isManager || isLogistics) && (
                  <button
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setShowManageStarModal(true);
                    }}
                    className="w-full py-4 px-4 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl border border-[var(--border)] text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none text-[var(--foreground)]"
                  >
                    <Star className="w-5 h-5 text-amber-500 fill-amber-500/20" />
                    <span>ניהול מוצרי כוכב ⭐</span>
                  </button>
                )}

                {(isAdmin || isManager || isLogistics) && (
                  <button
                    onClick={() => {
                      setActionsMenuOpen(false);
                      onClearAllArchive();
                    }}
                    className="w-full py-4 px-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-2xl text-sm font-bold transition-all flex items-center gap-3 justify-start cursor-pointer border-none"
                  >
                    <Trash2 className="w-5 h-5 text-rose-500" />
                    <span>ניקוי ואיפוס כל ארכיון הקניות 🧹</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setActionsMenuOpen(false);
                    setReceiptScanOpen(true);
                  }}
                  className="w-full py-4 px-4 bg-rose-500/10 hover:bg-rose-500/20 rounded-2xl text-sm font-bold text-rose-600 transition-all flex items-center gap-3 justify-start cursor-pointer border-none"
                >
                  <Receipt className="w-5 h-5 text-rose-500" />
                  <span>סריקה/צילום חשבונית</span>
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

      {/* ── MANAGE TRACKED PRODUCTS MODAL ── */}
      <AnimatePresence>
        {showManageTrackModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowManageTrackModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-lg p-6 md:p-8 shadow-2xl text-right flex flex-col max-h-[85vh]"
              dir="rtl"
            >
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h3 className="text-lg font-black flex items-center gap-2 text-[var(--foreground)]">
                  <Settings className="w-5 h-5 text-indigo-500" />
                  <span>בחירת מוצרים לניהול מלאי</span>
                </h3>
                <button
                  onClick={() => setShowManageTrackModal(false)}
                  className="p-2 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-[var(--muted)] font-bold mb-4 shrink-0">
                סמן את המוצרים שעבורם ברצונך לעקוב ולנהל מלאי קבוע במערכת.
              </p>

              <div className="relative mb-4 shrink-0">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                <input
                  type="text"
                  value={trackModalSearch}
                  onChange={(e) => setTrackModalSearch(e.target.value)}
                  placeholder="חפש מוצר ברשימה..."
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2 pr-10 pl-3 text-xs font-bold focus:outline-none focus:border-indigo-500 text-[var(--foreground)]"
                />
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[50vh]">
                {pool
                  .filter((p) => {
                    if (p.isActive === false) return false;
                    if (!trackModalSearch.trim()) return true;
                    const q = trackModalSearch.trim().toLowerCase();
                    return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
                  })
                  .map((p) => {
                    const isTracked = p.trackInventory === true;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-3 bg-[var(--background)] border border-[var(--border)] rounded-xl gap-2"
                      >
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-xs font-bold text-[var(--foreground)]">{p.name}</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${CAT_COLOR[p.category] ?? CAT_COLOR["כללי"]}`}>
                            {p.category}
                          </span>
                        </div>
                        <button
                          onClick={() => onToggleTrackInventory(p.id, p.trackInventory)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer border ${
                            isTracked
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-[var(--surface)] text-[var(--muted)] border-[var(--border)] hover:border-indigo-500"
                          }`}
                        >
                          {isTracked ? "במלאי ✓" : "+ הוסף למלאי"}
                        </button>
                      </div>
                    );
                  })}
              </div>

              <div className="mt-4 pt-4 border-t border-[var(--border)] shrink-0 flex justify-end">
                <button
                  onClick={() => setShowManageTrackModal(false)}
                  className="py-2.5 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition-all cursor-pointer"
                >
                  סיום
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
