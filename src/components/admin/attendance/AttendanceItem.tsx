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
    <div className="bg-white border-b border-slate-50 last:border-0 p-3 flex items-center gap-3 transition-all active:bg-slate-50">
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-[10px] text-white transition-all ${
        isPending ? "bg-slate-100 !text-slate-300" : avatarColor(patient.firstName)
      }`}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-black text-[13px] text-slate-900 truncate">
          {patient.firstName} {patient.lastName}
        </p>
        <p className={`text-[9px] font-black uppercase tracking-widest ${
          isPresent ? "text-emerald-600" :
          isAbsent  ? "text-rose-600" :
          "text-slate-400"
        }`}>
          {isPresent ? "נוכח" : isAbsent ? "נעדר" : "ממתין לדיווח"}
        </p>
      </div>

      {/* Modern Compact Toggles */}
      <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-2xl border border-slate-100/50">
        <button
          onClick={() => onToggle("absent")}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            isAbsent 
              ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20" 
              : "text-slate-400 hover:text-rose-500"
          }`}
        >
          <X className="w-4 h-4" />
        </button>

        <button
          onClick={() => onToggle("present")}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            isPresent 
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
              : "text-slate-400 hover:text-emerald-500"
          }`}
        >
          <Check className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
