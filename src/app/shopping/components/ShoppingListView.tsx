"use client";

import { useEffect, useRef, useState } from "react";
import { User } from "firebase/auth";
import { ShoppingRequest, Product, TargetFramework } from "../types";
import {
  Flame, ShoppingBag, ChevronDown, Check, RotateCcw, Undo2, Trash2, Download, Share2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CAT_SOLID, TARGET_FRAMEWORKS } from "../lib/constants";
import { ItemRow } from "./ItemRow";
import { ItemDetailSheet } from "./ItemDetailSheet";

type ShoppingStatus = ShoppingRequest["status"] | "permanently_delete";
type OnChangeStatus = (id: string, next: ShoppingStatus, extra?: Record<string, unknown>) => void;
type OnUpdateQuantity = (id: string, currentQtyStr: string, increment: number) => void;
type OnMoveList = (id: string) => void;

interface ShoppingListViewProps {
  requests: ShoppingRequest[];
  pool?: Product[];
  categories: string[];
  listType: "supermarket" | "large";
  activeCategory: string | null;
  setActiveCategory: (cat: string | null) => void;
  selectedFramework?: "all" | TargetFramework;
  setSelectedFramework?: (fw: "all" | TargetFramework) => void;
  canPurchase?: boolean;
  isAdmin?: boolean;
  isLogistics?: boolean;
  currentUser?: User | null;
  onChangeStatus: OnChangeStatus;
  onUpdateItem: (id: string, name: string, category: string, quantity: string, notes: string, priority: "low" | "normal" | "urgent", targetFramework?: TargetFramework) => void;
  onUpdateQuantity: OnUpdateQuantity;
  onMoveToEquipment: OnMoveList;
  onMoveToSupermarket: OnMoveList;
  onExportOngoingList?: (framework?: "all" | TargetFramework) => void;
  onExportProcurementList?: (framework?: "all" | TargetFramework) => void;
  onShareList?: (framework: "all" | TargetFramework) => void;
}

const UNDO_TIMEOUT_MS = 5000;

export function ShoppingListView({
  requests,
  categories,
  listType,
  activeCategory,
  setActiveCategory,
  selectedFramework = "all",
  setSelectedFramework,
  canPurchase,
  onChangeStatus,
  onUpdateItem,
  onMoveToEquipment,
  onMoveToSupermarket,
  onExportOngoingList,
  onExportProcurementList,
  onShareList,
}: ShoppingListViewProps) {
  const [purchasedCollapsed, setPurchasedCollapsed] = useState(true);
  const [deletedCollapsed, setDeletedCollapsed] = useState(true);
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);
  const [detailItem, setDetailItem] = useState<ShoppingRequest | null>(null);

  // Undo snackbar for check-off / delete — replaces a confirmation dialog with a fast,
  // reversible action: the write already happened, "בטל" just flips it back.
  const [undo, setUndo] = useState<{ label: string; revert: () => void } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  const showUndo = (label: string, revert: () => void) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo({ label, revert });
    undoTimerRef.current = setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS);
  };

  const totalCategoryRequests = requests.filter(
    (r) =>
      (r.status === "approved" || r.status === "pending") &&
      (listType === "large" ? r.listType === "large" : r.listType !== "large")
  );

  const mainCount = totalCategoryRequests.filter((r) => (r.targetFramework || "main") === "main").length;
  const lowerCount = totalCategoryRequests.filter((r) => r.targetFramework === "lower").length;

  const activeRequests = requests.filter(
    (r) =>
      (r.status === "approved" || r.status === "pending") &&
      (listType === "large" ? r.listType === "large" : r.listType !== "large") &&
      (!selectedFramework || selectedFramework === "all" || (r.targetFramework || "main") === selectedFramework)
  );

  const sessionPurchased = requests.filter(
    (r) =>
      r.status === "purchased" &&
      (listType === "large" ? r.listType === "large" : r.listType !== "large") &&
      (!selectedFramework || selectedFramework === "all" || (r.targetFramework || "main") === selectedFramework)
  );

  const sessionDeleted = requests.filter(
    (r) =>
      r.status === "deleted" &&
      (listType === "large" ? r.listType === "large" : r.listType !== "large") &&
      (!selectedFramework || selectedFramework === "all" || (r.targetFramework || "main") === selectedFramework)
  );

  // Progress is scoped to the framework filter, like the list itself — "12 of 30" should
  // describe what is on screen, not the whole cycle.
  const totalItems = activeRequests.length + sessionPurchased.length;
  const progressPct = totalItems === 0 ? 0 : Math.round((sessionPurchased.length / totalItems) * 100);
  const allDone = activeRequests.length === 0 && sessionPurchased.length > 0;

  const urgentCount = activeRequests.filter((r) => r.priority === "urgent").length;
  // Guard against a stale toggle once the last urgent item is purchased/removed elsewhere.
  const urgentFilterActive = showUrgentOnly && urgentCount > 0;

  const handleCheck = (item: ShoppingRequest) => {
    onChangeStatus(item.id, "purchased");
    showUndo(`✓ נרכש: ${item.name}`, () => onChangeStatus(item.id, "approved"));
  };

  const handleDelete = (id: string) => {
    const item = requests.find((r) => r.id === id);
    onChangeStatus(id, "deleted");
    showUndo(`נמחק: ${item?.name ?? ""}`, () => onChangeStatus(id, "approved"));
  };

  const [isFwDropdownOpen, setIsFwDropdownOpen] = useState(false);
  const fwDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fwDropdownRef.current && !fwDropdownRef.current.contains(e.target as Node)) {
        setIsFwDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentFw = TARGET_FRAMEWORKS.find((f) => f.id === selectedFramework);

  // Framework tag on each row only earns its keep when the list mixes frameworks —
  // filtered to one, the header already said which, so repeating it per row is noise.
  const showFrameworkTag = selectedFramework === "all";

  return (
    <div dir="rtl" className="w-full max-w-2xl mx-auto pb-24 px-2.5 sm:px-4">
      {/* ── Framework Pill Dropdown + Urgent Filter + Category Filter ── */}
      <div className="flex items-center gap-2 pt-2 pb-2 relative z-30">
        {/* Framework Dropdown Trigger */}
        <div className="relative" ref={fwDropdownRef}>
          <button
            onClick={() => setIsFwDropdownOpen((v) => !v)}
            className={`py-1.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer border flex items-center gap-1.5 shadow-xs select-none ${
              selectedFramework === "all"
                ? "bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--foreground)]/[0.04]"
                : `${currentFw?.activeBg ?? "bg-indigo-600"} !text-white border-transparent`
            }`}
            aria-haspopup="true"
            aria-expanded={isFwDropdownOpen}
          >
            <span>{selectedFramework === "all" ? "כל המסגרות" : currentFw?.name}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                selectedFramework === "all"
                  ? "bg-[var(--foreground)]/10 text-[var(--muted)]"
                  : "bg-white/20 !text-white"
              }`}
            >
              {selectedFramework === "all"
                ? totalCategoryRequests.length
                : totalCategoryRequests.filter((r) => (r.targetFramework || "main") === selectedFramework).length}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 opacity-70 ${
                isFwDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {isFwDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-1.5 w-52 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl p-1.5 z-50 overflow-hidden"
              >
                <button
                  onClick={() => {
                    setSelectedFramework?.("all");
                    setIsFwDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-black transition-colors cursor-pointer border-none text-right ${
                    selectedFramework === "all"
                      ? "bg-zinc-800 dark:bg-zinc-200 !text-white dark:!text-zinc-900"
                      : "bg-transparent text-[var(--foreground)] hover:bg-[var(--foreground)]/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-zinc-400" />
                    <span>כל המסגרות</span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      selectedFramework === "all"
                        ? "bg-white/20 !text-white dark:!text-zinc-900"
                        : "bg-[var(--foreground)]/10 text-[var(--muted)]"
                    }`}
                  >
                    {totalCategoryRequests.length}
                  </span>
                </button>

                <div className="h-px bg-[var(--border)] my-1" />

                {TARGET_FRAMEWORKS.map((fw) => {
                  const count = totalCategoryRequests.filter((r) => (r.targetFramework || "main") === fw.id).length;
                  const active = selectedFramework === fw.id;
                  return (
                    <button
                      key={fw.id}
                      onClick={() => {
                        setSelectedFramework?.(fw.id);
                        setIsFwDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-black transition-colors cursor-pointer border-none text-right ${
                        active
                          ? `${fw.activeBg} !text-white`
                          : "bg-transparent text-[var(--foreground)] hover:bg-[var(--foreground)]/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-current opacity-70" />
                        <span>{fw.name}</span>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                          active ? "bg-white/20 !text-white" : "bg-[var(--foreground)]/10 text-[var(--muted)]"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Urgent Filter Button */}
        {urgentCount > 0 && (
          <button
            onClick={() => {
              setActiveCategory(null);
              setShowUrgentOnly((v) => !v);
            }}
            className={`py-1.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer border flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs ${
              urgentFilterActive
                ? "bg-rose-600 !text-white border-transparent"
                : "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>דחוף</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                urgentFilterActive ? "bg-white/20 !text-white" : "bg-rose-500/20 text-rose-600 dark:text-rose-400"
              }`}
            >
              {urgentCount}
            </span>
          </button>
        )}

        {/* Active Category Filter Reset */}
        {activeCategory !== null && (
          <button
            onClick={() => setActiveCategory(null)}
            className="py-1.5 px-2.5 rounded-xl text-xs font-black bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer hover:bg-indigo-500/20"
            title="בטל סינון קטגוריה"
          >
            <span>{activeCategory}</span>
            <span className="text-[10px]">✕</span>
          </button>
        )}

        {/* Share (everyone) + Word export (purchasers) for the currently selected framework / view */}
        <div className="mr-auto flex items-center gap-1.5 shrink-0">
          {onShareList && activeRequests.length > 0 && (
            <button
              onClick={() => onShareList(selectedFramework)}
              title="שתף את הרשימה (וואטסאפ)"
              aria-label="שתף את הרשימה"
              className="py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--foreground)]/[0.05] flex items-center gap-1.5 shrink-0 shadow-xs"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline text-[11px] font-bold">שתף</span>
            </button>
          )}
          {canPurchase && (
            <button
              onClick={() => {
                if (listType === "large") {
                  onExportProcurementList?.(selectedFramework);
                } else {
                  onExportOngoingList?.(selectedFramework);
                }
              }}
              title={
                selectedFramework === "all"
                  ? `הורד רשימה מאוחדת (${listType === "large" ? "ציוד ורכש" : "סופר"})`
                  : `הורד רשימת ${currentFw?.name || ""} (${listType === "large" ? "ציוד ורכש" : "סופר"})`
              }
              aria-label="הורד רשימה כקובץ Word"
              className="py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--foreground)]/[0.05] flex items-center gap-1.5 shrink-0 shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden sm:inline text-[11px] font-bold">
                {selectedFramework === "all" ? "הורד רשימה" : `הורד ${currentFw?.shortName || "רשימה"}`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── Progress: how much of what's on screen is already in the cart ── */}
      {totalItems > 0 && (
        <div className="px-1 pb-3" aria-live="polite">
          <div className="flex items-center justify-between text-[11px] font-black mb-1">
            <span className={allDone ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--foreground)]/70"}>
              {allDone ? "הכל נרכש 🎉" : `${sessionPurchased.length} מתוך ${totalItems} נרכשו`}
            </span>
            <span className="text-[var(--muted)]">{progressPct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalItems}
            aria-valuenow={sessionPurchased.length}
            aria-label="התקדמות הרכישה"
            className="h-1.5 rounded-full bg-[var(--foreground)]/10 overflow-hidden"
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Active items, grouped by category ── */}
      {allDone ? (
        <div className="py-12 text-center bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-8 my-4">
          <div className="text-4xl mb-2">🎉</div>
          <h3 className="text-lg font-black text-emerald-700 dark:text-emerald-300">סיימנו! הכל נרכש</h3>
          <p className="text-xs text-[var(--muted)] font-bold mt-1">
            שכחת משהו? אפשר להחזיר מוצר מהרשימה שלמטה, או להוסיף חדש בכפתור ➕
          </p>
        </div>
      ) : activeRequests.length === 0 ? (
        <div className="py-16 text-center bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 my-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto mb-3">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-[var(--foreground)]">רשימת הקניות ריקה כרגע</h3>
          <p className="text-xs text-[var(--muted)] font-bold mt-1">תוכל להוסיף מוצרים חדשים בלחיצה על כפתור ה-➕ הציף</p>
        </div>
      ) : (
        categories.map((cat) => {
          if (activeCategory !== null && activeCategory !== cat) return null;
          const catItems = activeRequests.filter(
            (r) => r.category === cat && (!urgentFilterActive || r.priority === "urgent")
          );
          if (catItems.length === 0) {
            // A finished aisle collapses to one quiet line instead of disappearing — you can
            // see it's done, not lost. Skipped under the urgent filter, where "no urgent items
            // here" would otherwise read as "everything here is bought".
            const boughtInCat = urgentFilterActive
              ? 0
              : sessionPurchased.filter((r) => r.category === cat).length;
            const hasOpenInCat = activeRequests.some((r) => r.category === cat);
            if (boughtInCat === 0 || hasOpenInCat) return null;
            return (
              <div key={cat} className="mb-2 flex items-center gap-2 px-1 py-1.5 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>{cat}</span>
                <span className="text-[11px] text-[var(--muted)]">הושלם ({boughtInCat})</span>
              </div>
            );
          }

          return (
            <div key={cat} className="mb-4 last:mb-2">
              {/* Sticky so the current aisle stays named while scrolling a long list */}
              <div className="sticky top-0 z-10 flex items-center gap-2 py-1.5 px-1 bg-[var(--background)]">
                <span className={`w-2.5 h-2.5 rounded-full ${CAT_SOLID[cat] ?? CAT_SOLID["כללי"]}`} />
                <h2 className="text-sm font-black text-[var(--foreground)]">{cat}</h2>
                <span className="text-[11px] font-bold text-[var(--muted)]">{catItems.length}</span>
              </div>

              <AnimatePresence initial={false}>
                <div className="space-y-0.5">
                  {catItems.map((item) => (
                    <ItemRow key={item.id} item={item} onCheck={handleCheck} onOpenDetail={setDetailItem} showFrameworkTag={showFrameworkTag} />
                  ))}
                </div>
              </AnimatePresence>
            </div>
          );
        })
      )}

      {/* ── Purchased (collapsible) ── */}
      {sessionPurchased.length > 0 && (
        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <button
            onClick={() => setPurchasedCollapsed(!purchasedCollapsed)}
            className="flex items-center gap-2 text-xs font-black text-emerald-600 dark:text-emerald-400 cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 rounded-xl border border-emerald-500/20 transition-all"
          >
            <Check className="w-3.5 h-3.5" />
            <span>נרכשו ({sessionPurchased.length})</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${purchasedCollapsed ? "" : "rotate-180"}`} />
          </button>

          <AnimatePresence>
            {!purchasedCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-0.5 overflow-hidden mt-2"
              >
                {sessionPurchased.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onChangeStatus(item.id, "approved")}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[var(--foreground)]/5 transition-all text-right cursor-pointer border-none bg-transparent"
                    title="החזר לרשימה הפעילה"
                  >
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </span>
                    <span className="text-sm font-bold text-[var(--foreground)] line-through opacity-60 truncate flex-1">
                      {item.name}
                    </span>
                    <span className="text-[11px] font-bold text-[var(--muted)] shrink-0 flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" /> בטל
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Deleted (collapsible safety net) ── */}
      {sessionDeleted.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setDeletedCollapsed(!deletedCollapsed)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer py-1"
          >
            <span>פריטים שנמחקו ({sessionDeleted.length})</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${deletedCollapsed ? "" : "rotate-180"}`} />
          </button>

          <AnimatePresence>
            {!deletedCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-1 space-y-1 overflow-hidden"
              >
                {sessionDeleted.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--foreground)]/[0.02] text-xs text-[var(--muted)]">
                    <span className="line-through truncate max-w-[60%]">{item.name} ({item.quantity})</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => onChangeStatus(item.id, "approved")}
                        className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-500/20 cursor-pointer shrink-0 border-none"
                      >
                        החזר
                      </button>
                      <button
                        onClick={() => onChangeStatus(item.id, "permanently_delete")}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 cursor-pointer shrink-0 border-none flex items-center gap-1 font-bold text-[11px]"
                        title="הסר לצמיתות"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>מחק</span>
                      </button>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <ItemDetailSheet
        item={detailItem}
        onClose={() => setDetailItem(null)}
        categories={categories}
        onUpdateItem={onUpdateItem}
        onDelete={handleDelete}
        onMoveToEquipment={onMoveToEquipment}
        onMoveToSupermarket={onMoveToSupermarket}
      />

      {/* ── Undo snackbar ── */}
      <AnimatePresence>
        {undo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[90] bg-zinc-900 !text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 max-w-[92vw]"
          >
            <span className="text-xs font-bold truncate">{undo.label}</span>
            <button
              onClick={() => {
                undo.revert();
                setUndo(null);
                if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
              }}
              className="text-xs font-black text-indigo-300 hover:text-indigo-200 flex items-center gap-1 shrink-0 cursor-pointer border-none bg-transparent"
            >
              <Undo2 className="w-3.5 h-3.5" />
              בטל
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
