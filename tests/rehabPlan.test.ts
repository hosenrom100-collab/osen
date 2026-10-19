import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AREA_PRESETS, GOAL_PRESETS, activitiesWay, emptyPlan, farmActionsLine, formatPlanDate, hebrewList,
  missingParts, move, parsePlan, programActivities, quickFill, suggestForArea, toggle,
} from "../src/lib/rehabPlan";
import { DEFAULT_TYPES } from "../src/lib/workshops/activityTypesCore";
import type { Workshop } from "../src/lib/workshops/types";

const workshop = (o: Partial<Workshop>): Workshop => ({
  id: "w", name: "קרמיקה", programId: "p", startDate: "2026-09-01", endDate: "2026-12-31",
  slots: [], staffIds: [], participantIds: [], status: "active", ...o,
});
const area = (id: string) => AREA_PRESETS.find(a => a.id === id)!;

test("activities: only the participant's programs, not cancelled, for participants, still running", () => {
  const list = programActivities([
    workshop({ id: "a", name: "קרמיקה" }),
    workshop({ id: "b", name: "יוגה", programId: "other" }),
    workshop({ id: "c", name: "דיקור", status: "cancelled" }),
    workshop({ id: "d", name: "ארוחת צהריים", kind: "meal" }),
    workshop({ id: "e", name: "ישיבת צוות", kind: "staff_meeting" }),
    workshop({ id: "f", name: "גילוף", endDate: "2026-09-30" }),
    workshop({ id: "g", name: "  " }),
  ], ["p"], DEFAULT_TYPES, "2026-10-19");
  assert.deepEqual(list.map(a => a.name), ["קרמיקה"]);
});

test("activities: falls back to past workshops when none are current", () => {
  const list = programActivities([workshop({ name: "גילוף", endDate: "2026-09-30" })], ["p"], DEFAULT_TYPES, "2026-10-19");
  assert.deepEqual(list.map(a => a.name), ["גילוף"]);
});

test("activities: one per name, best attended first, then by name", () => {
  const list = programActivities([
    workshop({ id: "a", name: "יוגה" }),
    workshop({ id: "b", name: "קרמיקה" }),
    workshop({ id: "c", name: "קרמיקה" }), // a second group of the same workshop
    workshop({ id: "d", name: "בישול" }),
  ], ["p"], DEFAULT_TYPES, "2026-10-19", { b: 2, c: 3, a: 1 });
  assert.deepEqual(list, [{ name: "קרמיקה", attended: 5 }, { name: "יוגה", attended: 1 }, { name: "בישול", attended: 0 }]);
});

test("suggestions: activities matching the area come first", () => {
  const acts = [{ name: "בישול", attended: 4 }, { name: "עבודה עם כלבים טיפוליים", attended: 1 }, { name: "יוגה", attended: 0 }];
  assert.deepEqual(suggestForArea(area("regulation"), acts), { fits: ["עבודה עם כלבים טיפוליים", "יוגה"], others: ["בישול"] });
  assert.deepEqual(suggestForArea(undefined, acts).fits, []);
});

test("hebrew lists and printed lines", () => {
  assert.equal(hebrewList([]), "");
  assert.equal(hebrewList(["קרמיקה"]), "קרמיקה");
  assert.equal(hebrewList(["קרמיקה", "דיקור", "גילוף"]), "קרמיקה, דיקור וגילוף");
  assert.equal(farmActionsLine([]), "");
  assert.equal(farmActionsLine(["יוגה", "קרמיקה"]), "דרכי פעולה בחווה: שילוב בפעילויות כגון יוגה וקרמיקה.");
  assert.match(activitiesWay(["קרמיקה"]), /כגון: קרמיקה\.$/);
});

test("date prints as dd/MM/yyyy", () => {
  assert.equal(formatPlanDate(new Date(2026, 7, 18)), "18/08/2026");
});

test("quick fill drafts every section and keeps the header", () => {
  const base = emptyPlan({ therapistName: "דנה", date: "01/10/2026" });
  const p = quickFill(base, [{ name: "יוגה", attended: 0 }, { name: "בישול", attended: 0 }]);
  assert.equal(p.therapistName, "דנה");
  assert.equal(p.date, "01/10/2026");
  assert.deepEqual(p.areas.map(a => a.id), ["regulation", "interpersonal", "personal"]);
  assert.deepEqual(p.areas[0].farmActions, ["יוגה"]);
  assert.equal(p.goal, GOAL_PRESETS[0]);
  assert.ok(p.ways.some(w => w.includes("יוגה ובישול")));
  assert.deepEqual(missingParts(p), []);
});

test("missing parts block printing until area, goal and an objective exist", () => {
  assert.equal(missingParts(emptyPlan()).length, 3);
  assert.deepEqual(missingParts(emptyPlan({ areas: [{ id: "x", title: "t", description: "", farmActions: [] }], goal: "g", objectives: ["  "] })), ["יעד מרכזי אחד לפחות"]);
});

test("toggle and move", () => {
  assert.deepEqual(toggle(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggle(["a", "b"], "a"), ["b"]);
  assert.deepEqual(move(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(move(["a", "b"], 0, -1), ["a", "b"]);
});

test("a stored plan is read defensively", () => {
  const d = emptyPlan({ therapistName: "דנה" });
  assert.deepEqual(parsePlan(null, d), d);
  const p = parsePlan({ goal: "מטרה", areas: [{ title: "תחום", farmActions: ["יוגה", 3] }, null], objectives: "x", updatedAt: {} }, d);
  assert.equal(p.goal, "מטרה");
  assert.equal(p.therapistName, "דנה");
  assert.deepEqual(p.areas, [{ id: "custom_0", title: "תחום", description: "", farmActions: ["יוגה"] }]);
  assert.deepEqual(p.objectives, []);
});
