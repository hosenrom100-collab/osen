"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs } from "firebase/firestore";
import { Archive, ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Dialog, fieldCls, btnPrimary, btnGhost } from "./Dialog";
import { ActivityType, pastel, pastelCandidates, saveActivityTypes } from "@/lib/workshops/activityTypes";
import { PROGRAM_HUES } from "@/lib/workshops/colors";
import { Program, Workshop } from "@/lib/workshops/types";

const newId = () => `t_${Math.random().toString(36).slice(2, 8)}`;

/** Managers edit the activity types here: add, rename, recolour, reorder, archive, and delete the unused ones. */
export function ActivityTypesDialog({ types, programs, onClose, onSaved }: {
  types: ActivityType[]; programs: Program[]; onClose: () => void; onSaved: () => void;
}) {
  const [list, setList] = useState<ActivityType[]>(types.map(t => ({ ...t })));
  const [usage, setUsage] = useState<Map<string, number> | null>(null);
  const [openColor, setOpenColor] = useState<string | null>(null);
  const [alt, setAlt] = useState<{ id: string; options: number[]; i: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  // How many workshops and daily blocks use each type — a type in use cannot be deleted.
  useEffect(() => {
    getDocs(collection(db, "workshops")).then(snap => {
      const m = new Map<string, number>();
      snap.docs.forEach(d => { const k = (d.data() as Workshop).kind || "workshop"; m.set(k, (m.get(k) || 0) + 1); });
      programs.forEach(p => (p.dailyBlocks || []).forEach(b => m.set(b.kind, (m.get(b.kind) || 0) + 1)));
      setUsage(m);
    }).catch(() => setUsage(new Map()));
  }, [programs]);

  const patch = (id: string, p: Partial<ActivityType>) => setList(l => l.map(t => (t.id === id ? { ...t, ...p } : t)));
  const move = (i: number, d: number) => setList(l => { const a = [...l]; const j = i + d; if (j < 0 || j >= a.length) return l; [a[i], a[j]] = [a[j], a[i]]; return a; });

  const add = () => {
    const used = list.map(t => t.hue);
    const id = newId();
    setList(l => [...l, { id, label: "", hue: pastelCandidates(used)[0], band: false, hasStaff: true, hasParticipants: true, audience: "participants", order: l.length }]);
    setNotice("");
  };
  const anotherColor = (t: ActivityType) => {
    const options = alt?.id === t.id ? alt.options : pastelCandidates(list.filter(x => x.id !== t.id).map(x => x.hue));
    const i = alt?.id === t.id ? (alt.i + 1) % options.length : 0;
    setAlt({ id: t.id, options, i });
    patch(t.id, { hue: options[i] });
  };

  const usedBy = (id: string) => usage?.get(id) || 0;
  const remove = (t: ActivityType) => {
    if (usedBy(t.id) > 0) { setNotice(`"${t.label}" בשימוש ב-${usedBy(t.id)} סדנאות ורצועות ולכן אי אפשר למחוק אותו. אפשר להעביר אותו לארכיון.`); return; }
    if (!list.some(x => x.id !== t.id && !x.band && !x.archived)) { setNotice("חייב להישאר לפחות סוג אחד שמוצג ככרטיס."); return; }
    setList(l => l.filter(x => x.id !== t.id));
    setNotice("");
  };

  const empty = list.some(t => !t.label.trim());
  const dup = useMemo(() => new Set(list.map(t => t.label.trim())).size !== list.length, [list]);
  const save = async () => {
    setSaving(true);
    try { await saveActivityTypes(list.map(t => ({ ...t, label: t.label.trim() }))); onSaved(); } finally { setSaving(false); }
  };

  return (
    <Dialog title="סוגי פעילות" subtitle="הצבעים והתצוגה של כל סוג ביומן" onClose={onClose} wide
      footer={<>
        <button onClick={save} disabled={saving || empty || dup} className={btnPrimary}>שמור</button>
        <button onClick={onClose} className={btnGhost}>ביטול</button>
        <button onClick={add} className="mr-auto flex items-center gap-1 text-sm font-bold text-[var(--accent)]"><Plus className="w-4 h-4" />סוג חדש</button>
      </>}>
      <ul className="space-y-2">
        {list.map((t, i) => {
          const c = pastel(t.hue);
          const n = usedBy(t.id);
          return (
            <li key={t.id} className={`rounded-lg border border-[var(--border)] p-2.5 ${t.archived ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-2">
                <button onClick={() => setOpenColor(openColor === t.id ? null : t.id)} aria-label="בחירת צבע" aria-expanded={openColor === t.id}
                  className="w-8 h-8 rounded-md shrink-0 border-s-[3px]" style={{ backgroundColor: c.fill, borderInlineStartColor: c.bar, borderColor: c.soft }} />
                <input className={`${fieldCls} !py-1.5 font-semibold`} value={t.label} placeholder="שם הסוג" autoFocus={!t.label} onChange={e => patch(t.id, { label: e.target.value })} />
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} aria-label="למעלה" className="p-0.5 text-[var(--foreground)]/40 hover:text-[var(--foreground)]"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => move(i, 1)} aria-label="למטה" className="p-0.5 text-[var(--foreground)]/40 hover:text-[var(--foreground)]"><ArrowDown className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {openColor === t.id && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {PROGRAM_HUES.map(h => (
                    <button key={h} onClick={() => patch(t.id, { hue: h })} aria-label={`גוון ${h}`} aria-pressed={t.hue === h}
                      className={`w-6 h-6 rounded-md border-2 ${t.hue === h ? "border-[var(--foreground)]" : "border-transparent"}`} style={{ backgroundColor: pastel(h).bar }} />
                  ))}
                  <button onClick={() => anotherColor(t)} className="text-xs font-bold text-[var(--accent)] underline mr-1">צבע אחר</button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-[var(--foreground)]/70">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={t.band} onChange={e => patch(t.id, { band: e.target.checked, ...(e.target.checked ? { hasStaff: false, hasParticipants: false } : {}) })} />רצועה שקטה</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={t.hasStaff} disabled={t.band} onChange={e => patch(t.id, { hasStaff: e.target.checked })} />יש מדריך</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={t.hasParticipants} disabled={t.band} onChange={e => patch(t.id, { hasParticipants: e.target.checked })} />יש משתתפים</label>
                <label className="flex items-center gap-1.5">קהל
                  <select value={t.audience || "participants"} disabled={t.band} onChange={e => patch(t.id, { audience: e.target.value as "participants" | "staff" })} className="rounded-md border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-xs">
                    <option value="participants">משתתפים</option><option value="staff">צוות בלבד</option>
                  </select>
                </label>
                <span className="mr-auto tabular-nums">{usage === null ? "" : n > 0 ? `בשימוש ב-${n}` : "לא בשימוש"}</span>
                <button onClick={() => patch(t.id, { archived: !t.archived })} title={t.archived ? "החזר מהארכיון" : "העבר לארכיון"} className="p-1 rounded hover:bg-[var(--foreground)]/5"><Archive className="w-3.5 h-3.5" /></button>
                <button onClick={() => remove(t)} disabled={usage === null} title={n > 0 ? "בשימוש — אי אפשר למחוק" : "מחק"} className={`p-1 rounded hover:bg-[var(--foreground)]/5 ${n > 0 ? "text-[var(--foreground)]/25" : "text-rose-500"}`}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </li>
          );
        })}
      </ul>
      {notice && <p role="status" className="text-sm text-[#8a5a00] bg-[#fff6dc] rounded-md px-3 py-2">{notice}</p>}
      {dup && <p className="text-xs text-rose-500">יש שני סוגים עם אותו שם.</p>}
      <p className="text-xs text-[var(--foreground)]/50">סוג בארכיון לא מוצע לסדנאות חדשות, אבל מה שכבר משויך אליו ממשיך להופיע. לסוג חדש נבחר צבע פסטל שעוד לא בשימוש.</p>
    </Dialog>
  );
}
