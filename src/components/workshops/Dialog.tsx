"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { pastel } from "@/lib/workshops/activityTypes";

/**
 * Dialog on desktop, bottom sheet on phones. Title + a line of context (what / when / where),
 * an optional colour accent, and a footer for the actions. Esc closes; focus moves in and comes back.
 */
export function Dialog({ title, subtitle, accent, onClose, children, footer, wide }: {
  title: string; subtitle?: React.ReactNode; accent?: number; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.hasAttribute("disabled"));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; back?.focus?.(); };
  }, [onClose]);

  const bar = accent !== undefined ? pastel(accent).bar : undefined;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" dir="rtl">
      <div className="sheet-backdrop absolute inset-0 bg-black/35 backdrop-blur-[2px]" style={{ animation: "sheet-fade 160ms ease-out" }} onClick={onClose} />
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        style={{ animation: "sheet-up 200ms cubic-bezier(.2,.8,.2,1)" }}
        className={`sheet-anim relative w-full ${wide ? "sm:max-w-xl" : "sm:max-w-md"} max-h-[88vh] flex flex-col outline-none bg-[var(--card-bg)] text-[var(--foreground)] rounded-t-2xl sm:rounded-2xl text-right shadow-[0_1px_2px_rgba(0,0,0,0.08),0_16px_48px_rgba(0,0,0,0.18)] overflow-hidden sm:[animation-name:sheet-pop]`}>
        <div className="sm:hidden mx-auto mt-2 h-1 w-9 rounded-full bg-[var(--foreground)]/15 shrink-0" aria-hidden />
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 shrink-0">
          {bar && <span className="mt-1 w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: bar }} aria-hidden />}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-snug">{title}</h2>
            {subtitle && <p className="text-[13px] text-[var(--foreground)]/60 mt-0.5 leading-snug">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="סגור" className="p-1.5 -m-1.5 rounded-lg text-[var(--foreground)]/45 hover:bg-[var(--foreground)]/5 hover:text-[var(--foreground)]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 pt-1 space-y-5">{children}</div>
        {footer && <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--border)] shrink-0 bg-[var(--foreground)]/[0.02] pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export const fieldCls =
  "w-full bg-[var(--card-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 outline-none transition-shadow";
export const labelCls = "block text-xs font-semibold text-[var(--foreground)]/55 mb-1.5";
export const btnPrimary =
  "bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm font-bold hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition";
export const btnGhost =
  "px-3.5 py-2 rounded-lg text-sm font-semibold text-[var(--foreground)]/75 hover:bg-[var(--foreground)]/5 border border-[var(--border)] transition-colors";
