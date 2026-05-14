"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogIn, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const { user, login, isWhitelisted, status, loading } = useAuth();
  const router = useRouter();
  const [error,      setError]      = useState<string | null>(null);
  const [signingIn,  setSigningIn]  = useState(false);

  useEffect(() => {
    if (user && isWhitelisted) {
      router.push("/");
    } else if (user && !isWhitelisted) {
      if (status === "pending") {
        setError("בקשתך לכניסה התקבלה וממתינה לאישור מנהל.");
      } else if (status === "blocked") {
        setError("גישתך חסומה. פנה למנהל המערכת.");
      } else {
        setError("אין לך הרשאה לגשת למערכת. פנה למנהל.");
      }
    }
  }, [user, isWhitelisted, status, router]);

  const handleLogin = async () => {
    setError(null);
    setSigningIn(true);
    try { await login(); } finally { setSigningIn(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--background)]" role="status" aria-label="טוען">
        <div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--primary)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="flex flex-col items-center justify-center min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4"
    >
      {/* Subtle ambient glow — doesn't fight readability */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[var(--primary)]/6 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-violet-500/5 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-sm"
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 mb-4">
            <span className="text-xl font-black text-[var(--primary)]">H</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">מרכז חוסן</h1>
          <p className="text-sm text-[var(--muted)] mt-1">חוות רום</p>
        </div>

        {/* Card */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-xl shadow-black/10">

          <button
            onClick={handleLogin}
            disabled={signingIn}
            aria-label="התחבר באמצעות Google"
            className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3 px-5 rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {signingIn ? (
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" aria-hidden />
            ) : (
              // Google G icon
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {signingIn ? "מתחבר..." : "כניסה עם Google"}
          </button>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 overflow-hidden"
                role="alert"
              >
                <div className="flex items-start gap-2.5 p-3 bg-rose-500/8 border border-rose-500/15 rounded-xl text-rose-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  <span>{error}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-center text-[10px] text-[var(--muted)] mt-4 leading-relaxed">
            הכניסה מורשית לאנשי צוות בלבד
          </p>
        </div>
      </motion.div>

      <p className="absolute bottom-6 text-[10px] text-[var(--muted)] tracking-widest uppercase">
        Hosen Connect
      </p>
    </div>
  );
}
