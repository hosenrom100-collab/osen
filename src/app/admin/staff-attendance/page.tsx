"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { ClipboardList, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export default function StaffAttendancePage() {
  const router = useRouter();

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white p-6">
        <header className="flex items-center gap-4 mb-10">
          <button 
            onClick={() => router.push("/admin")}
            className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <ClipboardList className="w-6 h-6 text-orange-400" />
              נוכחות צוות
            </h1>
            <p className="text-slate-400 text-sm">מעקב נוכחות ושעות עבודה של הצוות</p>
          </div>
        </header>

        <div className="flex flex-col items-center justify-center py-20 bg-white/5 border border-white/10 border-dashed rounded-3xl">
          <p className="text-slate-500">דף נוכחות צוות נמצא בפיתוח</p>
        </div>
      </main>
    </RoleGuard>
  );
}
