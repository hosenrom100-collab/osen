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
  /** Only worth showing when the list mixes frameworks — a single-framework view already says so once, up top. */
  showFrameworkTag?: boolean;
}

/**
 * One line per product — the core building block of the "make it readable and simple"
 * redesign. A single row replaces the old multi-button card: tap the circle to
 * check it off, tap anywhere else to open the detail sheet (quantity, notes, move,
 * delete). No inline steppers or button rows here on purpose — that clutter is what
 * made the old list hard to scan at a glance.
 */
export const ItemRow = memo(function ItemRow({ item, onCheck, onOpenDetail, showFrameworkTag = true }: ItemRowProps) {
  const isUrgent = item.priority === "urgent";
  const { value: qtyValue, unit: qtyUnit } = parseQuantity(item.quantity);
  const hasNotes = !!(item.notes && item.notes.trim());
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
      className="relative w-full flex items-center gap-3 px-3 py-2.5 min-h-[60px] rounded-2xl border border-transparent bg-[var(--surface)] hover:bg-[var(--foreground)]/[0.03] active:bg-[var(--foreground)]/[0.05] transition-colors text-right cursor-pointer overflow-hidden"
    >
      {/* Urgent marker: a thin stripe, not a full color wash — same information, far less noise */}
      {isUrgent && <span className="absolute right-0 top-0 bottom-0 w-1 bg-rose-500" />}

      {/* Checkbox — 44px, easy to hit one-handed while walking the aisles */}
      <span
        role="button"
        aria-label="סמן כנרכש"
        onClick={handleCheck}
        className="w-11 h-11 shrink-0 rounded-full border-2 border-[var(--muted)]/35 hover:border-indigo-500 hover:bg-indigo-500/10 text-indigo-500 flex items-center justify-center transition-all active:scale-90 cursor-pointer"
      >
        <Check className="w-5 h-5 opacity-0 hover:opacity-100 transition-opacity stroke-[3]" />
      </span>

      {/* Name + meta */}
      <div className="min-w-0 flex-1 text-right">
        <div className="flex items-center gap-1.5">
          {isUrgent && <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
          <span className="text-[15px] font-bold text-[var(--foreground)] truncate">{item.name}</span>
          {showFrameworkTag && (
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border shrink-0 ${fwMeta.color}`}>
              {fwMeta.shortName}
            </span>
          )}
        </div>
        {hasNotes && (
          <div className="flex items-center gap-0.5 mt-0.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium truncate">
            <MessageSquare className="w-3 h-3 shrink-0" />
            <span className="truncate">{item.notes}</span>
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
