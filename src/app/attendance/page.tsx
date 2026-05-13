"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { ClipboardList, Users, ArrowRight, History, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { he } from "date-fns/locale";

export default function AttendanceGatePage() {
  const { isAdmin, role } = useAuth();
  const router = useRouter();
  const today = format(new Date(), "EEEE, d בMMMM", { locale: he });
  const isManager = isAdmin || role === "manager";

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "employee", "social_worker", "logistics"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white flex flex-col p-4 pb-28">
        {/* Header */}
        <header className="flex items-center gap-3 pt-4 mb-8">
          <button
            onClick={() => router.push("/")}
            className="p-2.5 bg-white/5 border border-white/10 rounded-2xl active:scale-95 transition-all"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">יומן נוכחות</h1>
            <p className="text-slate-500 text-[11px] font-bold mt-0.5 capitalize">{today}</p>
          </div>
        </header>

        {/* Main Options */}
        <div className="flex flex-col gap-4 flex-1">
          {/* Patient Attendance - Primary CTA */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/admin/patient-attendance")}
            className="relative bg-emerald-600/15 border-2 border-emerald-500/40 rounded-[2.5rem] p-8 text-right overflow-hidden active:bg-emerald-600/25 transition-all group flex-1 min-h-[160px] flex flex-col justify-between"
          >
            {/* Glow */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none" />

            <div className="flex items-start justify-between">
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center group-active:scale-95 transition-transform">
                <Users className="w-7 h-7" />
              </div>
              <ChevronLeft className="w-5 h-5 text-emerald-500/50 mt-1" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-emerald-400 mb-1">נוכחות מטופלים</h2>
              <p className="text-emerald-500/70 text-xs font-bold">סימון נוכחות יומי לכל מטופל</p>
            </div>
          </motion.button>

          {/* Staff Attendance - Secondary */}
          {isManager && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push("/admin/staff-attendance")}
              className="relative bg-orange-600/10 border-2 border-orange-500/30 rounded-[2.5rem] p-7 text-right overflow-hidden active:bg-orange-600/20 transition-all group min-h-[120px] flex flex-col justify-between"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/8 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none" />

              <div className="flex items-start justify-between">
                <div className="w-12 h-12 bg-orange-500/20 text-orange-400 rounded-2xl flex items-center justify-center group-active:scale-95 transition-transform">
                  <ClipboardList className="w-6 h-6" />
                </div>
                <ChevronLeft className="w-5 h-5 text-orange-500/50 mt-1" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-orange-400 mb-0.5">נוכחות צוות</h2>
                <p className="text-orange-500/60 text-xs font-bold">מעקב שעות עבודה ועובדים</p>
              </div>
            </motion.button>
          )}

          {/* History - Tertiary */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/attendance/log")}
            className="bg-white/5 border border-white/10 rounded-[2.5rem] p-5 text-right flex items-center gap-4 active:bg-white/10 transition-all group"
          >
            <div className="w-11 h-11 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center flex-shrink-0 group-active:scale-95 transition-transform">
              <History className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm">יומן היסטורי</h3>
              <p className="text-slate-500 text-xs mt-0.5">צפייה ברישומים קודמים</p>
            </div>
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </motion.button>
        </div>
      </main>
    </RoleGuard>
  );
}
