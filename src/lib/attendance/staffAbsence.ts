/**
 * Staff absences: one source of truth, the `absence_requests` collection.
 * A document covers one day or a range of days. `dates` lists every day it covers and is what
 * readers match on (`array-contains`); `startDate`/`endDate` are its first and last day, and `date`
 * stays equal to `startDate` so older screens that sort or show by `date` keep working.
 * Documents written before ranges existed carry only `date`; they count as a one-day absence.
 */
export type AbsenceStatus = "pending" | "approved" | "rejected";

export interface StaffAbsence {
  id: string;
  userId: string;
  userName: string;
  dates: string[];
  startDate: string;
  endDate: string;
  reason: string;
  status: AbsenceStatus;
}

/** Longest range one absence may cover, so a typo in the year cannot write thousands of days. */
export const MAX_ABSENCE_DAYS = 120;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Every day from `start` to `end` inclusive, as yyyy-MM-dd. Empty when the range is invalid or too long. */
export function daysInRange(start: string, end: string): string[] {
  if (!ISO.test(start) || !ISO.test(end) || end < start) return [];
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  while (out.length <= MAX_ABSENCE_DAYS) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > end) return out;
    out.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return [];
}

/** Reads an `absence_requests` document, old (single `date`) or new (`dates` range). */
export function absenceFromDoc(id: string, x: Record<string, unknown>): StaffAbsence {
  const listed = Array.isArray(x.dates) ? (x.dates as unknown[]).filter((d): d is string => typeof d === "string") : [];
  const dates = listed.length ? [...listed].sort() : typeof x.date === "string" ? [x.date] : [];
  const status = x.status === "approved" || x.status === "rejected" ? x.status : "pending";
  return {
    id,
    userId: String(x.userId ?? ""),
    userName: String(x.userName ?? ""),
    dates,
    startDate: dates[0] ?? "",
    endDate: dates[dates.length - 1] ?? "",
    reason: String(x.reason ?? ""),
    status,
  };
}

/** The fields to store for an absence covering `dates` (sorted, unique). */
export function absenceDateFields(dates: string[]) {
  const sorted = [...new Set(dates)].sort();
  return { dates: sorted, date: sorted[0], startDate: sorted[0], endDate: sorted[sorted.length - 1] };
}

/** "14.10" for one day, "14.10–18.10" for a range. */
export function formatAbsenceRange(a: Pick<StaffAbsence, "startDate" | "endDate">): string {
  const short = (iso: string) => iso.split("-").reverse().slice(0, 2).join(".");
  return a.startDate === a.endDate ? short(a.startDate) : `${short(a.startDate)}–${short(a.endDate)}`;
}

/** One row per approved absent day, limited to `dates` — the shape the calendar's conflict checks use. */
export function approvedDays(absences: StaffAbsence[], dates: string[]): { userId: string; date: string }[] {
  const want = new Set(dates);
  return absences
    .filter(a => a.status === "approved")
    .flatMap(a => a.dates.filter(d => want.has(d)).map(date => ({ userId: a.userId, date })));
}
