"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, ShoppingCart, Boxes, Settings } from "lucide-react";

interface ShoppingHeaderProps {
  listType: "supermarket" | "large";
  setListType: (t: "supermarket" | "large") => void;
  setActiveCategory: (cat: string | null) => void;
  hasMenuBadge: boolean;
  onOpenMenu: () => void;
  /** Purchased vs total for what the list is currently showing; drawn as a thin line under the header. */
  progress?: { done: number; total: number };
}

export function ShoppingHeader({
  listType,
  setListType,
  setActiveCategory,
  hasMenuBadge,
  onOpenMenu,
  progress,
}: ShoppingHeaderProps) {
  const router = useRouter();

  return (
    <header className="relative shrink-0 bg-[var(--background)]/90 backdrop-blur-md border-b border-[var(--border)] z-40">
      <div className="flex items-center justify-between px-2.5 sm:px-4 md:px-6 h-13 sm:h-14 gap-2">
        {/* Right side: Back button & compact title */}
        <div className="flex items-center gap-1.5 shrink-0 min-w-0">
          <button
            onClick={() => router.push("/")}
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl hover:bg-[var(--foreground)]/5 border-none bg-transparent cursor-pointer transition-colors"
            aria-label="חזרה"
          >
            <ArrowRight className="w-5 h-5 text-[var(--muted)]" />
          </button>
          <span className="hidden sm:inline-block text-sm font-bold text-[var(--foreground)] truncate">
            רשימת קניות
          </span>
        </div>

        {/* Center: Segmented switcher (Supermarket / Equipment) */}
        <div className="flex bg-[var(--foreground)]/[0.06] p-0.5 rounded-xl shrink-0">
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

        {/* Left side: menu */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onOpenMenu}
            className="relative w-10 h-10 shrink-0 flex items-center justify-center rounded-xl hover:bg-[var(--foreground)]/5 border-none bg-transparent cursor-pointer transition-colors"
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
