"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Check, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function AdminPasswordSection() {
  const { user } = useAuth();
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const call = async (method: "GET" | "POST", body?: object) => {
    const token = await user!.getIdToken();
    const res = await fetch("/api/admin/set-password", {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };

  useEffect(() => {
    if (!user) return;
    call("GET").then((d) => setIsSet(!!d.isSet)).catch(() => setIsSet(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSave = async () => {
    setMessage(null);
    if (password.trim().length < 4) return setMessage({ ok: false, text: "הסיסמה חייבת להכיל לפחות 4 תווים" });
    if (password !== confirm) return setMessage({ ok: false, text: "הסיסמאות אינן תואמות" });
    setSaving(true);
    try {
      const d = await call("POST", { password });
      if (d.success) {
        setIsSet(true);
        setPassword("");
        setConfirm("");
        setMessage({ ok: true, text: "סיסמת המנהל נשמרה" });
      } else {
        setMessage({ ok: false, text: d.error || "שגיאה בשמירה" });
      }
    } catch {
      setMessage({ ok: false, text: "שגיאת תקשורת, נסה שוב" });
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl p-3.5 text-xs font-bold focus:border-violet-500 outline-none transition-colors";

  return (
    <section className="border-b border-[var(--border)] py-6 space-y-4">
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
        <KeyRound className="w-5 h-5 text-violet-500" />
        <h2 className="text-xs font-bold">סיסמת מנהל (רשימת קניות)</h2>
        {isSet !== null && (
          <span className={`text-[11px] font-bold ${isSet ? "text-emerald-500" : "text-rose-500"}`}>
            {isSet ? "מוגדרת" : "לא מוגדרת"}
          </span>
        )}
      </div>
      <p className="text-[11px] text-[var(--muted)] font-medium">
        הסיסמה נדרשת לפעולות רגישות ברשימת הקניות, כמו סגירת מחזור. ניתן לשנות אותה רק על ידי אדמין.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="סיסמה חדשה" className={inputClass} />
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="אימות סיסמה" className={inputClass} />
      </div>
      {message && (
        <div className={`flex items-center gap-2 text-xs font-bold ${message.ok ? "text-emerald-500" : "text-rose-500"}`}>
          {message.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}
      <button
        onClick={handleSave}
        disabled={saving || !password}
        className="h-10 px-5 rounded-xl bg-violet-600 text-white text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center gap-2"
      >
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {isSet ? "עדכן סיסמה" : "הגדר סיסמה"}
      </button>
    </section>
  );
}
