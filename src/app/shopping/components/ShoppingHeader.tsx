"use client";

import { RefObject } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShoppingCart, Boxes, FileText, Settings, Plus, Search } from "lucide-react";

interface ShoppingHeaderProps {
  view: "list" | "archive";
  setView: (v: "list" | "archive") => void;
  listType: "supermarket" | "large";
  setListType: (t: "supermarket" | "large") => void;
  setActiveCategory: (cat: string | null) => void;
  canSeeArchive: boolean;
  hasMenuBadge: boolean;
  onOpenMenu: () => void;
  inputVal: string;
  setInputVal: (v: string) => void;
  onFocusAdd: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * One header for both mobile and desktop — replaces what used to be three separate,
 * partly-duplicated blocks (a mobile action bar, a desktop header, and a desktop
 * sub-header) with a single component that just adapts its density by breakpoint.
 */
export function ShoppingHeader({
  view,
  setView,
  listType,
  setListType,
  setActiveCategory,
  canSeeArchive,
  hasMenuBadge,
  onOpenMenu,
  inputVal,
  setInputVal,
  onFocusAdd,
  inputRef,
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

        {canSeeArchive && (
          <div className="flex bg-[var(--foreground)]/[0.05] p-0.5 rounded-xl border border-[var(--border)]">
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all border-none cursor-pointer ${
                view === "list" ? "bg-[var(--surface)] text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-[var(--muted)] bg-transparent"
              }`}
            >
              רשימה
            </button>
            <button
              onClick={() => setView("archive")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 border-none cursor-pointer ${
                view === "archive" ? "bg-[var(--surface)] text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-[var(--muted)] bg-transparent"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              ארכיון
            </button>
          </div>
        )}
      </div>

      {/* Row 3: add / search */}
      {view === "list" && (
        <div className="px-3 md:px-6 pb-3">
          <div className="relative">
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-indigo-500 pointer-events-none">
              <Plus className="w-4 h-4 stroke-[3]" />
              <Search className="w-3.5 h-3.5 opacity-60" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onFocus={onFocusAdd}
              placeholder="הוסף או חפש מוצר..."
              className="w-full bg-[var(--surface-raised)] border-2 border-indigo-600/15 rounded-2xl py-2.5 pr-16 pl-3 text-sm font-bold focus:outline-none focus:border-indigo-600/50 transition-all text-[var(--foreground)]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
