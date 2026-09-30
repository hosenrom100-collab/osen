"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export function Dialog({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-label={title}
        className="relative w-full sm:max-w-md max-h-[90vh] flex flex-col bg-[var(--card-bg)] text-[var(--foreground)] border border-[var(--border)] rounded-t-xl sm:rounded-lg text-right">
        <div className="flex items-center justify-between px-4 h-12 border-b border-[var(--border)] shrink-0">
          <h2 className="text-sm font-bold">{title}</h2>
          <button onClick={onClose} aria-label="סגור" className="p-1.5 -ml-1.5 text-[var(--foreground)]/50 hover:text-[var(--foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4">{children}</div>
        {footer && <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)] shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export const fieldCls =
  "w-full bg-transparent border border-[var(--border)] rounded-md px-2.5 py-2 text-sm focus:border-[var(--accent)] outline-none";
export const labelCls = "block text-xs font-bold text-[var(--foreground)]/50 mb-1";
export const btnPrimary =
  "bg-[var(--accent)] text-white px-3.5 py-2 rounded-md text-sm font-bold hover:opacity-90 disabled:opacity-40";
export const btnGhost =
  "px-3.5 py-2 rounded-md text-sm font-bold text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/5 border border-[var(--border)]";
