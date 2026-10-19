import { Session } from "./types";

/** Participants who joined this one session from a cancelled session of another workshop. */
export const guestIdsOf = (s: Pick<Session, "change">): string[] =>
  [...new Set(Object.values(s.change?.guests || {}).flat())];

/** Where a cancelled session's participants can go instead: a session of another workshop, the same day, that takes place and has participants. */
export function transferTargets(from: Session, sessions: Session[]): Session[] {
  return sessions
    .filter(s => s.date === from.date && s.workshopId !== from.workshopId && !!s.changeId && !s.fixedBlock
      && s.hasParticipants && s.audience !== "staff" && s.kind !== "cancelled" && s.kind !== "moved-away")
    .sort((a, b) => a.start.localeCompare(b.start) || a.workshopName.localeCompare(b.workshopName, "he"));
}

// Fields every regular change document carries; one holding nothing else changes nothing.
const BOOKKEEPING = ["workshopId", "slotId", "originalDate", "dates", "published", "updatedAt", "updatedBy"];

/** A change document once the guests from `fromChangeId` left it, or null when nothing would be left of it. */
export function withoutGuests(data: Record<string, unknown>, fromChangeId: string): Record<string, unknown> | null {
  const guests = { ...((data.guests as Record<string, string[]>) || {}) };
  delete guests[fromChangeId];
  const rest = { ...data };
  delete rest.guests;
  if (Object.keys(guests).length) rest.guests = guests;
  const empty = rest.slotId !== null && Object.keys(rest).every(k => BOOKKEEPING.includes(k));
  return empty ? null : rest;
}
