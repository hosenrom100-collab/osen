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

// An activity can have no start and/or no end date. These sentinel strings sort before/after every real date,
// so all the existing comparisons and date queries keep working unchanged.
export const OPEN_START = "0000-01-01";
export const OPEN_END = "9999-12-31";
export const isOpenStart = (d?: string) => !d || d <= "0001-01-01";
export const isOpenEnd = (d?: string) => !d || d >= "9999-01-01";

/** A finite window to compute over for an activity that may be open on either side (today - 4 weeks … today + 26 weeks). */
export function effectiveRange(start: string, end: string, today = toISO(new Date())): [string, string] {
  const from = isOpenStart(start) ? toISO(addDays(parseISO(today), -28)) : start;
  let to = isOpenEnd(end) ? toISO(addDays(parseISO(today), 182)) : end;
  if (isOpenEnd(end) && to < from) to = toISO(addDays(parseISO(from), 182));
  return [from > to ? to : from, to];
}

/** Anchor week for "every N weeks" when the activity has no start date: the first day it is set up from. */
export const anchorFallback = (start: string) => (isOpenStart(start) ? toISO(new Date()) : start);
