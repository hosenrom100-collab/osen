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
  Globe, Shield, Layers, BookOpen, User, Clock, Search, ChevronLeft,
} from "lucide-react";
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
  sentAt: Timestamp;
  sentByName: string;
  sentCount: number;
  failedCount: number;
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
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    loadData();
    loadLogs();
  }, []);

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
      const q = query(collection(db, "notificationLogs"), orderBy("sentAt", "desc"), limit(10));
      const snap = await getDocs(q);
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as NotifLog)));
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
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6">
          <div className="flex items-center gap-3 h-12">
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <Link href="/admin" className="hover:text-[var(--foreground)] transition-colors">ניהול</Link>
              <ChevronLeft className="w-3 h-3 opacity-30 rotate-180" />
              <span className="text-[var(--foreground)]/70">הודעות</span>
            </div>
            <button
              onClick={() => router.push("/admin")}
              className="md:hidden p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-pink-400" />
              <h1 className="text-sm font-semibold">הודעות ועדכונים לצוות</h1>
            </div>
            <span className="mr-auto text-[10px] font-medium text-pink-400 bg-pink-500/8 border border-pink-500/15 px-2.5 py-1 rounded-full">
              פוש נוטיפיקציות
            </span>
          </div>
        </header>

        {/* ── Content ── */}
        <main className="px-4 md:px-6 py-6 pb-24 max-w-xl mx-auto space-y-4">

          {/* ── Target ── */}
          <section>
            <p className="text-[11px] text-[var(--muted)] font-medium uppercase tracking-wider mb-3">למי לשלוח</p>

            {/* Mode pills */}
            <div className="flex gap-2 flex-wrap mb-4">
              {TARGET_MODES.map(m => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => { setMode(m.id); resetTarget(); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      active
                        ? "bg-pink-500/10 border-pink-500/30 text-pink-400"
                        : "bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <m.icon className="w-3.5 h-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Sub-selection */}
            <AnimatePresence mode="wait">
              {mode === "everyone" && (
                <motion.div key="everyone"
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-xs text-[var(--muted)] bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3"
                >
                  <Globe className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                  ההודעה תישלח לכל המשתמשים המאושרים במערכת
                </motion.div>
              )}

              {mode === "roles" && (
                <motion.div key="roles"
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-4"
                >
                  {/* Quick presets */}
                  <div>
                    <p className="text-[10px] text-[var(--muted)] mb-2">חתכים מהירים</p>
                    <div className="flex gap-2 flex-wrap">
                      {SEGMENTS.map(s => (
                        <button
                          key={s.label}
                          onClick={() => setSelectedRoles(s.roles)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--border)] hover:border-pink-500/30 hover:text-pink-400 transition-all"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Individual role checkboxes */}
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map(r => {
                      const checked = selectedRoles.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => toggleRole(r.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-all text-right ${
                            checked
                              ? "bg-pink-500/10 border-pink-500/30 text-pink-400"
                              : "bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] hover:border-[var(--border-strong)]"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            checked ? "bg-pink-500 border-pink-500" : "border-[var(--border)]"
                          }`}>
                            {checked && (
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                                <path d="M4.667 8.333L2 5.667l.933-.934 1.734 1.734 3.4-3.4.933.933z"/>
                              </svg>
                            )}
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
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--muted)]" />
                  ) : (
                    <select
                      value={selectedGroupId}
                      onChange={e => setSelectedGroupId(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-pink-500/50 transition-colors"
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
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--muted)]" />
                  ) : (
                    <select
                      value={selectedProgramId}
                      onChange={e => setSelectedProgramId(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-pink-500/50 transition-colors"
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
                  className="space-y-2"
                >
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]" />
                    <input
                      type="text"
                      placeholder="חיפוש לפי שם או אימייל..."
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pr-9 pl-4 py-2.5 text-sm focus:outline-none focus:border-pink-500/50 transition-colors placeholder:text-[var(--muted)]"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => { setSelectedUserId(u.id); setSelectedUserName(u.name); }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-right transition-all border ${
                          selectedUserId === u.id
                            ? "bg-pink-500/10 border-pink-500/30 text-pink-400"
                            : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--border-strong)]"
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-[var(--background)] border border-[var(--border)] flex items-center justify-center text-xs font-medium shrink-0">
                          {u.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate leading-tight">{u.name}</p>
                          <p className="text-[10px] text-[var(--muted)] truncate">{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* ── Message ── */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
            <p className="text-[11px] text-[var(--muted)] font-medium uppercase tracking-wider">תוכן ההודעה</p>

            <input
              type="text"
              placeholder="כותרת ההודעה *"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={100}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-pink-500/50 transition-colors placeholder:text-[var(--muted)]"
            />

            <textarea
              placeholder="תוכן ההודעה (אופציונלי)"
              value={body}
              onChange={e => setBody(e.target.value)}
              maxLength={300}
              rows={3}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-pink-500/50 transition-colors placeholder:text-[var(--muted)] resize-none"
            />

            <button
              onClick={() => setShowLink(v => !v)}
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              {showLink ? "הסתר קישור" : "+ הוסף קישור (אופציונלי)"}
            </button>

            {showLink && (
              <input
                type="text"
                placeholder="קישור (למשל: /attendance/overview)"
                value={link}
                onChange={e => setLink(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-pink-500/50 transition-colors placeholder:text-[var(--muted)]"
              />
            )}
          </section>

          {/* ── Send ── */}
          <button
            onClick={handleSend}
            disabled={sending || !isValid()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all shadow-lg shadow-pink-600/20 active:scale-[0.98]"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            שלח הודעה
          </button>

          {/* Result feedback */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  נשלח ל-{result.sent} נמענים
                  {result.failed > 0 ? ` · ${result.failed} נכשלו` : ""}
                </span>
              </motion.div>
            )}
            {sendError && (
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-2 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{sendError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── History ── */}
          {logs.length > 0 && (
            <section className="pt-4">
              <p className="text-[11px] text-[var(--muted)] font-medium uppercase tracking-wider mb-3">היסטוריית שליחות</p>
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight">{log.title}</p>
                        {log.body && (
                          <p className="text-xs text-[var(--muted)] truncate mt-0.5">{log.body}</p>
                        )}
                        <p className="text-[10px] text-[var(--muted)] mt-1.5 flex items-center gap-1">
                          <span className="text-pink-400/70">→</span>
                          {log.targetLabel}
                          <span className="opacity-40">·</span>
                          {log.sentCount} נמענים
                          {log.failedCount > 0 && (
                            <span className="text-rose-400/70 mr-1">{log.failedCount} נכשלו</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-[var(--muted)] shrink-0 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {formatTime(log.sentAt)}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </RoleGuard>
  );
}
