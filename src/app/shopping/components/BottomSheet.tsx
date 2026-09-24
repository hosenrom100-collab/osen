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
  /** "lg" for content that needs room (lists, forms); default fits a menu or a short form. */
  size?: "md" | "lg";
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
  size = "md",
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
            aria-label={typeof title === "string" ? title : undefined}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.5 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className={`relative w-full ${size === "lg" ? "md:max-w-2xl" : "md:max-w-lg"} bg-[var(--surface)] border-t md:border border-[var(--border)] rounded-t-3xl md:rounded-3xl shadow-[var(--shadow-pop)] text-right flex flex-col overflow-hidden outline-none ${
              maxHeight ? "max-h-[88vh]" : ""
            }`}
            dir="rtl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="w-10 h-1.5 bg-[var(--foreground)]/15 rounded-full mx-auto mt-2.5 mb-0.5 md:hidden shrink-0" />

            <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 shrink-0">
              <h2 className="text-lg font-extrabold flex items-center gap-2.5 text-[var(--foreground)] min-w-0">
                {icon}
                <span>{title}</span>
              </h2>
              <button
                onClick={onClose}
                aria-label="סגור"
                className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-[var(--foreground)]/[0.06] hover:bg-[var(--foreground)]/10 text-[var(--muted)] cursor-pointer border-none transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-5 pt-1 pb-5">{children}</div>

            {footer && (
              <div className="px-5 pt-3 pb-4 shrink-0 border-t border-[var(--border)] bg-[var(--surface)]">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
