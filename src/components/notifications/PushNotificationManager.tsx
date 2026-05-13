"use client";

import { useEffect, useState } from "react";
import { messaging } from "@/lib/firebase/config";
import { getToken, onMessage } from "firebase/messaging";
import { useAuth } from "@/context/AuthContext";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Bell, BellOff, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function PushNotificationManager() {
  const { user, isWhitelisted } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [token, setToken] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
      
      // If permission is default, show a custom prompt after a delay
      if (Notification.permission === "default" && user && isWhitelisted) {
        const timer = setTimeout(() => setShowPrompt(true), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [user, isWhitelisted]);

  useEffect(() => {
    if (permission === "granted" && user) {
      setupNotifications();
    }
  }, [permission, user]);

  const setupNotifications = async () => {
    try {
      const messagingInstance = await messaging();
      if (!messagingInstance) return;

      const currentToken = await getToken(messagingInstance, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
      });

      if (currentToken) {
        setToken(currentToken);
        // Save token to user document
        await updateDoc(doc(db, "users", user!.uid), {
          fcmTokens: arrayUnion(currentToken),
          notificationsEnabled: true,
          lastTokenUpdate: new Date()
        });
        console.log("FCM Token saved:", currentToken);
      }

      // Handle foreground messages
      onMessage(messagingInstance, (payload) => {
        console.log("Foreground message received:", payload);
        // You could show a custom toast here
        new Notification(payload.notification?.title || "הודעה חדשה", {
          body: payload.notification?.body,
          icon: "/favicon.ico"
        });
      });

    } catch (error) {
      console.error("Error setting up notifications:", error);
    }
  };

  const requestPermission = async () => {
    setShowPrompt(false);
    if (!("Notification" in window)) return;
    
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          className="fixed bottom-6 right-6 z-[100] max-w-sm w-full bg-slate-900 border border-white/10 p-6 rounded-3xl shadow-2xl shadow-purple-500/20 backdrop-blur-xl"
        >
          <button 
            onClick={() => setShowPrompt(false)}
            className="absolute top-4 left-4 text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-2xl flex items-center justify-center shrink-0">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-white text-lg">הפעלת התראות</h4>
              <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                כדי להישאר מעודכנים בעדכוני מטופלים ושינויים בצוות, מומלץ להפעיל התראות פוש.
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={requestPermission}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-purple-500/20"
                >
                  אפשר התראות
                </button>
                <button
                  onClick={() => setShowPrompt(false)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-2.5 rounded-xl text-sm transition-all"
                >
                  לא עכשיו
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
