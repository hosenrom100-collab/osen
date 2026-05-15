"use client";

import { Check, X } from "lucide-react";
import { motion } from "framer-motion";

interface AttendanceItemProps {
  patient: { id: string; firstName: string; lastName: string };
  status: "present" | "absent" | "unset";
  onToggle: (status: "present" | "absent") => void;
}

export function AttendanceItem({ patient, status, onToggle }: AttendanceItemProps) {
  const initials = `${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase();
  const isPresent = status === "present";
  const isAbsent  = status === "absent";

  return (
    <motion.div
      layout
      className={`flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0 transition-colors duration-150 select-none ${
        isPresent ? "bg-emerald-500/[0.04]" :
        isAbsent  ? "bg-rose-500/[0.04]" : ""
      }`}
    >
      {/* Status strip */}
      <div className={`w-1 self-stretch rounded-full shrink-0 transition-all duration-200 ${
        isPresent ? "bg-emerald-500" :
        isAbsent  ? "bg-rose-500" :
        "bg-[var(--border)]"
      }`} />

      {/* Avatar */}
      <div className={`w-11 h-11 rounded-2xl shrink-0 flex items-center justify-center font-black text-sm transition-all duration-200 ${
        isPresent ? "bg-emerald-500/15 text-emerald-500" :
        isAbsent  ? "bg-rose-500/15 text-rose-500" :
        "bg-[var(--foreground)]/5 text-[var(--muted)]/40"
      }`}>
        {initials}
      </div>

      {/* Name + status label */}
      <div className="flex-1 min-w-0">
        <p className="font-black text-sm text-[var(--foreground)] leading-tight truncate">
          {patient.firstName} {patient.lastName}
        </p>
        <p className={`text-[10px] font-bold mt-0.5 transition-colors ${
          isPresent ? "text-emerald-500" :
          isAbsent  ? "text-rose-400" :
          "text-[var(--muted)]/50"
        }`}>
          {isPresent ? "נוכח" : isAbsent ? "נעדר" : "ממתין"}
        </p>
      </div>

      {/* Large touch-friendly toggles */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onToggle("absent")}
          aria-label="סמן נעדר"
          className={`h-11 w-14 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-[0.92] ${
            isAbsent
              ? "bg-rose-500 text-white shadow-md shadow-rose-500/30"
              : "bg-[var(--foreground)]/5 text-[var(--muted)]/40 hover:text-rose-500 hover:bg-rose-500/8"
          }`}
        >
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <button
          onClick={() => onToggle("present")}
          aria-label="סמן נוכח"
          className={`h-11 w-14 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-[0.92] ${
            isPresent
              ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
              : "bg-[var(--foreground)]/5 text-[var(--muted)]/40 hover:text-emerald-500 hover:bg-emerald-500/8"
          }`}
        >
          <Check className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>
    </motion.div>
  );
}
