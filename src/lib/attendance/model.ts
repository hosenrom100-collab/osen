/**
 * Day attendance: one document per participant per day (`attendance/{patientId}_{yyyy-MM-dd}`),
 * whichever screen wrote it. Late arrival and early leave are marks on a *present* participant,
 * not extra statuses, so every existing reader that counts `present` keeps working.
 */
export type DayStatus = "present" | "absent" | "unset";

/** A time mark; `at` is "HH:MM" in Israel time, or null when the staff member did not give one. */
export interface TimeMark {
  at: string | null;
}

export interface AttendanceEntry {
  status: DayStatus;
  late?: TimeMark | null;
  leftEarly?: TimeMark | null;
  /** One short line, stored apart (attendance_notes) so a participant cannot read it. */
  note?: string;
  /** "session" = filled automatically from a workshop session; never overwrites a manual mark. */
  source?: "manual" | "session";
  derivedFrom?: string | null;
}

export const NOTE_MAX = 80;
export const NOTE_CHIPS = ["חולה", "ועדה", "בדיקה", "ללא אישור"];
/** Minutes after a session starts from which a "present" mark is suggested as a late arrival. */
export const LATE_THRESHOLD_MIN = 10;

const TIME_ZONE = "Asia/Jerusalem";

export const dayAttendanceId = (patientId: string, date: string) => `${patientId}_${date}`;

export const isValidTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** "HH:MM" of an instant on the Israel wall clock. */
export function timeInIsrael(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("hour")}:${get("minute")}`;
}

export function addMinutes(time: string, delta: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + delta));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const entryIsEmpty = (e: AttendanceEntry) =>
  e.status === "unset" && !e.late && !e.leftEarly && !e.note;

/** Turns a stored document (or nothing) into an entry. Unknown statuses read as unset. */
export function entryFromDoc(data: Record<string, unknown> | undefined, note?: string): AttendanceEntry {
  const status = data?.status === "present" || data?.status === "absent" ? data.status : "unset";
  const mark = (v: unknown): TimeMark | null =>
    v && typeof v === "object" ? { at: typeof (v as TimeMark).at === "string" ? (v as TimeMark).at : null } : null;
  return {
    status,
    late: status === "present" ? mark(data?.late) : null,
    leftEarly: status === "present" ? mark(data?.leftEarly) : null,
    note: note || undefined,
    source: data?.source === "session" ? "session" : "manual",
    derivedFrom: typeof data?.derivedFrom === "string" ? data.derivedFrom : null,
  };
}

/** The document that was written last wins; ids written by older screens may still exist. */
export function newest<T extends { updatedAt?: unknown }>(a: T, b: T): T {
  const ts = (x: T) => (typeof x.updatedAt === "string" ? x.updatedAt : "");
  return ts(b) > ts(a) ? b : a;
}

export interface DayCounts {
  present: number;
  absent: number;
  unset: number;
  late: number;
  leftEarly: number;
}

export function countEntries(entries: Iterable<AttendanceEntry>): DayCounts {
  const c: DayCounts = { present: 0, absent: 0, unset: 0, late: 0, leftEarly: 0 };
  for (const e of entries) {
    c[e.status]++;
    if (e.status === "present") {
      if (e.late) c.late++;
      if (e.leftEarly) c.leftEarly++;
    }
  }
  return c;
}

/** Short text for the tags shown next to a name. */
export const lateLabel = (m: TimeMark) => (m.at ? `איחור ${m.at}` : "איחור");
export const leftEarlyLabel = (m: TimeMark) => (m.at ? `יצא ${m.at}` : "יצא מוקדם");
