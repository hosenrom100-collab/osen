"use client";

import { useState, memo } from "react";
import { User } from "firebase/auth";
import { ShoppingRequest, Product } from "../types";
import {
  ShoppingCart, Flame, ShoppingBag,
  ChevronDown, Check, Trash2, Edit3, Plus, Minus, CheckCircle2, RotateCcw, Package, MessageSquare
} from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { CAT_SOLID, CAT_COLOR } from "../lib/constants";
import { useConfirm } from "@/hooks/useConfirm";
import { parseQuantity, formatUnitShort, getQuantityStep, getMinQuantity, steppedQuantity } from "../lib/quantityUtils";

type ShoppingStatus = ShoppingRequest["status"] | "permanently_delete";
type OnChangeStatus = (id: string, next: ShoppingStatus, extra?: Record<string, unknown>) => void;
type OnEditItem = (item: ShoppingRequest) => void;
type OnUpdateQuantity = (id: string, currentQtyStr: string, increment: number) => void;
type OnMoveList = (id: string) => void;

interface ShoppingListViewProps {
  requests: ShoppingRequest[];
  pool?: Product[];
  categories: string[];
  listType: "supermarket" | "large";
  activeCategory: string | null;
  setActiveCategory: (cat: string | null) => void;
  canPurchase?: boolean;
  isAdmin?: boolean;
  isLogistics?: boolean;
  currentUser?: User | null;
  onChangeStatus: OnChangeStatus;
  onEditItem: OnEditItem;
  onUpdateQuantity: OnUpdateQuantity;
  onMoveToEquipment: OnMoveList;
  onMoveToSupermarket: OnMoveList;
  onShowArchivePrompt: () => void;
}

export function ShoppingListView({
  requests,
  pool = [],
  categories,
  listType,
  activeCategory,
  setActiveCategory,
  onChangeStatus,
  onEditItem,
  onUpdateQuantity,
  onMoveToEquipment,
  onMoveToSupermarket,
  onShowArchivePrompt,
}: ShoppingListViewProps) {
  const [purchasedCollapsed, setPurchasedCollapsed] = useState(false);
  const [deletedCollapsed, setDeletedCollapsed] = useState(true);
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);

  const activeRequests = requests.filter(
    (r) =>
      (r.status === "approved" || r.status === "pending") &&
      (listType === "large" ? r.listType === "large" : r.listType !== "large")
  );
  const sessionPurchased = requests.filter(
    (r) => r.status === "purchased" && (listType === "large" ? r.listType === "large" : r.listType !== "large")
  );
  const sessionDeleted = requests.filter(
    (r) => r.status === "deleted" && (listType === "large" ? r.listType === "large" : r.listType !== "large")
  );

  const urgentCount = activeRequests.filter((r) => r.priority === "urgent").length;
  // Guard against a stale toggle once the last urgent item is purchased/removed elsewhere.
  const urgentFilterActive = showUrgentOnly && urgentCount > 0;

  return (
    <div dir="rtl" className="w-full max-w-4xl mx-auto pb-24 px-3 sm:px-4">
      {/* ── Listonic Top Stats & Controls ── */}
      <div className="pt-2 pb-4">
        <div className="grid grid-cols-3 gap-2.5 p-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xs">
          <button
            onClick={() => {
              setActiveCategory(null);
              setShowUrgentOnly(false);
            }}
            className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl transition-all cursor-pointer border-none ${
              activeCategory === null && !urgentFilterActive ? "bg-indigo-500/15 ring-2 ring-indigo-500/30" : "bg-indigo-500/5 hover:bg-indigo-500/10"
            }`}
          >
            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 mb-0.5">
              <ShoppingCart className="w-4 h-4" /> פתוחים
            </span>
            <span className="text-xl font-black text-[var(--foreground)]">{activeRequests.length}</span>
          </button>

          <button
            onClick={() => {
              if (urgentCount === 0) return;
              setActiveCategory(null);
              setShowUrgentOnly((v) => !v);
            }}
            className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl transition-all cursor-pointer border-none ${
              urgentFilterActive ? "bg-rose-500/20 ring-2 ring-rose-500/30" : urgentCount > 0 ? "bg-rose-500/10 hover:bg-rose-500/15" : "bg-slate-500/5"
            }`}
          >
            <span className="text-xs font-black text-rose-500 flex items-center gap-1.5 mb-0.5">
              <Flame className="w-4 h-4 animate-pulse text-rose-500" /> דחופים
            </span>
            <span className="text-xl font-black text-[var(--foreground)]">{urgentCount}</span>
          </button>

          <button
            onClick={() => setPurchasedCollapsed(!purchasedCollapsed)}
            className="flex flex-col items-center justify-center py-3 px-2 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 transition-all cursor-pointer border-none"
          >
            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mb-0.5">
              <CheckCircle2 className="w-4 h-4" /> נרכשו
            </span>
            <span className="text-xl font-black text-[var(--foreground)]">{sessionPurchased.length}</span>
          </button>
        </div>
      </div>

      {/* ── Active Items Grouped by Categories (Listonic Design) ── */}
      {activeRequests.length === 0 ? (
        <div className="py-16 text-center bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 my-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto mb-3">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-[var(--foreground)]">רשימת הקניות ריקה כרגע</h3>
          <p className="text-xs text-[var(--muted)] font-bold mt-1">תוכל להוסיף מוצרים חדשים בעזרת סרגל ההוספה למטה</p>
        </div>
      ) : (
        <LayoutGroup>
          {categories.map((cat) => {
            if (activeCategory !== null && activeCategory !== cat) return null;
            const catItems = activeRequests.filter(
              (r) => r.category === cat && (!urgentFilterActive || r.priority === "urgent")
            );
            if (catItems.length === 0) return null;

            return (
              <div key={cat} className="mb-6 last:mb-2">
                {/* Category Header */}
                <div className="flex items-center justify-between py-2 px-1 mb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-3.5 h-3.5 rounded-full ${CAT_SOLID[cat] ?? CAT_SOLID["כללי"]}`} />
                    <h2 className="text-base sm:text-lg font-black text-[var(--foreground)]">{cat}</h2>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-[var(--foreground)]/5 text-[var(--muted)]">
                      {catItems.length}
                    </span>
                  </div>
                </div>

                {/* Listonic Items Cards */}
                <div className="space-y-3">
                  {catItems.map((item) => (
                    <ListonicItemCard
                      key={item.id}
                      item={item}
                      onChangeStatus={onChangeStatus}
                      onEditItem={onEditItem}
                      onUpdateQuantity={onUpdateQuantity}
                      onMoveToEquipment={onMoveToEquipment}
                      onMoveToSupermarket={onMoveToSupermarket}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </LayoutGroup>
      )}

      {/* ── Purchased / Completed Items Section (Listonic Collapsible) ── */}
      {sessionPurchased.length > 0 && (
        <div className="mt-8 border-t border-[var(--border)] pt-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setPurchasedCollapsed(!purchasedCollapsed)}
              className="flex items-center gap-2 text-sm font-black text-emerald-600 dark:text-emerald-400 cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2 rounded-2xl border border-emerald-500/20 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>נרכשו בסבב הזה ({sessionPurchased.length})</span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${purchasedCollapsed ? "rotate-180" : ""}`} />
            </button>

            <button
              onClick={onShowArchivePrompt}
              className="px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-all shadow-md shadow-indigo-600/20 cursor-pointer border-none flex items-center gap-1.5"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>סיום קניות ושמירה</span>
            </button>
          </div>

          <AnimatePresence>
            {!purchasedCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-2 overflow-hidden"
              >
                {sessionPurchased.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-[var(--surface)]/60 border border-[var(--border)] opacity-75 hover:opacity-100 transition-all gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        onClick={() => onChangeStatus(item.id, "approved")}
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 cursor-pointer shadow-sm hover:scale-105 transition-transform"
                        title="החזר לרשימה הפעילה"
                      >
                        <Check className="w-5 h-5 stroke-[3]" />
                      </button>

                      <div className="min-w-0 flex-1 text-right">
                        <span className="text-base font-bold text-[var(--foreground)] line-through opacity-70 block truncate">
                          {item.name}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg">
                            {item.quantity}
                          </span>
                          {item.requestedByName && (
                            <span className="text-[10px] text-[var(--muted)] font-bold">
                              מבקש: {item.requestedByName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onChangeStatus(item.id, "approved")}
                      className="px-3 py-1.5 rounded-xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--foreground)] text-xs font-bold flex items-center gap-1 cursor-pointer border border-[var(--border)]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>בטל רכישה</span>
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Deleted Items Section (Optional Trash Bin) ── */}
      {sessionDeleted.length > 0 && (
        <div className="mt-6 border-t border-[var(--border)]/40 pt-4">
          <button
            onClick={() => setDeletedCollapsed(!deletedCollapsed)}
            className="flex items-center gap-2 text-xs font-bold text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer py-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>פריטים שנמחקו ({sessionDeleted.length})</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${deletedCollapsed ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence>
            {!deletedCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 space-y-2 overflow-hidden"
              >
                {sessionDeleted.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface)]/40 border border-[var(--border)]/50 text-xs text-[var(--muted)]"
                  >
                    <span className="line-through">{item.name} ({item.quantity})</span>
                    <button
                      onClick={() => onChangeStatus(item.id, "approved")}
                      className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-500/20 cursor-pointer"
                    >
                      החזר לרשימה
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

{/* ── Individual Listonic-Style Item Card ── */}
const ListonicItemCard = memo(function ListonicItemCard({
  item,
  onChangeStatus,
  onEditItem,
  onUpdateQuantity,
  onMoveToEquipment,
  onMoveToSupermarket,
}: {
  item: ShoppingRequest;
  onChangeStatus: OnChangeStatus;
  onEditItem: OnEditItem;
  onUpdateQuantity: OnUpdateQuantity;
  onMoveToEquipment: OnMoveList;
  onMoveToSupermarket: OnMoveList;
}) {
  const [isEditingQtyDirect, setIsEditingQtyDirect] = useState(false);
  const [qtyDraft, setQtyDraft] = useState("");
  const { confirm, ConfirmDialog } = useConfirm();

  const isUrgent = item.priority === "urgent";
  const { value: qtyValue, unit: qtyUnit } = parseQuantity(item.quantity);
  const qtyStep = getQuantityStep(qtyUnit);
  const qtyMin = getMinQuantity(qtyUnit);

  const startEditingQty = () => {
    setQtyDraft(String(qtyValue));
    setIsEditingQtyDirect(true);
  };

  const commitQtyEdit = () => {
    setIsEditingQtyDirect(false);
    const parsed = parseFloat(qtyDraft.replace(",", "."));
    if (!Number.isNaN(parsed) && parsed > 0 && parsed !== qtyValue) {
      onUpdateQuantity(item.id, item.quantity || "1", parsed - qtyValue);
    }
  };

  const confirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: "מחיקת מוצר",
      message: `האם ברצונך למחוק את "${item.name}" מהרשימה?`,
      type: "danger",
    });
    if (ok) onChangeStatus(item.id, "deleted");
  };

  const handleCheckbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(20);
    }
    onChangeStatus(item.id, "purchased");
  };

  return (
    <>
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className={`relative bg-[var(--surface)] border rounded-2xl p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-all flex flex-col gap-3 ${
        isUrgent
          ? "border-rose-500/40 bg-gradient-to-l from-rose-500/5 via-[var(--surface)] to-[var(--surface)]"
          : "border-[var(--border)]"
      }`}
    >
      {/* Upper Row: Checkbox, Name, Badges */}
      <div className="flex items-start justify-between gap-3 w-full">
        <div className="flex items-start gap-3 min-w-0 flex-1 text-right">
          {/* Listonic Large Checkbox */}
          <button
            onClick={handleCheckbox}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl border-2 border-[var(--muted)]/30 hover:border-indigo-500 hover:bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0 transition-all cursor-pointer active:scale-90 shadow-xs"
            title="סמן כנרכש"
            aria-label="סמן כנרכש"
          >
            <Check className="w-5 h-5 sm:w-6 sm:h-6 opacity-40 hover:opacity-100 transition-opacity stroke-[2.5]" />
          </button>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base sm:text-lg font-black text-[var(--foreground)] leading-snug whitespace-normal break-words">
                {item.name}
              </span>

              {isUrgent && (
                <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-500 border border-rose-500/30 flex items-center gap-1 shrink-0">
                  <Flame className="w-3.5 h-3.5 animate-pulse" /> דחוף
                </span>
              )}
            </div>

            {/* Requester & Category Info line */}
            <div className="flex items-center gap-2 mt-1 text-xs text-[var(--muted)] flex-wrap">
              {item.requestedByName && (
                <span className="bg-[var(--foreground)]/5 border border-[var(--border)] px-2 py-0.5 rounded-lg font-bold">
                  מבקש: {item.requestedByName}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-lg font-bold text-[11px] ${CAT_COLOR[item.category] ?? CAT_COLOR["כללי"]}`}>
                {item.category}
              </span>
            </div>

            {/* Notes Box */}
            {item.notes && item.notes.trim() !== "" && (
              <div className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 p-2 rounded-xl flex items-start gap-1.5">
                <MessageSquare className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span className="break-words">{item.notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Large Quantity Stepper */}
        <div className="flex items-center gap-1 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl p-1 shrink-0 shadow-xs">
          <button
            onClick={() => onUpdateQuantity(item.id, item.quantity || "1", steppedQuantity(qtyValue, qtyStep, -1, qtyMin) - qtyValue)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[var(--surface)] hover:bg-[var(--foreground)]/10 text-[var(--foreground)] flex items-center justify-center transition-all active:scale-90 border border-[var(--border)] cursor-pointer"
            title="הפחת כמות"
            aria-label="הפחת כמות"
          >
            <Minus className="w-4 h-4 stroke-[3]" />
          </button>

          <div className="min-w-[50px] text-center px-1">
            {isEditingQtyDirect ? (
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={qtyDraft}
                onChange={(e) => setQtyDraft(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={commitQtyEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setIsEditingQtyDirect(false);
                }}
                className="w-14 bg-[var(--background)] border border-indigo-500 rounded-lg text-base font-black text-center outline-none text-[var(--foreground)]"
              />
            ) : (
              <button
                type="button"
                onClick={startEditingQty}
                className="cursor-pointer hover:bg-[var(--foreground)]/10 rounded-lg px-1 py-0.5 transition-colors"
                title="לחץ להזנת כמות מדויקת"
              >
                <span className="text-base sm:text-lg font-black text-[var(--foreground)]">{qtyValue}</span>
                <span className="text-[10px] text-[var(--muted)] block -mt-1 font-bold">{formatUnitShort(qtyUnit)}</span>
              </button>
            )}
          </div>

          <button
            onClick={() => onUpdateQuantity(item.id, item.quantity || "1", steppedQuantity(qtyValue, qtyStep, 1) - qtyValue)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-all active:scale-90 shadow-sm cursor-pointer border-none"
            title="הוסף כמות"
            aria-label="הוסף כמות"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      </div>

      {/* Lower Row: Prominent Action Buttons (Large, Clear, Mobile-Friendly) */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]/40 flex-wrap">
        <button
          onClick={() => onEditItem(item)}
          className="px-3.5 py-2 rounded-xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--foreground)] text-xs font-bold transition-all active:scale-95 border border-[var(--border)] flex items-center gap-1.5 cursor-pointer"
          title="עריכת מוצר"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>עריכה</span>
        </button>

        <button
          onClick={confirmDelete}
          className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-bold transition-all active:scale-95 border border-rose-500/20 flex items-center gap-1.5 cursor-pointer"
          title="מחיקה מהרשימה"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>מחיקה</span>
        </button>

        {item.listType !== "large" ? (
          <button
            onClick={() => onMoveToEquipment(item.id)}
            className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold transition-all active:scale-95 border border-amber-500/20 flex items-center gap-1.5 cursor-pointer"
            title="העבר לרשימת ציוד ורכש"
          >
            <Package className="w-3.5 h-3.5" />
            <span>העבר לציוד</span>
          </button>
        ) : (
          <button
            onClick={() => onMoveToSupermarket(item.id)}
            className="px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold transition-all active:scale-95 border border-indigo-500/20 flex items-center gap-1.5 cursor-pointer"
            title="העבר לרשימת סופר"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>העבר לסופר</span>
          </button>
        )}
      </div>
    </motion.div>
    <ConfirmDialog />
    </>
  );
});
