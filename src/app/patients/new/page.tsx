"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { PatientForm } from "@/components/patients/PatientForm";
import { Users, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export default function NewPatientPage() {
  const router = useRouter();

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white p-6 md:p-12 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none -mr-40 -mt-40"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none -ml-40 -mb-40"></div>

        <div className="max-w-4xl mx-auto relative z-10">
          <header className="flex items-center gap-4 mb-10">
            <button 
              onClick={() => router.push("/patients")}
              className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Users className="w-8 h-8 text-purple-400" />
                הזנת מטופל חדש
              </h1>
              <p className="text-slate-400 mt-1">מילוי פרטי המטופל לפתיחת תיק במערכת</p>
            </div>
          </header>

          <PatientForm />
        </div>
      </main>
    </RoleGuard>
  );
}
