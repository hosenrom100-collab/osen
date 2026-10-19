import type { PatientLite } from "./data";
import { firstNames } from "./people";
import { Person, Session } from "./types";

/** Who is on duty in one program on one day. Doc id = `${programId}_${date}` in `daily_duties`. */
export interface DailyDuty {
  id: string;
  programId: string;
  date: string;
  breakfastIds: string[]; // participants on breakfast duty
  instructorId?: string;  // the duty instructor: a staff member with the instructor role
}

export const dutyIdFor = (programId: string, date: string) => `${programId}_${date}`;

/** A program's fixed breakfast entry (a meal block whose name mentions breakfast). */
export const isBreakfast = (s: Pick<Session, "fixedBlock" | "activity" | "workshopName">) =>
  !!s.fixedBlock && s.activity === "meal" && s.workshopName.includes("בוקר");

/** First names of a program's breakfast duty on a date; ids of participants no longer listed are skipped. */
export function dutyNames(programId: string, date: string, duties: DailyDuty[], patients: PatientLite[]): string[] {
  const ids = new Set(dutyOf(programId, date, duties)?.breakfastIds || []);
  return firstNames(patients.filter(p => ids.has(p.id)));
}

/** Puts the day's breakfast duty names on the program's breakfast entry, so every schedule view shows them. */
export function withDuties(sessions: Session[], duties: DailyDuty[], patients: PatientLite[]): Session[] {
  if (!duties.length) return sessions;
  return sessions.map(s => {
    if (!isBreakfast(s)) return s;
    const duty = dutyNames(s.programId, s.date, duties, patients);
    return duty.length ? { ...s, duty } : s;
  });
}

export const dutyText = (names: string[]) => `תורני ארוחת בוקר: ${names.join(", ")}`;

/** Who can be put on duty: the program's participants (in the entry's groups, if it has any) staying on that date. */
export const dutyCandidates = (programId: string, groupIds: string[], date: string, patients: PatientLite[]) =>
  patients
    .filter(p => p.programIds.includes(programId) && (groupIds.length === 0 || p.groupIds.some(g => groupIds.includes(g))) &&
      (!p.startDate || p.startDate <= date) && (!p.endDate || p.endDate >= date))
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "he"));

const dutyOf = (programId: string, date: string, duties: DailyDuty[]) => duties.find(d => d.programId === programId && d.date === date);

/** Staff who can be the duty instructor: those with the instructor role. */
export const instructorCandidates = (staff: Person[]) => staff.filter(p => p.roles?.includes("instructor"));

/** Name of a program's duty instructor on a date; empty when none is set or they are no longer on the staff list. */
export const dutyInstructor = (programId: string, date: string, duties: DailyDuty[], staff: Person[]) =>
  staff.find(p => p.id === dutyOf(programId, date, duties)?.instructorId)?.name || "";

export const instructorText = (name: string) => `מדריך תורן: ${name}`;

/** One line naming the duty instructor of each program shown; the program is named only when several are shown. */
export function instructorsLine(programs: { id: string; name: string }[], date: string, duties: DailyDuty[], staff: Person[]): string | undefined {
  const list = programs.map(p => ({ program: p.name, name: dutyInstructor(p.id, date, duties, staff) })).filter(x => x.name);
  if (!list.length) return undefined;
  return instructorText(programs.length === 1 ? list[0].name : list.map(x => `${x.name} (${x.program})`).join(", "));
}
