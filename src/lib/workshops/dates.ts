import { addDays, format, parseISO, startOfWeek, eachDayOfInterval } from "date-fns";

export const toISO = (d: Date) => format(d, "yyyy-MM-dd");

// Weeks start on Sunday.
export const weekStartOf = (d: Date) => startOfWeek(d, { weekStartsOn: 0 });

export const weekDates = (start: Date): string[] =>
  Array.from({ length: 7 }, (_, i) => toISO(addDays(start, i)));

export const rangeDates = (from: string, to: string): string[] =>
  eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map(toISO);

export const dayOf = (iso: string) => parseISO(iso).getDay();

/** "7.10" */
export const shortDate = (iso: string) => format(parseISO(iso), "d.M");

export const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  aStart < bEnd && bStart < aEnd;
