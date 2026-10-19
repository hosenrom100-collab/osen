import type { PatientLite } from "./data";
import type { Session, Workshop } from "./types";
import { guestIdsOf } from "./transferCore";

/**
 * Participants attending a session: the workshop's own list when it has one, otherwise everyone
 * in the session's program (and groups) whose stay covers that date. Plus anyone sent over from a
 * cancelled session of another workshop, for this session only.
 */
export function participantsOf(s: Session, workshop: Workshop | undefined, patients: PatientLite[]): PatientLite[] {
  if (s.fixedBlock || !s.hasParticipants) return [];
  const own = ownParticipants(s, workshop, patients);
  const guests = guestIdsOf(s);
  if (!guests.length) return own;
  const have = new Set(own.map(p => p.id));
  return [...own, ...patients.filter(p => guests.includes(p.id) && !have.has(p.id))];
}

function ownParticipants(s: Session, workshop: Workshop | undefined, patients: PatientLite[]): PatientLite[] {
  if (workshop?.participantIds?.length) {
    const ids = new Set(workshop.participantIds);
    return patients.filter(p => ids.has(p.id));
  }
  return patients.filter(p =>
    p.programIds.includes(s.programId) &&
    (s.groupIds.length === 0 || p.groupIds.some(g => s.groupIds.includes(g))) &&
    (!p.startDate || p.startDate <= s.date) && (!p.endDate || p.endDate >= s.date)
  );
}

/**
 * First names only. A last-name initial is added only when two people in the same list share a first name.
 */
export function firstNames(list: PatientLite[]): string[] {
  const count = new Map<string, number>();
  list.forEach(p => count.set(p.firstName, (count.get(p.firstName) || 0) + 1));
  return list
    .map(p => (count.get(p.firstName)! > 1 && p.lastName ? `${p.firstName} ${p.lastName.charAt(0)}׳` : p.firstName))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "he"));
}
