"use client";

import { useEffect, useState } from "react";
import { messaging } from "@/lib/firebase/config";
import { getToken, onMessage } from "firebase/messaging";
import { useAuth } from "@/context/AuthContext";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Bell, X, Info, CheckCircle2, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ToastMessage {
  id: number;
  title: string;
  body: string;
  link?: string;
  receivedAt: string;
  read: boolean;
  senderName?: string;
}

export function PushNotificationManager() {
  const { user, isWhitelisted } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [showPrompt, setShowPrompt] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Show permission prompt once per session (not on every page load)
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const currentPerm = Notification.permission;
    setPermission(currentPerm);

    if (currentPerm === "default" && user && isWhitelisted) {
      const alreadyAsked = sessionStorage.getItem("push_prompt_shown");
      if (!alreadyAsked) {
        const t = setTimeout(() => setShowPrompt(true), 4000);
        return () => clearTimeout(t);
      }
    }
  }, [user, isWhitelisted]);

  // Setup FCM once permission is granted
  useEffect(() => {
    if (permission === "granted" && user) {
      setupFCM();
    }
  }, [permission, user]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000); // Longer duration for readability
    return () => clearTimeout(t);
  }, [toast?.id]);

  const setupFCM = async () => {
    try {
      const instance = await messaging();
      if (!instance) return;

      let registration;
      if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        console.log("[FCM] Service Worker registered:", registration.scope);
      }

      const token = await getToken(instance, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (token) {
        await updateDoc(doc(db, "users", user!.uid), {
          fcmTokens: arrayUnion(token),
          notificationsEnabled: true,
          lastTokenUpdate: new Date(),
        });
      }

      // Show in-app banner for foreground messages
      onMessage(instance, (payload) => {
        const title = payload.notification?.title || "הודעה חדשה";
        const body  = payload.notification?.body  || "";
        const link  = (payload.fcmOptions?.link    || payload.data?.link) as string | undefined;
        
        const newNotif: ToastMessage = {
          id: Date.now(),
          title,
          body,
          link,
          receivedAt: new Date().toISOString(),
          read: false,
          senderName: payload.data?.senderName as string | undefined
        };

        setToast(newNotif);

        // Save to local inbox for persistence
        try {
          const saved = localStorage.getItem("hosen_inbox");
          const inbox: ToastMessage[] = saved ? JSON.parse(saved) : [];
          localStorage.setItem("hosen_inbox", JSON.stringify([newNotif, ...inbox].slice(0, 50)));
          // Dispatch custom event for the notifications page to pick up
          window.dispatchEvent(new Event("hosen_new_notification"));
        } catch (e) {
          console.error("Inbox save error:", e);
        }
      });
    } catch (err) {
      console.error("FCM setup error:", err);
    }
  };

  const requestPermission = async () => {
    dismissPrompt();
    if (!("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch (e) {
      console.error("Permission request error:", e);
    }
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
    sessionStorage.setItem("push_prompt_shown", "1");
  };

  return (
    <>
      {/* ─── Foreground message toast ─── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.9, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -20, scale: 0.9, filter: "blur(10px)" }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="fixed top-4 inset-x-4 z-[200] max-w-sm mx-auto"
            dir="rtl"
          >
            <div
              className="bg-emerald-500/10 backdrop-blur-3xl border border-emerald-500/40 rounded-[2rem] p-5 shadow-2xl shadow-emerald-950/10 flex items-start gap-4 cursor-pointer active:scale-[0.98] transition-all group"
              onClick={() => { setToast(null); if (toast.link) window.location.href = toast.link; }}
            >
              <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                <Bell className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-black text-sm text-emerald-900 leading-tight truncate">{toast.title}</p>
                  {toast.senderName && (
                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/10 shrink-0">
                      מאת: {toast.senderName}
                    </span>
                  )}
                </div>
                {toast.body && (
                  <p className="text-emerald-800/70 text-[11px] leading-relaxed line-clamp-2 font-bold">{toast.body}</p>
                )}
                {toast.link && (
                  <div className="flex items-center gap-1 text-emerald-600 text-[10px] font-black mt-2 uppercase tracking-widest">
                    לחץ למעבר <ChevronLeft className="w-3 h-3" />
                  </div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setToast(null); }}
                className="text-emerald-500/30 hover:text-emerald-500 transition-colors flex-shrink-0 mt-0.5 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Elegant progress indicator */}
            <div className="absolute bottom-1.5 inset-x-8 h-1 bg-white/5 rounded-full overflow-hidden">
               <motion.div
                 initial={{ width: "100%" }}
                 animate={{ width: "0%" }}
                 transition={{ duration: 8, ease: "linear" }}
                 className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
               />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Permission request prompt ─── */}
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed bottom-24 inset-x-4 z-[100] max-w-md mx-auto"
            dir="rtl"
          >
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-8 shadow-2xl shadow-black/40 relative overflow-hidden">
              {/* Abstract decorative background */}
              <div className="absolute -top-12 -left-12 w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full" />
              <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
              
              <div className="relative flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-600 rounded-3xl flex items-center justify-center flex-shrink-0 border border-emerald-500/20 shadow-inner">
                  <Bell className="w-8 h-8" />
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-black text-[var(--foreground)] text-xl tracking-tight">הישאר מעודכן בזמן אמת</h4>
                  <p className="text-[var(--muted)] text-sm leading-relaxed max-w-[280px] mx-auto font-medium">
                    קבל התראות מיידיות על שינויי לו״ז, בקשות קניות ועדכוני צוות חשובים.
                  </p>
                </div>

                <div className="flex flex-col w-full gap-3 mt-2">
                  <button
                    onClick={requestPermission}
                    className="w-full bg-emerald-500 text-white font-black py-4 rounded-2xl text-sm active:scale-[0.98] transition-all shadow-xl shadow-emerald-500/20 hover:bg-emerald-600"
                  >
                    הפעל התראות
                  </button>
                  <button
                    onClick={dismissPrompt}
                    className="w-full bg-[var(--foreground)]/5 text-[var(--muted)] font-bold py-4 rounded-2xl text-sm hover:bg-[var(--foreground)]/10 transition-all"
                  >
                    אולי מאוחר יותר
                  </button>
                </div>
                
                <button 
                  onClick={dismissPrompt} 
                  className="absolute top-0 left-0 p-2 text-[var(--muted)]/30 hover:text-[var(--muted)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
