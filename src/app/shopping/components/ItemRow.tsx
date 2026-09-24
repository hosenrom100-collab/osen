"use client";

import { memo } from "react";
import { ShoppingRequest } from "../types";
import { Check, Flame, ChevronLeft, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { formatUnitShort, parseQuantity } from "../lib/quantityUtils";
import { TARGET_FRAMEWORKS } from "../lib/constants";

interface ItemRowProps {
  item: ShoppingRequest;
  onCheck: (item: ShoppingRequest) => void;
  onOpenDetail: (item: ShoppingRequest) => void;
}

/**
 * One line per product — the core building block of the "make it readable and simple"
 * redesign. A single 56px row replaces the old multi-button card: tap the circle to
 * check it off, tap anywhere else to open the detail sheet (quantity, notes, move,
 * delete). No inline steppers or button rows here on purpose — that clutter is what
 * made the old list hard to scan at a glance.
 */
export const ItemRow = memo(function ItemRow({ item, onCheck, onOpenDetail }: ItemRowProps) {
  const isUrgent = item.priority === "urgent";
  const { value: qtyValue, unit: qtyUnit } = parseQuantity(item.quantity);
  const hasMeta = !!(item.requestedByName || (item.notes && item.notes.trim()));
  const fwMeta = TARGET_FRAMEWORKS.find((f) => f.id === (item.targetFramework || "main")) || TARGET_FRAMEWORKS[0];

  const handleCheck = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
    onCheck(item);
  };

  return (
    <motion.button
      type="button"
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onClick={() => onOpenDetail(item)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-2xl border transition-colors text-right cursor-pointer ${
        isUrgent
          ? "border-rose-500/30 bg-rose-500/[0.04]"
          : "border-transparent hover:bg-[var(--foreground)]/[0.03] active:bg-[var(--foreground)]/[0.05]"
      }`}
    >
      {/* Checkbox */}
      <span
        role="button"
        aria-label="סמן כנרכש"
        onClick={handleCheck}
        className="w-8 h-8 shrink-0 rounded-full border-2 border-[var(--muted)]/35 hover:border-indigo-500 hover:bg-indigo-500/10 text-indigo-500 flex items-center justify-center transition-all active:scale-90 cursor-pointer"
      >
        <Check className="w-4 h-4 opacity-0 hover:opacity-100 transition-opacity stroke-[3]" />
      </span>

      {/* Name + meta */}
      <div className="min-w-0 flex-1 text-right">
        <div className="flex items-center gap-1.5">
          {isUrgent && <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
          <span className="text-[15px] font-bold text-[var(--foreground)] truncate">{item.name}</span>
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border shrink-0 ${fwMeta.color}`}>
            {fwMeta.shortName}
          </span>
        </div>
        {hasMeta && (
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[var(--muted)] font-medium truncate">
            {item.notes && item.notes.trim() && (
              <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400 truncate">
                <MessageSquare className="w-3 h-3 shrink-0" />
                <span className="truncate">{item.notes}</span>
              </span>
            )}
            {item.notes && item.notes.trim() && item.requestedByName && <span>·</span>}
            {item.requestedByName && <span className="truncate">{item.requestedByName}</span>}
          </div>
        )}
      </div>

      {/* Quantity */}
      <span className="shrink-0 text-xs font-black text-[var(--foreground)]/70 bg-[var(--foreground)]/5 px-2 py-1 rounded-lg">
        {qtyValue}
        <span className="opacity-60 font-bold"> {formatUnitShort(qtyUnit)}</span>
      </span>

      <ChevronLeft className="w-4 h-4 text-[var(--muted)]/50 shrink-0" />
    </motion.button>
  );
});
