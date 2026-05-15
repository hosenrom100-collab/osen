"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { 
  collection, query, where, orderBy, limit, 
  onSnapshot, doc, updateDoc, arrayUnion, Timestamp 
} from "firebase/firestore";
import { Bell, X, Check, ExternalLink, Clock, Info, CheckCircle2 } from "lucide-react";
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
        className={`relative p-2.5 rounded-2xl transition-all duration-300 ${
          isOpen 
            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
            : "hover:bg-[var(--foreground)]/5 text-[var(--muted)] hover:text-emerald-500"
        }`}
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 && !isOpen ? "animate-[bell_2s_infinite]" : ""}`} />
        {unreadCount > 0 && (
          <span className={`absolute top-1.5 right-1.5 w-4 h-4 text-[10px] font-black flex items-center justify-center rounded-full border-2 transition-colors ${
            isOpen ? "bg-white text-emerald-500 border-emerald-500" : "bg-emerald-500 text-white border-[var(--background)]"
          }`}>
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/5 md:bg-transparent" 
              onClick={() => setIsOpen(false)} 
            />
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.95, x: 20 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              exit={{ opacity: 0, y: 12, scale: 0.95, x: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute bottom-full left-0 mb-4 w-80 md:w-[400px] bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] shadow-2xl z-50 overflow-hidden"
              dir="rtl"
            >
              <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--foreground)]/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-[var(--foreground)] leading-none mb-1">מרכז עדכונים</h3>
                    <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-widest">הודעות אחרונות</p>
                  </div>
                </div>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-[10px] font-black text-emerald-500 hover:bg-emerald-500/5 px-3 py-1.5 rounded-lg border border-emerald-500/10 transition-all"
                  >
                    סמן הכל כנקרא
                  </button>
                )}
              </div>

              <div className="max-h-[450px] overflow-y-auto no-scrollbar py-2">
                {loading ? (
                  <div className="p-12 text-center opacity-20">
                    <Clock className="w-10 h-10 animate-spin mx-auto mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest">מעדכן נתונים...</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="w-16 h-16 rounded-full bg-[var(--foreground)]/5 flex items-center justify-center mx-auto mb-4 border border-dashed border-[var(--border)]">
                      <Info className="w-8 h-8 text-[var(--muted)] opacity-20" />
                    </div>
                    <p className="text-[11px] font-black text-[var(--muted)] uppercase tracking-widest opacity-40">אין עדכונים חדשים</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {notifications.map((n) => {
                      const isRead = n.readBy?.includes(user?.uid || "");
                      return (
                        <motion.div 
                          layout
                          key={n.id}
                          className={`p-5 transition-all relative group ${isRead ? "opacity-90" : "bg-emerald-500/[0.03] hover:bg-emerald-500/[0.06]"}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1.5">
                                <h4 className="text-xs font-black text-[var(--foreground)] leading-tight flex items-center gap-2">
                                  {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-lg shadow-emerald-500/40" />}
                                  {n.title}
                                </h4>
                                {isRead && (
                                  <span className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)] opacity-40 bg-[var(--foreground)]/5 px-1.5 py-0.5 rounded">
                                    נקרא
                                  </span>
                                )}
                              </div>
                              <p className={`text-[11px] leading-relaxed mb-4 line-clamp-3 ${isRead ? "text-[var(--muted)]" : "text-[var(--foreground)] opacity-70"}`}>
                                {n.body}
                              </p>
                              
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold text-[var(--muted)] opacity-50 flex items-center gap-1.5">
                                  <Clock className="w-3 h-3" />
                                  {n.createdAt ? formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true, locale: he }) : "עכשיו"}
                                </span>
                                
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                  {!isRead && (
                                    <button 
                                      onClick={() => markAsRead(n.id)}
                                      className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all shadow-sm"
                                      title="סמן כנקרא"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {n.link && (
                                    <Link 
                                      href={n.link}
                                      onClick={() => {
                                        markAsRead(n.id);
                                        setIsOpen(false);
                                      }}
                                      className="p-2 rounded-xl bg-[var(--foreground)]/5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-all"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {notifications.length > 0 && (
                <div className="p-4 border-t border-[var(--border)] bg-[var(--foreground)]/[0.01]">
                   <p className="text-[9px] text-center font-black text-[var(--muted)] uppercase tracking-[0.2em] opacity-30">
                     סוף העדכונים
                   </p>
                </div>
              )}
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
