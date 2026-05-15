"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { Loader2, AlertCircle, Users } from "lucide-react";

export default function ParticipantJoinPage() {
  const { user, status, role } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (user && role === "participant" && status === "approved") router.push("/portal");
    else if (user && role && role !== "participant") router.push("/");
  }, [user, status, role, router]);

  const handleJoin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result   = await signInWithPopup(auth, provider);
      const uid      = result.user.uid;

      const userRef = doc(db, "users", uid);
      const snap    = await getDoc(userRef);

      if (!snap.exists()) {
        await setDoc(userRef, {
          email:               result.user.email ?? "",
          name:                result.user.displayName ?? "",
          role:                "participant",
          status:              "approved",
          onboardingComplete:  false,
          createdAt:           serverTimestamp(),
          assignedGroups:      [],
          preferredProgramIds: [],
          fcmTokens:           [],
          notificationsEnabled: false,
        });

        // Notify admins and managers
        try {
          fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: ["admin", "manager"],
              title: "משתתף חדש הצטרף",
              body: `${result.user.displayName || result.user.email} הצטרף למערכת כמשתתף.`,
              link: "/admin/users"
            })
          });
        } catch (e) {
          console.error("Notify failed:", e);
        }
      }
      // AuthContext will pick up the new document via onSnapshot
      router.push("/portal");
    } catch (e: any) {
      if (!e?.code?.includes("popup-closed")) {
        setError("שגיאה בהתחברות. נסה/י שנית.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="flex flex-col items-center justify-center min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[var(--primary)]/6 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-teal-500/4 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-sm"
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 mb-4">
            <Users className="w-6 h-6 text-teal-400" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">פורטל משתתפים</h1>
          <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-widest mt-1">מרכז חוסן — חוות רום</p>
        </div>

        {/* Card */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] p-8 shadow-2xl shadow-black/10 space-y-6">

          <div className="text-center space-y-1.5">
            <h2 className="text-lg font-black">הצטרף/י כמשתתף/ת</h2>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              ההרשמה אוטומטית ומיידית.<br />לאחר הכניסה תשובץ/י לתוכנית וקבוצה.
            </p>
          </div>

          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-[var(--foreground)] text-[var(--background)] font-black py-4 px-6 rounded-2xl hover:opacity-90 active:scale-[0.98] transition-all shadow-xl shadow-[var(--foreground)]/10 disabled:opacity-60 text-sm uppercase tracking-widest"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity=".8"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity=".6"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity=".7"/>
              </svg>
            )}
            {loading ? "מתחבר/ת..." : "הצטרפות עם Google"}
          </button>

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="text-center border-t border-[var(--border)] pt-4">
            <button
              onClick={() => router.push("/login")}
              className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors font-medium"
            >
              אנשי צוות — כניסה כאן
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
