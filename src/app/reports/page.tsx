"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";

export default function ReportsPlaceholder() {
  const router = useRouter();
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-12 flex flex-col items-center justify-center text-center">
      <div className="w-20 h-20 bg-rose-500/10 text-rose-400 rounded-3xl flex items-center justify-center mb-8">
        <FileText className="w-10 h-10" />
      </div>
      <h1 className="text-3xl font-bold mb-4">טפסים ודוחות</h1>
      <p className="text-slate-400 mb-8 max-w-md">מודול הטפסים והדוחות נמצא בפיתוח. בקרוב תוכלו להפיק סיכומים וייצוא נתונים.</p>
      <button 
        onClick={() => router.push("/")}
        className="flex items-center gap-2 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl hover:bg-white/10 transition-all"
      >
        <ArrowRight className="w-5 h-5" /> חזרה לדאשבורד
      </button>
    </main>
  );
}
