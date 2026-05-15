"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { 
  collection, query, where, orderBy, limit, 
  onSnapshot, doc, updateDoc, arrayUnion, Timestamp 
} from "firebase/firestore";
import { Bell, X, Check, ExternalLink, Clock, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface Notification {
  id: string;
  title: string;
  body: string;
  link?: string;
  createdAt: any;
  readBy: string[];
}

export function NotificationCenter() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Query notifications where user is a recipient
    const q = query(
      collection(db, "notifications"),
      where("recipientIds", "array-contains", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Notification));
      setNotifications(list);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const unreadCount = notifications.filter(n => !n.readBy?.includes(user?.uid || "")).length;

  const markAsRead = async (id: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "notifications", id), {
        readBy: arrayUnion(user.uid)
      });
    } catch (e) {
      console.error("Failed to mark as read:", e);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const unread = notifications.filter(n => !n.readBy?.includes(user.uid));
    for (const n of unread) {
      markAsRead(n.id);
    }
  };

  return (
    <div className="relative">
      {/* Bell Trigger */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-[var(--foreground)]/5 transition-colors"
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? "text-rose-500 animate-[bell_2s_infinite]" : "text-[var(--muted)]"}`} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-[var(--background)]">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)} 
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute left-0 top-full mt-2 w-80 md:w-96 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 overflow-hidden"
              dir="rtl"
            >
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--foreground)]/[0.02]">
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <Bell className="w-4 h-4 text-rose-500" />
                  מרכז עדכונים
                </h3>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-[10px] font-black text-rose-500 hover:underline"
                  >
                    סמן הכל כנקרא
                  </button>
                )}
              </div>

              <div className="max-h-[400px] overflow-y-auto no-scrollbar">
                {loading ? (
                  <div className="p-8 text-center opacity-20">
                    <Clock className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest">טוען הודעות...</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-12 text-center opacity-20">
                    <Info className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest">אין עדכונים חדשים</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {notifications.map((n) => {
                      const isRead = n.readBy?.includes(user?.uid || "");
                      return (
                        <div 
                          key={n.id}
                          className={`p-4 transition-colors ${isRead ? "opacity-60" : "bg-rose-500/[0.02]"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-black text-[var(--foreground)] mb-1 leading-tight">
                                {n.title}
                              </h4>
                              <p className="text-[11px] text-[var(--muted)] leading-relaxed mb-3">
                                {n.body}
                              </p>
                              
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold text-[var(--muted)] opacity-50 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {n.createdAt ? formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true, locale: he }) : "עכשיו"}
                                </span>
                                
                                <div className="flex items-center gap-2">
                                  {!isRead && (
                                    <button 
                                      onClick={() => markAsRead(n.id)}
                                      className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-all"
                                      title="סמן כנקרא"
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                  )}
                                  {n.link && (
                                    <Link 
                                      href={n.link}
                                      onClick={() => {
                                        markAsRead(n.id);
                                        setIsOpen(false);
                                      }}
                                      className="p-1.5 rounded-lg bg-[var(--foreground)]/5 text-[var(--muted)] hover:text-[var(--foreground)] transition-all"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                            {!isRead && (
                              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @keyframes bell {
          0% { transform: rotate(0); }
          10% { transform: rotate(15deg); }
          20% { transform: rotate(-15deg); }
          30% { transform: rotate(10deg); }
          40% { transform: rotate(-10deg); }
          50% { transform: rotate(0); }
          100% { transform: rotate(0); }
        }
      `}</style>
    </div>
  );
}
