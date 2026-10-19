"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { ArrowDown, ArrowUp, Check, Download, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { useAutoSave } from "@/hooks/useAutoSave";
import { AutoSaveIndicator } from "@/components/ui/AutoSaveIndicator";
import { loadActivityTypes } from "@/lib/workshops/activityTypes";
import type { Workshop } from "@/lib/workshops/types";
import { generateDocxWithLetterhead, generatePersonalRehabPlanWord } from "@/lib/word-generator";
import {
  AREA_PRESETS, GOAL_PRESETS, OBJECTIVE_PRESETS, SUPPORT_PRESETS, WAY_PRESETS,
  activitiesWay, areaFromPreset, emptyPlan, missingParts, move, parsePlan, programActivities,
  quickFill, suggestForArea, toggle, type ProgramActivity, type RehabArea, type RehabPlan,
} from "@/lib/rehabPlan";

/**
 * Smart template for a personal rehabilitation plan. The header comes from the participant's record,
 * the "ways of action" are chips of the activities in the participant's programs (the ones they
 * attend most first), and every section has ready texts one tap away. Saves as you type to
 * rehab_plans/{patientId}; "הפקה" writes the plan on the letterhead (דף הלוגו) as Word.
 */
export function RehabPlanBuilder({ patientId, patientName, patientIdNumber, programIds, attendedByWorkshop, defaults, signatureImage, userId, onClose, onExported }: {
  patientId: string;
  patientName: string;
  patientIdNumber: string;
  programIds: string[];
  attendedByWorkshop: Record<string, number>;
  defaults: Pick<RehabPlan, "therapistName" | "districtWorker" | "signerName" | "signerTitle">;
  signatureImage?: string;
  userId?: string;
  onClose: () => void;
  onExported?: () => void;
}) {
  const [plan, setPlan] = useState<RehabPlan | null>(null);
  const [activities, setActivities] = useState<ProgramActivity[]>([]);
  const [hasSaved, setHasSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const planRef = useRef<RehabPlan | null>(null);
  useEffect(() => { planRef.current = plan; }, [plan]);

  const autoSave = useAutoSave(async () => {
    if (!planRef.current) return;
    await setDoc(doc(db, "rehab_plans", patientId), {
      ...planRef.current, patientId, updatedBy: userId || null, updatedAt: serverTimestamp(),
    });
    setHasSaved(true);
  }, 1200);

  useEffect(() => {
    let alive = true;
    (async () => {
      const base = emptyPlan(defaults);
      const [saved, types, wSnap] = await Promise.all([
        getDoc(doc(db, "rehab_plans", patientId)).catch(() => null),
        loadActivityTypes(),
        programIds.length
          ? getDocs(query(collection(db, "workshops"), where("programId", "in", programIds.slice(0, 30)))).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!alive) return;
      const workshops = (wSnap?.docs ?? []).map(d => ({ id: d.id, ...d.data() }) as Workshop);
      const today = new Date().toISOString().slice(0, 10);
      setActivities(programActivities(workshops, programIds, types, today, attendedByWorkshop));
      setHasSaved(!!saved?.exists());
      // A saved plan keeps its own texts; an empty header field takes today's default.
      const p = saved?.exists() ? parsePlan(saved.data(), base) : base;
      setPlan({ ...p, therapistName: p.therapistName || base.therapistName, districtWorker: p.districtWorker || base.districtWorker,
        signerName: p.signerName || base.signerName, signerTitle: p.signerTitle || base.signerTitle });
    })();
    return () => { alive = false; };
    // Loaded once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const edit = (fn: (p: RehabPlan) => RehabPlan) => {
    setPlan(p => (p ? fn(p) : p));
    autoSave.trigger();
  };
  const setArea = (i: number, patch: Partial<RehabArea>) =>
    edit(p => ({ ...p, areas: p.areas.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  const chosenActivities = useMemo(
    () => [...new Set((plan?.areas ?? []).flatMap(a => a.farmActions))],
    [plan?.areas],
  );

  const missing = plan ? missingParts(plan) : [];

  const exportWord = async () => {
    if (!plan || missing.length) return;
    autoSave.saveNow();
    setExporting(true);
    try {
      const d = generatePersonalRehabPlanWord(plan, { patientName, patientId: patientIdNumber, signatureImage });
      await generateDocxWithLetterhead(d, `תוכנית_שיקום_${patientName.replace(/\s+/g, "_")}.docx`);
      onExported?.();
    } catch (e) {
      console.error(e);
      alert("שגיאה בהפקת המסמך");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="תוכנית שיקום אישית"
        className="relative w-full sm:max-w-3xl h-[94vh] sm:h-[90vh] flex flex-col bg-white text-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden text-right">
        <header className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">תוכנית שיקום אישית</h2>
            <p className="text-[12px] text-slate-500 truncate">{patientName}{patientIdNumber ? ` · ת.ז ${patientIdNumber}` : ""}</p>
          </div>
          <AutoSaveIndicator status={autoSave.status} error={autoSave.error} onRetry={autoSave.saveNow} />
          <button onClick={onClose} aria-label="סגור" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </header>

        {!plan ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {!hasSaved && !plan.areas.length && (
              <button onClick={() => edit(p => quickFill(p, activities))}
                className="w-full flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-right hover:bg-violet-100 transition-colors">
                <Sparkles className="w-5 h-5 text-violet-500 shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-violet-800">מילוי מהיר לפי התוכנית</span>
                  <span className="block text-[12px] text-violet-700/80">
                    ממלא תחומים, מטרה, יעדים ומקורות סיוע, עם הפעילויות שבתוכנית{activities.length ? ` (${activities.length})` : ""}. אחר כך רק מתקנים.
                  </span>
                </span>
              </button>
            )}

            {/* Header fields */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="תאריך" value={plan.date} onChange={v => edit(p => ({ ...p, date: v }))} />
              <Field label="איש הצוות הטיפולי המלווה בחווה" value={plan.therapistName} onChange={v => edit(p => ({ ...p, therapistName: v }))} />
              <Field label="שם העו״ס במחוז" value={plan.districtWorker} onChange={v => edit(p => ({ ...p, districtWorker: v }))} />
            </section>

            {/* Part A */}
            <section className="space-y-3">
              <SectionTitle>חלק א׳: באילו תחומים היית רוצה להביא לשיפור (לפי סדר חשיבות)</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {AREA_PRESETS.map(pr => {
                  const on = plan.areas.some(a => a.id === pr.id);
                  return (
                    <Chip key={pr.id} on={on} onClick={() => edit(p => on
                      ? { ...p, areas: p.areas.filter(a => a.id !== pr.id) }
                      : { ...p, areas: [...p.areas, areaFromPreset(pr, suggestForArea(pr, activities).fits.slice(0, 3))] })}>
                      {pr.title}
                    </Chip>
                  );
                })}
                <Chip on={false} onClick={() => edit(p => ({ ...p, areas: [...p.areas, { id: `custom_${Date.now()}`, title: "", description: "", farmActions: [] }] }))}>
                  <Plus className="w-3.5 h-3.5" /> תחום אחר
                </Chip>
              </div>

              {plan.areas.map((area, i) => {
                const preset = AREA_PRESETS.find(pr => pr.id === area.id);
                const { fits, others } = suggestForArea(preset, activities);
                const extra = area.farmActions.filter(n => !fits.includes(n) && !others.includes(n));
                return (
                  <div key={area.id} className="rounded-2xl border border-slate-200 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-violet-500 text-white text-[12px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <input value={area.title} onChange={e => setArea(i, { title: e.target.value })} placeholder="שם התחום"
                        className="flex-1 min-w-0 bg-transparent font-bold text-sm outline-none border-b border-transparent focus:border-violet-300" />
                      <IconBtn label="למעלה" disabled={i === 0} onClick={() => edit(p => ({ ...p, areas: move(p.areas, i, i - 1) }))}><ArrowUp className="w-4 h-4" /></IconBtn>
                      <IconBtn label="למטה" disabled={i === plan.areas.length - 1} onClick={() => edit(p => ({ ...p, areas: move(p.areas, i, i + 1) }))}><ArrowDown className="w-4 h-4" /></IconBtn>
                      <IconBtn label="הסר" onClick={() => edit(p => ({ ...p, areas: p.areas.filter((_, j) => j !== i) }))}><Trash2 className="w-4 h-4" /></IconBtn>
                    </div>
                    <AutoText value={area.description} onChange={v => setArea(i, { description: v })} placeholder="תיאור קצר של התחום" />
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 mb-1">דרכי פעולה בחווה</p>
                      <div className="flex flex-wrap gap-1.5">
                        {fits.map(n => <Chip key={n} on={area.farmActions.includes(n)} hint onClick={() => setArea(i, { farmActions: toggle(area.farmActions, n) })}>{n}</Chip>)}
                        {others.map(n => <Chip key={n} on={area.farmActions.includes(n)} onClick={() => setArea(i, { farmActions: toggle(area.farmActions, n) })}>{n}</Chip>)}
                        {extra.map(n => <Chip key={n} on onClick={() => setArea(i, { farmActions: toggle(area.farmActions, n) })}>{n}</Chip>)}
                        <AddChip onAdd={n => setArea(i, { farmActions: [...area.farmActions, n] })} />
                      </div>
                      {!activities.length && <p className="text-[11px] text-slate-400 mt-1">לא נמצאו סדנאות פעילות בתוכנית של המשתתף/ת. אפשר להוסיף פעילות ידנית.</p>}
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Part B */}
            <section className="space-y-3">
              <SectionTitle>חלק ב׳: הגדרת המטרה באופן ספציפי וברור</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {GOAL_PRESETS.map(g => <Chip key={g} on={plan.goal === g} onClick={() => edit(p => ({ ...p, goal: g }))}>{g}</Chip>)}
              </div>
              <AutoText value={plan.goal} onChange={v => edit(p => ({ ...p, goal: v }))} placeholder="הגדרת המטרה" />

              <p className="text-[12px] font-bold text-slate-600 pt-1">יעדים מרכזיים</p>
              <ListEditor items={plan.objectives} presets={OBJECTIVE_PRESETS} numbered
                onChange={objectives => edit(p => ({ ...p, objectives }))} />
            </section>

            {/* Table */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <SectionTitle>דרכים אפשריות להשגת המטרה (בדגש החווה)</SectionTitle>
                {chosenActivities.length > 0 && (
                  <Chip on={plan.ways.includes(activitiesWay(chosenActivities))} hint
                    onClick={() => edit(p => ({ ...p, ways: toggle(p.ways, activitiesWay(chosenActivities)) }))}>
                    <Sparkles className="w-3.5 h-3.5" /> חיבור לפעילויות שנבחרו
                  </Chip>
                )}
                <ListEditor items={plan.ways} presets={WAY_PRESETS} onChange={ways => edit(p => ({ ...p, ways }))} />
              </div>
              <div className="space-y-2">
                <SectionTitle>מקורות סיוע להשגת המטרה: מה או מי יכול לסייע?</SectionTitle>
                <ListEditor items={plan.supports} presets={SUPPORT_PRESETS} onChange={supports => edit(p => ({ ...p, supports }))} />
              </div>
            </section>

            {/* Signature */}
            <section className="space-y-2">
              <SectionTitle>חתימה</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="שם" value={plan.signerName} onChange={v => edit(p => ({ ...p, signerName: v }))} />
                <Field label="תפקיד" value={plan.signerTitle} onChange={v => edit(p => ({ ...p, signerTitle: v }))} />
                <Field label="צוות / ארגון" value={plan.signerOrg} onChange={v => edit(p => ({ ...p, signerOrg: v }))} />
              </div>
            </section>
          </div>
        )}

        <footer className="flex items-center gap-3 px-5 py-3 border-t border-slate-100 shrink-0 bg-slate-50/60 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="flex-1 text-[12px] text-slate-500 leading-snug">
            {plan && missing.length ? `חסר: ${missing.join(", ")}` : "התוכנית נשמרת אוטומטית. ההפקה היא על דף הלוגו, בפורמט Word."}
          </p>
          <button onClick={exportWord} disabled={!plan || missing.length > 0 || exporting}
            className="flex items-center gap-1.5 rounded-xl bg-violet-500 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            הפקת תוכנית
          </button>
        </footer>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[13px] font-bold text-slate-800">{children}</h3>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-slate-500 mb-1">{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
    </label>
  );
}

function AutoText({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      rows={Math.max(2, value.split("\n").length + Math.floor(value.length / 90))}
      className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
  );
}

function Chip({ on, hint, onClick, children }: { on: boolean; hint?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold text-right transition-colors ${
        on ? "bg-violet-500 border-violet-500 text-white"
          : hint ? "bg-violet-50 border-violet-200 text-violet-800 hover:border-violet-400"
          : "bg-white border-slate-200 text-slate-600 hover:border-violet-300"}`}>
      {on && <Check className="w-3.5 h-3.5 shrink-0" />}
      {children}
    </button>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30">
      {children}
    </button>
  );
}

function AddChip({ onAdd }: { onAdd: (name: string) => void }) {
  const [text, setText] = useState("");
  const add = () => { const t = text.trim(); if (t) onAdd(t); setText(""); };
  return (
    <input value={text} onChange={e => setText(e.target.value)} placeholder="+ פעילות אחרת"
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add}
      className="w-32 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[12px] outline-none focus:border-violet-400" />
  );
}

/** Editable lines plus ready texts: tapping a ready text adds it (or removes it if already in). */
function ListEditor({ items, presets, numbered, onChange }: { items: string[]; presets: string[]; numbered?: boolean; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          {numbered && <span className="mt-2 text-[12px] font-bold text-slate-400 w-4 shrink-0">{i + 1}.</span>}
          <div className="flex-1"><AutoText value={it} onChange={v => onChange(items.map((x, j) => (j === i ? v : x)))} /></div>
          <IconBtn label="הסר" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></IconBtn>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {presets.map(pr => <Chip key={pr} on={items.includes(pr)} onClick={() => onChange(toggle(items, pr))}>{pr}</Chip>)}
        <Chip on={false} onClick={() => onChange([...items, ""])}><Plus className="w-3.5 h-3.5" /> שורה חופשית</Chip>
      </div>
    </div>
  );
}
