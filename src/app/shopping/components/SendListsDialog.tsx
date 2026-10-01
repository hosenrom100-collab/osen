"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { FileText, Mail } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "@/components/workshops/Dialog";
import { Product, ShoppingRequest } from "../types";
import {
  DEFAULT_EMAIL_CONFIG, EmailConfig, MailAttachment, buildAttachments, buildEml, mailableLists, validAddresses,
} from "../lib/mailLists";
import { FRAMEWORK_LABELS } from "../lib/constants";

/**
 * Sends the closed weekly lists to the supplier: recipients and text are remembered, one file per
 * list and framework is attached, and the message opens in the mail program installed on the computer.
 */
export function SendListsDialog({ requests, pool, weekLabels, format, onClose, onSent }: {
  requests: ShoppingRequest[];
  pool: Product[];
  weekLabels: { supermarket: string; large: string };
  format: "word" | "pdf";
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [cfg, setCfg] = useState<EmailConfig>(DEFAULT_EMAIL_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lists = mailableLists(requests);

  useEffect(() => {
    let live = true;
    getDoc(doc(db, "settings", "shopping"))
      .then(s => { if (live && s.data()?.emailConfig) setCfg({ ...DEFAULT_EMAIL_CONFIG, ...s.data()!.emailConfig }); })
      .catch(() => {})
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, []);

  const set = (p: Partial<EmailConfig>) => setCfg(c => ({ ...c, ...p }));
  const problem = !cfg.to.trim() ? "הזן כתובת נמען" : !validAddresses(cfg.to) ? "כתובת הנמען אינה תקינה" : !validAddresses(cfg.cc) ? "כתובת בהעתק אינה תקינה" : "";

  const send = async () => {
    setBusy(true); setError("");
    try {
      const files: MailAttachment[] = await buildAttachments(requests, pool, weekLabels, format);
      const eml = await buildEml(cfg, files);
      await setDoc(doc(db, "settings", "shopping"), { emailConfig: cfg, listsSentAt: serverTimestamp() }, { merge: true });
      const url = URL.createObjectURL(eml);
      const a = document.createElement("a");
      a.href = url; a.download = "רשימות_קניות_לחוסן.eml";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      onSent("ההודעה הורדה. פתח את הקובץ ותוכנת המייל תציג אותה עם הצרופות, ואז לחץ שליחה.");
    } catch (e) {
      console.error(e);
      setError("לא הצלחתי להכין את ההודעה. נסה שוב.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog title="שליחת רשימות קניות במייל" subtitle="כל רשימה ומסגרת בקובץ נפרד, והכל נפתח בתוכנת המייל במחשב" onClose={onClose} wide
      footer={<>
        <button onClick={send} disabled={busy || !loaded || !!problem || lists.length === 0} className={`${btnPrimary} flex items-center gap-1.5`}>
          <Mail className="w-4 h-4" />{busy ? "מכין…" : "פתח בתוכנת המייל"}
        </button>
        <button onClick={onClose} className={btnGhost}>סגור</button>
        <span className="text-xs text-[var(--foreground)]/60 me-auto">{error || problem}</span>
      </>}>
      <div>
        <label className={labelCls}>צרופות ({lists.length})</label>
        {lists.length === 0 ? (
          <p className="text-sm text-[var(--foreground)]/60">אין פריטים פתוחים ברשימות.</p>
        ) : (
          <ul className="space-y-1.5">
            {lists.map(l => (
              <li key={`${l.listType}${l.framework}`} className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 shrink-0 text-[var(--foreground)]/45" />
                <span className="font-semibold">{l.listType === "large" ? "רכש וציוד" : "קניות"} · {FRAMEWORK_LABELS[l.framework] || l.framework}</span>
                <span className="text-[var(--foreground)]/55">{l.count} פריטים · {format === "pdf" ? "PDF" : "Word"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <label className={labelCls}>אל</label>
        <input dir="ltr" className={fieldCls} value={cfg.to} onChange={e => set({ to: e.target.value })} placeholder="supplier@example.com, אפשר כמה כתובות מופרדות בפסיק" />
      </div>
      <div>
        <label className={labelCls}>העתק (CC)</label>
        <input dir="ltr" className={fieldCls} value={cfg.cc} onChange={e => set({ cc: e.target.value })} placeholder="אופציונלי" />
      </div>
      <div>
        <label className={labelCls}>נושא</label>
        <input className={fieldCls} value={cfg.subject} onChange={e => set({ subject: e.target.value })} />
      </div>
      <div>
        <label className={labelCls}>תוכן ההודעה</label>
        <textarea className={`${fieldCls} min-h-[9rem]`} value={cfg.body} onChange={e => set({ body: e.target.value })} />
        <p className="text-xs text-[var(--foreground)]/50 mt-1.5">הכתובות והנוסח נשמרים לשליחה הבאה.</p>
      </div>
    </Dialog>
  );
}
