"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db } from "@/lib/firebase/config";
import { 
  collection, getDocs, addDoc, query, orderBy, limit, 
  Timestamp, doc, updateDoc, arrayUnion, deleteDoc,
  where, onSnapshot, serverTimestamp
} from "firebase/firestore";
import { 
  Send, Users, Shield, MessageSquare, History, 
  Trash2, Bell, CheckCircle, AlertCircle, Search, 
  User, Layers, Globe, ExternalLink, Clock, Eye,
  ChevronDown, ChevronUp, Loader2, X, CheckCircle2,
  BookOpen, Mail, ArrowRight
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
  const { user } = useAuth();
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

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToLogs();
    return () => unsubscribe();
  }, []);

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
    const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(30));
    return onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as NotifLog)));
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
      const promises = logs.map(l => deleteDoc(doc(db, "notifications", l.id)));
      await Promise.all(promises);
    } catch (e) {
      console.error("Clear error:", e);
    }
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

            <div className="flex gap-3">
              <button 
                onClick={handleClearLogs}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/5 text-rose-500 border border-rose-500/10 text-xs font-black hover:bg-rose-500/10 transition-all active:scale-[0.98]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                נקה היסטוריה
              </button>
            </div>
          </header>

          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8 items-start">
            
            {/* ─── COMPOSER ─── */}
            <motion.section 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-[2.5rem] p-8 shadow-2xl shadow-black/5 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -translate-y-1/2 translate-x-1/2 rounded-full" />
              
              <h2 className="text-xl font-black mb-8 flex items-center gap-3">
                <Send className="w-5 h-5 text-emerald-500" />
                הודעה חדשה
              </h2>

              <div className="space-y-6">
                {/* Target Selection Mode */}
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

                {/* Sub-selectors */}
                <AnimatePresence mode="wait">
                  {mode === "role" && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">בחר תפקיד</label>
                      <select 
                        value={selectedRole} 
                        onChange={e => setSelectedRole(e.target.value)}
                        className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
                      >
                        {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </motion.div>
                  )}

                  {mode === "group" && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">בחר קבוצה</label>
                      <select 
                        value={selectedGroupId} 
                        onChange={e => setSelectedGroupId(e.target.value)}
                        className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
                      >
                        <option value="">בחר קבוצה...</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </motion.div>
                  )}

                  {mode === "program" && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">בחר תוכנית</label>
                      <select 
                        value={selectedProgramId} 
                        onChange={e => setSelectedProgramId(e.target.value)}
                        className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
                      >
                        <option value="">בחר תוכנית...</option>
                        {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </motion.div>
                  )}

                  {mode === "user" && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                      <div className="relative">
                        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                        <input
                          type="text"
                          placeholder="חפש עובד..."
                          value={searchTerm}
                          onChange={e => setSearchTerm(e.target.value)}
                          className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl pr-10 pl-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2">
                        {filteredUsers.map(u => (
                          <button
                            key={u.id}
                            onClick={() => { setSelectedUserId(u.id); setSelectedUserName(u.name); }}
                            className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${
                              selectedUserId === u.id
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                                : "bg-[var(--foreground)]/[0.01] border-[var(--border)] hover:bg-[var(--foreground)]/[0.04]"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${selectedUserId === u.id ? "bg-emerald-500 text-white" : "bg-[var(--foreground)]/10 text-[var(--muted)]"}`}>
                                {u.name.charAt(0)}
                              </div>
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

                {/* Content Fields */}
                <div className="space-y-4 pt-4 border-t border-[var(--border)]">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">כותרת ההודעה</label>
                    <input
                      type="text"
                      placeholder="לדוגמה: שינוי בשעת הצ׳ק-אין..."
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">תוכן ההודעה</label>
                    <textarea
                      placeholder="פרט את תוכן ההודעה כאן..."
                      rows={4}
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-all resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] px-2">קישור (אופציונלי)</label>
                    <div className="relative">
                      <ExternalLink className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] opacity-30" />
                      <input
                        type="text"
                        placeholder="https://..."
                        value={link}
                        onChange={e => setLink(e.target.value)}
                        className="w-full bg-[var(--foreground)]/[0.03] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSend}
                  disabled={sending}
                  className={`w-full py-5 rounded-3xl font-black text-sm tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl ${
                    sending 
                      ? "bg-[var(--foreground)]/5 text-[var(--muted)] cursor-not-allowed"
                      : "bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98] shadow-emerald-500/20"
                  }`}
                >
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  שלח הודעה כעת
                </button>

                {/* Success Toast Overlay */}
                <AnimatePresence>
                  {successToast && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute bottom-10 left-8 right-8 bg-white border-2 border-emerald-500 text-emerald-600 p-5 rounded-2xl flex items-center gap-4 shadow-[0_20px_50px_rgba(16,185,129,0.3)] z-20"
                    >
                      <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] font-black leading-none mb-1">בוצע בהצלחה!</p>
                        <p className="text-[10px] font-bold opacity-70">ההודעה נשלחה לכל הנמענים.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.section>

            {/* ─── LOGS / HISTORY ─── */}
            <motion.section 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between px-2">
                <h2 className="text-xl font-black flex items-center gap-3">
                  <History className="w-5 h-5 text-emerald-500" />
                  היסטוריית שליחות
                </h2>
                <span className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest bg-[var(--foreground)]/5 px-3 py-1 rounded-full border border-[var(--border)]">
                  {logs.length} הודעות אחרונות
                </span>
              </div>

              <div className="space-y-4">
                {loading ? (
                  <div className="p-20 flex flex-col items-center justify-center text-[var(--muted)]">
                    <Loader2 className="w-8 h-8 animate-spin mb-4" />
                    <p className="text-xs font-black uppercase tracking-widest">טוען נתונים...</p>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-[2rem] p-12 text-center text-[var(--muted)]">
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-10" />
                    <p className="text-sm font-bold opacity-30 uppercase tracking-widest">אין הודעות בהיסטוריה</p>
                  </div>
                ) : (
                  logs.map((log) => (
                    <motion.div 
                      key={log.id}
                      layout
                      className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden hover:border-emerald-500/30 transition-all group"
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/10">
                                {log.target?.userId ? "פרטני" : log.target?.role ? "תפקיד" : log.target?.groupId ? "קבוצה" : log.target?.programId ? "תוכנית" : "כללי"}
                              </span>
                              {log.senderId === user?.uid ? (
                                <span className="text-[9px] font-black text-white bg-emerald-500 px-2 py-0.5 rounded-lg shadow-sm shadow-emerald-500/20">
                                  נשלח על ידך
                                </span>
                              ) : log.senderName ? (
                                <span className="text-[9px] font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/10">
                                  נשלח ע״י: {log.senderName}
                                </span>
                              ) : null}
                              <span className="text-[9px] font-bold text-[var(--muted)] opacity-50 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTime(log.createdAt)}
                              </span>
                            </div>
                            <h3 className="text-sm font-black text-[var(--foreground)] leading-tight truncate group-hover:text-emerald-500 transition-colors">
                              {log.title}
                            </h3>
                            <p className="text-xs text-[var(--muted)] mt-1 line-clamp-1 opacity-60">
                              {log.body}
                            </p>

                            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[var(--border-subtle)]">
                              <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600">
                                <CheckCircle className="w-3 h-3" />
                                {log.readBy?.length || 0} קראו
                              </div>
                              <div className="flex items-center gap-1 text-[10px] font-black text-blue-500">
                                <Users className="w-3 h-3" />
                                {log.recipientIds?.length || 0} נמענים
                              </div>
                              
                              <div className="mr-auto flex gap-1">
                                <button 
                                  onClick={() => setSelectedLogForStatus(log)}
                                  className="p-2 rounded-xl bg-[var(--foreground)]/5 text-[var(--muted)] hover:text-emerald-500 hover:bg-emerald-500/10 transition-all"
                                  title="מי קרא?"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteLog(log.id)}
                                  className="p-2 rounded-xl bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100"
                                  title="מחק"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.section>

          </div>
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
