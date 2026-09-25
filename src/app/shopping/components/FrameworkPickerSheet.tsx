"use client";

import { Check, Layers } from "lucide-react";
import { motion } from "framer-motion";
import { BottomSheet } from "./BottomSheet";
import { TargetFramework } from "../types";
import { TARGET_FRAMEWORKS } from "../lib/constants";

interface FrameworkPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selected: "all" | TargetFramework;
  onSelect: (id: "all" | TargetFramework) => void;
  /** Adds a leading "כל המסגרות" option (for filtering; not for choosing where an item goes). */
  includeAll?: boolean;
  /** Optional item counts shown per option. */
  counts?: Partial<Record<"all" | TargetFramework, number>>;
  zIndex?: number;
}

/**
 * The one framework chooser used by the list filter and the item editor. Each framework keeps
 * the colour defined for it in TARGET_FRAMEWORKS, so the selected row matches that framework's
 * button everywhere else in the app.
 */
export function FrameworkPickerSheet({ isOpen, onClose, selected, onSelect, includeAll = false, counts, zIndex }: FrameworkPickerSheetProps) {
  const options: { id: "all" | TargetFramework; name: string }[] = [
    ...(includeAll ? [{ id: "all" as const, name: "כל המסגרות" }] : []),
    ...TARGET_FRAMEWORKS.map((fw) => ({ id: fw.id, name: fw.name })),
  ];

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="בחירת מסגרת"
      icon={<Layers className="w-5 h-5 text-[var(--accent-text)]" />}
      zIndex={zIndex}
    >
      <div role="radiogroup" aria-label="מסגרת" className="space-y-1.5">
        {options.map((opt) => {
          const active = selected === opt.id;
          const fw = TARGET_FRAMEWORKS.find((f) => f.id === opt.id);
          const count = counts?.[opt.id];
          return (
            <button
              key={opt.id}
              role="radio"
              aria-checked={active}
              onClick={() => {
                onSelect(opt.id);
                onClose();
              }}
              className={`w-full h-12 px-3 rounded-xl flex items-center gap-3 text-right cursor-pointer border-none transition-colors ${
                active
                  ? fw
                    ? `${fw.activeBg} !text-white`
                    : "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                  : "bg-transparent hover:bg-[var(--fill)] text-[var(--foreground)]"
              }`}
            >
              {fw ? (
                <span aria-hidden className={`w-2.5 h-2.5 rounded-full shrink-0 ${active ? "bg-white/90" : fw.dot}`} />
              ) : (
                <Layers className="w-4 h-4 shrink-0 opacity-70" />
              )}
              <span className={`flex-1 text-[15px] ${active ? "font-bold" : "font-medium"}`}>{opt.name}</span>
              {count !== undefined && (
                <span className={`text-[13px] font-semibold tabular-nums ${active ? "opacity-85" : "text-[var(--muted)]"}`}>{count}</span>
              )}
              <span className="w-4 h-4 shrink-0">
                {active && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 22 }} className="block">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </motion.span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
