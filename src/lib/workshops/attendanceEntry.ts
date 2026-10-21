import type { Session } from "./types";

/**
 * Whether a session on the home schedule opens its attendance check when clicked:
 * a real workshop session (not a band / fixed block, not cancelled) that has a session id
 * and participants, for someone allowed to mark attendance.
 */
export function opensAttendance(s: Session, participantCount: number, canMark: boolean): boolean {
  return canMark && participantCount > 0 && !s.band && !s.fixedBlock && s.kind !== "cancelled" && !!s.changeId;
}
