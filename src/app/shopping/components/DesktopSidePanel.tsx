"use client";

import { Plus, Download, History, Package } from "lucide-react";

interface DesktopSidePanelProps {
  listType: "supermarket" | "large";
  /** Name of the framework filter in effect ("כל המסגרות" when none), so the numbers say what they count. */
  scopeLabel: string;
  done: number;
  total: number;
  canPurchase: boolean;
  /** Admin / logistics with a frozen list: the "close the cycle" action belongs here too. */
  showCloseCycle: boolean;
  onAdd: () => void;
  onExport: () => void;
  onOpenHistory: () => void;
  onCloseCycle: () => void;
}

const RING_RADIUS = 38;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Persistent side rail for wide screens (lg+). On a phone the list is the whole screen and
 * these actions live in the menu and the floating button; on a desktop there is room to keep
 * progress and the main actions in view at all times instead of behind taps.
 */
export function DesktopSidePanel({
  listType,
  scopeLabel,
  done,
  total,
  canPurchase,
  showCloseCycle,
  onAdd,
  onExport,
  onOpenHistory,
  onCloseCycle,
}: DesktopSidePanelProps) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const allDone = total > 0 && done === total;

  const secondaryBtn =
    "w-full h-11 px-3.5 rounded-xl flex items-center gap-2.5 text-sm font-semibold bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--foreground)]/[0.04] cursor-pointer transition-colors";

  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-card)] p-5">
        <h2 className="text-[13px] font-bold text-[var(--muted)] mb-4">
          {listType === "large" ? "ציוד ורכש" : "קניות"} · {scopeLabel}
        </h2>

        {total === 0 ? (
          <p className="text-sm text-[var(--muted)] font-medium">אין מוצרים ברשימה עדיין.</p>
        ) : (
          <div className="flex items-center gap-4">
            <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={`${pct}% מהמוצרים נרכשו`} className="shrink-0">
              <circle cx="48" cy="48" r={RING_RADIUS} fill="none" strokeWidth="8" className="stroke-[var(--foreground)]/10" />
              <circle
                cx="48"
                cy="48"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - pct / 100)}
                transform="rotate(-90 48 48)"
                className="stroke-emerald-500 transition-[stroke-dashoffset] duration-500 ease-out"
              />
              <text x="48" y="55" textAnchor="middle" className="fill-[var(--foreground)] text-[20px] font-extrabold">
                {pct}%
              </text>
            </svg>
            <div className="min-w-0">
              <div className="text-3xl font-extrabold tabular-nums leading-none text-[var(--foreground)]">
                {done}
                <span className="text-[var(--muted)] font-semibold">/{total}</span>
              </div>
              <div className={`text-[13px] font-semibold mt-1.5 ${allDone ? "text-emerald-700 dark:text-emerald-400" : "text-[var(--muted)]"}`}>
                {allDone ? "הכל נרכש 🎉" : `${total - done} נשארו לקנות`}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <button
          onClick={onAdd}
          className="w-full h-12 px-4 rounded-xl flex items-center justify-center gap-2 text-[15px] font-bold bg-[var(--accent)] hover:brightness-110 !text-white border-none cursor-pointer transition-[filter]"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          הוסף מוצר
        </button>

        {showCloseCycle && (
          <button onClick={onCloseCycle} className={secondaryBtn}>
            <Package className="w-4 h-4 text-amber-600" />
            הפקת רשימה וסגירת סבב
          </button>
        )}
        {canPurchase && (
          <button onClick={onExport} disabled={total === 0} className={`${secondaryBtn} disabled:opacity-40 disabled:cursor-not-allowed`}>
            <Download className="w-4 h-4 text-[var(--accent-text)]" />
            הורד רשימה (Word)
          </button>
        )}
        {canPurchase && (
          <button onClick={onOpenHistory} className={secondaryBtn}>
            <History className="w-4 h-4 text-[var(--muted)]" />
            סבבים קודמים
          </button>
        )}
      </section>
    </div>
  );
}
