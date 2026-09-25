"use client";

import { useEffect, useState } from "react";
import { History, ChevronDown, Check, Loader2, Flame } from "lucide-react";
import { format } from "date-fns";
import { BottomSheet } from "./BottomSheet";
import { CycleRecord } from "../types";
import { fetchRecentCycles } from "../lib/closeCycle";
import { formatUnitShort, parseQuantity } from "../lib/quantityUtils";

interface CycleHistorySheetProps {
  isOpen: boolean;
  onClose: () => void;
  listType: "supermarket" | "large";
}

/** Read-only look back at closed cycles: "what did we order last week?" */
export function CycleHistorySheet({ isOpen, onClose, listType }: CycleHistorySheetProps) {
  const [cycles, setCycles] = useState<CycleRecord[] | null>(null);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchRecentCycles(listType)
      .then((c) => !cancelled && setCycles(c))
      .catch((e) => {
        console.error("Error loading cycle history:", e);
        if (!cancelled) setError(true);
      });
    // Reset on close/list change (not in the effect body) so each open starts at "loading".
    return () => {
      cancelled = true;
      setCycles(null);
      setError(false);
      setOpenId(null);
    };
  }, [isOpen, listType]);

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`סבבים קודמים · ${listType === "large" ? "רכש" : "סופר"}`}
      icon={<History className="w-4 h-4 text-[var(--accent-text)]" />}
    >
      {error ? (
        <p className="py-10 text-center text-xs font-bold text-rose-500">שגיאה בטעינת ההיסטוריה. נסה שוב.</p>
      ) : cycles === null ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 text-[var(--accent-text)] animate-spin" />
        </div>
      ) : cycles.length === 0 ? (
        <p className="py-10 text-center text-xs font-bold text-[var(--muted)]">עוד לא נסגר אף סבב.</p>
      ) : (
        <div className="space-y-2">
          {cycles.map((cycle) => {
            const expanded = openId === cycle.id;
            return (
              <div key={cycle.id} className="border-b border-[var(--border)] overflow-hidden">
                <button
                  onClick={() => setOpenId(expanded ? null : cycle.id)}
                  aria-expanded={expanded}
                  className="w-full flex items-center gap-3 px-4 py-3 text-right cursor-pointer border-none bg-transparent"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-bold text-[var(--foreground)] tabular-nums">
                      {format(cycle.closedAt, "dd/MM/yyyy")}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">{cycle.purchasedCount} נרכשו</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">{cycle.unpurchasedCount} לא נרכשו</span>
                      {cycle.carriedOverCount > 0 && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]">{cycle.carriedOverCount} הועברו הלאה</span>
                      )}
                      {cycle.closedByName && <span className="text-xs text-[var(--muted)]">נסגר ע״י {cycle.closedByName}</span>}
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-[var(--muted)] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
                </button>

                {expanded && (
                  <ul className="px-4 pb-3 space-y-1 border-t border-[var(--border)]/60 pt-2">
                    {cycle.items.map((item, idx) => {
                      const { value, unit } = parseQuantity(item.quantity);
                      return (
                        <li key={idx} className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)]">
                          <span
                            className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                              item.purchased ? "bg-emerald-500 text-white" : "border border-[var(--muted)]/40"
                            }`}
                          >
                            {item.purchased && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </span>
                          <span className={`truncate flex-1 ${item.purchased ? "" : "text-[var(--muted)]"}`}>
                            {item.name}
                          </span>
                          {item.priority === "urgent" && <Flame className="w-3 h-3 text-rose-500 shrink-0" />}
                          <span className="text-xs text-[var(--muted)] shrink-0">
                            {value} {formatUnitShort(unit)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}
