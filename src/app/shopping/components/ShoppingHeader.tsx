"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShoppingCart, Boxes, Settings, Clock, Truck } from "lucide-react";
import { CutoffStatus } from "../types";

interface ShoppingHeaderProps {
  listType: "supermarket" | "large";
  setListType: (t: "supermarket" | "large") => void;
  setActiveCategory: (cat: string | null) => void;
  hasMenuBadge: boolean;
  onOpenMenu: () => void;
  /** Purchased vs total for what the list is currently showing; drawn as a thin line under the header. */
  progress?: { done: number; total: number };
  /** Drives the compact countdown tag; the frozen state has its own banner. */
  cutoffStatus?: CutoffStatus;
}

// "4 ימים" / "5 שע׳" / "20 דק׳" — short enough to sit in the header next to the menu.
function formatShortLeft(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return days === 1 ? "יום" : `${days} ימים`;
  }
  if (hours >= 1) return `${hours} שע׳`;
  return `${totalMinutes} דק׳`;
}

export function ShoppingHeader({
  listType,
  setListType,
  setActiveCategory,
  hasMenuBadge,
  onOpenMenu,
  progress,
  cutoffStatus,
}: ShoppingHeaderProps) {
  const router = useRouter();
  const [cutoffOpen, setCutoffOpen] = useState(false);
  const showCutoff = !!cutoffStatus?.isEnabled && !cutoffStatus.isPassed && cutoffStatus.msLeft !== undefined;
  // Under a day left is worth noticing; further out it stays neutral.
  const cutoffSoon = showCutoff && (cutoffStatus?.msLeft ?? Infinity) < 24 * 60 * 60 * 1000;

  return (
    <header className="relative shrink-0 bg-[var(--background)]/90 backdrop-blur-md border-b border-[var(--border)] z-40">
      <div className="flex items-center justify-between px-2.5 sm:px-4 md:px-6 h-13 sm:h-14 gap-2">
        {/* Right side: Back button & compact title */}
        <div className="flex items-center gap-1.5 shrink-0 min-w-0">
          <button
            onClick={() => router.push("/")}
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl hover:bg-[var(--fill)] border-none bg-transparent cursor-pointer transition-colors"
            aria-label="חזרה"
          >
            <ArrowRight className="w-5 h-5 text-[var(--muted)]" />
          </button>
          <span className="hidden sm:inline-block text-sm font-bold text-[var(--foreground)] truncate">
            רשימת קניות
          </span>
        </div>

        {/* Center: Segmented switcher (Supermarket / Equipment) */}
        <div className="flex bg-[var(--fill-strong)] p-0.5 rounded-xl shrink-0">
          <button
            onClick={() => {
              setListType("supermarket");
              setActiveCategory(null);
            }}
            className={`px-4 h-9 rounded-lg text-[13px] font-semibold transition-all flex items-center gap-1.5 border-none cursor-pointer ${
              listType === "supermarket"
                ? "bg-[var(--surface)] text-[var(--accent-text)] shadow-[var(--shadow-card)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)] bg-transparent"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
            <span>סופר</span>
          </button>
          <button
            onClick={() => {
              setListType("large");
              setActiveCategory(null);
            }}
            className={`px-4 h-9 rounded-lg text-[13px] font-semibold transition-all flex items-center gap-1.5 border-none cursor-pointer ${
              listType === "large"
                ? "bg-[var(--surface)] text-[var(--accent-text)] shadow-[var(--shadow-card)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)] bg-transparent"
            }`}
          >
            <Boxes className="w-3.5 h-3.5 shrink-0" />
            <span>ציוד ורכש</span>
          </button>
        </div>

        {/* Left side: cutoff countdown + menu */}
        <div className="flex items-center gap-1 shrink-0 relative">
          {showCutoff && cutoffStatus && (
            <>
              <button
                onClick={() => setCutoffOpen((v) => !v)}
                aria-expanded={cutoffOpen}
                aria-label={`סגירת הזנות בעוד ${formatShortLeft(cutoffStatus.msLeft ?? 0)}. לחץ לפרטים`}
                className={`h-8 px-2.5 rounded-full text-[13px] font-semibold flex items-center gap-1.5 border-none cursor-pointer transition-colors ${
                  cutoffSoon
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    : "bg-[var(--fill)] text-[var(--muted)] hover:bg-[var(--fill-strong)]"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="tabular-nums">{formatShortLeft(cutoffStatus.msLeft ?? 0)}</span>
              </button>

              {cutoffOpen && (
                <>
                  <button
                    aria-label="סגור"
                    onClick={() => setCutoffOpen(false)}
                    className="fixed inset-0 z-40 cursor-default bg-transparent border-none"
                  />
                  <div className="absolute top-full left-0 mt-2 w-64 z-50 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-pop)] p-3.5 text-right space-y-2">
                    <div className="text-[13px] font-medium text-[var(--muted)]">סגירת הזנות</div>
                    <div className="text-sm font-semibold text-[var(--foreground)]">{cutoffStatus.formattedTarget}</div>
                    <div className="text-[13px] font-medium text-[var(--muted)] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {cutoffStatus.timeLeftFormatted}
                    </div>
                    {cutoffStatus.deliveryDayFormatted && (
                      <div className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 pt-2 border-t border-[var(--border)]">
                        <Truck className="w-3.5 h-3.5" />
                        משלוח {cutoffStatus.deliveryDayFormatted}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          <button
            onClick={onOpenMenu}
            className="relative w-10 h-10 shrink-0 flex items-center justify-center rounded-xl hover:bg-[var(--fill)] border-none bg-transparent cursor-pointer transition-colors"
            aria-label="תפריט"
          >
            <Settings className="w-5 h-5 text-[var(--muted)]" />
            {hasMenuBadge && (
              <span className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-[var(--background)]" />
            )}
          </button>
        </div>
      </div>

      {/* Always-visible progress: no matter how far down the list you are, the line under the header says how much is left. */}
      {progress && progress.total > 0 && (
        <div
          role="progressbar"
          aria-label="התקדמות הרכישה"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          className="absolute bottom-0 inset-x-0 h-[3px]"
        >
          <div
            className="h-full bg-emerald-500 transition-[width] duration-500 ease-out"
            style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
          />
        </div>
      )}
    </header>
  );
}
