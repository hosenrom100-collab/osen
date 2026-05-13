"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { ClipboardList, Users, ArrowRight, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function AttendanceGatePage() {
  const router = useRouter();

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "employee"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center justify-center">
        <div className="max-w-2xl w-full">
          <header className="text-center mb-12">
            <h1 className="text-3xl font-bold mb-2">יומן נוכחות</h1>
            <p className="text-slate-400">בחר את סוג הנוכחות שברצונך לסמן</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push("/admin/patient-attendance")}
              className="group bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-3xl text-center hover:bg-emerald-500/20 transition-all"
            >
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-emerald-400 mb-2">נוכחות מטופלים</h3>
              <p className="text-slate-400 text-xs">סימון יומיומי למטופלים</p>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push("/admin/staff-attendance")}
              className="group bg-orange-500/10 border border-orange-500/20 p-8 rounded-3xl text-center hover:bg-orange-500/20 transition-all"
            >
              <div className="w-16 h-16 bg-orange-500/20 text-orange-400 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <ClipboardList className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-orange-400 mb-2">נוכחות צוות</h3>
              <p className="text-slate-400 text-xs">מעקב שעות עבודה</p>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push("/attendance/log")}
              className="group bg-blue-500/10 border border-blue-500/20 p-8 rounded-3xl text-center hover:bg-blue-500/20 transition-all"
            >
              <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <Calendar className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-blue-400 mb-2">יומן היסטורי</h3>
              <p className="text-slate-400 text-xs">צפייה ברישומים קודמים</p>
            </motion.button>
          </div>

          <button
            onClick={() => router.push("/admin")}
            className="mt-12 flex items-center gap-2 text-slate-500 hover:text-white mx-auto transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            חזרה לתפריט הניהול
          </button>
        </div>
      </main>
    </RoleGuard>
  );
}
