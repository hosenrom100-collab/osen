"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase/config";
import { 
  collection, query, where, orderBy, onSnapshot, 
  doc, setDoc, serverTimestamp, limit 
} from "firebase/firestore";
import { MessageCircle, X, Send, User, Clock, Loader2, Minus } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: any;
  participants: string[];
}

interface FloatingChatProps {
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  patientId: string;
}

export function FloatingChat({ 
  senderId, senderName, recipientId, recipientName, patientId 
}: FloatingChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!senderId || !recipientId) return;

    const q = query(
      collection(db, "messages"),
      where("participants", "array-contains", senderId),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Message))
        .filter(m => m.participants.includes(recipientId))
        .reverse();
      
      setMessages(list);
      setLoading(false);
      
      // Auto scroll to bottom
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    });

    return () => unsubscribe();
  }, [senderId, recipientId]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !senderId || !recipientId) return;
    const content = newMessage.trim();
    setNewMessage("");

    try {
      const msgRef = doc(collection(db, "messages"));
      await setDoc(msgRef, {
        participants: [senderId, recipientId],
        senderId,
        receiverId: recipientId,
        content,
        timestamp: serverTimestamp(),
        read: false,
      });

      // Create a notification for the recipient in DB
      await setDoc(doc(collection(db, "notifications")), {
        title: `הודעה חדשה מ${senderName}`,
        body: content.length > 50 ? content.substring(0, 50) + "..." : content,
        recipientIds: [recipientId],
        senderId,
        createdAt: serverTimestamp(),
        readBy: [],
        type: "chat",
        link: senderName.includes("משתתף") || senderName === "משתתף" ? `/patients/${patientId}?tab=messages` : "/portal"
      });

      // Send actual PUSH notification
      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `הודעה חדשה מ${senderName}`,
            body: content.length > 50 ? content.substring(0, 50) + "..." : content,
            userIds: [recipientId],
            link: senderName.includes("משתתף") || senderName === "משתתף" ? `/patients/${patientId}?tab=messages` : "/portal",
            skipDb: true
          }),
        });
      } catch (err) { console.error("Push failed:", err); }
    } catch (e) {
      console.error("Failed to send message:", e);
    }
  };

  const unreadCount = messages.filter(m => m.senderId === recipientId).length; // Placeholder for real unread logic

  return (
    <div className="fixed bottom-6 left-6 z-[100] flex flex-col items-end" dir="rtl">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="mb-4 w-80 md:w-96 h-[500px] bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 border-b border-[var(--border)] bg-teal-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-lg font-black">
                  {recipientName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-sm font-black leading-tight">{recipientName}</h3>
                  <p className="text-[10px] opacity-80 font-bold">עו״ס מלווה</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-all"
                >
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar bg-gradient-to-b from-[var(--background)] to-[var(--surface)]"
            >
              {loading ? (
                <div className="h-full flex items-center justify-center opacity-20">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30 italic p-8">
                  <MessageCircle className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-xs">הצ׳אט ריק. כתוב הודעה לעו״ס שלך.</p>
                </div>
              ) : (
                messages.map((m) => (
                  <div 
                    key={m.id} 
                    className={`flex ${m.senderId === senderId ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      m.senderId === senderId 
                        ? 'bg-teal-600 text-white rounded-br-none' 
                        : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] rounded-bl-none'
                    }`}>
                      <p className="leading-relaxed">{m.content}</p>
                      <div className={`flex items-center gap-1 mt-1 opacity-50 text-[9px] ${m.senderId === senderId ? 'justify-end' : 'justify-start'}`}>
                        <Clock className="w-2.5 h-2.5" />
                        {m.timestamp?.toDate ? format(m.timestamp.toDate(), "HH:mm") : "עכשיו"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-[var(--surface)] border-t border-[var(--border)]">
              <div className="flex gap-2 items-center bg-[var(--background)] border border-[var(--border)] rounded-2xl p-1.5 focus-within:border-teal-500/50 transition-all">
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="הקלד/י הודעה..."
                  className="flex-1 bg-transparent border-none outline-none text-sm px-3 py-1.5"
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className="w-10 h-10 bg-teal-600 text-white rounded-xl flex items-center justify-center disabled:opacity-30 disabled:scale-95 transition-all active:scale-90 shadow-lg shadow-teal-600/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all relative ${
          isOpen ? "bg-rose-500 text-white rotate-90" : "bg-teal-600 text-white"
        }`}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-[var(--background)]">
            {unreadCount > 9 ? "+9" : unreadCount}
          </span>
        )}
      </motion.button>
    </div>
  );
}
