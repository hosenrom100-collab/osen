"use client";

import { Sparkles, ArrowLeft, Loader2 } from "lucide-react";
import {
  ParticipantProfile,
  SURVEY_QUESTIONS,
  isProfileComplete,
} from "@/lib/participantProfile";

interface ParticipantSurveyStepProps {
  profile: ParticipantProfile;
  onChange: (next: ParticipantProfile) => void;
  onSubmit: () => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
  onEnrich?: () => void;
  enriching?: boolean;
  notes?: string;
  onNotesChange?: (next: string) => void;
}

export function ParticipantSurveyStep({
  profile,
  onChange,
  onSubmit,
  onCancel,
  title = "שאלון הערכה מהיר להתאמת הדו״ח",
  subtitle = "מענה על שאלות אלו יתאים אוטומטית את תוכן הדו״ח ויחסוך לך זמן עבודה יקר. ניתן לערוך הכל בשלב הבא.",
  onEnrich,
  enriching = false,
  notes,
  onNotesChange,
}: ParticipantSurveyStepProps) {
  return (
    <div className="flex-1 overflow-y-auto space-y-6 px-1 py-2 scrollbar-thin">
      <div className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white rounded-3xl p-6 shadow-md mb-2">
        <h4 className="text-sm font-black mb-1.5 flex items-center gap-2">
          <Sparkles className="w-5 h-5 animate-pulse" />
          {title}
        </h4>
        <p className="text-[11px] text-violet-100 font-bold leading-relaxed">
          {subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SURVEY_QUESTIONS.map((q) => {
          const isMulti = q.multi;
          const currentValue = profile[q.key];

          return (
            <div
              key={q.key}
              className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3 flex flex-col justify-between"
            >
              <div>
                <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-wider mb-2">
                  {q.title}
                </h5>
                <div className={isMulti ? "grid grid-cols-2 gap-1.5" : "space-y-1.5"}>
                  {q.options.map((opt) => {
                    const isSelected = isMulti
                      ? Array.isArray(currentValue) && currentValue.includes(opt.id)
                      : currentValue === opt.id;

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          if (isMulti) {
                            const arr = Array.isArray(currentValue) ? currentValue : [];
                            const next = arr.includes(opt.id)
                              ? arr.filter((x) => x !== opt.id)
                              : [...arr, opt.id];
                            onChange({ ...profile, [q.key]: next });
                          } else {
                            onChange({ ...profile, [q.key]: opt.id });
                          }
                        }}
                        className={`w-full text-right px-3 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                          isMulti ? "text-[10px] px-2 py-1.5" : ""
                        } ${
                          isSelected
                            ? "bg-violet-50 border-violet-500 text-violet-700 shadow-sm"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {onEnrich && onNotesChange && (
        <div className="bg-violet-50/60 border border-violet-200 rounded-2xl p-4 space-y-2">
          <label className="text-[11px] font-black text-violet-800 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            הערות נוספות להעשרה חכמה (אופציונלי)
          </label>
          <p className="text-[10px] text-violet-500 font-bold leading-relaxed">
            כתוב כאן מידע או דגשים נוספים שברצונך שהעוזר החכם ישלב בדוח בצורה טבעית ומותאמת (למשל אירוע משמעותי, שינוי לאחרונה, נקודה להדגשה). אין לכלול שם, ת.ז. או פרטים מזהים אחרים.
          </p>
          <textarea
            value={notes || ""}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="לדוגמה: חל שיפור ניכר בהתמדה בחודש האחרון, יש להדגיש זאת..."
            className="w-full bg-white border border-violet-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-violet-500 transition-all font-bold min-h-[70px] text-right"
          />
        </div>
      )}

      {/* Survey action footer */}
      <div className="pt-4 flex justify-between border-t border-slate-100 shrink-0">
        <button
          onClick={onCancel}
          className="bg-slate-50 hover:bg-slate-100 border border-slate-200 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border-none"
        >
          ביטול
        </button>
        <div className="flex items-center gap-2">
          {onEnrich && (
            <button
              onClick={onEnrich}
              disabled={!isProfileComplete(profile) || enriching}
              className="bg-white hover:bg-violet-50 disabled:opacity-50 text-violet-700 font-black px-5 py-3 rounded-2xl text-[10px] uppercase tracking-wider transition-all border border-violet-200 cursor-pointer flex items-center gap-1.5"
            >
              {enriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {enriching ? "העוזר החכם כותב את הדו״ח..." : "העשרה חכמה"}
            </button>
          )}
          <button
            onClick={onSubmit}
            disabled={!isProfileComplete(profile) || enriching}
            className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black px-8 py-3 rounded-2xl text-[10px] uppercase tracking-wider transition-all shadow-lg shadow-violet-600/15 cursor-pointer border-none flex items-center gap-1.5"
          >
            המשך לעריכת הדו״ח והיגדים
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
