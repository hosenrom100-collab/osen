// Dates are "yyyy-MM-dd" strings, times are "HH:mm". Day index: 0 = Sunday … 6 = Saturday.

export interface Slot {
  id: string;
  day: number;
  start: string;
  end: string;
  locationId?: string;
  groupIds?: string[]; // groups this weekly meeting is for; empty/missing = all of the workshop's groups
  every?: number;      // repeat every N weeks; missing = every week
  anchorDate?: string; // a date in the first week it happens (needed when every > 1); missing = the workshop's start
}

/** Id of an activity type (see activityTypes.ts). Types are edited by managers, so this is a plain string. */
export type ActivityKind = string;

export interface Workshop {
  id: string;
  name: string;
  kind?: ActivityKind; // activity type id; missing = "workshop"
  programId: string;
  groupIds?: string[]; // groups within the program taking part; empty/missing = whole program
  startDate: string;
  endDate: string;
  laneHint?: number;   // preferred side when sessions run in parallel (0 = right-most); set by dragging sideways in the calendar
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
  kind?: string; // activity type for this session only (overrides the workshop's)
  title?: string; // name for this session only (overrides the workshop's)
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

/** A fixed daily entry of one program (lunch, break, transport…). Empty groupIds = the whole program. */
export interface DailyBlock {
  id: string;
  kind: ActivityKind;
  label: string;
  start: string;
  end: string;
  days?: number[];     // missing/empty = every active day of the program
  groupIds?: string[]; // missing/empty = every group of the program
  locationId?: string; // where it happens (e.g. the dining room); optional
}

export interface Program {
  id: string;
  name: string;
  activeDays: number[];
  color?: number;              // hue 0-359; missing = derived from the id
  laneMode?: "groups" | "stable" | "auto"; // groups: a fixed lane per group; auto: lanes only in weeks the groups overlap ("stable" is legacy = groups)
  dailyBlocks?: DailyBlock[];
  staffGroupUrl?: string;        // community group of the program's staff
  participantsGroupUrl?: string; // community group of the program's participants
}

export interface Group {
  id: string;
  name: string;
  programId: string;
  color?: number; // hue for the group's lane and tags; else a shade of the program's colour
}

export interface Person {
  id: string;
  name: string;
  roles?: string[];       // staff only
  programIds?: string[];  // staff only: programs they are assigned to
  groupIds?: string[];    // staff only: groups they are assigned to
}

export const ROLE_LABEL: Record<string, string> = {
  admin: "אדמין", manager: "מנהל/ת", instructor: "מדריך/ה", social_worker: 'עו"ס', employee: "עובד/ת", logistics: "לוגיסטיקה",
};

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
  activity: ActivityKind;
  hasParticipants: boolean;
  audience: "participants" | "staff"; // "staff": only staff attend (a team meeting), so the staff are attendees, not leaders
  band: boolean;        // drawn as a quiet full-width band instead of a card
  fixedBlock?: boolean; // generated from a program's daily blocks; not editable as a session
  change?: SessionChange;
  note?: string;
  base: { start: string; end: string; staffIds: string[]; locationId?: string; groupIds?: string[] };
}

export const DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
export const DAY_FULL = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export const STAFF_ROLES = ["admin", "manager", "instructor", "social_worker", "employee", "logistics"];

/** How a session's staff differs from the standing team: someone added is a substitute; only removals are just a change. */
export function staffChangeLabel(s: Pick<Session, "staffIds" | "base">): string {
  const added = s.staffIds.some(id => !s.base.staffIds.includes(id));
  const removed = s.base.staffIds.some(id => !s.staffIds.includes(id));
  return added ? "מחליף" : removed ? "צוות שונה" : "";
}
