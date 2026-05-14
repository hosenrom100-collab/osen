"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { PatientForm } from "@/components/patients/PatientForm";
import { Users, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function NewPatientPage() {
  const router = useRouter();

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor"]} redirectTo="/">
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-12 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none -mr-40 -mt-40 transition-opacity"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none -ml-40 -mb-40 transition-opacity"></div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl mx-auto relative z-10"
        >
          <header className="flex items-center gap-6 mb-12">
            <button 
              onClick={() => router.push("/patients")}
              className="w-12 h-12 flex items-center justify-center bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl hover:bg-[var(--foreground)]/10 transition-all active:scale-95"
            >
              <ChevronLeft className="w-6 h-6 rotate-180" />
            </button>
            <div>
              <h1 className="text-3xl font-black tracking-tight flex items-center gap-4">
                <Users className="w-8 h-8 text-emerald-500" />
                יצירת מטופל חדש
              </h1>
              <p className="text-sm font-bold text-[var(--foreground)]/40 uppercase tracking-widest mt-1">פתיחת תיק קליני במערכת חוסן</p>
            </div>
          </header>

          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[3rem] p-8 md:p-12 shadow-2xl shadow-black/20">
            <PatientForm />
          </div>
        </motion.div>
      </main>
    </RoleGuard>
  );
}
