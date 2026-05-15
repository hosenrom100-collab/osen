"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase/config";
import { collection, query, where, orderBy, onSnapshot, getDocs, getDoc, doc, setDoc, serverTimestamp, updateDoc, limit, writeBatch } from "firebase/firestore";
import { MessageCircle, Send, Clock, User, Search, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: any;
  participants: string[];
}

interface Contact {
  id: string;
  name: string;
  lastMessage?: Message;
  unreadCount: number;
}

export default function InboxPage() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load all contacts (users/patients that have messaged this SW)
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "messages"),
      where("participants", "array-contains", user.uid),
      orderBy("timestamp", "desc"),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, async (snap) => {
      const allMessages = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      
      // Group by the "other" participant
      const contactMap = new Map<string, Contact>();
      
      allMessages.forEach(msg => {
        const otherId = msg.participants.find(p => p !== user.uid);
        if (!otherId) return;

        if (!contactMap.has(otherId)) {
          contactMap.set(otherId, {
            id: otherId,
            name: "טוען...", // Will fetch real names
            lastMessage: msg,
            unreadCount: 0 // Simplification, could compute real unread
          });
        }
      });

      // Fetch names
      const finalContacts = Array.from(contactMap.values());
      for (const c of finalContacts) {
        try {
          const uSnap = await getDoc(doc(db, "users", c.id));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            let resolvedName = uData.displayName || uData.name || uData.email?.split('@')[0];
            
            // If they are a participant, try to get their real patient name
            if (uData.patientId) {
              const pSnap = await getDoc(doc(db, "patients", uData.patientId));
              if (pSnap.exists()) {
                const pData = pSnap.data();
                if (pData.firstName && pData.lastName) {
                  resolvedName = `${pData.firstName} ${pData.lastName}`;
                }
              }
            }
            c.name = resolvedName || "משתתף/ת";
          } else {
             // Fallback if not in users
             const pSnap = await getDoc(doc(db, "patients", c.id));
             if (pSnap.exists()) {
               const pData = pSnap.data();
               c.name = `${pData.firstName} ${pData.lastName}`;
             } else {
               c.name = "משתתף/ת";
             }
          }
        } catch (e) {
          c.name = "משתתף/ת";
        }
      }

      setContacts(finalContacts);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Load messages for selected contact
  useEffect(() => {
    if (!user || !selectedContact) return;

    const q = query(
      collection(db, "messages"),
      where("participants", "array-contains", user.uid),
      orderBy("timestamp", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Message))
        .filter(m => m.participants.includes(selectedContact.id))
        .reverse();
      
      setMessages(list);
      
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    });

    return () => unsubscribe();
  }, [user, selectedContact]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !selectedContact) return;
    const content = newMessage.trim();
    setNewMessage("");

    try {
      const msgRef = doc(collection(db, "messages"));
      await setDoc(msgRef, {
        participants: [user.uid, selectedContact.id],
        senderId: user.uid,
        receiverId: selectedContact.id,
        content,
        timestamp: serverTimestamp(),
        read: false,
      });

      // Notification to participant
      await setDoc(doc(collection(db, "notifications")), {
        title: `הודעה חדשה מ${user.displayName || "הצוות"}`,
        body: content.length > 50 ? content.substring(0, 50) + "..." : content,
        recipientIds: [selectedContact.id],
        senderId: user.uid,
        createdAt: serverTimestamp(),
        readBy: [],
        type: "chat",
        link: `/portal`
      });

      // Send actual PUSH notification
      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `הודעה חדשה מ${user.displayName || "הצוות"}`,
            body: content.length > 50 ? content.substring(0, 50) + "..." : content,
            userIds: [selectedContact.id],
            link: `/portal`,
            skipDb: true
          }),
        });
      } catch (err) { console.error("Push failed:", err); }

    } catch (e) { console.error(e); }
  };

  const handleDeleteConversation = async () => {
    if (!user || !selectedContact) return;
    if (!confirm("האם למחוק את השיחה לצמיתות? פעולה זו אינה ניתנת לביטול.")) return;
    
    try {
      const q1 = query(collection(db, "messages"), where("participants", "==", [user.uid, selectedContact.id]));
      const q2 = query(collection(db, "messages"), where("participants", "==", [selectedContact.id, user.uid]));
      
      const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      
      const batch = writeBatch(db);
      s1.forEach(d => batch.delete(d.ref));
      s2.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      setSelectedContact(null);
    } catch (e) {
      console.error(e);
      alert("אירעה שגיאה במחיקת השיחה.");
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager", "social_worker", "instructor"]} redirectTo="/">
      <div className="flex h-screen bg-[var(--background)]" dir="rtl">
        
        {/* Sidebar Contacts */}
        <div className="w-80 border-l border-[var(--border)] bg-[var(--surface)] flex flex-col">
          <div className="p-4 border-b border-[var(--border)]">
            <h1 className="text-xl font-black mb-4">תיבת הודעות</h1>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
              <input 
                type="text" 
                placeholder="חיפוש שיחה..."
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2 pr-10 pl-4 text-xs"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center opacity-30">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                <p className="text-xs">טוען שיחות...</p>
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-8 text-center opacity-30">
                <MessageCircle className="w-8 h-8 mx-auto mb-2" />
                <p className="text-xs">אין שיחות פעילות</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {contacts.map(c => (
                  <button 
                    key={c.id}
                    onClick={() => setSelectedContact(c)}
                    className={`w-full p-4 text-right transition-all hover:bg-[var(--foreground)]/5 ${selectedContact?.id === c.id ? 'bg-teal-500/10 border-r-4 border-teal-500' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="text-sm font-black text-[var(--foreground)]">{c.name}</h3>
                      {c.lastMessage?.timestamp && (
                        <span className="text-[10px] text-[var(--muted)]">
                          {format(c.lastMessage.timestamp.toDate(), "HH:mm")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--muted)] line-clamp-1">{c.lastMessage?.content}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-[var(--background)]">
          {selectedContact ? (
            <>
              <div className="h-16 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-500/10 text-teal-500 flex items-center justify-center font-black">
                    {selectedContact.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-sm font-black leading-tight">{selectedContact.name}</h2>
                    <p className="text-[10px] font-bold text-[var(--muted)]">שיחה פעילה</p>
                  </div>
                </div>
                
                <button 
                  onClick={handleDeleteConversation}
                  className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors"
                  title="מחק שיחה"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map(m => {
                  const isMe = m.senderId === user?.uid;
                  return (
                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-5 py-3 text-sm shadow-sm ${isMe ? 'bg-teal-600 text-white rounded-bl-none' : 'bg-white border border-slate-200 text-slate-800 rounded-br-none'}`}>
                        <p className="leading-relaxed">{m.content}</p>
                        <p className={`text-[9px] mt-1 opacity-60 font-bold ${isMe ? 'text-left' : 'text-right'}`}>
                          {m.timestamp ? format(m.timestamp.toDate(), "HH:mm") : "עכשיו"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 bg-[var(--surface)] border-t border-[var(--border)] shrink-0">
                <div className="max-w-4xl mx-auto flex gap-2">
                  <input 
                    type="text" 
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && sendMessage()}
                    placeholder="הקלידו הודעה..."
                    className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-teal-500 transition-colors"
                  />
                  <button 
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="w-12 h-12 flex items-center justify-center bg-teal-500 text-white rounded-xl disabled:opacity-50 transition-all hover:bg-teal-600 active:scale-95"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-30">
              <MessageCircle className="w-16 h-16 mb-4" />
              <h2 className="text-xl font-black">תיבת הודעות צוות</h2>
              <p className="text-sm">בחר שיחה מהרשימה כדי להתחיל</p>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
