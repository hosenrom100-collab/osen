"use client";

import { useEffect, useState } from "react";
import { deleteField, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";

const newToken = () => { const a = new Uint8Array(24); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""); };

/** "Add my schedule to my phone's calendar": a private link that stays up to date. A new link cancels the old one. */
export function CalendarFeedCard() {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then(s => setToken(s.data()?.icsToken ?? null)).catch(() => setToken(null));
  }, [user]);
  if (!user || token === undefined) return null;
  const url = token ? `${window.location.origin}/api/ics/${token}` : "";
  const make = async () => { const t = newToken(); await updateDoc(doc(db, "users", user.uid), { icsToken: t }); setToken(t); };
  const stop = async () => { await updateDoc(doc(db, "users", user.uid), { icsToken: deleteField() }); setToken(null); };
  return (
    <section className="rounded-xl border border-[var(--border)] p-4 space-y-2" dir="rtl">
      <h2 className="font-bold">הלוז שלי ביומן הטלפון</h2>
      <p className="text-xs text-[var(--foreground)]/60 leading-relaxed">קישור אישי שמציג ביומן של Google או באייפון את המפגשים שלך בלבד, ומתעדכן לבד. אל תשתף אותו: כל מי שיש לו את הקישור רואה את הלוז שלך.</p>
      {token ? (
        <>
          <input readOnly dir="ltr" value={url} onFocus={e => e.currentTarget.select()} className="w-full text-xs border border-[var(--border)] rounded-lg px-2 py-1.5 bg-transparent" />
          <div className="flex flex-wrap gap-2 text-sm">
            <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="px-3 py-1.5 rounded-lg bg-[var(--btn)] text-[var(--btn-text)] font-bold">{copied ? "הועתק" : "העתק קישור"}</button>
            <button onClick={make} className="px-3 py-1.5 rounded-lg bg-[var(--btn-soft)] text-[var(--btn-soft-text)] font-semibold">קישור חדש (מבטל את הישן)</button>
            <button onClick={stop} className="px-3 py-1.5 rounded-lg text-rose-600 underline">בטל את הקישור</button>
          </div>
          <p className="text-xs text-[var(--foreground)]/55">ב-Google Calendar: הוסף יומן, מכתובת URL. באייפון: הגדרות, יומן, חשבונות, הוסף חשבון מנוי.</p>
        </>
      ) : <button onClick={make} className="px-3 py-1.5 rounded-lg bg-[var(--btn)] text-[var(--btn-text)] text-sm font-bold">צור קישור אישי</button>}
    </section>
  );
}
