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
    <div className="bg-white/5 border border-white/5 p-4 rounded-[1.5rem] flex items-center justify-between group active:bg-white/10 transition-all duration-300">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-inner ${
          status === "present" ? "bg-emerald-500/20 text-emerald-400" : 
          status === "absent" ? "bg-rose-500/20 text-rose-400" : 
          "bg-slate-900 text-slate-700"
        }`}>
          <User className="w-6 h-6" />
        </div>
        <div>
          <h4 className="font-bold text-sm tracking-tight">{patient.firstName} {patient.lastName}</h4>
          <p className="text-[10px] text-slate-600 font-medium">
            {status === "unset" ? "טרם סומן" : status === "present" ? "נוכח היום" : "נפקד היום"}
          </p>
        </div>
      </div>

      <div className="flex gap-2.5">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => onToggle("absent")}
          className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-all duration-300 ${
            status === "absent" 
              ? "bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/20" 
              : "bg-white/5 border-white/10 text-slate-600 hover:border-rose-500/30"
          }`}
        >
          <X className="w-5 h-5" />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => onToggle("present")}
          className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-all duration-300 ${
            status === "present" 
              ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/20" 
              : "bg-white/5 border-white/10 text-slate-600 hover:border-emerald-500/30"
          }`}
        >
          <Check className="w-6 h-6" />
        </motion.button>
      </div>
    </div>
  );
}
