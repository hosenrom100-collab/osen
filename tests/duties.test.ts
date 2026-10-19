import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSessions } from "../src/lib/workshops/buildWeek";
import {
  DailyDuty, dutyCandidates, dutyIdFor, dutyInstructor, dutyNames, dutyText, instructorCandidates, instructorsLine, isBreakfast, withDuties,
} from "../src/lib/workshops/duties";
import type { PatientLite } from "../src/lib/workshops/data";
import type { Person, Program } from "../src/lib/workshops/types";

const MON = "2026-10-19"; // a Monday
const program: Program = {
  id: "prog1", name: "חוסן", activeDays: [0, 1, 2, 3, 4],
  dailyBlocks: [
    { id: "b1", kind: "meal", label: "ארוחת בוקר", start: "08:30", end: "09:00" },
    { id: "b2", kind: "meal", label: "ארוחת צהריים", start: "12:30", end: "13:15" },
  ],
};
const other: Program = { ...program, id: "prog2", name: "אחר" };
const person = (id: string, firstName: string, over: Partial<PatientLite> = {}): PatientLite =>
  ({ id, firstName, lastName: "כהן", programIds: ["prog1"], groupIds: [], ...over });
const patients = [person("p1", "דנה"), person("p2", "יוסי"), person("p3", "רון", { programIds: ["prog2"] })];
const duty = (programId: string, date: string, breakfastIds: string[]): DailyDuty => ({ id: dutyIdFor(programId, date), programId, date, breakfastIds });

test("one duty document per program per day", () => {
  assert.equal(dutyIdFor("prog1", MON), "prog1_2026-10-19");
});

test("only a program's breakfast block counts as breakfast", () => {
  const list = buildSessions([MON], [], [program], [], []);
  assert.deepEqual(list.filter(isBreakfast).map(s => s.workshopName), ["ארוחת בוקר"]);
});

test("the day's duty names land on that program's breakfast, and nowhere else", () => {
  const list = withDuties(buildSessions([MON, "2026-10-20"], [], [program, other], [], []),
    [duty("prog1", MON, ["p2", "p1"]), duty("prog2", MON, ["p3"])], patients);
  const breakfast = (pid: string, date: string) => list.find(s => s.programId === pid && s.date === date && isBreakfast(s));
  assert.deepEqual(breakfast("prog1", MON)?.duty, ["דנה", "יוסי"]);
  assert.deepEqual(breakfast("prog2", MON)?.duty, ["רון"]);
  assert.equal(breakfast("prog1", "2026-10-20")?.duty, undefined); // another day
  assert.ok(list.filter(s => !isBreakfast(s)).every(s => s.duty === undefined)); // lunch untouched
});

test("someone no longer active is skipped; no names means no duty line", () => {
  assert.deepEqual(dutyNames("prog1", MON, [duty("prog1", MON, ["p1", "gone"])], patients), ["דנה"]);
  const list = withDuties(buildSessions([MON], [], [program], [], []), [duty("prog1", MON, ["gone"])], patients);
  assert.equal(list.find(isBreakfast)?.duty, undefined);
});

test("a closed day has no breakfast, so no duty is shown", () => {
  const list = withDuties(buildSessions([MON], [], [program], [], [{ id: "c", date: MON, programIds: [], reason: "חג" }]), [duty("prog1", MON, ["p1"])], patients);
  assert.equal(list.length, 0);
});

test("candidates: the program's participants staying that day, within the block's groups", () => {
  const ps = [
    person("a", "אבי", { groupIds: ["g1"] }),
    person("b", "בתיה", { groupIds: ["g2"] }),
    person("c", "גל", { endDate: "2026-10-18" }), // left the day before
    person("d", "דור", { startDate: "2026-10-20" }), // arrives the day after
    person("e", "הדס", { programIds: ["prog2"] }),
  ];
  assert.deepEqual(dutyCandidates("prog1", [], MON, ps).map(p => p.id), ["a", "b"]);
  assert.deepEqual(dutyCandidates("prog1", ["g2"], MON, ps).map(p => p.id), ["b"]);
});

test("duty text", () => {
  assert.equal(dutyText(["דנה", "יוסי"]), "תורני ארוחת בוקר: דנה, יוסי");
});

const staff: Person[] = [
  { id: "s1", name: "רותם לוי", roles: ["instructor"] },
  { id: "s2", name: "נועה בר", roles: ["social_worker"] },
  { id: "s3", name: "עידו גל", roles: ["manager", "instructor"] },
];
const withInstructor = (programId: string, date: string, instructorId: string): DailyDuty => ({ ...duty(programId, date, []), instructorId });

test("only staff with the instructor role can be the duty instructor", () => {
  assert.deepEqual(instructorCandidates(staff).map(p => p.id), ["s1", "s3"]);
});

test("the duty instructor is per program per day", () => {
  const duties = [withInstructor("prog1", MON, "s1"), withInstructor("prog2", MON, "s3")];
  assert.equal(dutyInstructor("prog1", MON, duties, staff), "רותם לוי");
  assert.equal(dutyInstructor("prog2", MON, duties, staff), "עידו גל");
  assert.equal(dutyInstructor("prog1", "2026-10-20", duties, staff), "");
  assert.equal(dutyInstructor("prog1", MON, [withInstructor("prog1", MON, "left")], staff), ""); // no longer on the staff list
});

test("one line for the programs shown: the program is named only when there are several", () => {
  const duties = [withInstructor("prog1", MON, "s1"), withInstructor("prog2", MON, "s3")];
  assert.equal(instructorsLine([program], MON, duties, staff), "מדריך תורן: רותם לוי");
  assert.equal(instructorsLine([program, other], MON, duties, staff), "מדריך תורן: רותם לוי (חוסן), עידו גל (אחר)");
  assert.equal(instructorsLine([program, other], MON, [duties[0]], staff), "מדריך תורן: רותם לוי (חוסן)");
  assert.equal(instructorsLine([program], "2026-10-20", duties, staff), undefined);
});

test("breakfast duty and the duty instructor live in one document and do not hide each other", () => {
  const both: DailyDuty = { ...duty("prog1", MON, ["p1"]), instructorId: "s1" };
  assert.deepEqual(dutyNames("prog1", MON, [both], patients), ["דנה"]);
  assert.equal(dutyInstructor("prog1", MON, [both], staff), "רותם לוי");
  const onlyInstructor = withDuties(buildSessions([MON], [], [program], [], []), [withInstructor("prog1", MON, "s1")], patients);
  assert.equal(onlyInstructor.find(isBreakfast)?.duty, undefined);
});
