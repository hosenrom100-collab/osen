"use client";

import React, { useState } from "react";
import {
  Package, FileText, Trash2, Plus, X, AlertCircle, CheckCircle2, ShoppingBag, Edit2, Lock, ArrowRight, Loader2
} from "lucide-react";
import { ShoppingRequest, Product } from "../types";
import { BottomSheet } from "./BottomSheet";

export interface CycleClosureModalProps {
  isOpen: boolean;
  onClose: () => void;
  listType: "supermarket" | "large";
  requests: ShoppingRequest[];
  pool: Product[];
  categories: string[];
  onAddProduct: (name: string, category: string, priority?: "low" | "normal" | "urgent", qty?: string, notes?: string) => Promise<void>;
  onExportList: () => Promise<void>;
  onCloseCycle: (options: { carryOver: boolean }) => Promise<void>;
  onRemoveItem: (id: string) => Promise<void>;
  onUpdateQuantity: (id: string, newQty: string) => Promise<void>;
  onVerifyPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
}

export function CycleClosureModal({
  isOpen,
  onClose,
  listType,
  requests,
  pool,
  categories,
  onAddProduct,
  onExportList,
  onCloseCycle,
  onRemoveItem,
  onUpdateQuantity,
  onVerifyPassword,
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

  const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");
  // On by default: an unbought item silently vanishing is the costly mistake, an item that
  // stays on the list one more week is easy to remove.
  const [carryOver, setCarryOver] = useState(true);

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

  const unpurchasedCount = activeItems.filter((r) => r.status !== "purchased").length;
  const purchasedCount = activeItems.length - unpurchasedCount;

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

  const handleConfirmedClose = async () => {
    const gateResult = await onVerifyPassword(confirmPassword.trim());
    if (!gateResult.success) {
      setConfirmError(gateResult.error || "סיסמת מנהל שגויה!");
      return;
    }
    setIsProcessing(true);
    try {
      await onExportList();
      await onCloseCycle({ carryOver: carryOver && unpurchasedCount > 0 });
      setIsExportConfirmOpen(false);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const footer = (
          <div className="space-y-3">
            {!isExportConfirmOpen ? (
              <>
                <div className="flex items-center justify-between text-xs font-bold text-[var(--muted)]">
                  <span>סה"כ {activeItems.length} מוצרים ב-{Object.keys(grouped).length} קטגוריות</span>
                  {activeItems.length > 0 && (
                    <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> מוכן להדפסה
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 flex-wrap">
                  <button
                    onClick={onClose}
                    className="h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--fill)] text-[var(--foreground)] hover:bg-[var(--fill-strong)] transition-colors cursor-pointer border-none"
                  >
                    ביטול / המשך עריכה
                  </button>

                  <button
                    onClick={() => { setIsExportConfirmOpen(true); setConfirmPassword(""); setConfirmError(""); }}
                    disabled={isProcessing || activeItems.length === 0}
                    className="h-12 px-5 rounded-xl text-sm font-bold bg-[var(--accent)] hover:brightness-110 !text-white transition-all shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-2 border-none"
                  >
                    <FileText className="w-4 h-4 text-white" />
                    <span>ייצא רשימה להדפסה (Word)</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[var(--foreground)]/80 font-medium leading-relaxed flex items-start gap-2">
                  <Lock className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>
                    תופק רשימה להדפסה (Word) עבור <strong>{activeItems.length}</strong> פריטים, והסבב ייסגר
                    וישמר ב״סבבים קודמים״. אנא הזן סיסמת מנהל לאישור.
                  </span>
                </p>
                {unpurchasedCount > 0 && (
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 cursor-pointer text-xs font-bold text-[var(--foreground)]">
                    <input
                      type="checkbox"
                      checked={carryOver}
                      onChange={(e) => setCarryOver(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-amber-500 shrink-0"
                    />
                    <span>
                      העבר את <strong>{unpurchasedCount}</strong> המוצרים שלא נרכשו לסבב הבא
                      <span className="block text-xs font-semibold text-[var(--muted)] mt-0.5">
                        {carryOver ? "יישארו ברשימה עם הכמויות וההערות." : "יימחקו מהרשימה (יישמרו רק בהיסטוריה)."}
                      </span>
                    </span>
                  </label>
                )}
                <div>
                  <label htmlFor="cycle-closure-password" className="sr-only">סיסמת מנהל</label>
                  <input
                    id="cycle-closure-password"
                    type="password"
                    autoFocus
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setConfirmError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleConfirmedClose(); }}
                    placeholder="הזן סיסמת מנהל..."
                    aria-invalid={!!confirmError}
                    aria-describedby={confirmError ? "cycle-closure-password-error" : undefined}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-3 text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none text-center tracking-widest text-[var(--foreground)]"
                  />
                  {confirmError && (
                    <span id="cycle-closure-password-error" className="text-xs text-rose-500 font-bold mt-1.5 block">{confirmError}</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setIsExportConfirmOpen(false)}
                    className="h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--fill)] text-[var(--foreground)] hover:bg-[var(--fill-strong)] transition-colors cursor-pointer border-none flex items-center gap-1.5"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    חזור
                  </button>
                  <button
                    onClick={handleConfirmedClose}
                    disabled={isProcessing}
                    className="h-12 px-5 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-700 !text-white transition-all shadow-lg active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-2 border-none"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Lock className="w-4 h-4 text-white" />}
                    <span>אשר, ייצא וסגור סבב</span>
                  </button>
                </div>
              </div>
            )}
          </div>
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="סגירת סבב קניות"
      icon={<Package className="w-5 h-5 text-[var(--accent-text)]" aria-hidden="true" />}
      zIndex={140}
      size="lg"
      footer={footer}
    >
          <p className="text-sm text-[var(--muted)] font-medium mb-4">
            בדיקה סופית לפני ארכוב הסבב של <strong className="text-[var(--foreground)]">{listType === "large" ? "ציוד ורכש" : "קניות סופר"}</strong>. הסבב נשמר ב״סבבים קודמים״.
          </p>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { n: purchasedCount, label: "נרכשו", cls: "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-400" },
              { n: unpurchasedCount, label: "לא נרכשו", cls: "bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-400" },
              {
                n: carryOver ? unpurchasedCount : 0,
                label: "יועברו הלאה",
                cls: "bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent-text)]",
              },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-2xl border p-3 text-center ${stat.cls}`}>
                <div className="text-2xl font-bold tabular-nums leading-none">{stat.n}</div>
                <div className="text-[13px] font-semibold mt-1.5 opacity-90">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Quick Add Bar - "מוצרי דקה ה-90" */}
          <div className="my-4 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 shrink-0">
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 block mb-2">
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
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 !text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 border-none shadow-xs"
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
                <div key={category} className="bg-[var(--fill)] border border-[var(--border)] rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-[var(--fill)] border-b border-[var(--border)] flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--foreground)]">{category}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--fill-strong)] text-[var(--muted)]">
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
                              <span className="text-xs font-semibold text-[var(--muted)] bg-[var(--fill)] px-2 py-0.5 rounded-lg truncate max-w-[160px]">
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
                                className="px-2 py-1 rounded-lg bg-[var(--fill)] hover:bg-[var(--fill-strong)] font-bold text-[var(--foreground)] flex items-center gap-1 cursor-pointer border-none"
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

    </BottomSheet>
  );
}
