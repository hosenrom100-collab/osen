"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Cap sheet height so a short sheet doesn't stretch to fill the screen. Default true. */
  maxHeight?: boolean;
  zIndex?: number;
}

/**
 * Shared bottom-sheet shell used by every panel in the shopping list (add item, item
 * detail, menu, category/recurring/star/cutoff settings, receipt scan). Handles the
 * backdrop, drag handle, safe-area padding, and focus trapping so each panel only has
 * to provide its own content.
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  icon,
  children,
  footer,
  maxHeight = true,
  zIndex = 100,
}: BottomSheetProps) {
  const containerRef = useFocusTrap<HTMLDivElement>(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-end md:items-center justify-center p-0 md:p-6" style={{ zIndex }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.5 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className={`relative w-full md:max-w-lg bg-[var(--surface)] border-t md:border border-[var(--border)] rounded-t-[1.5rem] md:rounded-[2rem] shadow-2xl text-right flex flex-col overflow-hidden ${
              maxHeight ? "max-h-[88vh]" : ""
            }`}
            dir="rtl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="w-12 h-1 bg-[var(--border)] rounded-full mx-auto mt-3 mb-1 md:hidden shrink-0" />

            <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0 border-b border-[var(--border)]/60">
              <h2 className="text-base font-black flex items-center gap-2 text-[var(--foreground)]">
                {icon}
                <span>{title}</span>
              </h2>
              <button
                onClick={onClose}
                aria-label="סגור"
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer border-none bg-transparent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4">{children}</div>

            {footer && (
              <div className="px-5 pt-3 pb-4 shrink-0 border-t border-[var(--border)]/60">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
