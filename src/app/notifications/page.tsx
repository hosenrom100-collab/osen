"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { 
  collection, query, where, orderBy, limit, 
  onSnapshot, doc, updateDoc, arrayUnion, arrayRemove 
} from "firebase/firestore";
import { Bell, Clock, ChevronRight, ExternalLink, CheckCircle2, MessageSquare, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  title: string;
  body: string;
  link?: string;
  createdAt: any;
  readBy: string[];
  senderName?: string;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "notifications"),
      where("recipientIds", "array-contains", user.uid),
      orderBy("createdAt", "desc"),
      limit(50)
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

  const deleteNotification = async (id: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "notifications", id), {
        recipientIds: arrayRemove(user.uid)
      });
    } catch (e) {
      console.error("Failed to delete notification:", e);
    }
  };

  const formatTime = (ts: any) => {
    if (!ts) return "";
    return format(ts.toDate(), "dd/MM HH:mm", { locale: he });
  };

  return (
    <main className="min-h-screen bg-[var(--background)] p-4 md:p-8 lg:p-12" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">מרכז עדכונים</h1>
              <p className="text-[10px] text-[var(--muted)] font-black uppercase tracking-widest opacity-60">היסטוריית הודעות ודיווחים</p>
            </div>
          </div>
        </header>

        {/* List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center text-[var(--muted)]">
              <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4" />
              <p className="text-xs font-black uppercase tracking-widest">טוען עדכונים...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-[2.5rem] p-20 text-center">
              <div className="w-20 h-20 bg-[var(--foreground)]/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <MessageSquare className="w-10 h-10 text-[var(--muted)] opacity-20" />
              </div>
              <p className="text-sm font-black text-[var(--muted)] uppercase tracking-widest opacity-40">אין הודעות להצגה</p>
            </div>
          ) : (
            notifications.map((n, idx) => {
              const isRead = n.readBy?.includes(user?.uid || "");
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 transition-all hover:shadow-xl hover:shadow-black/5 group relative overflow-hidden ${!isRead ? "border-emerald-500/30 ring-1 ring-emerald-500/10 shadow-lg shadow-emerald-500/5" : "opacity-80"}`}
                  onClick={() => !isRead && markAsRead(n.id)}
                >
                  {!isRead && (
                    <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-500" />
                  )}
                  
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-[10px] font-black text-[var(--muted)] opacity-50 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(n.createdAt)}
                          </span>
                          {n.senderName && (
                            <span className="text-[10px] font-bold text-blue-500 bg-blue-500/5 px-2 py-0.5 rounded-lg border border-blue-500/10">
                              מאת: {n.senderName}
                            </span>
                          )}
                          {!isRead && (
                            <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/10">חדש</span>
                          )}
                        </div>
                        <h2 className={`text-base font-black leading-tight ${!isRead ? "text-[var(--foreground)]" : "text-[var(--foreground)]/60"}`}>
                          {n.title}
                        </h2>
                      </div>
                    </div>

                    <p className={`text-sm leading-relaxed ${!isRead ? "text-[var(--foreground)]/80" : "text-[var(--muted)]/70"}`}>
                      {n.body}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
                      {n.link ? (
                        <Link
                          href={n.link}
                          className="flex items-center gap-2 text-xs font-black text-emerald-500 hover:text-emerald-600 transition-colors"
                        >
                          לחץ לפרטים נוספים
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      ) : <div />}

                        <button
                          onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                          className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-500/20"
                          title="מחק הודעה"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
