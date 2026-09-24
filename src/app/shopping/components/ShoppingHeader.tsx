"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, ShoppingCart, Boxes, Settings, Clock } from "lucide-react";
import { CutoffStatus } from "../types";

interface ShoppingHeaderProps {
  listType: "supermarket" | "large";
  setListType: (t: "supermarket" | "large") => void;
  setActiveCategory: (cat: string | null) => void;
  hasMenuBadge: boolean;
  onOpenMenu: () => void;
  cutoffStatus?: CutoffStatus;
  isCutoffBannerVisible?: boolean;
  onToggleCutoffBanner?: () => void;
}

export function ShoppingHeader({
  listType,
  setListType,
  setActiveCategory,
  hasMenuBadge,
  onOpenMenu,
  cutoffStatus,
  isCutoffBannerVisible,
  onToggleCutoffBanner,
}: ShoppingHeaderProps) {
  const router = useRouter();

  return (
    <header className="shrink-0 bg-[var(--background)] border-b border-[var(--border)] z-40">
      <div className="flex items-center justify-between px-2.5 sm:px-4 md:px-6 h-13 sm:h-14 gap-2">
        {/* Right side: Back button & compact title */}
        <div className="flex items-center gap-1.5 shrink-0 min-w-0">
          <button
            onClick={() => router.push("/")}
            className="w-8.5 h-8.5 shrink-0 flex items-center justify-center rounded-xl hover:bg-[var(--foreground)]/5 border-none bg-transparent cursor-pointer transition-colors"
            aria-label="חזרה"
          >
            <ArrowRight className="w-5 h-5 text-[var(--muted)]" />
          </button>
          <span className="hidden sm:inline-block text-sm font-black text-[var(--foreground)] truncate">
            רשימת קניות
          </span>
        </div>

        {/* Center: Segmented switcher (Supermarket / Equipment) */}
        <div className="flex bg-[var(--foreground)]/[0.05] p-0.5 rounded-xl border border-[var(--border)] shrink-0">
          <button
            onClick={() => {
              setListType("supermarket");
              setActiveCategory(null);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 border-none cursor-pointer ${
              listType === "supermarket"
                ? "bg-[var(--surface)] text-indigo-600 dark:text-indigo-400 shadow-xs"
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
            className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 border-none cursor-pointer ${
              listType === "large"
                ? "bg-[var(--surface)] text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-[var(--muted)] hover:text-[var(--foreground)] bg-transparent"
            }`}
          >
            <Boxes className="w-3.5 h-3.5 shrink-0" />
            <span>ציוד ורכש</span>
          </button>
        </div>

        {/* Left side: Cutoff mini-indicator & Menu button */}
        <div className="flex items-center gap-1 shrink-0">
          {cutoffStatus?.isEnabled && !cutoffStatus.isPassed && !isCutoffBannerVisible && (
            <button
              onClick={onToggleCutoffBanner}
              className="px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[11px] font-black flex items-center gap-1 border-none cursor-pointer transition-colors"
              title={`סגירת הזנות: ${cutoffStatus.formattedTarget} (${cutoffStatus.timeLeftFormatted})`}
              aria-label="הצג מועד סגירת הזנות"
            >
              <Clock className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
              <span className="hidden md:inline">{cutoffStatus.timeLeftFormatted}</span>
            </button>
          )}

          <button
            onClick={onOpenMenu}
            className="relative w-8.5 h-8.5 shrink-0 flex items-center justify-center rounded-xl hover:bg-[var(--foreground)]/5 border-none bg-transparent cursor-pointer transition-colors"
            aria-label="תפריט"
          >
            <Settings className="w-5 h-5 text-[var(--muted)]" />
            {hasMenuBadge && (
              <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
