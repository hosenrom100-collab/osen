"use client";

import { Check, X } from "lucide-react";
import { motion } from "framer-motion";

interface AttendanceItemProps {
  patient: { id: string; firstName: string; lastName: string };
  status: "present" | "absent" | "unset";
  onToggle: (status: "present" | "absent") => void;
}

const COLORS = ["bg-blue-500","bg-violet-500","bg-rose-500","bg-amber-500","bg-teal-500","bg-indigo-500"];
const avatarColor = (name: string) => COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length];

export function AttendanceItem({ patient, status, onToggle }: AttendanceItemProps) {
  const initials = `${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase();
  const isPresent = status === "present";
  const isAbsent  = status === "absent";
  const isPending = status === "unset";

  return (
    <div className="bg-[var(--surface)] border-b border-[var(--border-subtle)] last:border-0 p-3 flex items-center gap-3 transition-all active:bg-[var(--foreground)]/5">
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-[10px] text-white transition-all ${
        isPending ? "bg-[var(--foreground)]/5 !text-[var(--muted)]" : avatarColor(patient.firstName)
      }`}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-black text-[13px] text-[var(--foreground)] truncate">
          {patient.firstName} {patient.lastName}
        </p>
        <p className={`text-[9px] font-black uppercase tracking-widest ${
          isPresent ? "text-emerald-500" :
          isAbsent  ? "text-rose-500" :
          "text-[var(--muted)]"
        }`}>
          {isPresent ? "נוכח" : isAbsent ? "נעדר" : "ממתין לדיווח"}
        </p>
      </div>

      {/* Modern Compact Toggles */}
      <div className="flex items-center gap-1 bg-[var(--foreground)]/5 p-1 rounded-2xl border border-[var(--border)]">
        <button
          onClick={() => onToggle("absent")}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            isAbsent 
              ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20" 
              : "text-[var(--muted)] hover:text-rose-500"
          }`}
        >
          <X className="w-4 h-4" />
        </button>

        <button
          onClick={() => onToggle("present")}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            isPresent 
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
              : "text-[var(--muted)] hover:text-emerald-500"
          }`}
        >
          <Check className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
