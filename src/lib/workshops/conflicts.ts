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
