"use client";

import { useEffect, useRef, useState } from "react";
import { User } from "firebase/auth";
import { ShoppingRequest, Product, TargetFramework } from "../types";
import {
  Flame, ShoppingBag, ChevronDown, Check, RotateCcw, Undo2, Trash2, Download,
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
  /** Opens the add sheet — the empty state's one call to action. */
  onAddClick?: () => void;
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
  onAddClick,
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

  const currentFw = TARGET_FRAMEWORKS.find((f) => f.id === selectedFramework);

  // Framework tag on each row only earns its keep when the list mixes frameworks —
  // filtered to one, the chip row already said which, so repeating it per row is noise.
  const showFrameworkTag = selectedFramework === "all";

  // Keep the active chip in view: the saved framework can be off-screen in the scroller.
  const activeChipRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selectedFramework]);

  const frameworkChips = [
    { id: "all" as const, label: "הכל", count: totalCategoryRequests.length },
    ...TARGET_FRAMEWORKS.map((fw) => ({
      id: fw.id,
      label: fw.shortName,
      count: totalCategoryRequests.filter((r) => (r.targetFramework || "main") === fw.id).length,
    })),
  ];

  const cardClass =
    "rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-card)] overflow-clip";

  return (
    <div dir="rtl" className="w-full max-w-2xl mx-auto pb-24 px-2.5 sm:px-4 [&>section:first-of-type]:mt-2">
      {/* ── One compact control row: urgent filter, framework chips (scrollable), download.
           Sticky, and exactly 44px tall because the category headers stick just below it.
           Progress lives in the page header now, so nothing else sits between here and the list. ── */}
      <div className="sticky top-0 z-20 -mx-2.5 sm:-mx-4 px-2.5 sm:px-4 bg-[var(--background)]/90 backdrop-blur-md">
        <div className="flex items-center gap-2 py-1.5">
          {urgentCount > 0 && (
            <button
              onClick={() => {
                setActiveCategory(null);
                setShowUrgentOnly((v) => !v);
              }}
              aria-pressed={urgentFilterActive}
              className={`h-8 px-3 rounded-full text-[13px] font-semibold border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                urgentFilterActive
                  ? "bg-rose-600 !text-white border-transparent"
                  : "bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20"
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span className="tabular-nums">{urgentCount}</span>
              <span className="sr-only">פריטים דחופים</span>
            </button>
          )}

          <div
            role="tablist"
            aria-label="סינון לפי מסגרת"
            className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
          >
            {frameworkChips.map((chip) => {
              const active = selectedFramework === chip.id;
              const fw = TARGET_FRAMEWORKS.find((f) => f.id === chip.id);
              return (
                <button
                  key={chip.id}
                  ref={active ? activeChipRef : undefined}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedFramework?.(chip.id)}
                  className={`h-8 px-3 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 border transition-colors cursor-pointer ${
                    active
                      ? "bg-[var(--accent)] !text-white border-transparent"
                      : "bg-[var(--surface)] text-[var(--foreground)]/80 border-[var(--border)] hover:bg-[var(--fill)]"
                  }`}
                >
                  {fw && <span aria-hidden className={`w-2 h-2 rounded-full ${active ? "bg-white/85" : fw.dot}`} />}
                  <span>{chip.label}</span>
                  <span className={`text-xs font-semibold tabular-nums ${active ? "opacity-80" : "text-[var(--muted)]"}`}>
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>

          {activeCategory !== null && (
            <button
              onClick={() => setActiveCategory(null)}
              className="h-8 px-3 rounded-full text-[13px] font-semibold bg-[var(--accent-soft)] border border-[var(--accent-line)] text-[var(--accent-text)] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="בטל סינון קטגוריה"
            >
              <span>{activeCategory}</span>
              <span aria-hidden>✕</span>
            </button>
          )}

          {/* On lg+ the side rail already has a download button */}
          {canPurchase && totalItems > 0 && (
            <button
              onClick={() => {
                if (listType === "large") onExportProcurementList?.(selectedFramework);
                else onExportOngoingList?.(selectedFramework);
              }}
              title={
                selectedFramework === "all"
                  ? `הורד רשימה מאוחדת (${listType === "large" ? "ציוד ורכש" : "סופר"})`
                  : `הורד רשימת ${currentFw?.name || ""} (${listType === "large" ? "ציוד ורכש" : "סופר"})`
              }
              aria-label="הורד רשימה כקובץ Word"
              className="lg:hidden h-8 w-8 rounded-full border bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--fill)] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4 text-[var(--accent-text)]" />
            </button>
          )}
        </div>
      </div>

      {/* ── Active items, grouped into one card per category ── */}
      {allDone ? (
        <div className="mt-2 py-12 px-6 text-center bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl my-2">
          <div className="text-4xl mb-2">🎉</div>
          <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-300">סיימנו! הכל נרכש</h3>
          <p className="text-sm text-[var(--muted)] mt-1">שכחת משהו? אפשר להחזיר מוצר מהרשימה שלמטה, או להוסיף חדש.</p>
          {onAddClick && (
            <button
              onClick={onAddClick}
              className="mt-5 h-11 px-5 rounded-xl bg-[var(--accent)] hover:brightness-110 !text-white text-sm font-bold border-none cursor-pointer inline-flex items-center gap-2"
            >
              הוסף מוצר
            </button>
          )}
        </div>
      ) : activeRequests.length === 0 ? (
        <div className={`${cardClass} py-14 px-6 text-center my-2`}>
          <div className="w-16 h-16 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-[var(--foreground)]">הרשימה ריקה</h3>
          <p className="text-sm text-[var(--muted)] mt-1">
            {selectedFramework === "all" ? "עוד לא נוספו מוצרים לרשימה." : `אין עדיין מוצרים עבור ${currentFw?.name ?? "המסגרת"}.`}
          </p>
          {onAddClick && (
            <button
              onClick={onAddClick}
              className="mt-5 h-11 px-5 rounded-xl bg-[var(--accent)] hover:brightness-110 !text-white text-sm font-bold border-none cursor-pointer inline-flex items-center gap-2"
            >
              הוסף מוצר
            </button>
          )}
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
              <div key={cat} className="mb-3 flex items-center gap-2 px-2 py-1 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{cat}</span>
                <span className="text-[var(--muted)] font-medium">הושלם ({boughtInCat})</span>
              </div>
            );
          }

          return (
            <section key={cat} className={`${cardClass} mb-4`}>
              {/* Sticky under the chip row (52px) so the current aisle stays named while scrolling */}
              <header className="sticky top-11 z-10 flex items-center gap-2.5 px-4 py-2.5 bg-[var(--surface)]/95 backdrop-blur border-b border-[var(--border)]">
                <span aria-hidden className={`w-2.5 h-2.5 rounded-full ${CAT_SOLID[cat] ?? CAT_SOLID["כללי"]}`} />
                <h2 className="text-sm font-bold text-[var(--foreground)]">{cat}</h2>
                <span className="text-[13px] font-medium text-[var(--muted)] tabular-nums">{catItems.length}</span>
              </header>
              <div className="divide-y divide-[var(--border)]">
                {catItems.map((item) => (
                  <ItemRow key={item.id} item={item} onCheck={handleCheck} onOpenDetail={setDetailItem} showFrameworkTag={showFrameworkTag} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {/* ── Purchased (collapsible) ── */}
      {sessionPurchased.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setPurchasedCollapsed(!purchasedCollapsed)}
            aria-expanded={!purchasedCollapsed}
            className="flex items-center gap-2 h-10 px-4 rounded-full text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>נרכשו ({sessionPurchased.length})</span>
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${purchasedCollapsed ? "" : "rotate-180"}`} />
          </button>

          <AnimatePresence initial={false}>
            {!purchasedCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className={`${cardClass} mt-3 divide-y divide-[var(--border)]`}>
                  {sessionPurchased.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onChangeStatus(item.id, "approved")}
                      className="w-full flex items-center gap-3 px-3 min-h-[52px] hover:bg-[var(--fill)] transition-colors text-right cursor-pointer border-none bg-transparent"
                      title="החזר לרשימה הפעילה"
                    >
                      <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mx-2.5">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                      <span className="text-[15px] font-medium text-[var(--muted)] line-through truncate flex-1">{item.name}</span>
                      <span className="text-[13px] font-semibold text-[var(--accent-text)] shrink-0 flex items-center gap-1">
                        <RotateCcw className="w-3.5 h-3.5" /> החזר
                      </span>
                    </button>
                  ))}
                </div>
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
            aria-expanded={!deletedCollapsed}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer py-2 bg-transparent border-none"
          >
            <span>פריטים שנמחקו ({sessionDeleted.length})</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${deletedCollapsed ? "" : "rotate-180"}`} />
          </button>

          <AnimatePresence initial={false}>
            {!deletedCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className={`${cardClass} divide-y divide-[var(--border)]`}>
                  {sessionDeleted.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 px-4 min-h-[52px] text-sm text-[var(--muted)]">
                      <span className="line-through truncate min-w-0">{item.name} ({item.quantity})</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => onChangeStatus(item.id, "approved")}
                          className="h-9 px-3 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)] text-[13px] font-semibold hover:bg-[var(--accent-soft-hover)] cursor-pointer border-none"
                        >
                          החזר
                        </button>
                        <button
                          onClick={() => onChangeStatus(item.id, "permanently_delete")}
                          className="h-9 px-3 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 cursor-pointer border-none flex items-center gap-1.5 text-[13px] font-semibold"
                          title="הסר לצמיתות"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>מחק</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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

      {/* ── Undo snackbar — sits above the add button so the two never overlap ── */}
      <AnimatePresence>
        {undo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            role="status"
            className="fixed bottom-44 md:bottom-28 left-1/2 -translate-x-1/2 z-[90] bg-[#312E81] !text-white rounded-2xl shadow-[var(--shadow-pop)] pl-3 pr-4 py-2 flex items-center gap-3 max-w-[92vw]"
          >
            <span className="text-sm font-medium truncate">{undo.label}</span>
            <button
              onClick={() => {
                undo.revert();
                setUndo(null);
                if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
              }}
              className="h-9 px-3 rounded-lg text-sm font-bold text-indigo-200 hover:bg-white/10 flex items-center gap-1.5 shrink-0 cursor-pointer border-none bg-transparent"
            >
              <Undo2 className="w-4 h-4" />
              בטל
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
