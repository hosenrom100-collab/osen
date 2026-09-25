"use client";

import { memo, useEffect, useRef, useState } from "react";
import { ShoppingRequest } from "../types";
import { Check, ChevronLeft, MessageSquare } from "lucide-react";
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
      className={`relative w-full flex items-center gap-3 px-3 py-2 min-h-[64px] hover:bg-[var(--fill)] active:bg-[var(--fill-strong)] transition-colors text-right cursor-pointer ${
        checking ? "bg-emerald-500/10" : "bg-transparent"
      }`}
    >
      {/* Urgent marker: a thin stripe at the edge of the card, not a color wash */}
      {isUrgent && (
        <>
          <span aria-hidden className="absolute right-0 top-0 bottom-0 w-[3px] bg-rose-500" />
          <span className="sr-only">דחוף</span>
        </>
      )}

      {/* Checkbox — 44px hit area around a 28px circle: easy to hit one-handed in the aisle, calm to look at */}
      <span
        role="button"
        aria-label="סמן כנרכש"
        onClick={handleCheck}
        className="group/check w-11 h-11 shrink-0 flex items-center justify-center cursor-pointer"
      >
        <span
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all group-active/check:scale-90 ${
            checking
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-[var(--muted)]/50 group-hover/check:border-[var(--accent)] group-hover/check:bg-[var(--accent-soft)]"
          }`}
        >
          {checking ? (
            // The tick is drawn stroke by stroke rather than popped in — small, but it's the moment
            // the whole screen exists for.
            <motion.svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, ease: "easeOut" }} />
            </motion.svg>
          ) : (
            <Check className="w-4 h-4 stroke-[3] transition-opacity opacity-0 group-hover/check:opacity-70 text-[var(--accent-text)]" />
          )}
        </span>
      </span>

      {/* Name + meta */}
      <div className="min-w-0 flex-1 text-right">
        <div className="flex items-center gap-2">
          <span
            className={`text-base font-semibold text-[var(--foreground)] truncate transition-opacity ${
              checking ? "line-through opacity-50" : ""
            }`}
          >
            {item.name}
          </span>
          {showFrameworkTag && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${fwMeta.color}`}>
              {fwMeta.shortName}
            </span>
          )}
        </div>
        {hasNotes && (
          <div className="flex items-center gap-1 mt-0.5 text-[13px] text-amber-700 dark:text-amber-400 font-medium truncate">
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{item.notes}</span>
          </div>
        )}
      </div>

      {/* Quantity — the number leads, the unit recedes */}
      <span className="shrink-0 text-right leading-tight">
        <span className="text-base font-semibold tabular-nums text-[var(--foreground)]">{qtyValue}</span>
        <span className="text-[13px] font-medium text-[var(--muted)]"> {formatUnitShort(qtyUnit)}</span>
      </span>

      <ChevronLeft className="w-4 h-4 text-[var(--muted)]/40 shrink-0" />
    </motion.button>
  );
});
