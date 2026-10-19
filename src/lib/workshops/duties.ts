import type { PatientLite } from "./data";
import { firstNames } from "./people";
import { Session } from "./types";

/** Who is on breakfast duty in one program on one day. Doc id = `${programId}_${date}` in `daily_duties`. */
export interface DailyDuty {
  id: string;
  programId: string;
  date: string;
  breakfastIds: string[]; // participant ids
}

export const dutyIdFor = (programId: string, date: string) => `${programId}_${date}`;

/** A program's fixed breakfast entry (a meal block whose name mentions breakfast). */
export const isBreakfast = (s: Pick<Session, "fixedBlock" | "activity" | "workshopName">) =>
  !!s.fixedBlock && s.activity === "meal" && s.workshopName.includes("בוקר");

/** First names of a program's breakfast duty on a date; ids of participants no longer listed are skipped. */
export function dutyNames(programId: string, date: string, duties: DailyDuty[], patients: PatientLite[]): string[] {
  const ids = new Set(duties.find(d => d.programId === programId && d.date === date)?.breakfastIds || []);
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
