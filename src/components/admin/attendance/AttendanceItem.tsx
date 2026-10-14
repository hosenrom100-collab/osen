"use client";

import { useState } from "react";
import { Check, X, MessageSquare, MoreHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLongPress } from "@/hooks/useLongPress";
import { AttendanceEntry, lateLabel, leftEarlyLabel, NOTE_CHIPS, NOTE_MAX } from "@/lib/attendance/model";

interface AttendanceItemProps {
  patient: { id: string; firstName: string; lastName: string; phone?: string };
  entry: AttendanceEntry;
  onToggle: (status: "present" | "absent") => void;
  /** Saves the one-line note ("" removes it). */
  onSaveNote: (text: string) => void;
  /** Opens the sheet with late / early leave / time / note. */
  onOpenDetails: () => void;
}

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.458L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.413 9.863-9.83.001-2.624-1.012-5.09-2.855-6.937C16.638 1.997 14.173.987 11.556.987c-5.442 0-9.87 4.414-9.873 9.833-.001 1.777.472 3.511 1.368 5.044L2.016 22l6.233-1.636z" />
    <path d="M11.516 4.756c-.214-.476-.44-.486-.644-.495-.205-.008-.44-.007-.675-.007-.235 0-.618.088-.941.44-.323.352-1.233 1.205-1.233 2.938 0 1.733 1.262 3.407 1.439 3.642.176.235 2.483 3.792 6.014 5.32 2.933 1.27 3.528.878 4.175.82.646-.059 2.085-.851 2.379-1.673.294-.82.294-1.525.206-1.672-.088-.147-.323-.235-.676-.411-.352-.176-2.085-1.03-2.408-1.147-.323-.117-.558-.176-.793.176-.235.352-.91 1.147-1.116 1.381-.205.234-.411.264-.764.088-.352-.176-1.488-.548-2.834-1.75-1.047-.934-1.753-2.087-1.959-2.439-.205-.352-.022-.543.154-.718.158-.157.352-.411.529-.617.176-.205.235-.352.352-.587.118-.235.059-.44-.029-.617-.088-.176-.793-1.91-.976-2.355z" />
  </svg>
);

const formatPhoneForWhatsApp = (phoneStr?: string) => {
  if (!phoneStr) return "";
  let clean = phoneStr.replace(/\D/g, "");
  if (clean.startsWith("0") && clean.length === 10) {
    clean = "972" + clean.substring(1);
  }
  return clean;
};

export function AttendanceItem({ patient, entry, onToggle, onSaveNote, onOpenDetails }: AttendanceItemProps) {
  const { role } = useAuth();
  const status = entry.status;
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState("");
  // A long press on ✓ opens the details; a tap still just marks present.
  const presentPress = useLongPress(onOpenDetails, () => onToggle("present"));

  const openNote = () => { setDraft(entry.note ?? ""); setEditingNote(true); };
  const commitNote = (text: string) => {
    setEditingNote(false);
    if (text.trim() !== (entry.note ?? "")) onSaveNote(text.trim());
  };
  const hasMarks = !!(entry.late || entry.leftEarly || entry.note);
  const isPresent = status === "present";
  const isAbsent  = status === "absent";
  const isInstructor = role === "instructor";

  return (
    <motion.div
      layout
      className={`border-b border-[var(--border)] last:border-0 transition-colors duration-150 select-none ${
        isPresent ? "bg-emerald-500/[0.04]" :
        isAbsent  ? "bg-rose-500/[0.04]" : ""
      }`}
    >
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Status strip */}
      <div className={`w-1 self-stretch rounded-full shrink-0 transition-all duration-200 ${
        isPresent ? "bg-emerald-500" :
        isAbsent  ? "bg-rose-500" :
        "bg-[var(--border)]"
      }`} />

      {/* Name + status label */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-1">
          {!isInstructor ? (
            <Link href={`/patients/${patient.id}`} className="hover:text-emerald-500 hover:underline transition-colors cursor-pointer min-w-0">
              <p className="font-bold text-lg text-slate-800 leading-none truncate">
                {patient.firstName} {patient.lastName}
              </p>
            </Link>
          ) : (
            <p className="font-bold text-lg text-slate-800 leading-none truncate">
              {patient.firstName} {patient.lastName}
            </p>
          )}
          {/* Two small, quiet icons: a one-line note and the late / early-leave details. */}
          <button
            type="button"
            onClick={openNote}
            aria-label={entry.note ? "ערוך הערה" : "הוסף הערה"}
            className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-lg transition-colors ${
              entry.note ? "text-[var(--foreground)]/55" : "text-[var(--muted)]/30 hover:text-[var(--muted)]"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onOpenDetails}
            aria-label="איחור, יציאה מוקדמת והערה"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-[var(--muted)]/30 hover:text-[var(--muted)] transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
        <p className={`text-[11px] font-bold transition-colors uppercase tracking-wider ${
          isPresent ? "text-emerald-500" :
          isAbsent  ? "text-rose-400" :
          "text-slate-300"
        }`}>
          {isPresent ? "נוכח במפגש" : isAbsent ? "לא הגיע" : "טרם עודכן"}
        </p>
        {hasMarks && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)] min-w-0">
            {isPresent && entry.late && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700">{lateLabel(entry.late)}</span>
            )}
            {isPresent && entry.leftEarly && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-700">{leftEarlyLabel(entry.leftEarly)}</span>
            )}
            {entry.note && <span className="truncate">{entry.note}</span>}
          </p>
        )}
      </div>

      {/* WhatsApp Link for Absent Patients */}
      <AnimatePresence>
        {isAbsent && patient.phone && (
          <motion.a
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            href={`https://wa.me/${formatPhoneForWhatsApp(patient.phone)}?text=${encodeURIComponent(`הי ${patient.firstName}, לא הגעת היום. מה שלומך?`)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="שלח הודעת וואטסאפ"
            className="h-11 w-11 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 flex items-center justify-center transition-all duration-150 active:scale-90 shrink-0"
          >
            <WhatsAppIcon />
          </motion.a>
        )}
      </AnimatePresence>

      {/* Large touch-friendly toggles */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onToggle("absent")}
          aria-label="סמן נעדר"
          title="סמן נעדר"
          className={`h-11 w-14 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-[0.92] ${
            isAbsent
              ? "bg-rose-500 text-white shadow-md"
              : "bg-[var(--foreground)]/5 text-[var(--muted)]/40 hover:text-rose-500 hover:bg-rose-500/8"
          }`}
        >
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <button
          {...presentPress}
          aria-label="סמן נוכח (לחיצה ארוכה: איחור, יציאה מוקדמת, הערה)"
          title="סמן נוכח (לחיצה ארוכה: איחור, יציאה מוקדמת, הערה)"
          className={`h-11 w-14 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-[0.92] ${
            isPresent
              ? "bg-emerald-500 text-white shadow-md"
              : "bg-[var(--foreground)]/5 text-[var(--muted)]/40 hover:text-emerald-500 hover:bg-emerald-500/8"
          }`}
        >
          <Check className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>
    </div>

    {/* One-line note, opened right under the row so the list never jumps to another screen. */}
    <AnimatePresence initial={false}>
      {editingNote && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="px-4 pb-3 space-y-2">
            <input
              autoFocus
              value={draft}
              maxLength={NOTE_MAX}
              enterKeyHint="done"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitNote(draft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNote(draft);
                if (e.key === "Escape") setEditingNote(false);
              }}
              placeholder="הערה קצרה..."
              className="w-full h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--muted)]/50"
            />
            {/* onMouseDown keeps the input focused so the chip applies before blur saves. */}
            <div className="flex flex-wrap gap-1.5">
              {NOTE_CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitNote(c)}
                  className="h-8 px-3 rounded-lg text-xs font-bold border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--foreground)]/5"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </motion.div>
  );
}
