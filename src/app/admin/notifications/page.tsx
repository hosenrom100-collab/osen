"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import {
  collection, getDocs, addDoc, query, orderBy, limit,
  serverTimestamp, Timestamp,
} from "firebase/firestore";
import {
  Bell, Send, ArrowRight, Loader2, CheckCircle2, AlertCircle,
  Globe, Shield, Layers, BookOpen, User, Clock, Search, ChevronLeft, Trash2, Mail, ExternalLink, X,
} from "lucide-react";
import { doc, deleteDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

type TargetMode = "everyone" | "roles" | "group" | "program" | "user";

interface Group   { id: string; name: string; }
interface Program { id: string; name: string; }
interface UserItem { id: string; name: string; email: string; }
interface NotifLog {
  id: string;
  title: string;
  body?: string;
  targetLabel: string;
  createdAt: Timestamp;
  sentByName: string;
  recipientIds: string[];
  readBy: string[];
  link?: string;
}

interface InboxMessage {
  id: number;
  title: string;
  body: string;
  link?: string;
  receivedAt: string;
  read: boolean;
}

const ROLES = [
  { id: "admin",         label: "מנהל מערכת" },
  { id: "manager",       label: "מנהל" },
  { id: "instructor",    label: "מדריך" },
  { id: "employee",      label: "עובד" },
  { id: "logistics",     label: "לוגיסטיקה" },
  { id: "social_worker", label: 'עו"ס' },
];

const SEGMENTS = [
  { label: "כל הצוות",    roles: ["admin","manager","instructor","employee","logistics","social_worker"] },
  { label: "ניהול",       roles: ["admin","manager"] },
  { label: "צוות טיפולי", roles: ["instructor","employee","social_worker"] },
  { label: "מדריכים",     roles: ["instructor"] },
];

const TARGET_MODES: { id: TargetMode; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "everyone", label: "כולם",            icon: Globe,    desc: "כל המשתמשים המאושרים" },
  { id: "roles",    label: "לפי תפקיד",       icon: Shield,   desc: "תפקיד אחד או יותר" },
  { id: "group",    label: "לפי קבוצה",       icon: Layers,   desc: "חברי קבוצה" },
  { id: "program",  label: "לפי תוכנית",      icon: BookOpen, desc: "משתתפי תוכנית" },
  { id: "user",     label: "משתמש ספציפי",    icon: User,     desc: "אדם אחד" },
];

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<TargetMode>("everyone");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserName, setSelectedUserName] = useState("");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("/");
  const [showLink, setShowLink] = useState(false);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const [groups, setGroups] = useState<Group[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedLogForStatus, setSelectedLogForStatus] = useState<NotifLog | null>(null);

  useEffect(() => {
    loadData();
    loadLogs();
    loadInbox();

    // Listen for new notifications arriving while page is open
    window.addEventListener("hosen_new_notification", loadInbox);
    return () => window.removeEventListener("hosen_new_notification", loadInbox);
  }, []);

  function loadInbox() {
    try {
      const saved = localStorage.getItem("hosen_inbox");
      if (saved) setInbox(JSON.parse(saved));
    } catch (e) {
      console.error("Load inbox error:", e);
    }
  }

  function markAsRead(id: number) {
    const newInbox = inbox.map(m => m.id === id ? { ...m, read: true } : m);
    setInbox(newInbox);
    localStorage.setItem("hosen_inbox", JSON.stringify(newInbox));
  }

  function deleteInboxItem(id: number) {
    const newInbox = inbox.filter(m => m.id !== id);
    setInbox(newInbox);
    localStorage.setItem("hosen_inbox", JSON.stringify(newInbox));
  }

  function clearReadInbox() {
    const newInbox = inbox.filter(m => !m.read);
    setInbox(newInbox);
    localStorage.setItem("hosen_inbox", JSON.stringify(newInbox));
  }

  async function loadData() {
    setDataLoading(true);
    try {
      const [gSnap, pSnap, uSnap] = await Promise.all([
        getDocs(query(collection(db, "groups"),   orderBy("name"))),
        getDocs(query(collection(db, "programs"), orderBy("name"))),
        getDocs(query(collection(db, "users"),    orderBy("name"))),
      ]);
      setGroups(gSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
      setPrograms(pSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
      setUsers(uSnap.docs.map(d => ({
        id: d.id,
        name:  d.data().name  || d.data().email || "ללא שם",
        email: d.data().email || "",
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setDataLoading(false);
    }
  }

  async function loadLogs() {
    try {
      const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(20));
      const snap = await getDocs(q);
      setLogs(snap.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        targetLabel: d.data().target?.everyone ? "כולם" : 
                    d.data().target?.role ? `תפקיד: ${d.data().target.role}` :
                    d.data().target?.groupId ? "קבוצה" :
                    d.data().target?.userId ? "משתמש" : "אחר"
      } as NotifLog)));
    } catch (e) {
      console.error(e);
    }
  }

  function getTargetLabel(): string {
    switch (mode) {
      case "everyone": return "כל המשתמשים";
      case "roles":    return selectedRoles.map(r => ROLES.find(x => x.id === r)?.label).join(", ");
      case "group":    return groups.find(g => g.id === selectedGroupId)?.name ?? "";
      case "program":  return programs.find(p => p.id === selectedProgramId)?.name ?? "";
      case "user":     return selectedUserName;
    }
  }

  function isValid(): boolean {
    if (!title.trim()) return false;
    if (mode === "roles"   && selectedRoles.length === 0) return false;
    if (mode === "group"   && !selectedGroupId)           return false;
    if (mode === "program" && !selectedProgramId)         return false;
    if (mode === "user"    && !selectedUserId)            return false;
    return true;
  }

  async function handleSend() {
    if (!isValid()) return;
    setSending(true);
    setResult(null);
    setSendError(null);

    try {
      const payload: Record<string, unknown> = { title: title.trim(), body: body.trim(), link };
      switch (mode) {
        case "everyone": payload.everyone = true;                  break;
        case "roles":    payload.role     = selectedRoles;         break;
        case "group":    payload.groupId  = selectedGroupId;       break;
        case "program":  payload.programId = selectedProgramId;    break;
        case "user":     payload.userId   = selectedUserId;        break;
      }

      const res  = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה בשליחה");

      setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 });

      await addDoc(collection(db, "notificationLogs"), {
        title:       title.trim(),
        body:        body.trim(),
        targetType:  mode,
        targetLabel: getTargetLabel(),
        sentAt:      serverTimestamp(),
        sentBy:      user?.uid ?? "",
        sentByName:  user?.displayName ?? "מנהל",
        sentCount:   data.sent    ?? 0,
        failedCount: data.failed  ?? 0,
        link,
      });
      await loadLogs();
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSending(false);
    }
  }
  
  async function handleDeleteLog(id: string) {
    if (!confirm("האם למחוק את תיעוד ההודעה?")) return;
    try {
      await deleteDoc(doc(db, "notifications", id));
      setLogs(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      console.error("Delete error:", e);
    }
  }

  async function handleClearAllLogs() {
    if (!confirm("האם למחוק את כל היסטוריית ההודעות?")) return;
    try {
      const promises = logs.map(l => deleteDoc(doc(db, "notificationLogs", l.id)));
      await Promise.all(promises);
      setLogs([]);
    } catch (e) {
      console.error("Clear error:", e);
    }
  }

  function toggleRole(roleId: string) {
    setSelectedRoles(prev =>
      prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]
    );
  }

  function resetTarget() {
    setSelectedRoles([]);
    setSelectedGroupId("");
    setSelectedProgramId("");
    setSelectedUserId("");
    setSelectedUserName("");
    setUserSearch("");
  }

  const filteredUsers = userSearch
    ? users.filter(u => u.name.includes(userSearch) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
    : users.slice(0, 6);

  function formatTime(ts: Timestamp | undefined) {
    if (!ts) return "";
    const d = ts.toDate();
    return `${d.toLocaleDateString("he-IL")} ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
  }

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)]">

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/80 backdrop-blur-md border-b border-[var(--border)] px-4 md:px-8">
          <div className="flex items-center gap-4 h-16">
            <div className="hidden md:flex items-center gap-2 text-[11px] text-[var(--muted)]">
              <Link href="/admin" className="hover:text-[var(--foreground)] transition-colors">ניהול</Link>
              <ChevronLeft className="w-3 h-3 rotate-180" />
              <span className="text-[var(--foreground)] font-bold">הודעות פוש</span>
            </div>
            
            <button
              onClick={() => router.push("/admin")}
              className="md:hidden p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[var(--foreground)] flex items-center justify-center text-[var(--background)]">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-black text-[var(--foreground)]">הודעות ועדכונים</h1>
                <p className="text-[10px] text-[var(--muted)] font-bold">ניהול תקשורת והתראות לצוות</p>
              </div>
            </div>
          </div>
        </header>

        {/* ── Content ── */}
        <main className="max-w-[1600px] mx-auto p-4 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* ── Right: Composer (7 cols) ── */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 md:p-8 space-y-8 shadow-xl">
                <div>
                  <h2 className="text-lg font-black text-[var(--foreground)] mb-1">שליחת הודעה חדשה</h2>
                  <p className="text-xs text-[var(--muted)] font-bold">בחר קהל יעד ונסח את ההודעה</p>
                </div>

          {/* ── Target ── */}
                <section>
                  <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest mb-4">1. קהל יעד</p>

                  <div className="flex gap-2 flex-wrap mb-6">
                    {TARGET_MODES.map(m => {
                      const active = mode === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => { setMode(m.id); resetTarget(); }}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black border transition-all ${
                            active
                              ? "bg-[var(--foreground)] border-[var(--foreground)] text-[var(--background)]"
                              : "bg-[var(--foreground)]/5 border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]/50 hover:text-[var(--foreground)]"
                          }`}
                        >
                          <m.icon className="w-4 h-4" />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>

                  <AnimatePresence mode="wait">
                    {mode === "everyone" && (
                      <motion.div key="everyone"
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-3 text-xs text-slate-500 bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-4"
                      >
                        <Globe className="w-5 h-5 text-emerald-500 shrink-0" />
                        ההודעה תישלח לכל המשתמשים המאושרים במערכת
                      </motion.div>
                    )}

                    {mode === "roles" && (
                      <motion.div key="roles"
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl p-6 space-y-6"
                      >
                        <div>
                          <p className="text-[10px] text-[var(--muted)] font-black uppercase tracking-widest mb-3">חתכים מהירים</p>
                          <div className="flex gap-2 flex-wrap">
                            {SEGMENTS.map(s => (
                              <button
                                key={s.label}
                                onClick={() => setSelectedRoles(s.roles)}
                                className="text-xs px-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--muted)] hover:text-[var(--foreground)] font-bold transition-all"
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {ROLES.map(r => {
                            const checked = selectedRoles.includes(r.id);
                            return (
                              <button
                                key={r.id}
                                onClick={() => toggleRole(r.id)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold border transition-all text-right ${
                                  checked
                                    ? "bg-slate-900 border-slate-900 text-white"
                                    : "bg-white border-slate-100 text-slate-600 hover:border-slate-300"
                                }`}
                              >
                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                  checked ? "bg-white border-white" : "border-slate-200"
                                }`}>
                                  {checked && <div className="w-2 h-2 bg-slate-900 rounded-sm" />}
                                </div>
                                {r.label}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}

                    {mode === "group" && (
                      <motion.div key="group"
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      >
                        {dataLoading ? (
                          <div className="flex items-center justify-center py-6 bg-slate-50 border border-slate-100 rounded-2xl">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                          </div>
                        ) : (
                          <select
                            value={selectedGroupId}
                            onChange={e => setSelectedGroupId(e.target.value)}
                            className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl px-5 py-3.5 text-sm font-bold text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)] transition-colors appearance-none"
                          >
                            <option value="">בחר קבוצה...</option>
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        )}
                      </motion.div>
                    )}

                    {mode === "program" && (
                      <motion.div key="program"
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      >
                        {dataLoading ? (
                          <div className="flex items-center justify-center py-6 bg-slate-50 border border-slate-100 rounded-2xl">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                          </div>
                        ) : (
                          <select
                            value={selectedProgramId}
                            onChange={e => setSelectedProgramId(e.target.value)}
                            className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl px-5 py-3.5 text-sm font-bold text-[var(--foreground)] focus:outline-none focus:border-[var(--foreground)] transition-colors appearance-none"
                          >
                            <option value="">בחר תוכנית...</option>
                            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                      </motion.div>
                    )}

                    {mode === "user" && (
                      <motion.div key="user"
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="space-y-3"
                      >
                        <div className="relative">
                          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]/50" />
                          <input
                            type="text"
                            placeholder="חיפוש לפי שם או אימייל..."
                            value={userSearch}
                            onChange={e => setUserSearch(e.target.value)}
                            className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl pr-11 pl-4 py-3.5 text-sm font-bold focus:outline-none focus:border-[var(--foreground)] transition-colors placeholder:text-[var(--muted)]/40"
                          />
                        </div>
                        <div className="max-h-64 overflow-y-auto space-y-2 p-1">
                          {filteredUsers.map(u => (
                            <button
                              key={u.id}
                              onClick={() => { setSelectedUserId(u.id); setSelectedUserName(u.name); }}
                              className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-sm text-right transition-all border ${
                                selectedUserId === u.id
                                  ? "bg-[var(--foreground)] border-[var(--foreground)] text-[var(--background)]"
                                  : "bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--muted)]/50"
                              }`}
                            >
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                                selectedUserId === u.id ? "bg-[var(--background)]/10 text-[var(--background)]" : "bg-[var(--foreground)]/5 text-[var(--muted)]"
                              }`}>
                                {u.name.charAt(0)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-black truncate leading-tight">{u.name}</p>
                                <p className={`text-[10px] truncate ${selectedUserId === u.id ? "text-white/60" : "text-slate-400"}`}>
                                  {u.email}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>

                {/* ── 2. Message ── */}
                <section className="space-y-4">
                  <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest">2. תוכן ההודעה</p>

                  <div className="space-y-4">
                    <input
                      type="text"
                      placeholder="כותרת ההודעה *"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      maxLength={100}
                      className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-[var(--foreground)] transition-colors placeholder:text-[var(--muted)]/40"
                    />

                    <textarea
                      placeholder="תוכן ההודעה (אופציונלי)"
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      maxLength={300}
                      rows={4}
                      className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-[var(--foreground)] transition-colors placeholder:text-[var(--muted)]/40 resize-none"
                    />

                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => setShowLink(v => !v)}
                        className="text-xs font-black text-slate-400 hover:text-slate-900 transition-colors flex items-center gap-2"
                      >
                        <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                          {showLink ? "-" : "+"}
                        </div>
                        {showLink ? "הסתר קישור" : "הוסף קישור להודעה"}
                      </button>

                      <AnimatePresence>
                        {showLink && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <input
                              type="text"
                              placeholder="קישור (למשל: /attendance/overview)"
                              value={link}
                              onChange={e => setLink(e.target.value)}
                              className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-[var(--foreground)] transition-colors placeholder:text-[var(--muted)]/40"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </section>

                {/* ── 3. Send ── */}
                <div className="pt-4">
                  <button
                    onClick={handleSend}
                    disabled={sending || !isValid()}
                    className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl bg-[var(--foreground)] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed text-[var(--background)] font-black text-sm transition-all active:scale-[0.98] shadow-xl shadow-[var(--foreground)]/10"
                  >
                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    שלח הודעה כעת
                  </button>

                  <AnimatePresence>
                    {result && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="mt-4 flex items-center gap-3 px-6 py-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700 text-xs font-bold"
                      >
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <span>
                          נשלח בהצלחה ל-{result.sent} נמענים
                          {result.failed > 0 ? ` (${result.failed} נכשלו)` : ""}
                        </span>
                      </motion.div>
                    )}
                    {sendError && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="mt-4 flex items-center gap-3 px-6 py-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-xs font-bold"
                      >
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <span>{sendError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* ── Left: Activity & History (5 cols) ── */}
            <div className="lg:col-span-5 space-y-8 h-[calc(100vh-140px)] overflow-y-auto no-scrollbar pb-10">
              
              {/* 📥 INBOX: Received Notifications */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl flex flex-col shrink-0 shadow-lg">
                <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-[var(--foreground)]">התראות שקיבלתי</h2>
                      <p className="text-[10px] text-[var(--muted)] font-bold">הודעות פוש אחרונות למכשיר זה</p>
                    </div>
                  </div>
                  {inbox.some(m => m.read) && (
                    <button 
                      onClick={clearReadInbox}
                      className="text-[10px] font-black text-rose-500 hover:text-rose-600 transition-colors p-2"
                    >
                      נקה הודעות שנקראו
                    </button>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  {inbox.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-[var(--muted)]/20 gap-2 text-center">
                      <Bell className="w-8 h-8 opacity-20" />
                      <p className="text-[10px] font-bold">התיבה ריקה</p>
                    </div>
                  ) : (
                    inbox.map((msg) => (
                      <div 
                        key={msg.id}
                        onClick={() => markAsRead(msg.id)}
                        className={`group relative border rounded-2xl p-4 transition-all cursor-pointer ${
                          msg.read 
                            ? "bg-[var(--foreground)]/[0.02] border-transparent opacity-60" 
                            : "bg-[var(--surface-raised)] border-[var(--border)] shadow-sm hover:border-[var(--muted)]/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {!msg.read && <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                              <p className="text-xs font-black text-[var(--foreground)] truncate">{msg.title}</p>
                            </div>
                            <p className="text-[11px] text-[var(--muted)] line-clamp-1">{msg.body}</p>
                            <p className="text-[9px] text-slate-400 font-bold mt-2">
                              {new Date(msg.receivedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {msg.link && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); window.location.href = msg.link!; }}
                                className="p-1.5 text-slate-400 hover:text-slate-900 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button 
                              onClick={(e) => { e.stopPropagation(); deleteInboxItem(msg.id); }}
                              className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 📋 LOGS: Sent History */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl flex flex-col shrink-0 shadow-lg">
                <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[var(--foreground)]/10 text-[var(--foreground)] flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-[var(--foreground)]">היסטוריית שליחות</h2>
                      <p className="text-[10px] text-[var(--muted)] font-bold">תיעוד הודעות שנשלחו מהמערכת</p>
                    </div>
                  </div>
                  {logs.length > 0 && (
                    <button 
                      onClick={handleClearAllLogs}
                      className="text-[10px] font-black text-rose-500 hover:text-rose-600 transition-colors p-2"
                    >
                      נקה הכל
                    </button>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  {logs.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-300 gap-2 text-center">
                      <Send className="w-8 h-8 opacity-20" />
                      <p className="text-[10px] font-bold">אין הודעות בהיסטוריה</p>
                    </div>
                  ) : (
                    logs.map((log, i) => (
                      <div
                        key={log.id}
                        className="group bg-[var(--foreground)]/[0.02] border border-[var(--border)] rounded-2xl p-4 hover:bg-[var(--surface-raised)] hover:border-[var(--muted)]/50 transition-all"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-[var(--foreground)] leading-tight mb-1">{log.title}</p>
                            {log.body && (
                              <p className="text-[10px] text-[var(--muted)] line-clamp-1 mb-3">{log.body}</p>
                            )}
                            
                            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--border-subtle)]">
                              <div className="flex items-center gap-1 text-[9px] text-[var(--muted)] font-bold">
                                <User className="w-2.5 h-2.5" />
                                {log.targetLabel}
                              </div>
                              <div className="flex items-center gap-1 text-[9px] text-emerald-500 font-black">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                {log.recipientIds?.length || 0} נמענים
                              </div>
                              <div className="flex items-center gap-1 text-[9px] text-blue-500 font-black">
                                <BookOpen className="w-2.5 h-2.5" />
                                {log.readBy?.length || 0} קראו
                              </div>
                              <div className="flex items-center gap-1 text-[9px] text-[var(--muted)] font-medium mr-auto">
                                <Clock className="w-2.5 h-2.5" />
                                {formatTime(log.createdAt)}
                              </div>
                            </div>
                          </div>
                          
                          <button 
                            onClick={() => setSelectedLogForStatus(log)}
                            className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                            title="מי קרא?"
                          >
                            <User className="w-3.5 h-3.5" />
                          </button>

                          <button 
                            onClick={() => handleDeleteLog(log.id)}
                            className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-rose-500 transition-all rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 🔍 READ STATUS MODAL */}
              <AnimatePresence>
                {selectedLogForStatus && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                      onClick={() => setSelectedLogForStatus(null)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 20 }}
                      className="relative w-full max-w-lg bg-[var(--surface)] rounded-[2rem] border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                      dir="rtl"
                    >
                      <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--foreground)]/[0.02]">
                        <div>
                          <h3 className="text-sm font-black text-[var(--foreground)]">מצב קריאה</h3>
                          <p className="text-[10px] text-[var(--muted)] font-bold">{selectedLogForStatus.title}</p>
                        </div>
                        <button onClick={() => setSelectedLogForStatus(null)} className="p-2 hover:bg-[var(--foreground)]/5 rounded-xl transition-all">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                        {/* Summary Stats */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-center">
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">קראו</p>
                            <p className="text-2xl font-black text-emerald-600">{selectedLogForStatus.readBy?.length || 0}</p>
                          </div>
                          <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4 text-center">
                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">טרם קראו</p>
                            <p className="text-2xl font-black text-rose-600">
                              {(selectedLogForStatus.recipientIds?.length || 0) - (selectedLogForStatus.readBy?.length || 0)}
                            </p>
                          </div>
                        </div>

                        {/* List */}
                        <div className="space-y-4">
                          <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest px-2">פירוט נמענים</p>
                          <div className="divide-y divide-[var(--border)]">
                            {selectedLogForStatus.recipientIds?.map(uid => {
                              const u = users.find(x => x.id === uid);
                              const isRead = selectedLogForStatus.readBy?.includes(uid);
                              return (
                                <div key={uid} className="py-3 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                                      isRead ? "bg-emerald-500/10 text-emerald-600" : "bg-[var(--foreground)]/5 text-[var(--muted)]"
                                    }`}>
                                      {u?.name.charAt(0) || "?"}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-[var(--foreground)] truncate">{u?.name || "משתמש לא ידוע"}</p>
                                      <p className="text-[9px] text-[var(--muted)] truncate">{u?.email || uid}</p>
                                    </div>
                                  </div>
                                  {isRead ? (
                                    <span className="text-[9px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full flex items-center gap-1">
                                      <CheckCircle2 className="w-2.5 h-2.5" />
                                      נקרא
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-2 py-1 rounded-full flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5" />
                                      ממתין
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

            </div>

          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
