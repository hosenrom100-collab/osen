"use client";

import { useEffect, useState } from "react";
import { messaging } from "@/lib/firebase/config";
import { getToken, onMessage } from "firebase/messaging";
import { useAuth } from "@/context/AuthContext";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ToastMessage {
  id: number;
  title: string;
  body: string;
  link?: string;
  receivedAt: string;
  read: boolean;
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
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast?.id]);

  const setupFCM = async () => {
    try {
      const instance = await messaging();
      if (!instance) return;

      const token = await getToken(instance, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
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
          read: false
        };

        setToast(newNotif);

        // Save to local inbox
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
    const result = await Notification.requestPermission();
    setPermission(result);
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
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            className="fixed top-3 inset-x-3 z-[200] max-w-sm mx-auto"
          >
            <div
              className="bg-slate-900/95 backdrop-blur-xl border border-white/15 rounded-3xl p-4 shadow-2xl shadow-black/60 flex items-start gap-3 cursor-pointer active:scale-[0.98] transition-transform"
              onClick={() => { setToast(null); if (toast.link) window.location.href = toast.link; }}
            >
              <div className="w-9 h-9 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-white leading-tight">{toast.title}</p>
                {toast.body && (
                  <p className="text-slate-400 text-xs mt-0.5 leading-relaxed line-clamp-2">{toast.body}</p>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setToast(null); }}
                className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0 mt-0.5 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Progress bar */}
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 5, ease: "linear" }}
              style={{ transformOrigin: "right" }}
              className="h-0.5 bg-blue-500/50 rounded-full mx-4 -mt-0.5"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Permission request prompt ─── */}
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.97 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            className="fixed bottom-24 inset-x-4 z-[100] max-w-sm mx-auto"
          >
            <div className="bg-slate-900 border border-white/15 rounded-[2rem] p-5 shadow-2xl shadow-black/70">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-white text-sm">הפעל התראות</h4>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                    קבל עדכונים מיידיים על נוכחות, קניות ושינויים בלו״ז.
                  </p>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={requestPermission}
                      className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-2xl text-xs active:scale-95 transition-all shadow-lg shadow-blue-600/30"
                    >
                      הפעל
                    </button>
                    <button
                      onClick={dismissPrompt}
                      className="px-4 bg-white/5 text-slate-400 font-bold py-2.5 rounded-2xl text-xs hover:bg-white/10 transition-all"
                    >
                      לא עכשיו
                    </button>
                  </div>
                </div>
                <button onClick={dismissPrompt} className="text-slate-600 hover:text-slate-400 transition-colors mt-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
