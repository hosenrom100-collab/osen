"use client";

import { useEffect, useRef, useState } from "react";
import {
  AllForms,
  EMPTY_FORMS,
  FORMS,
  FormId,
  formToText,
  fullName,
  missingRequired,
  noneKey,
  NONE_LABEL,
} from "@/lib/forms/definitions";
import { renderFormPdf } from "@/lib/forms/renderPdf";

const STORAGE_KEY = "hosen-public-forms-v1";

function SignaturePad({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
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
        className="w-full h-40 rounded-xl border-2 border-dashed border-[#9fb0cf] bg-white touch-none"
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
    window.history.replaceState(null, "", "#" + id);
  };

  const send = async () => {
    const missing = missingRequired(def, values);
    if (missing.length) {
      setMsg("חסר: " + missing.join(", "));
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
  };

  const input =
    "w-full rounded-xl border border-[#cdd5e4] bg-white px-4 py-3 text-base text-[#1f2a44] outline-none focus:border-[#3b5f8f] focus:ring-2 focus:ring-[#3b5f8f]/20";

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
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-[#e6e0d5] space-y-4">
          <h2 className="text-xl font-bold">{def.title}</h2>
          {def.intro && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{def.intro}</p>}

          {def.paragraphs && (
            <div className="space-y-3 rounded-xl bg-[#f8f6f1] p-4 text-[15px] leading-relaxed">
              {def.paragraphs.map((p, i) => (
                <div key={i}>
                  {p.heading && <p className="font-bold">{p.heading}</p>}
                  <p>{p.body}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
          {def.fields.map((f) => {
            const none = f.allowNone && values[noneKey(f.key)] === "1";
            return (
              <div key={f.key} className={f.half ? "" : "col-span-2"}>
                <label className="block">
                  <span className="block mb-1 text-sm font-semibold text-[#3b5f8f]">
                    {f.label} <span className="text-red-600">*</span>
                  </span>
                  {f.type === "textarea" ? (
                    <textarea rows={3} disabled={none} className={input} value={none ? "" : values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                  ) : (
                    <input
                      type={f.type === "tel" ? "tel" : "text"}
                      inputMode={f.type === "tel" ? "tel" : undefined}
                      disabled={none}
                      className={input}
                      value={none ? "" : values[f.key] ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  )}
                </label>
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
            <>
              <label className="flex items-start gap-3 font-semibold">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={values.agree === "1"}
                  onChange={(e) => set("agree", e.target.checked ? "1" : "")}
                />
                <span>{def.agreeLabel}</span>
              </label>
              <div>
                <span className="block mb-1 text-sm font-semibold text-[#3b5f8f]">
                  חתימה <span className="text-red-600">*</span>
                </span>
                <SignaturePad value={values.signature} onChange={(v) => set("signature", v)} />
              </div>
            </>
          )}
        </div>

        {msg && <p className="mt-4 rounded-xl bg-white border border-[#e6e0d5] px-4 py-3 text-sm">{msg}</p>}

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
