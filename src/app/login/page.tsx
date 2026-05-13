"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const { user, login, isWhitelisted, status, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && isWhitelisted) {
      router.push("/");
    } else if (user && !isWhitelisted) {
      if (status === "pending") {
        setError("בקשתך לכניסה למערכת התקבלה וממתינה לאישור מנהל. אנא נסה שוב מאוחר יותר.");
      } else if (status === "blocked") {
        setError("גישתך למערכת חסומה. אנא פנה למנהל המערכת.");
      } else {
        setError("אין לך הרשאה לגשת למערכת. פנה למנהל המערכת להוספתך.");
      }
    }
  }, [user, isWhitelisted, status, router]);

  const handleLogin = async () => {
    setError(null);
    await login();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 overflow-hidden relative">
      {/* Background Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl relative z-10"
      >
        <div className="text-center mb-8">
          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent mb-2"
          >
            חוסן-קונקט
          </motion.h1>
          <p className="text-slate-400 text-lg">מרכז ניהול קהילתי חכם</p>
        </div>

        <div className="space-y-6">
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white text-slate-950 font-bold py-4 px-6 rounded-2xl hover:bg-slate-200 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-white/5"
          >
            <LogIn className="w-5 h-5" />
            התחבר באמצעות Google
          </button>

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center leading-relaxed"
            >
              {error}
            </motion.div>
          )}

          <div className="text-center">
            <p className="text-xs text-slate-500">
              הכניסה למערכת מורשית לאנשי צוות בלבד
            </p>
          </div>
        </div>
      </motion.div>

      {/* Version Tag */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest text-slate-600 font-medium">
        Hosen Connect v1.0.0
      </div>
    </div>
  );
}
