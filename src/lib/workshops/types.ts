// Dates are "yyyy-MM-dd" strings, times are "HH:mm". Day index: 0 = Sunday … 6 = Saturday.

export interface Slot {
  id: string;
  day: number;
  start: string;
  end: string;
  locationId?: string;
  groupIds?: string[]; // groups this weekly meeting is for; empty/missing = all of the workshop's groups
}

export interface Workshop {
  id: string;
  name: string;
  programId: string;
  groupIds?: string[]; // groups within the program taking part; empty/missing = whole program
  startDate: string;
  endDate: string;
  slots: Slot[];
  staffIds: string[];
  participantIds: string[];
  notes?: string;
  status: "draft" | "active" | "cancelled";
}

// One exception on top of the standing schedule. Doc id = `${workshopId}_${date}_${slotId}`
// for a regular session, or a random id for an extra one-off session (slotId === null).
export interface SessionChange {
  id: string;
  workshopId: string;
  slotId: string | null;
  originalDate: string | null;
  cancelled?: boolean;
  newDate?: string;
  newStart?: string;
  newEnd?: string;
  staffIds?: string[];
  locationId?: string;
  note?: string;
  dates: string[]; // every date this change touches — used for the weekly query
  published: boolean;
}

export interface Closure {
  id: string;
  date: string;
  programIds: string[]; // empty = every program
  reason: string;
}

export interface Program {
  id: string;
  name: string;
  activeDays: number[];
}

export interface Group {
  id: string;
  name: string;
  programId: string;
}

export interface Person {
  id: string;
  name: string;
}

export type SessionKind = "normal" | "cancelled" | "moved-away" | "moved-in" | "extra";

export interface Session {
  id: string;
  changeId: string | null; // id of the change doc that applies (or would be created for) this session
  workshopId: string;
  workshopName: string;
  programId: string;
  groupIds: string[];
  slotId: string | null;
  origDate: string | null;
  date: string;
  start: string;
  end: string;
  locationId?: string;
  staffIds: string[];
  kind: SessionKind;
  change?: SessionChange;
  note?: string;
  base: { start: string; end: string; staffIds: string[]; locationId?: string; groupIds?: string[] };
}

export const DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
export const DAY_FULL = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export const STAFF_ROLES = ["admin", "manager", "instructor", "social_worker", "employee", "logistics"];
