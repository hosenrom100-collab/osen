"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, ShoppingCart, Boxes, Settings } from "lucide-react";

interface ShoppingHeaderProps {
  listType: "supermarket" | "large";
  setListType: (t: "supermarket" | "large") => void;
  setActiveCategory: (cat: string | null) => void;
  hasMenuBadge: boolean;
  onOpenMenu: () => void;
}

export function ShoppingHeader({
  listType,
  setListType,
  setActiveCategory,
  hasMenuBadge,
  onOpenMenu,
}: ShoppingHeaderProps) {
  const router = useRouter();

  return (
    <div className="shrink-0 bg-[var(--background)] border-b border-[var(--border)] z-40">
      {/* Row 1: back, title, menu */}
      <div className="flex items-center justify-between px-3 md:px-6 h-14">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => router.push("/")}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl hover:bg-[var(--foreground)]/5 border-none bg-transparent cursor-pointer"
            aria-label="חזרה"
          >
            <ArrowRight className="w-5 h-5 text-[var(--muted)]" />
          </button>
          <h1 className="text-base font-black text-[var(--foreground)] truncate">רשימת קניות</h1>
        </div>

        <button
          onClick={onOpenMenu}
          className="relative w-9 h-9 shrink-0 flex items-center justify-center rounded-xl hover:bg-[var(--foreground)]/5 border-none bg-transparent cursor-pointer"
          aria-label="תפריט"
        >
          <Settings className="w-5 h-5 text-[var(--muted)]" />
          {hasMenuBadge && (
            <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-rose-500" />
          )}
        </button>
      </div>

      {/* Row 2: segmented controls */}
      <div className="flex items-center gap-2 px-3 md:px-6 pb-2.5">
        <div className="flex bg-[var(--foreground)]/[0.05] p-0.5 rounded-xl border border-[var(--border)]">
          <button
            onClick={() => {
              setListType("supermarket");
              setActiveCategory(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 border-none cursor-pointer ${
              listType === "supermarket" ? "bg-[var(--surface)] text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-[var(--muted)] bg-transparent"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            סופר
          </button>
          <button
            onClick={() => {
              setListType("large");
              setActiveCategory(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 border-none cursor-pointer ${
              listType === "large" ? "bg-[var(--surface)] text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-[var(--muted)] bg-transparent"
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            ציוד ורכש
          </button>
        </div>
      </div>
    </div>
  );
}
