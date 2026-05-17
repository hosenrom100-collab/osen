"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X, Loader2 } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: "danger" | "info" | "success";
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  type = "info",
  isLoading = false
}: ConfirmModalProps) {
  const colors = {
    danger: "bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20",
    info: "bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 shadow-black/10",
    success: "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20"
  };

  const iconColors = {
    danger: "text-rose-500 bg-rose-500/10",
    info: "text-blue-500 bg-blue-500/10",
    success: "text-emerald-500 bg-emerald-500/10"
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
          >
            <button
              onClick={onClose}
              className="absolute top-6 left-6 p-2 rounded-xl hover:bg-[var(--foreground)]/5 text-[var(--muted)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className={`w-16 h-16 rounded-[2rem] flex items-center justify-center mb-6 ${iconColors[type]}`}>
                <AlertCircle className="w-8 h-8" />
              </div>

              <h3 className="text-xl font-black mb-3">{title}</h3>
              <p className="text-sm text-[var(--muted)] font-bold leading-relaxed mb-8">
                {message}
              </p>

              <div className="flex flex-col w-full gap-3">
                <button
                  onClick={onConfirm}
                  disabled={isLoading}
                  className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 ${colors[type]}`}
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {confirmLabel}
                </button>
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest text-[var(--muted)] hover:bg-[var(--foreground)]/5 transition-all"
                >
                  {cancelLabel}
                </button>
              </div>
            </div>
            
            {/* Decorative background element */}
            <div className={`absolute -bottom-12 -right-12 w-32 h-32 blur-3xl opacity-20 rounded-full ${type === 'danger' ? 'bg-rose-500' : 'bg-blue-500'}`} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
