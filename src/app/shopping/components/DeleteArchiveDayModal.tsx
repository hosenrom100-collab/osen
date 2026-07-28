"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Trash2, X, Loader2, Package, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { ShoppingRequest } from "../types";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export interface DeleteArchiveDayModalProps {
  isOpen: boolean;
  onClose: () => void;
  archivedRequests: ShoppingRequest[];
  onDeleteDay: (dateKey: string, password: string) => Promise<{ success: boolean; error?: string }>;
}

function toDateKey(value: { toDate: () => Date } | Date | null | undefined): string | null {
  const d = value instanceof Date ? value : value && typeof value.toDate === "function" ? value.toDate() : null;
  if (!d || isNaN(d.getTime())) return null;
  return format(d, "yyyy-MM-dd");
}

export function DeleteArchiveDayModal({ isOpen, onClose, archivedRequests, onDeleteDay }: DeleteArchiveDayModalProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const dayGroups = useMemo(() => {
    const map = new Map<string, number>();
    archivedRequests.forEach((r) => {
      const key = toDateKey(r.archivedAt) || toDateKey(r.updatedAt) || toDateKey(r.createdAt);
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, count]) => ({ date, count }));
  }, [archivedRequests]);

  const dialogTitleId = "delete-archive-day-title";
  const containerRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) return null;

  const resetLocalState = () => {
    setSelectedDate(null);
    setPassword("");
    setError("");
  };

  const handleClose = () => {
    resetLocalState();
    onClose();
  };

  const handleConfirmDelete = async () => {
    if (!selectedDate) return;
    setDeleting(true);
    try {
      const result = await onDeleteDay(selectedDate, password.trim());
      if (result.success) {
        resetLocalState();
        onClose();
      } else {
        setError(result.error || "שגיאה במחיקה");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") handleClose();
          }}
          className="relative bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[85vh] text-right"
          dir="rtl"
        >
          <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3 shrink-0">
            <h3 id={dialogTitleId} className="text-lg font-black text-rose-500 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-rose-500" aria-hidden="true" />
              <span>מחיקת יום מהארכיון</span>
            </h3>
            <button
              onClick={handleClose}
              aria-label="סגור"
              className="p-1.5 rounded-full hover:bg-[var(--foreground)]/5 text-[var(--muted)] cursor-pointer border-none bg-transparent"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {!selectedDate ? (
            <div className="flex-grow overflow-y-auto space-y-1.5 no-scrollbar">
              <p className="text-[11px] text-[var(--muted)] font-semibold mb-2">
                בחר יום למחיקה. הרשימה הפעילה (הזמנות פתוחות) לא תושפע.
              </p>
              {dayGroups.length === 0 ? (
                <div className="py-10 text-center opacity-40">
                  <Package className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-xs font-bold">אין ימים בארכיון למחיקה</p>
                </div>
              ) : (
                dayGroups.map(({ date, count }) => (
                  <button
                    key={date}
                    onClick={() => { setSelectedDate(date); setPassword(""); setError(""); }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--border)] hover:border-rose-500/40 hover:bg-rose-500/5 transition-all text-sm font-bold cursor-pointer text-[var(--foreground)]"
                  >
                    <span>{date}</span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[var(--foreground)]/10 text-[var(--muted)]">
                      {count} מוצרים
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-[var(--foreground)]/80 font-medium leading-relaxed">
                פעולה זו תמחק לצמיתות את{" "}
                <strong>{dayGroups.find((d) => d.date === selectedDate)?.count ?? 0}</strong> המוצרים שנשמרו
                בארכיון בתאריך <strong>{selectedDate}</strong>.
                <br />
                <span className="text-rose-500 font-bold">
                  לא ניתן לשחזר לאחר המחיקה. הרשימה הפעילה לא תושפע.
                </span>
              </p>

              <div>
                <label htmlFor="delete-archive-day-password" className="text-xs font-bold text-[var(--foreground)] mb-1.5 block">
                  אנא הזן סיסמת מנהל לאישור:
                </label>
                <input
                  id="delete-archive-day-password"
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleConfirmDelete(); }}
                  placeholder="הזן סיסמת מנהל..."
                  aria-invalid={!!error}
                  aria-describedby={error ? "delete-archive-day-password-error" : undefined}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2.5 px-3 text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none text-center tracking-widest text-[var(--foreground)]"
                />
                {error && <span id="delete-archive-day-password-error" className="text-xs text-rose-500 font-bold mt-1.5 block">{error}</span>}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  onClick={() => { setSelectedDate(null); setPassword(""); setError(""); }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--foreground)]/5 text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors cursor-pointer border-none flex items-center gap-1.5"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  חזור
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="px-4 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 !text-white transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 border-none"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Trash2 className="w-4 h-4 text-white" />}
                  <span>מחק יום זה</span>
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
