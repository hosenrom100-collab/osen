"use client";

import { User, Check, X } from "lucide-react";
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
  return (
    <div className="bg-white/5 border border-white/5 p-5 rounded-[2rem] flex flex-col gap-5 shadow-sm active:bg-white/[0.07] transition-all duration-300">
      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-inner ${
          status === "present" ? "bg-emerald-500/20 text-emerald-400" : 
          status === "absent" ? "bg-rose-500/20 text-rose-400" : 
          "bg-slate-900 text-slate-700"
        }`}>
          <User className="w-7 h-7" />
        </div>
        <div className="flex-1">
          <h4 className="font-black text-base tracking-tight text-white/90">{patient.firstName} {patient.lastName}</h4>
          <p className={`text-[11px] font-black uppercase tracking-wider mt-1 ${
            status === "present" ? "text-emerald-500" : 
            status === "absent" ? "text-rose-500" : 
            "text-slate-600"
          }`}>
            {status === "unset" ? "ממתין לסימון" : status === "present" ? "נוכח היום" : "נפקד / לא הגיע"}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => onToggle("absent")}
          className={`flex-1 py-4 rounded-2xl border-2 flex items-center justify-center gap-3 font-black text-sm transition-all duration-300 ${
            status === "absent" 
              ? "bg-rose-600 border-rose-500 text-white shadow-xl shadow-rose-600/30" 
              : "bg-white/5 border-white/10 text-slate-500"
          }`}
        >
          <X className={`w-5 h-5 ${status === "absent" ? "animate-pulse" : ""}`} />
          נפקד
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => onToggle("present")}
          className={`flex-1 py-4 rounded-2xl border-2 flex items-center justify-center gap-3 font-black text-sm transition-all duration-300 ${
            status === "present" 
              ? "bg-emerald-600 border-emerald-400 text-white shadow-xl shadow-emerald-600/30" 
              : "bg-white/5 border-white/10 text-slate-500"
          }`}
        >
          <Check className={`w-5 h-5 ${status === "present" ? "animate-pulse" : ""}`} />
          נוכח
        </motion.button>
      </div>
    </div>
  );
}
