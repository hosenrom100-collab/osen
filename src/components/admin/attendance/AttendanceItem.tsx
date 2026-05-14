"use client";

import { Check, X } from "lucide-react";
import { motion } from "framer-motion";

interface AttendanceItemProps {
  patient: { id: string; firstName: string; lastName: string };
  status: "present" | "absent" | "unset";
  onToggle: (status: "present" | "absent") => void;
}

const COLORS = ["bg-blue-600","bg-violet-600","bg-rose-600","bg-amber-600","bg-teal-600","bg-indigo-600"];
const avatarColor = (name: string) => COLORS[name.charCodeAt(0) % COLORS.length];

export function AttendanceItem({ patient, status, onToggle }: AttendanceItemProps) {
  const initials = `${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase();
  const isPresent = status === "present";
  const isAbsent  = status === "absent";
  const isPending = status === "unset";

  return (
    <div className={`rounded-2xl overflow-hidden transition-all duration-200 ${
      isPresent ? "ring-1 ring-emerald-500/40 shadow-lg shadow-emerald-500/5" :
      isAbsent  ? "ring-1 ring-rose-500/40 shadow-lg shadow-rose-500/5" :
      "ring-1 ring-white/8"
    }`}>
      {/* Patient row */}
      <div className={`flex items-center gap-4 px-4 py-3.5 transition-colors duration-200 ${
        isPresent ? "bg-emerald-500/6" :
        isAbsent  ? "bg-rose-500/6" :
        "bg-white/[0.03]"
      }`}>
        {/* Avatar */}
        <div className={`w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-base text-white ${
          isPending ? "bg-slate-800" : avatarColor(patient.firstName)
        }`}>
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[16px] leading-tight text-white truncate">
            {patient.firstName} {patient.lastName}
          </p>
          <p className={`text-[11px] font-semibold mt-0.5 ${
            isPresent ? "text-emerald-400" :
            isAbsent  ? "text-rose-400" :
            "text-slate-600"
          }`}>
            {isPresent ? "נוכח היום" : isAbsent ? "נפקד" : "טרם נסמן"}
          </p>
        </div>

        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          isPresent ? "bg-emerald-400 shadow shadow-emerald-400/80" :
          isAbsent  ? "bg-rose-400 shadow shadow-rose-400/80" :
          "bg-slate-700"
        }`} />
      </div>

      {/* Action buttons */}
      <div className="flex">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onToggle("absent")}
          className={`flex-1 h-12 flex items-center justify-center gap-2 text-sm font-black transition-colors duration-150 border-t border-white/5 ${
            isAbsent
              ? "bg-rose-600 text-white"
              : "bg-transparent text-slate-500 hover:text-rose-400 hover:bg-rose-500/8 active:bg-rose-500/15"
          }`}
        >
          <X className="w-4 h-4" />
          נפקד
        </motion.button>

        <div className="w-px bg-white/5" />

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onToggle("present")}
          className={`flex-1 h-12 flex items-center justify-center gap-2 text-sm font-black transition-colors duration-150 border-t border-white/5 ${
            isPresent
              ? "bg-emerald-600 text-white"
              : "bg-transparent text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/8 active:bg-emerald-500/15"
          }`}
        >
          <Check className="w-4 h-4" />
          נוכח
        </motion.button>
      </div>
    </div>
  );
}
