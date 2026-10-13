import { Program, Session } from "./types";
import { dayOf, overlaps } from "./dates";

export interface AbsenceLite { userId: string; date: string }

/** sessionId → human-readable warnings. */
export function findConflicts(
  sessions: Session[],
  programs: Program[],
  absences: AbsenceLite[],
  nameOf: (staffId: string) => string,
  roomOf: (locationId: string) => string
): Map<string, string[]> {
  const warnings = new Map<string, string[]>();
  const add = (id: string, msg: string) => {
    const list = warnings.get(id) ?? [];
    if (!list.includes(msg)) list.push(msg);
    warnings.set(id, list);
  };
  const live = sessions.filter(s => !s.fixedBlock && s.kind !== "cancelled" && s.kind !== "moved-away");
  const progById = new Map(programs.map(p => [p.id, p]));

  for (let i = 0; i < live.length; i++) {
    const a = live[i];

    for (const staffId of a.staffIds) {
      if (absences.some(x => x.userId === staffId && x.date === a.date)) {
        add(a.id, `${nameOf(staffId)} בהיעדרות`);
      }
    }
    const prog = progById.get(a.programId);
    if (prog && !prog.activeDays.includes(dayOf(a.date))) add(a.id, "יום ללא פעילות בתוכנית");

    for (let j = i + 1; j < live.length; j++) {
      const b = live[j];
      if (a.date !== b.date || !overlaps(a.start, a.end, b.start, b.end)) continue;
      for (const staffId of a.staffIds) {
        if (b.staffIds.includes(staffId)) {
          add(a.id, `${nameOf(staffId)} משובץ גם ב"${b.workshopName}"`);
          add(b.id, `${nameOf(staffId)} משובץ גם ב"${a.workshopName}"`);
        }
      }
      if (a.locationId && a.locationId === b.locationId) {
        add(a.id, `${roomOf(a.locationId)} תפוס ב"${b.workshopName}"`);
        add(b.id, `${roomOf(b.locationId!)} תפוס ב"${a.workshopName}"`);
      }
    }
  }
  return warnings;
}

/** Does this staff member have another live session overlapping the given slot on the given date? */
export function staffBusyAt(
  staffId: string, date: string, start: string, end: string,
  sessions: Session[], ignoreWorkshopId?: string
): Session | undefined {
  return sessions.find(s =>
    s.kind !== "cancelled" && s.kind !== "moved-away" &&
    s.workshopId !== ignoreWorkshopId &&
    s.date === date && s.staffIds.includes(staffId) && overlaps(s.start, s.end, start, end)
  );
}

/**
 * Everything that would clash if a session (these people, this room) took place at that date and time.
 * One check for dragging, for the "new event" form and for the session editor, so they always agree.
 * `ignore`: a workshop whose own sessions do not count (the session being moved or edited).
 */
export function clashesAt(
  at: { staffIds: string[]; locationId?: string; date: string; start: string; end: string; ignoreWorkshopId?: string; ignoreSessionId?: string },
  sessions: Session[], absences: AbsenceLite[], roomOf: (locationId?: string) => string | undefined
): { staff: Map<string, string>; room?: string } { // staff: id → why they are not free (without the name)
  const staff = new Map<string, string>();
  for (const id of at.staffIds) {
    if (absences.some(a => a.userId === id && a.date === at.date)) { staff.set(id, "בהיעדרות"); continue; }
    const busy = staffBusyAt(id, at.date, at.start, at.end, sessions, at.ignoreWorkshopId);
    if (busy) staff.set(id, `משובץ ב"${busy.workshopName}"`);
  }
  const o = at.locationId ? sessions.find(x => x.id !== at.ignoreSessionId && !x.fixedBlock && x.kind !== "cancelled" && x.kind !== "moved-away"
    && x.locationId === at.locationId && x.date === at.date && overlaps(x.start, x.end, at.start, at.end)) : undefined;
  return { staff, room: o ? `${roomOf(at.locationId)} תפוס ב"${o.workshopName}" (${o.start}–${o.end})` : undefined };
}
