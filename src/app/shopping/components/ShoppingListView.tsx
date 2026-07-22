"use client";

import { useState } from "react";
import { ShoppingRequest, InventoryItem } from "../types";
import { 
  ShoppingCart, Flame, Boxes, ShoppingBag, 
  ChevronDown, Check, Trash2, Edit3, Plus, Minus, CheckCircle2, RotateCcw, Package, AlertTriangle, X 
} from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

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

interface ShoppingListViewProps {
  requests: ShoppingRequest[];
  inventoryMap: Record<string, InventoryItem>;
  categories: string[];
  listType: "supermarket" | "large";
  activeCategory: string | null;
  setActiveCategory: (cat: string | null) => void;
  canPurchase: boolean;
  currentUser: any;
  onChangeStatus: (id: string, next: any, extra?: any) => void;
  onEditItem: (item: ShoppingRequest) => void;
  onUpdateQuantity: (id: string, currentQtyStr: string, increment: number) => void;
  onMoveToEquipment: (id: string) => void;
  onMoveToSupermarket: (id: string) => void;
  onShowArchivePrompt: () => void;
  onSwitchToInventoryView: () => void;
}

export function ShoppingListView({
  requests,
  inventoryMap,
  categories,
  listType,
  activeCategory,
  setActiveCategory,
  canPurchase,
  currentUser,
  onChangeStatus,
  onEditItem,
  onUpdateQuantity,
  onMoveToEquipment,
  onMoveToSupermarket,
  onShowArchivePrompt,
  onSwitchToInventoryView,
}: ShoppingListViewProps) {
  const [purchasedCollapsed, setPurchasedCollapsed] = useState(true);
  const [deletedCollapsed, setDeletedCollapsed] = useState(true);
  const [showLogisticsNotice, setShowLogisticsNotice] = useState(true);

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

  // Check which requested items are ALREADY in inventory with stock > 0
  const itemsAlreadyInInventory = activeRequests.filter((r) => {
    if (!r.name) return false;
    const norm = r.name.trim().toLowerCase();
    const invItem = Object.values(inventoryMap).find((inv) => (inv?.name || "").trim().toLowerCase() === norm);
    return invItem && invItem.currentStock > 0;
  });

  return (
    <div dir="rtl">
      {/* ── Summary Bar for Logistics & Managers ── */}
      {canPurchase && (
        <div className="pt-3 pb-2 px-4 md:px-0">
          <div className="grid grid-cols-3 gap-2 p-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xs">
            <button
              onClick={() => setActiveCategory(null)}
              className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/10 transition-all cursor-pointer border-none"
            >
              <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                <ShoppingCart className="w-3 h-3" /> פתוחים
              </span>
              <span className="text-base font-black text-[var(--foreground)]">{activeRequests.length}</span>
            </button>

            <button
              onClick={() => {
                const urgentReqs = activeRequests.filter((r) => r.priority === "urgent");
                if (urgentReqs.length > 0) {
                  setActiveCategory(urgentReqs[0].category);
                }
              }}
              className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 transition-all cursor-pointer border-none"
            >
              <span className="text-[10px] font-black text-rose-500 flex items-center gap-1">
                <Flame className="w-3 h-3 animate-pulse" /> דחופים
              </span>
              <span className="text-base font-black text-[var(--foreground)]">
                {activeRequests.filter((r) => r.priority === "urgent").length}
              </span>
            </button>

            <button
              onClick={onSwitchToInventoryView}
              className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/10 transition-all cursor-pointer border-none"
            >
              <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Boxes className="w-3 h-3" /> מלאי נמוך
              </span>
              <span className="text-base font-black text-[var(--foreground)]">
                {
                  Object.values(inventoryMap).filter(
                    (inv) => inv.currentStock <= (inv.minStock ?? 1)
                  ).length
                }
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── Logistics Duplicate Stock Alert Banner ── */}
      {canPurchase && itemsAlreadyInInventory.length > 0 && showLogisticsNotice && (
        <div className="mx-4 md:mx-0 my-3 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <span className="font-black block">
                התראת ניהול מלאי: {itemsAlreadyInInventory.length} מוצרים ברשימה קיימים במלאי המחסן!
              </span>
              <span className="text-[11px] opacity-90 font-medium">
                {itemsAlreadyInInventory.map((i) => i.name).slice(0, 3).join(", ")}
                {itemsAlreadyInInventory.length > 3 ? "..." : ""}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowLogisticsNotice(false)}
            className="p-1 rounded-lg text-amber-600 hover:bg-amber-500/20"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Category Sections List ── */}
      <LayoutGroup>
        {categories.map((cat) => {
          if (activeCategory !== null && activeCategory !== cat) return null;
          const catItems = activeRequests.filter((r) => r.category === cat);
          if (catItems.length === 0) return null;

          return (
            <div key={cat} className="mb-6 last:mb-0 px-4 md:px-0">
              <div className="flex items-center justify-between py-2 mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-1.5 h-5 rounded-full shadow-sm ${
                      (CAT_SOLID[cat] || CAT_SOLID["כללי"] || "bg-slate-400").split(" ")[0]
                    }`}
                  />
                  <h3 className="text-sm font-extrabold text-[var(--foreground)]">{cat}</h3>
                  <span className="text-[10px] font-bold bg-[var(--foreground)]/5 px-2 py-0.5 rounded-full text-[var(--muted)]">
                    {catItems.length}
                  </span>
                </div>
              </div>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm divide-y divide-[var(--border)]/55">
                {catItems.map((item) => {
                  const norm = (item.name || "").trim().toLowerCase();
                  const invItem = Object.values(inventoryMap).find((inv) => (inv?.name || "").trim().toLowerCase() === norm);
                  const inStockQty = invItem?.currentStock;

                  return (
                    <ShoppingItemRow
                      key={item.id}
                      item={item}
                      inStockQty={inStockQty}
                      onStatus={onChangeStatus}
                      onEdit={onEditItem}
                      onUpdateQuantity={onUpdateQuantity}
                      canPurchase={canPurchase}
                      currentUser={currentUser}
                      onMoveToEquipment={onMoveToEquipment}
                      onMoveToSupermarket={onMoveToSupermarket}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Fallback for items with unknown categories */}
        {(activeCategory === null || activeCategory === "אחר") &&
          activeRequests.some((r) => !categories.includes(r.category)) && (
            <div className="mb-6 px-4 md:px-0">
              <div className="flex items-center justify-between py-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-5 rounded-full bg-slate-400" />
                  <h3 className="text-sm font-extrabold text-[var(--foreground)]">אחר</h3>
                </div>
              </div>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm divide-y divide-[var(--border)]/55">
                {activeRequests
                  .filter((r) => !categories.includes(r.category))
                  .map((item) => (
                    <ShoppingItemRow
                      key={item.id}
                      item={item}
                      onStatus={onChangeStatus}
                      onEdit={onEditItem}
                      onUpdateQuantity={onUpdateQuantity}
                      canPurchase={canPurchase}
                      currentUser={currentUser}
                      onMoveToEquipment={onMoveToEquipment}
                      onMoveToSupermarket={onMoveToSupermarket}
                    />
                  ))}
              </div>
            </div>
          )}

        {/* Empty List Fallback */}
        {activeRequests.length === 0 && sessionPurchased.length === 0 && sessionDeleted.length === 0 && (
          <div className="py-32 px-12 text-center opacity-30 flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-[2.5rem] bg-[var(--foreground)]/5 flex items-center justify-center">
              <ShoppingBag className="w-10 h-10" />
            </div>
            <p className="text-sm font-black uppercase tracking-[0.2em]">הרשימה ריקה</p>
          </div>
        )}
      </LayoutGroup>

      {/* Purchased Items Section */}
      {sessionPurchased.length > 0 && (
        <div className="mt-8 px-4 pb-6">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-3">
            <button
              onClick={() => setPurchasedCollapsed(!purchasedCollapsed)}
              className="text-sm font-black text-emerald-500 flex items-center gap-2 hover:opacity-80 active:scale-95 transition-all border-none bg-transparent cursor-pointer"
            >
              <ShoppingBag className="w-4.5 h-4.5" />
              <span>מצרכים שנקנו ({sessionPurchased.length})</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  purchasedCollapsed ? "" : "rotate-180"
                }`}
              />
            </button>

            <button
              onClick={onShowArchivePrompt}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all active:scale-95 shadow-lg shadow-emerald-600/10 flex items-center gap-1 border-none cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[3] text-white" />
              <span>סיום וארכוב</span>
            </button>
          </div>

          {!purchasedCollapsed && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden divide-y divide-[var(--border)]/50 shadow-sm">
              {sessionPurchased.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-4 md:px-6 py-3.5 bg-[var(--surface)]/90 backdrop-blur-sm border-b border-[var(--border)] last:border-0"
                >
                  <div className="flex-1 min-w-0 text-right">
                    <span className="text-xs md:text-sm font-bold text-[var(--muted)] line-through decoration-2 decoration-emerald-500/40">
                      {item.name}
                    </span>
                    <div className="text-[10px] text-[var(--muted)]/60 font-semibold mt-0.5">
                      נרכש • ביקש/ה {item.requestedByName}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-[11px] font-black text-[var(--muted)] bg-[var(--foreground)]/5 px-2 py-1 rounded-lg">
                      {item.quantity || "1"}
                    </span>

                    <button
                      onClick={() => onChangeStatus(item.id, "approved")}
                      className="w-8 h-8 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs transition-all active:scale-75 border border-amber-500/20 cursor-pointer"
                      title="החזר לרשימה הפעילה"
                    >
                      <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>

                    {(item.requestedBy === currentUser?.uid || canPurchase) && (
                      <button
                        onClick={() => {
                          if (confirm(`האם ברצונך להעביר את "${item.name}" למוצרים שנמחקו?`)) {
                            onChangeStatus(item.id, "deleted");
                          }
                        }}
                        className="w-8 h-8 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 flex items-center justify-center shadow-xs transition-all active:scale-75 border border-rose-500/20 cursor-pointer"
                        title="העבר למוצרים שנמחקו"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Deleted Items Section */}
      {sessionDeleted.length > 0 && (
        <div className="mt-6 px-4 pb-12">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-3">
            <button
              onClick={() => setDeletedCollapsed(!deletedCollapsed)}
              className="text-sm font-black text-rose-500 flex items-center gap-2 hover:opacity-80 active:scale-95 transition-all border-none bg-transparent cursor-pointer"
            >
              <Trash2 className="w-4.5 h-4.5" />
              <span>מוצרים שנמחקו ({sessionDeleted.length})</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  deletedCollapsed ? "" : "rotate-180"
                }`}
              />
            </button>

            {canPurchase && (
              <button
                onClick={async () => {
                  if (confirm("האם ברצונך למחוק לצמיתות את כל המוצרים שנמחקו?")) {
                    await Promise.all(sessionDeleted.map((r) => onChangeStatus(r.id, "permanently_delete")));
                  }
                }}
                className="px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-xl text-xs font-black transition-all active:scale-95 border border-rose-500/20 cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>רוקן אשפה</span>
              </button>
            )}
          </div>

          {!deletedCollapsed && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden divide-y divide-[var(--border)]/50 shadow-sm">
              {sessionDeleted.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-4 md:px-6 py-3.5 bg-[var(--surface)]/90 backdrop-blur-sm border-b border-[var(--border)] last:border-0"
                >
                  <div className="flex-1 min-w-0 text-right">
                    <span className="text-xs md:text-sm font-bold text-[var(--muted)] line-through decoration-2 decoration-rose-500/40">
                      {item.name}
                    </span>
                    <div className="text-[10px] text-[var(--muted)]/60 font-semibold mt-0.5">
                      נמחק • ביקש/ה: {item.requestedByName}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-[11px] font-black text-[var(--muted)] bg-[var(--foreground)]/5 px-2 py-1 rounded-lg">
                      {item.quantity || "1"}
                    </span>

                    <button
                      onClick={() => onChangeStatus(item.id, "approved")}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-black flex items-center gap-1 shadow-xs transition-all active:scale-95 border border-amber-500/20 cursor-pointer"
                      title="החזר לרשימה הפעילה"
                    >
                      <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>החזר לרשימה</span>
                    </button>

                    {(item.requestedBy === currentUser?.uid || canPurchase) && (
                      <button
                        onClick={async () => {
                          if (confirm(`האם ברצונך למחוק לצמיתות את "${item.name}"?`)) {
                            onChangeStatus(item.id, "permanently_delete");
                          }
                        }}
                        className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 flex items-center justify-center shadow-xs transition-all active:scale-95 border border-rose-500/20 cursor-pointer"
                        title="מחק לצמיתות"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const formatQuantityAndUnit = (qtyStr: string) => {
  if (!qtyStr) return { qty: "1.0", unit: "יח׳" };
  const trimmed = qtyStr.trim();
  const match = trimmed.match(/^([\d\.]+)\s*(.*)$/);
  if (match) {
    const qty = match[1];
    let unit = match[2] || "יח׳";
    if (unit === "יחידות") unit = "יח׳";
    return { qty, unit };
  }
  return { qty: qtyStr, unit: "יח׳" };
};

function ShoppingItemRow({
  item,
  inStockQty,
  onStatus,
  onEdit,
  onUpdateQuantity,
  canPurchase,
  currentUser,
  onMoveToEquipment,
  onMoveToSupermarket,
}: {
  item: ShoppingRequest;
  inStockQty?: number;
  onStatus: any;
  onEdit: any;
  onUpdateQuantity: any;
  canPurchase: boolean;
  currentUser: any;
  onMoveToEquipment: any;
  onMoveToSupermarket: any;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const isApproved = item.status === "approved" || item.status === "pending";
  const isUrgent = item.priority === "urgent";

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`האם ברצונך למחוק את "${item.name}" מהרשימה?`)) {
      onStatus(item.id, "deleted");
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isApproved && canPurchase) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(15);
      }
      onStatus(item.id, "purchased");
    }
  };

  return (
    <div className="relative overflow-hidden group">
      {/* Background Actions Revealed On Swipe */}
      <div className="absolute inset-0 flex items-center justify-between px-4 z-0 text-white font-bold text-xs">
        <div className={`flex items-center gap-1.5 text-rose-500 font-black transition-opacity ${dragOffset > 20 ? "opacity-100" : "opacity-0"}`}>
          <Trash2 className="w-4 h-4" />
          <span>מחק</span>
        </div>
        {canPurchase && isApproved && (
          <div className={`flex items-center gap-1.5 text-indigo-500 font-black transition-opacity ${dragOffset < -20 ? "opacity-100" : "opacity-0"}`}>
            <ShoppingCart className="w-4 h-4" />
            <span>סומן כנקנה ✓</span>
          </div>
        )}
      </div>

      <motion.div
        layout
        drag="x"
        dragConstraints={{ left: canPurchase && isApproved ? -90 : 0, right: 90 }}
        dragElastic={0.15}
        onDrag={(_, info) => setDragOffset(info.offset.x)}
        onDragEnd={(_, info) => {
          if (info.offset.x < -60 && isApproved && canPurchase) {
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
            onStatus(item.id, "purchased");
          } else if (info.offset.x > 60) {
            if (confirm(`האם ברצונך למחוק את "${item.name}" מהרשימה?`)) {
              onStatus(item.id, "deleted");
            }
          }
          setDragOffset(0);
        }}
        onClick={() => setIsExpanded(!isExpanded)}
        className={`relative z-10 flex flex-col px-3 py-2.5 bg-[var(--surface)] even:bg-[var(--foreground)]/[0.012] transition-colors cursor-pointer select-none ${
          isExpanded ? "bg-[var(--foreground)]/[0.025]! ring-2 ring-indigo-500/20" : "hover:bg-[var(--foreground)]/[0.01]"
        } ${
          isUrgent ? "bg-gradient-to-l from-rose-500/[0.02] to-transparent border-r-4 border-r-rose-500 pr-2.5" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2.5 w-full">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              onClick={handleCheckboxClick}
              disabled={!canPurchase}
              className={`w-7 h-7 rounded-xl flex items-center justify-center border-2 transition-all shrink-0 active:scale-90 cursor-pointer ${
                isApproved
                  ? canPurchase
                    ? "border-[var(--muted)]/40 hover:border-indigo-500 hover:bg-indigo-500/10 text-indigo-500 shadow-xs"
                    : "border-[var(--border)] text-[var(--muted)]/20 cursor-not-allowed"
                  : "border-indigo-500 bg-indigo-500 text-white shadow-sm"
              }`}
            >
              <Check className={`w-4 h-4 transition-opacity ${!isApproved ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
            </button>

            <div className="min-w-0 flex-1 text-right">
              <div className="flex items-center gap-1.5 justify-start flex-wrap">
                <span className="text-xs font-bold text-[var(--foreground)] leading-tight whitespace-normal">
                  {item.name}
                </span>

                {(() => {
                  const { qty, unit } = formatQuantityAndUnit(item.quantity);
                  return (
                    <div className="flex items-center gap-1 bg-[var(--foreground)]/5 px-2 py-0.5 rounded-lg shrink-0">
                      <span className="text-[11px] font-black text-[var(--foreground)]">{qty}</span>
                      <span className="text-[9px] font-bold text-[var(--muted)]">{unit}</span>
                    </div>
                  );
                })()}

                {isUrgent && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center gap-0.5">
                    <Flame className="w-2.5 h-2.5 animate-pulse" /> דחוף
                  </span>
                )}

                {/* Stock Indicator Badge */}
                {inStockQty !== undefined && (
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border flex items-center gap-1 ${
                      inStockQty > 0
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                        : "bg-rose-500/10 border-rose-500/30 text-rose-500"
                    }`}
                    title={`מלאי קיים במחסן: ${inStockQty}`}
                  >
                    <Boxes className="w-2.5 h-2.5" />
                    <span>{inStockQty > 0 ? `במלאי: ${inStockQty}` : "אזל במלאי"}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-[var(--muted)]/40 p-1"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.div>
        </div>

        {/* Expanded details container */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: "auto", opacity: 1, marginTop: 10 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden w-full border-t border-[var(--border)]/40 pt-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-2 gap-2 mb-3.5 p-3 rounded-xl bg-[var(--foreground)]/[0.02] border border-[var(--border)]/40 text-xs text-[var(--muted)]">
                <div>
                  מבקש/ת: <span className="font-bold text-[var(--foreground)]">{item.requestedByName}</span>
                </div>
                <div>
                  קטגוריה: <span className="font-bold text-[var(--foreground)]">{item.category}</span>
                </div>
                {item.notes && (
                  <div className="col-span-2 border-t border-[var(--border)]/30 pt-2 mt-1">
                    <span className="font-bold text-[var(--foreground)]/70">הערות:</span>{" "}
                    <span className="text-[var(--foreground)]/90">{item.notes}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2.5 flex-wrap">
                <div className="flex items-center gap-1.5 bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-xl p-1 shadow-sm shrink-0">
                  <button
                    onClick={() => onUpdateQuantity(item.id, item.quantity || "1", -1)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] transition-all active:scale-75 shadow-sm cursor-pointer"
                    title="הפחת כמות"
                  >
                    <Minus className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                  <div className="min-w-[36px] text-center px-1">
                    <span className="text-sm font-black text-[var(--foreground)]">{item.quantity || "1"}</span>
                    <span className="text-[9px] text-[var(--muted)] block -mt-1 font-bold">יח׳</span>
                  </div>
                  <button
                    onClick={() => onUpdateQuantity(item.id, item.quantity || "1", 1)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] transition-all active:scale-75 shadow-sm cursor-pointer"
                    title="הוסף כמות"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 flex-grow justify-end">
                  <button
                    onClick={() => onEdit(item)}
                    className="px-3 py-2 rounded-xl flex items-center justify-center gap-1 bg-[var(--foreground)]/[0.04] hover:bg-[var(--foreground)]/10 text-[var(--muted)] hover:text-[var(--foreground)] transition-all active:scale-95 border border-[var(--border)] text-xs font-bold cursor-pointer"
                    title="ערוך מוצר"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> עריכה
                  </button>

                  <button
                    onClick={handleDelete}
                    className="px-3 py-2 rounded-xl flex items-center justify-center gap-1 bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 border border-rose-500/10 transition-all active:scale-95 text-xs font-bold cursor-pointer"
                    title="מחק מהרשימה"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> מחיקה
                  </button>

                  {canPurchase &&
                    (item.listType !== "large" ? (
                      <button
                        onClick={() => onMoveToEquipment(item.id)}
                        className="px-3 py-2 rounded-xl flex items-center justify-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 transition-all active:scale-95 text-xs font-bold cursor-pointer"
                        title="העבר לציוד ורכש"
                      >
                        <Package className="w-3.5 h-3.5" /> העבר לציוד ורכש
                      </button>
                    ) : (
                      <button
                        onClick={() => onMoveToSupermarket(item.id)}
                        className="px-3 py-2 rounded-xl flex items-center justify-center gap-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 transition-all active:scale-95 text-xs font-bold cursor-pointer"
                        title="העבר לרשימת סופר"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" /> העבר לרשימת סופר
                      </button>
                    ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
