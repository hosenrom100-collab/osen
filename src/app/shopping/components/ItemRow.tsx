"use client";

import { memo, useEffect, useRef, useState } from "react";
import { ShoppingRequest } from "../types";
import { Check, Flame, ChevronLeft, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { formatUnitShort, parseQuantity } from "../lib/quantityUtils";
import { TARGET_FRAMEWORKS } from "../lib/constants";

// How long the row lingers, visibly checked, before it leaves the list. Long enough to
// register "yes, that one was marked" without slowing down a fast walk down the aisle.
const CHECK_FEEDBACK_MS = 450;

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

  // Local "just checked" state: the row shows the tick and strikethrough first, and only
  // then hands off to onCheck (which removes it from the list). Without this the row
  // vanishes with no confirmation of what was marked — and on touch there is no hover tick.
  const [checking, setChecking] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  const handleCheck = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (checking) return;
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
    setChecking(true);
    // Deliberately not cancelled on unmount: if the row disappears mid-animation (filter
    // change), the purchase the user tapped must still go through.
    setTimeout(() => onCheck(item), CHECK_FEEDBACK_MS);
    // If the write is rejected the row stays in the list — don't leave it stuck "checked".
    resetTimerRef.current = setTimeout(() => setChecking(false), CHECK_FEEDBACK_MS + 2000);
  };

  return (
    <motion.button
      type="button"
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onClick={() => {
        if (!checking) onOpenDetail(item);
      }}
      className={`relative w-full flex items-center gap-3 px-3 py-2.5 min-h-[60px] rounded-2xl border border-transparent hover:bg-[var(--foreground)]/[0.03] active:bg-[var(--foreground)]/[0.05] transition-colors text-right cursor-pointer overflow-hidden ${
        checking ? "bg-emerald-500/10" : "bg-[var(--surface)]"
      }`}
    >
      {/* Urgent marker: a thin stripe, not a full color wash — same information, far less noise */}
      {isUrgent && <span className="absolute right-0 top-0 bottom-0 w-1 bg-rose-500" />}

      {/* Checkbox — 44px, easy to hit one-handed while walking the aisles */}
      <span
        role="button"
        aria-label="סמן כנרכש"
        onClick={handleCheck}
        className={`w-11 h-11 shrink-0 rounded-full border-2 flex items-center justify-center transition-all active:scale-90 cursor-pointer ${
          checking
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-[var(--muted)]/35 hover:border-indigo-500 hover:bg-indigo-500/10 text-indigo-500"
        }`}
      >
        <Check className={`w-5 h-5 transition-opacity stroke-[3] ${checking ? "opacity-100" : "opacity-0 hover:opacity-100"}`} />
      </span>

      {/* Name + meta */}
      <div className="min-w-0 flex-1 text-right">
        <div className="flex items-center gap-1.5">
          {isUrgent && <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
          <span className={`text-[15px] font-bold text-[var(--foreground)] truncate transition-opacity ${checking ? "line-through opacity-50" : ""}`}>
            {item.name}
          </span>
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
