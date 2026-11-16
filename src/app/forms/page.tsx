"use client";

import { useEffect, useRef, useState } from "react";
import {
  AllForms,
  EMPTY_FORMS,
  FORMS,
  FormId,
  formToText,
  fullName,
  fieldErrors,
  noneKey,
  NONE_LABEL,
} from "@/lib/forms/definitions";
import { renderFormPdf } from "@/lib/forms/renderPdf";

const STORAGE_KEY = "hosen-public-forms-v1";

function SignaturePad({ value, onChange, invalid }: { value?: string; onChange: (v: string) => void; invalid?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = value;
    }
  }, [value]);

  const pos = (e: React.PointerEvent) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1f2a44";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(ref.current!.toDataURL("image/png"));
  };

  return (
    <div>
      <canvas
        ref={ref}
        width={800}
        height={260}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className={`w-full h-40 rounded-xl border-2 border-dashed bg-white touch-none ${invalid ? "border-red-500 bg-red-50" : "border-[#9fb0cf]"}`}
      />
      <button type="button" onClick={() => onChange("")} className="mt-1 text-sm text-[#3b5f8f] underline">
        נקה חתימה
      </button>
    </div>
  );
}

export default function FormsPage() {
  const [data, setData] = useState<AllForms>(EMPTY_FORMS);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<FormId>("personal");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- טעינה מ-localStorage אפשרית רק אחרי hydration */
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setData({ ...EMPTY_FORMS, ...JSON.parse(raw) });
    } catch {}
    const h = window.location.hash.replace("#", "") as FormId;
    if (FORMS.some((f) => f.id === h)) setActive(h);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, [data, loaded]);

  const def = FORMS.find((f) => f.id === active)!;
  const values = data[active];
  const set = (key: string, v: string) => setData((d) => ({ ...d, [active]: { ...d[active], [key]: v } }));

  const setMany = (patch: Record<string, string>) => setData((d) => ({ ...d, [active]: { ...d[active], ...patch } }));

  const pick = (id: FormId) => {
    setActive(id);
    setMsg("");
    setAttempted(false);
    window.history.replaceState(null, "", "#" + id);
  };

  const send = async () => {
    const errs = fieldErrors(def, values);
    const count = Object.keys(errs).length;
    if (count) {
      setAttempted(true);
      setMsg("");
      // גלילה לשדה הראשון (לפי סדר המסך) שדורש תיקון
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>('[data-invalid="1"]');
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.querySelector<HTMLElement>("input:not([type=checkbox]),textarea")?.focus({ preventScroll: true });
      }, 50);
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const blob = await renderFormPdf(def, values);
      const fileName = `${def.title} - ${fullName(values)}.pdf`.replace(/[\\/:*?"<>|]/g, "");
      const file = new File([blob], fileName, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: def.title });
        setMsg("נפתח חלון השיתוף – בחרו וואטסאפ.");
      } else {
        // מחשב / דפדפן בלי שיתוף קבצים: מורידים את ה-PDF ופותחים וואטסאפ עם סיכום
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        const to = new URLSearchParams(window.location.search).get("to")?.replace(/\D/g, "") ?? "";
        window.open(`https://wa.me/${to}?text=${encodeURIComponent(formToText(def, values))}`, "_blank");
        setMsg("ה-PDF ירד למכשיר. צרפו אותו בשיחת הוואטסאפ שנפתחה.");
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") setMsg("שגיאה ביצירת הקובץ, נסו שוב.");
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    if (!confirm("למחוק את כל מה שמולא בטופס הזה?")) return;
    setData((d) => ({ ...d, [active]: {} }));
    setMsg("");
    setAttempted(false);
  };

  // אחרי ניסיון שליחה השגיאות מתעדכנות חי – שדה שתוקן מפסיק להיות אדום
  const errors = attempted ? fieldErrors(def, values) : {};
  const inputBase =
    "w-full rounded-xl border border-[#cdd5e4] bg-white px-4 py-3 text-base text-[#1f2a44] outline-none focus:border-[#3b5f8f] focus:ring-2 focus:ring-[#3b5f8f]/20";
  const inputBad = "w-full rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-base text-[#1f2a44] outline-none focus:ring-2 focus:ring-red-300";

  return (
    <div dir="rtl" className="min-h-screen bg-[#f5f1ea] text-[#1f2a44]" style={{ fontFamily: '"Assistant Local", Arial, sans-serif' }}>
      <header className="flex items-center gap-3 px-5 pt-5 max-w-2xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logoup.png" alt="חוות רום" className="h-16 w-auto" />
        <div>
          <h1 className="text-2xl font-bold">טפסים למילוי</h1>
          <p className="text-sm text-[#5b6785]">הפרטים נשמרים רק במכשיר שלך ואינם נשלחים לשום שרת. כל השדות חובה – אם אין, סמנו &quot;אין&quot;.</p>
        </div>
      </header>

      <nav className="max-w-2xl mx-auto px-5 mt-4 flex gap-2">
        {FORMS.map((f) => (
          <button
            key={f.id}
            onClick={() => pick(f.id)}
            className={`flex-1 rounded-xl px-2 py-3 text-sm font-bold transition ${
              active === f.id ? "bg-[#3b5f8f] text-white" : "bg-white text-[#3b5f8f] border border-[#cdd5e4]"
            }`}
          >
            {f.short}
          </button>
        ))}
      </nav>

      <main className="max-w-2xl mx-auto px-5 py-5 pb-16">
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-[#e6e0d5] flex flex-col gap-4">
          <h2 className="order-first text-xl font-bold">{def.title}</h2>
          {def.intro && <p className="order-first text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{def.intro}</p>}

          {def.paragraphs && (
            <div className={`space-y-3 rounded-xl bg-[#f8f6f1] p-4 text-[15px] leading-relaxed ${def.fieldsFirst ? "order-2" : "order-1"}`}>
              {def.paragraphs.map((p, i) => (
                <div key={i}>
                  {p.heading && <p className="font-bold">{p.heading}</p>}
                  <p>{p.body}</p>
                  {p.note && <p className="font-bold text-[#9a4b2f]">* {p.note}</p>}
                </div>
              ))}
            </div>
          )}

          <div className={`grid grid-cols-2 gap-4 ${def.fieldsFirst ? "order-1" : "order-2"}`}>
          {def.fields.map((f) => {
            const none = f.allowNone && values[noneKey(f.key)] === "1";
            const err = errors[f.key];
            const input = err ? inputBad : inputBase;
            return (
              <div key={f.key} data-invalid={err ? "1" : undefined} className={f.half ? "" : "col-span-2"}>
                <label className="block">
                  <span className={`block mb-1 text-sm font-semibold ${err ? "text-red-600" : "text-[#3b5f8f]"}`}>
                    {f.label} <span className="text-red-600">*</span>
                  </span>
                  {f.type === "textarea" ? (
                    <textarea rows={3} disabled={none} aria-invalid={err ? true : undefined} className={input} value={none ? "" : values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                  ) : (
                    <input
                      type={f.type === "tel" ? "tel" : "text"}
                      inputMode={f.type === "tel" ? "tel" : f.type === "id" ? "numeric" : undefined}
                      maxLength={f.type === "id" ? 9 : undefined}
                      disabled={none}
                      className={input}
                      aria-invalid={err ? true : undefined}
                      value={none ? "" : values[f.key] ?? ""}
                      onChange={(e) => set(f.key, f.type === "id" ? e.target.value.replace(/\D/g, "") : e.target.value)}
                    />
                  )}
                </label>
                {err && <p className="mt-1 text-sm font-semibold text-red-600">{err}</p>}
                {f.allowNone && (
                  <label className="mt-1 flex items-center gap-2 text-sm text-[#5b6785]">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={!!none}
                      onChange={(e) => setMany({ [noneKey(f.key)]: e.target.checked ? "1" : "", ...(e.target.checked ? { [f.key]: "" } : {}) })}
                    />
                    {NONE_LABEL}
                  </label>
                )}
              </div>
            );
          })}
          </div>

          {def.needsSignature && (
            <div className="order-last flex flex-col gap-4">
              <div data-invalid={errors.agree ? "1" : undefined} className={errors.agree ? "rounded-xl border-2 border-red-500 bg-red-50 p-3" : ""}>
                <label className="flex items-start gap-3 font-semibold">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={values.agree === "1"}
                    onChange={(e) => set("agree", e.target.checked ? "1" : "")}
                  />
                  <span>{def.agreeLabel}</span>
                </label>
                {errors.agree && <p className="mt-1 text-sm font-semibold text-red-600">{errors.agree}</p>}
              </div>
              <p className="text-sm font-semibold text-[#3b5f8f]">
                תאריך: <span className="text-[#1f2a44]">{new Date().toLocaleDateString("he-IL")}</span>
              </p>
              <div data-invalid={errors.signature ? "1" : undefined}>
                <span className={`block mb-1 text-sm font-semibold ${errors.signature ? "text-red-600" : "text-[#3b5f8f]"}`}>
                  חתימה <span className="text-red-600">*</span>
                </span>
                <SignaturePad value={values.signature} onChange={(v) => set("signature", v)} invalid={!!errors.signature} />
                {errors.signature && <p className="mt-1 text-sm font-semibold text-red-600">{errors.signature}</p>}
              </div>
            </div>
          )}
        </div>

        {Object.keys(errors).length > 0 ? (
          <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {Object.keys(errors).length === 1 ? "יש שדה אחד שדורש תיקון" : `יש ${Object.keys(errors).length} שדות שדורשים תיקון`} – מסומנים באדום.
          </p>
        ) : (
          msg && <p className="mt-4 rounded-xl border border-[#e6e0d5] bg-white px-4 py-3 text-sm">{msg}</p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            onClick={send}
            disabled={busy}
            className="flex-1 rounded-xl bg-[#25a55a] px-4 py-4 text-lg font-bold text-white disabled:opacity-60"
          >
            {busy ? "מכין קובץ…" : "שליחה בוואטסאפ"}
          </button>
          <button onClick={clear} className="rounded-xl border border-[#cdd5e4] bg-white px-4 py-4 text-sm font-bold text-[#5b6785]">
            ניקוי
          </button>
        </div>
      </main>
    </div>
  );
}
