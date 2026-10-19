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

// ── Workshop sessions ───────────────────────────────────────────────────────────────────

export interface DayFillAction {
  type: "fill" | "clear" | "rederive";
  /** For "rederive": the session that now backs the day's mark. */
  sessionId?: string;
}

/**
 * What a session mark does to the participant's day. A present mark in a session fills an empty
 * day (never a manual one). Undoing it takes back only what that session filled, and only if
 * no other session of the day still has the participant present.
 */
export function dayFillAction(
  day: Pick<AttendanceEntry, "status" | "source" | "derivedFrom"> | undefined,
  sessionId: string,
  sessionStatus: DayStatus,
  otherPresentSessionId: string | null
): DayFillAction | null {
  if (sessionStatus === "present") {
    return !day || day.status === "unset" ? { type: "fill" } : null;
  }
  if (day?.status === "present" && day.source === "session" && day.derivedFrom === sessionId) {
    return otherPresentSessionId ? { type: "rederive", sessionId: otherPresentSessionId } : { type: "clear" };
  }
  return null;
}

export interface Hint {
  kind: "late" | "leftEarly";
  /** The time the mark would get ("HH:MM"), or null when unknown. */
  at: string | null;
  text: string;
}

interface SessionSlot { id: string; start: string; end: string }

/**
 * A suggestion, never an automatic mark: the time a "present" tap happens is not the time the
 * person arrived. Offered when the day's other sessions point to a late arrival or an early leave,
 * or when a tap on today's session comes more than LATE_THRESHOLD_MIN after it began.
 */
export function suggestMark(args: {
  newStatus: DayStatus;
  session: SessionSlot & { date: string };
  /** The day's sessions of this participant, in any order. */
  daySessions: SessionSlot[];
  /** This participant's other session marks that day. */
  others: { sessionId: string; status: DayStatus }[];
  /** Israel wall clock now, and today's date there. */
  nowTime: string;
  today: string;
}): Hint | null {
  const { newStatus, session, daySessions, others, nowTime, today } = args;
  const statusIn = (id: string) => others.find((o) => o.sessionId === id)?.status;
  const earlier = daySessions
    .filter((s) => s.id !== session.id && s.start < session.start)
    .sort((a, b) => a.start.localeCompare(b.start));

  if (newStatus === "present") {
    const missedEarlier = earlier.some((s) => statusIn(s.id) === "absent");
    const presentEarlier = earlier.some((s) => statusIn(s.id) === "present");
    if (missedEarlier && !presentEarlier) {
      return { kind: "late", at: session.start, text: "לא היה במפגש הקודם. לסמן איחור?" };
    }
    if (!presentEarlier && session.date === today && minutesOf(nowTime) > minutesOf(session.start) + LATE_THRESHOLD_MIN && nowTime < session.end) {
      return { kind: "late", at: nowTime, text: `סומן ב-${nowTime}. לסמן איחור?` };
    }
    return null;
  }
  if (newStatus === "absent") {
    const lastPresent = [...earlier].reverse().find((s) => statusIn(s.id) === "present");
    if (lastPresent) return { kind: "leftEarly", at: lastPresent.end, text: "היה במפגש הקודם. לסמן יציאה מוקדמת?" };
  }
  return null;
}

/** Today's date ("yyyy-MM-dd") on the Israel calendar. */
export function todayInIsrael(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Who of a session's participants is away: marked absent in the session itself, or not marked in
 * it while their whole day is marked absent. The same rule the session's attendance sheet shows,
 * so the calendar, the home schedule and the sheet always agree.
 */
export function absentInSession(
  participantIds: string[],
  /** This session's marks, by participant. */
  sessionMarks: ReadonlyMap<string, DayStatus> | undefined,
  /** Participants marked absent for the whole day. */
  dayAbsent: ReadonlySet<string> | undefined
): string[] {
  return participantIds.filter((pid) => {
    const own = sessionMarks?.get(pid);
    return own && own !== "unset" ? own === "absent" : !!dayAbsent?.has(pid);
  });
}
