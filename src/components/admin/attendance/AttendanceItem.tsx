"use client";

import { Check, X } from "lucide-react";
import { motion } from "framer-motion";

interface AttendanceItemProps {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
  };
  status: "present" | "absent" | "unset";
  onToggle: (status: "present" | "absent") => void;
}

export function AttendanceItem({ patient, status, onToggle }: AttendanceItemProps) {
  const initials = `${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <motion.div
      layout
      className={`rounded-[2rem] overflow-hidden border-2 transition-colors duration-300 ${
        status === "present"
          ? "border-emerald-500/40 shadow-lg shadow-emerald-500/10"
          : status === "absent"
          ? "border-rose-500/40 shadow-lg shadow-rose-500/10"
          : "border-white/8"
      }`}
    >
      {/* ── Patient info row ── */}
      <div
        className={`flex items-center gap-4 px-5 py-4 transition-colors duration-300 ${
          status === "present"
            ? "bg-emerald-500/8"
            : status === "absent"
            ? "bg-rose-500/8"
            : "bg-white/[0.03]"
        }`}
      >
        {/* Avatar with initials */}
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-xl tracking-tight transition-colors duration-300 ${
            status === "present"
              ? "bg-emerald-500/20 text-emerald-300"
              : status === "absent"
              ? "bg-rose-500/20 text-rose-300"
              : "bg-slate-800 text-slate-500"
          }`}
        >
          {initials}
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <h4 className="font-black text-[17px] tracking-tight leading-tight text-white">
            {patient.firstName} {patient.lastName}
          </h4>
          <p
            className={`text-xs font-bold mt-1 transition-colors duration-300 ${
              status === "present"
                ? "text-emerald-400"
                : status === "absent"
                ? "text-rose-400"
                : "text-slate-600"
            }`}
          >
            {status === "present"
              ? "✓  נוכח היום"
              : status === "absent"
              ? "✗  נפקד"
              : "ממתין לסימון"}
          </p>
        </div>

        {/* Quick-state indicator dot */}
        <div
          className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors duration-300 ${
            status === "present"
              ? "bg-emerald-400 shadow-lg shadow-emerald-400/60"
              : status === "absent"
              ? "bg-rose-400 shadow-lg shadow-rose-400/60"
              : "bg-slate-700"
          }`}
        />
      </div>

      {/* ── Action buttons ── */}
      <div className="flex divide-x divide-white/5 border-t-2 border-white/5">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onToggle("absent")}
          className={`flex-1 py-[18px] flex items-center justify-center gap-2 font-black text-sm transition-colors duration-200 ${
            status === "absent"
              ? "bg-rose-600 text-white"
              : "bg-transparent text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 active:bg-rose-500/20"
          }`}
        >
          <X className={`w-4 h-4 ${status === "absent" ? "opacity-100" : "opacity-60"}`} />
          נפקד
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onToggle("present")}
          className={`flex-1 py-[18px] flex items-center justify-center gap-2 font-black text-sm transition-colors duration-200 ${
            status === "present"
              ? "bg-emerald-600 text-white"
              : "bg-transparent text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-400 active:bg-emerald-500/20"
          }`}
        >
          <Check className={`w-4 h-4 ${status === "present" ? "opacity-100" : "opacity-60"}`} />
          נוכח
        </motion.button>
      </div>
    </motion.div>
  );
}
