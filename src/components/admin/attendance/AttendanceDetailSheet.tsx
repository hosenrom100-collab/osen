"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/app/shopping/components/BottomSheet";
import {
  addMinutes, AttendanceEntry, DayStatus, isValidTime, NOTE_CHIPS, NOTE_MAX, timeInIsrael, TimeMark,
} from "@/lib/attendance/model";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  /** What is being marked: a whole day, or one workshop session. */
  scope?: "day" | "session";
  entry: AttendanceEntry;
  onSave: (entry: AttendanceEntry) => void;
}

const chip = (active: boolean, tone: "emerald" | "rose" | "amber" | "sky" | "slate" = "slate") =>
  `h-11 px-4 rounded-xl text-sm font-bold border transition-all active:scale-[0.97] cursor-pointer ${
    active
      ? tone === "emerald" ? "bg-emerald-500 border-emerald-500 text-white"
      : tone === "rose" ? "bg-rose-500 border-rose-500 text-white"
      : tone === "amber" ? "bg-amber-500 border-amber-500 text-white"
      : tone === "sky" ? "bg-sky-500 border-sky-500 text-white"
      : "bg-[var(--foreground)] border-[var(--foreground)] text-[var(--background)]"
      : "bg-[var(--foreground)]/5 border-transparent text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/10"
  }`;

const small = (active: boolean) =>
  `h-9 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
    active ? "bg-[var(--foreground)] border-[var(--foreground)] text-[var(--background)]"
           : "bg-transparent border-[var(--border)] text-[var(--muted)] hover:bg-[var(--foreground)]/5"
  }`;

/** Time chips for one mark: "now", a shifted time, none, or a typed time. */
function TimeRow({ label, mark, onChange, shifts }: {
  label: string; mark: TimeMark; onChange: (m: TimeMark) => void; shifts: { label: string; delta: number }[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-[var(--muted)]">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={small(mark.at === null)} onClick={() => onChange({ at: null })}>ללא שעה</button>
        <button type="button" className={small(mark.at === timeInIsrael())} onClick={() => onChange({ at: timeInIsrael() })}>עכשיו</button>
        {shifts.map((s) => {
          const t = addMinutes(timeInIsrael(), s.delta);
          return <button key={s.label} type="button" className={small(mark.at === t)} onClick={() => onChange({ at: t })}>{s.label}</button>;
        })}
        <input
          type="time"
          value={mark.at ?? ""}
          onChange={(e) => onChange({ at: isValidTime(e.target.value) ? e.target.value : null })}
          aria-label={label}
          className="h-9 px-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs font-bold text-[var(--foreground)]"
        />
      </div>
    </div>
  );
}

export function AttendanceDetailSheet({ isOpen, onClose, name, scope = "day", entry, onSave }: Props) {
  const [status, setStatus] = useState<DayStatus>("unset");
  const [late, setLate] = useState<TimeMark | null>(null);
  const [leftEarly, setLeftEarly] = useState<TimeMark | null>(null);
  const [note, setNote] = useState("");

  // Start from the stored entry every time the sheet opens.
  useEffect(() => {
    if (!isOpen) return;
    setStatus(entry.status);
    setLate(entry.late ?? null);
    setLeftEarly(entry.leftEarly ?? null);
    setNote(entry.note ?? "");
  }, [isOpen, entry]);

  const plainPresent = status === "present" && !late && !leftEarly;

  const pick = (next: "present" | "absent") => {
    // Tapping the chosen one again clears it, like the buttons in the list.
    if ((next === "present" && plainPresent) || (next === "absent" && status === "absent")) {
      setStatus("unset");
    } else {
      setStatus(next);
    }
    setLate(null);
    setLeftEarly(null);
  };
  const toggleLate = () => { setStatus("present"); setLate(late ? null : { at: timeInIsrael() }); };
  const toggleLeft = () => { setStatus("present"); setLeftEarly(leftEarly ? null : { at: timeInIsrael() }); };

  const save = () => {
    onSave({ ...entry, status, late: status === "present" ? late : null, leftEarly: status === "present" ? leftEarly : null, note: note.trim() || undefined });
    onClose();
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      zIndex={160}
      title={<span>{name}<span className="text-xs font-semibold text-[var(--muted)] me-2"> · {scope === "session" ? "במפגש" : "היום"}</span></span>}
      footer={
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--fill)] text-[var(--foreground)] cursor-pointer border-none">ביטול</button>
          <button type="button" onClick={save} className="h-12 px-6 rounded-xl text-sm font-bold btn-primary !text-white cursor-pointer border-none">שמור</button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={chip(plainPresent, "emerald")} onClick={() => pick("present")}>נוכח</button>
          <button type="button" className={chip(status === "absent", "rose")} onClick={() => pick("absent")}>נעדר</button>
          <button type="button" className={chip(!!late, "amber")} onClick={toggleLate}>איחור</button>
          <button type="button" className={chip(!!leftEarly, "sky")} onClick={toggleLeft}>יצא מוקדם</button>
        </div>

        {late && (
          <TimeRow label="שעת הגעה" mark={late} onChange={setLate} shifts={[{ label: "לפני רבע שעה", delta: -15 }]} />
        )}
        {leftEarly && (
          <TimeRow label="שעת יציאה" mark={leftEarly} onChange={setLeftEarly}
            shifts={[{ label: "בעוד חצי שעה", delta: 30 }, { label: "בעוד שעה", delta: 60 }]} />
        )}

        <div className="space-y-2">
          <p className="text-xs font-bold text-[var(--muted)]">הערה (שורה אחת)</p>
          <input
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            enterKeyHint="done"
            placeholder="למשל: הודיע מראש"
            className="w-full h-11 px-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--muted)]/50"
          />
          <div className="flex flex-wrap gap-2">
            {NOTE_CHIPS.map((c) => (
              <button key={c} type="button" className={small(note === c)} onClick={() => setNote(note === c ? "" : c)}>{c}</button>
            ))}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
