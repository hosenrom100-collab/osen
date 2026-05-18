"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db } from "@/lib/firebase/config";
import { 
  collection, getDocs, addDoc, query, orderBy, limit, 
  Timestamp, doc, updateDoc, arrayUnion, deleteDoc,
  where, onSnapshot, serverTimestamp, writeBatch
} from "firebase/firestore";
import { 
  Send, Users, Shield, MessageSquare, History, 
  Trash2, Bell, CheckCircle, AlertCircle, Search, 
  User, Layers, Globe, ExternalLink, Clock, Eye,
  ChevronDown, ChevronUp, Loader2, X, CheckCircle2,
  BookOpen, Mail, ArrowRight, FileText, BarChart3
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface NotifLog {
  id: string;
  title: string;
  body: string;
  createdAt: any;
  recipientIds: string[];
  readBy: string[];
  target: any;
  sentCount?: number;
  failedCount?: number;
  senderId?: string;
  senderName?: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'news' | 'event' | 'alert';
  createdAt: any;
  active: boolean;
}

interface DocRequest {
  id: string;
  patientId: string;
  patientName?: string;
  type: 'stay' | 'attendance' | 'custom';
  status: 'pending' | 'completed';
  createdAt: any;
  assignedWorkerId?: string;
  month?: string;
  customType?: string;
  notes?: string;
}

interface UserSummary {
  id: string;
  name: string;
  email: string;
}

const ROLES = [
  { id: "admin",         label: "מנהל מערכת" },
  { id: "manager",       label: "מנהל" },
  { id: "instructor",    label: "מדריך" },
  { id: "employee",      label: "עובד" },
  { id: "logistics",     label: "לוגיסטיקה" },
  { id: "social_worker", label: 'עו"ס' },
];

export default function AdminNotificationsPage() {
  const { user, isAdmin, isManager } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [mode, setMode] = useState<"everyone" | "role" | "group" | "program" | "user">("everyone");
  const [selectedRole, setSelectedRole] = useState("employee");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState("");
  
  const [groups, setGroups] = useState<{id: string, name: string}[]>([]);
  const [programs, setPrograms] = useState<{id: string, name: string}[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLogForStatus, setSelectedLogForStatus] = useState<NotifLog | null>(null);
  const [successToast, setSuccessToast] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState<"notifications" | "announcements" | "requests">("notifications");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [docRequests, setDocRequests] = useState<DocRequest[]>([]);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [announcementType, setAnnouncementType] = useState<'news' | 'event' | 'alert'>('news');
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    loadData();
    const unsubscribeLogs = subscribeToLogs();
    const unsubscribeAnnouncements = subscribeToAnnouncements();
    const unsubscribeRequests = subscribeToRequests();
    return () => {
      unsubscribeLogs();
      unsubscribeAnnouncements();
      unsubscribeRequests();
    };
  }, []);

  function subscribeToRequests() {
    let q = query(collection(db, "document_requests"), where("status", "==", "pending"), orderBy("createdAt", "desc"));
    
    // If the current user is a social worker (and not an admin/manager), only show their assigned requests
    if (user && !isAdmin && !isManager) {
      // Note: This requires a composite index if we combine with status and createdAt
      // For now, we'll fetch all pending and filter client-side to avoid index requirement immediately
      // OR we can use a simpler query if the user is a SW.
      q = query(collection(db, "document_requests"), where("status", "==", "pending"), where("assignedWorkerId", "==", user.uid));
    }

    return onSnapshot(q, (snap) => {
      let requests = snap.docs.map(d => ({ id: d.id, ...d.data() } as DocRequest));
      // Re-sort client side if the filtered query didn't use orderBy
      if (user && !isAdmin && !isManager) {
        requests = requests.sort((a, b) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return tB - tA;
        });
      }
      setDocRequests(requests);
    });
  }

  function subscribeToAnnouncements() {
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));
    });
  }

  async function loadData() {
    try {
      const [gSnap, pSnap, uSnap] = await Promise.all([
        getDocs(query(collection(db, "groups"),    orderBy("name"))),
        getDocs(query(collection(db, "programs"),  orderBy("name"))),
        getDocs(query(collection(db, "users"),     orderBy("name"))),
      ]);

      setGroups(gSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
      setPrograms(pSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
      setUsers(uSnap.docs.map(d => ({
        id: d.id,
        name: d.data().displayName || d.data().name || d.data().email?.split('@')[0] || "ללא שם",
        email: d.data().email || "",
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function subscribeToLogs() {
    const q = query(
      collection(db, "notifications"), 
      where("type", "==", "system"),
      orderBy("createdAt", "desc"), 
      limit(30)
    );
    return onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as NotifLog)));
    }, (err) => {
      console.error("Logs subscription error:", err);
    });
  }

  async function handleSend() {
    if (!title) return alert("אנא הזן כותרת");
    if (mode === "group" && !selectedGroupId) return alert("אנא בחר קבוצה");
    if (mode === "program" && !selectedProgramId) return alert("אנא בחר תוכנית");
    if (mode === "user" && !selectedUserId) return alert("אנא בחר עובד");

    setSending(true);
    try {
      const payload: any = { 
        title: title.trim(), 
        body: body.trim(), 
        link: link.trim(),
        senderId: user?.uid,
        senderName: user?.displayName || user?.email?.split('@')[0]
      };
      if (mode === "everyone") payload.everyone = true;
      if (mode === "role")     payload.role = selectedRole;
      if (mode === "group")    payload.groupId = selectedGroupId;
      if (mode === "program")  payload.programId = selectedProgramId;
      if (mode === "user")     payload.userId = selectedUserId;

      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setTitle("");
        setBody("");
        setLink("");
        setSuccessToast(true);
        setTimeout(() => setSuccessToast(false), 3000);
      } else {
        const data = await res.json();
        alert(data.error || "שגיאה בשליחת ההודעה");
      }
    } catch (e) {
      console.error(e);
      alert("שגיאה בתקשורת עם השרת");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteLog(id: string) {
    if (!confirm("האם למחוק את תיעוד ההודעה?")) return;
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (e) {
      console.error("Delete error:", e);
    }
  }

  async function handleClearLogs() {
    if (!confirm("האם אתה בטוח שברצונך למחוק את כל היסטוריית ההודעות?")) return;
    try {
      const q = query(
        collection(db, "notifications"), 
        where("type", "==", "system"),
        limit(500)
      );
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      alert("ההיסטוריה נוקתה בהצלחה");
    } catch (e) {
      console.error("Clear logs error:", e);
      alert("שגיאה בניקוי ההיסטוריה");
    }
  }

  async function handleSaveAnnouncement() {
    if (!announcementTitle || !announcementContent) return alert("אנא מלא את כל השדות");
    
    try {
      const data = {
        title: announcementTitle,
        content: announcementContent,
        type: announcementType,
        createdAt: editingAnnouncement ? editingAnnouncement.createdAt : serverTimestamp(),
        active: true,
      };

      if (editingAnnouncement) {
        await updateDoc(doc(db, "announcements", editingAnnouncement.id), data);
      } else {
        await addDoc(collection(db, "announcements"), data);
      }

      setAnnouncementTitle("");
      setAnnouncementContent("");
      setAnnouncementType("news");
      setEditingAnnouncement(null);
      setSuccessToast(true);
      setTimeout(() => setSuccessToast(false), 3000);
    } catch (e) {
      console.error(e);
      alert("שגיאה בשמירת ההודעה");
    }
  }

  async function handleDeleteAnnouncement(id: string) {
    if (!confirm("האם למחוק את הודעת החדשות?")) return;
    try {
      await deleteDoc(doc(db, "announcements", id));
    } catch (e) { console.error(e); }
  }

  const filteredUsers = searchTerm
    ? users.filter(u => u.name.includes(searchTerm) || u.email.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5)
    : users.slice(0, 5);

  function formatTime(ts: any) {
    if (!ts) return "";
    const d = ts.toDate();
    return format(d, "dd/MM HH:mm", { locale: he });
  }

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <main className="min-h-screen bg-[var(--background)] p-4 md:p-8 lg:p-12" dir="rtl">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* ── Header ── */}
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/admin")}
                className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-3xl font-black tracking-tight">מרכז הודעות</h1>
                  <p className="text-sm text-[var(--muted)] font-bold uppercase tracking-widest opacity-60">ניהול תקשורת והתראות לצוות</p>
                </div>
              </div>
            </div>

            <div className="flex gap-1 bg-[var(--surface)] p-1.5 rounded-2xl border border-[var(--border)]">
              <button
                onClick={() => setActiveAdminTab("notifications")}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  activeAdminTab === "notifications"
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                    : "text-[var(--muted)] hover:bg-[var(--foreground)]/5"
                }`}
              >
                התראות ופוש
              </button>
              <button
                onClick={() => setActiveAdminTab("announcements")}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  activeAdminTab === "announcements"
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                    : "text-[var(--muted)] hover:bg-[var(--foreground)]/5"
                }`}
              >
                חדשות ועדכונים
              </button>
              <button
                onClick={() => setActiveAdminTab("requests")}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  activeAdminTab === "requests"
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                    : "text-[var(--muted)] hover:bg-[var(--foreground)]/5"
                }`}
              >
                בקשות דוחות {docRequests.length > 0 && <span className="mr-2 bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[8px] animate-pulse">{docRequests.length}</span>}
              </button>
            </div>
          </header>

          <AnimatePresence mode="wait">
            {activeAdminTab === "notifications" ? (
              <motion.div 
                key="notifications"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid lg:grid-cols-[1.2fr_1fr] gap-8 items-start"
              >
                {/* Composer */}
                <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-8 shadow-2xl shadow-black/5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -translate-y-1/2 translate-x-1/2 rounded-full" />
                  <h2 className="text-xl font-black mb-8 flex items-center gap-3">
                    <Send className="w-5 h-5 text-emerald-500" />
                    הודעה חדשה
                  </h2>
                  <div className="space-y-6">
                    {/* ... (Existing composer fields) ... */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                      {[
                        { id: "everyone", label: "כולם", icon: Globe },
                        { id: "role",     label: "תפקיד", icon: Shield },
                        { id: "group",    label: "קבוצה", icon: Layers },
                        { id: "program",  label: "תוכנית", icon: BookOpen },
                        { id: "user",     label: "עובד", icon: User },
                      ].map((m) => (
                        <button
                          key={m.id}
                          onClick={() => { setMode(m.id as any); setSelectedUserId(null); }}
                          className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border transition-all ${
                            mode === m.id
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 shadow-sm"
                              : "bg-[var(--foreground)]/[0.02] border-[var(--border)] text-[var(--muted)] hover:bg-[var(--foreground)]/[0.05]"
                          }`}
                        >
                          <m.icon className="w-4 h-4" />
                          <span className="text-[10px] font-black">{m.label}</span>
                        </button>
                      ))}
                    </div>

                    <AnimatePresence mode="wait">
                      {mode === "role" && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">בחר תפקיד</label>
                          <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50">
                            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                          </select>
                        </motion.div>
                      )}
                      {mode === "group" && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">בחר קבוצה</label>
                          <select value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)} className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50">
                            <option value="">בחר קבוצה...</option>
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name.startsWith("תוכנית") ? g.name : `תוכנית ${g.name}`}</option>)}
                          </select>
                        </motion.div>
                      )}
                      {mode === "program" && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">בחר תוכנית</label>
                          <select value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)} className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50">
                            <option value="">בחר תוכנית...</option>
                            {programs.map(p => <option key={p.id} value={p.id}>{p.name.startsWith("תוכנית") ? p.name : `תוכנית ${p.name}`}</option>)}
                          </select>
                        </motion.div>
                      )}
                      {mode === "user" && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                          <div className="relative">
                            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                            <input type="text" placeholder="חפש עובד..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl pr-10 pl-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50" />
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {filteredUsers.map(u => (
                              <button key={u.id} onClick={() => { setSelectedUserId(u.id); setSelectedUserName(u.name); }} className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${selectedUserId === u.id ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600" : "bg-[var(--foreground)]/[0.01] border-[var(--border)] hover:bg-[var(--foreground)]/[0.04]"}`}>
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${selectedUserId === u.id ? "bg-emerald-500 text-white" : "bg-[var(--foreground)]/10 text-[var(--muted)]"}`}>{u.name.charAt(0)}</div>
                                  <div className="text-right">
                                    <p className="text-xs font-black leading-tight">{u.name}</p>
                                    <p className="text-[10px] opacity-40">{u.email}</p>
                                  </div>
                                </div>
                                {selectedUserId === u.id && <CheckCircle2 className="w-4 h-4" />}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="space-y-4 pt-4 border-t border-[var(--border)]">
                      <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">כותרת ההודעה</label>
                        <input type="text" placeholder="לדוגמה: שינוי בשעת הצ׳ק-אין..." value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-emerald-500/50" />
                      </div>
                      <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">תוכן ההודעה</label>
                        <textarea placeholder="פרט את תוכן ההודעה כאן..." rows={4} value={body} onChange={e => setBody(e.target.value)} className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 resize-none" />
                      </div>
                      <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">קישור (אופציונלי)</label>
                        <div className="relative"><ExternalLink className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] opacity-30" /><input type="text" placeholder="https://..." value={link} onChange={e => setLink(e.target.value)} className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50" dir="ltr" /></div>
                      </div>
                    </div>

                    <button onClick={handleSend} disabled={sending} className={`w-full py-5 rounded-3xl font-black text-sm tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl ${sending ? "bg-[var(--foreground)]/5 text-[var(--muted)] cursor-not-allowed" : "bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98] shadow-emerald-500/20"}`}>
                      {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                      שלח הודעה כעת
                    </button>
                  </div>
                </section>

                {/* History */}
                <section className="space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <h2 className="text-xl font-black flex items-center gap-3"><History className="w-5 h-5 text-emerald-500" /> היסטוריית שליחות</h2>
                    <button onClick={handleClearLogs} className="text-[8px] font-black text-rose-500 uppercase tracking-widest bg-rose-500/5 px-3 py-1 rounded-full border border-rose-500/10 hover:bg-rose-500/10 transition-all">נקה הכל</button>
                  </div>
                  <div className="space-y-4">
                    {logs.map((log) => (
                      <div key={log.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden hover:border-emerald-500/30 transition-all group p-5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/10">{log.target?.userId ? "פרטני" : log.target?.role ? "תפקיד" : log.target?.groupId ? "קבוצה" : log.target?.programId ? "תוכנית" : "כללי"}</span>
                          <span className="text-[8px] font-bold text-[var(--muted)] opacity-50 flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(log.createdAt)}</span>
                        </div>
                        <h3 className="text-sm font-black text-[var(--foreground)] truncate group-hover:text-emerald-500">{log.title}</h3>
                        <p className="text-xs text-[var(--muted)] mt-1 line-clamp-1 opacity-60">{log.body}</p>
                        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[var(--border-subtle)]">
                          <div className="flex items-center gap-1 text-[9px] font-black text-emerald-600"><CheckCircle className="w-3 h-3" /> {log.readBy?.length || 0} קראו</div>
                          <button onClick={() => setSelectedLogForStatus(log)} className="mr-auto p-2 rounded-xl bg-[var(--foreground)]/5 text-[var(--muted)] hover:text-emerald-500"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteLog(log.id)} className="p-2 rounded-xl bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </motion.div>
            ) : activeAdminTab === "announcements" ? (
              <motion.div 
                key="announcements"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid lg:grid-cols-[1fr_1.5fr] gap-8 items-start"
              >
                {/* Announcement Editor */}
                <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-8 shadow-2xl shadow-black/5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl -translate-y-1/2 translate-x-1/2 rounded-full" />
                  <h2 className="text-xl font-black mb-8 flex items-center gap-3">
                    <Globe className="w-5 h-5 text-blue-500" />
                    {editingAnnouncement ? "עריכת הודעה" : "הודעת חדשות חדשה"}
                  </h2>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">סוג הודעה</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['news', 'event', 'alert'].map(t => (
                          <button key={t} onClick={() => setAnnouncementType(t as any)} className={`py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${announcementType === t ? 'bg-blue-500 text-white border-blue-500' : 'bg-[var(--foreground)]/5 border-[var(--border)] text-[var(--muted)]'}`}>
                            {t === 'news' ? 'חדשות' : t === 'event' ? 'אירוע' : 'התראה'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">כותרת</label>
                      <input type="text" value={announcementTitle} onChange={e => setAnnouncementTitle(e.target.value)} className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl px-4 py-3 text-sm font-bold focus:border-blue-500/50 outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">תוכן</label>
                      <textarea rows={5} value={announcementContent} onChange={e => setAnnouncementContent(e.target.value)} className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none resize-none" />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={handleSaveAnnouncement} className="flex-1 bg-blue-500 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20">שמור ופרסם</button>
                      {editingAnnouncement && (
                        <button onClick={() => { setEditingAnnouncement(null); setAnnouncementTitle(""); setAnnouncementContent(""); }} className="px-6 bg-slate-100 text-slate-500 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">ביטול</button>
                      )}
                    </div>
                  </div>
                </section>

                {/* Announcement List */}
                <section className="space-y-6">
                  <h2 className="text-xl font-black flex items-center gap-3"><Globe className="w-5 h-5 text-blue-500" /> הודעות פעילות</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {announcements.map(a => (
                      <div key={a.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-6 hover:border-blue-500/30 transition-all group relative overflow-hidden">
                        <div className={`absolute top-0 right-0 w-1 h-full ${a.type === 'alert' ? 'bg-rose-500' : a.type === 'event' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                        <div className="flex items-center justify-between mb-4">
                          <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${a.type === 'alert' ? 'bg-rose-500/10 text-rose-500' : a.type === 'event' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            {a.type === 'news' ? 'חדשות' : a.type === 'event' ? 'אירוע' : 'התראה'}
                          </span>
                          <span className="text-[8px] font-bold text-[var(--muted)] opacity-50">{a.createdAt?.toDate ? format(a.createdAt.toDate(), "dd/MM/yyyy") : "—"}</span>
                        </div>
                        <h3 className="text-sm font-black mb-2 text-[var(--foreground)]">{a.title}</h3>
                        <p className="text-xs text-[var(--muted)] line-clamp-3 mb-6 leading-relaxed">{a.content}</p>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingAnnouncement(a); setAnnouncementTitle(a.title); setAnnouncementContent(a.content); setAnnouncementType(a.type); }} className="flex-1 bg-slate-100 hover:bg-blue-500 hover:text-white text-slate-500 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">ערוך</button>
                          <button onClick={() => handleDeleteAnnouncement(a.id)} className="px-4 bg-rose-500/5 hover:bg-rose-500 text-rose-500 hover:text-white py-2 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </motion.div>
            ) : (
              <motion.div 
                key="requests"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-xl font-black flex items-center gap-3"><FileText className="w-5 h-5 text-teal-500" /> בקשות דוחות ממתינות</h2>
                </div>
                
                {docRequests.length === 0 ? (
                  <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-[3rem] p-20 text-center">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-black text-[var(--muted)] opacity-30">אין בקשות דוחות ממתינות כרגע</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {docRequests.map(req => (
                      <div key={req.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-6 hover:border-teal-500/30 transition-all group flex flex-col justify-between min-h-[220px]">
                        <div>
                          <div className="flex items-start justify-between mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-500 flex items-center justify-center">
                              {req.type === 'stay' ? <Shield className="w-6 h-6" /> : req.type === 'attendance' ? <BarChart3 className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                            </div>
                            <span className="text-[8px] font-black uppercase tracking-widest text-teal-500 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/10">
                              {req.type === 'stay' ? 'אישור שהייה' : req.type === 'attendance' ? 'דו״ח נוכחות' : 'בקשה מיוחדת'}
                            </span>
                          </div>
                          <h3 className="text-sm font-black mb-1">{req.patientName || "משתתף"}</h3>
                          <p className="text-xs font-bold text-teal-600 mb-1">
                            {req.type === 'stay' ? 'אישור שהייה חתום ידנית' : req.type === 'attendance' ? `דו״ח נוכחות - ${req.month}` : (req.customType || 'בקשה מיוחדת')}
                          </p>
                          <p className="text-[10px] text-[var(--muted)] mb-3 flex items-center gap-1"><Clock className="w-3 h-3" /> {req.createdAt?.toDate ? format(req.createdAt.toDate(), "dd/MM HH:mm") : "—"}</p>
                          {req.notes && (
                            <p className="text-xs text-amber-700 bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 mb-4 leading-relaxed font-medium">
                              הערת משתתף: {req.notes}
                            </p>
                          )}
                        </div>
                        <button 
                          onClick={() => router.push(`/patients/${req.patientId}?tab=reports`)}
                          className="w-full py-3 bg-[var(--foreground)]/5 hover:bg-teal-500 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          מעבר לטיפול בבקשה
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Read Status Modal */}
        <AnimatePresence>
          {selectedLogForStatus && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setSelectedLogForStatus(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg bg-[var(--surface)] rounded-[2.5rem] border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                dir="rtl"
              >
                <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--foreground)]/[0.02]">
                  <div>
                    <h3 className="text-sm font-black text-[var(--foreground)]">מצב קריאה</h3>
                    <p className="text-[10px] text-[var(--muted)] font-bold truncate max-w-[200px]">{selectedLogForStatus.title}</p>
                  </div>
                  <button onClick={() => setSelectedLogForStatus(null)} className="p-2 hover:bg-[var(--foreground)]/5 rounded-xl transition-all">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-center">
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">קראו</p>
                      <p className="text-2xl font-black text-emerald-600">{selectedLogForStatus.readBy?.length || 0}</p>
                    </div>
                    <div className="bg-slate-500/5 border border-slate-500/10 rounded-2xl p-4 text-center">
                      <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1">נמענים</p>
                      <p className="text-2xl font-black text-[var(--foreground)]">{selectedLogForStatus.recipientIds?.length || 0}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest px-2">נמענים שקראו</h4>
                    <div className="grid gap-2">
                      {selectedLogForStatus.readBy?.length > 0 ? (
                        selectedLogForStatus.readBy.map(uid => {
                          const u = users.find(x => x.id === uid);
                          return (
                            <div key={uid} className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                              <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black">
                                {u?.name.charAt(0) || "?"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black truncate">{u?.name || "משתמש לא נמצא"}</p>
                                <p className="text-[9px] opacity-40 truncate">{u?.email}</p>
                              </div>
                              <CheckCircle className="w-4 h-4 text-emerald-500" />
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-[var(--muted)] text-center py-4 opacity-40 italic">טרם בוצעו קריאות</p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </RoleGuard>
  );
}
