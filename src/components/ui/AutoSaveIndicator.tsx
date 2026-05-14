"use client";

import { Loader2, Check, AlertCircle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { SaveStatus } from "@/hooks/useAutoSave";

interface Props {
  status:    SaveStatus;
  error?:    string | null;
  onRetry?:  () => void;
  className?: string;
}

/**
 * Non-intrusive auto-save status badge.
 *
 * Renders nothing in "idle" or "pending" state — only appears when
 * there is something worth surfacing (saving / saved / error).
 */
export function AutoSaveIndicator({ status, error, onRetry, className = "" }: Props) {
  const visible = status === "saving" || status === "saved" || status === "error";

  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          key={status}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.12 }}
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium select-none shrink-0 ${className}`}
        >
          {status === "saving" && (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-[var(--muted)]" />
              <span className="text-[var(--muted)]">שומר...</span>
            </>
          )}

          {status === "saved" && (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-500">נשמר</span>
            </>
          )}

          {status === "error" && (
            <>
              <AlertCircle className="w-3 h-3 text-rose-400" />
              <span className="text-rose-400">{error ?? "שגיאה בשמירה"}</span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  title="נסה שנית"
                  className="p-0.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
