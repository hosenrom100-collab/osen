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
    <motion.div 
      layout
      className={`rounded-[2rem] overflow-hidden border transition-all duration-300 ${
        isPresent ? "border-emerald-500/30 bg-emerald-500/5 shadow-lg shadow-emerald-500/5" :
        isAbsent  ? "border-rose-500/30 bg-rose-500/5 shadow-lg shadow-rose-500/5" :
        "border-[var(--border)] bg-[var(--foreground)]/[0.02]"
      }`}
    >
      <div className="flex flex-col">
        {/* Main Info Area */}
        <div className="flex items-center gap-4 p-5">
          {/* Avatar */}
          <div className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-sm text-white/90 shadow-xl transition-all ${
            isPending ? "bg-[var(--foreground)]/10" : avatarColor(patient.firstName)
          }`}>
            {initials}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-[var(--foreground)] truncate">
              {patient.firstName} {patient.lastName}
            </p>
            <p className={`text-[10px] font-black uppercase tracking-widest mt-1 transition-colors ${
              isPresent ? "text-emerald-500" :
              isAbsent  ? "text-rose-500" :
              "text-[var(--foreground)]/30"
            }`}>
              {isPresent ? "נוכח" : isAbsent ? "נעדר" : "טרם סומן"}
            </p>
          </div>

          {/* Status Indicator */}
          <div className={`w-3 h-3 rounded-full flex-shrink-0 transition-all border-2 border-[var(--background)] ${
            isPresent ? "bg-emerald-500" :
            isAbsent  ? "bg-rose-500" :
            "bg-[var(--foreground)]/10"
          }`} />
        </div>

        {/* Action buttons */}
        <div className="flex border-t border-[var(--border)]">
          <button
            onClick={() => onToggle("absent")}
            className={`flex-1 h-12 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
              isAbsent
                ? "bg-rose-600 text-white"
                : "text-[var(--foreground)]/30 hover:text-rose-500 hover:bg-rose-500/5"
            }`}
          >
            <X className="w-3.5 h-3.5" />
            נעדר
          </button>

          <div className="w-px bg-[var(--border)]" />

          <button
            onClick={() => onToggle("present")}
            className={`flex-1 h-12 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
              isPresent
                ? "bg-emerald-600 text-white"
                : "text-[var(--foreground)]/30 hover:text-emerald-500 hover:bg-emerald-500/5"
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            נוכח
          </button>
        </div>
      </div>
    </motion.div>
  );
}
