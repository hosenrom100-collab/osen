import { test } from "node:test";
import assert from "node:assert/strict";
import {
  absentInSession, addMinutes, countEntries, dayAttendanceId, entryFromDoc, entryIsEmpty, isValidTime, newest, timeInIsrael,
} from "../src/lib/attendance/model";

test("one id per participant per day", () => {
  assert.equal(dayAttendanceId("p1", "2026-10-14"), "p1_2026-10-14");
});

test("time helpers", () => {
  assert.ok(isValidTime("09:05") && isValidTime("23:59") && !isValidTime("24:00") && !isValidTime("9:5"));
  assert.equal(timeInIsrael(new Date("2026-10-14T07:05:00Z")), "10:05"); // UTC+3 in summer time
  assert.equal(timeInIsrael(new Date("2026-11-02T07:05:00Z")), "09:05"); // UTC+2 after the clocks change
  assert.equal(addMinutes("09:50", 15), "10:05");
  assert.equal(addMinutes("23:50", 30), "23:59");
  assert.equal(addMinutes("00:10", -30), "00:00");
});

test("late and early leave only count on a present participant", () => {
  const present = entryFromDoc({ status: "present", late: { at: "09:40" }, leftEarly: { at: null } });
  assert.deepEqual(present.late, { at: "09:40" });
  assert.deepEqual(present.leftEarly, { at: null });
  const absent = entryFromDoc({ status: "absent", late: { at: "09:40" } });
  assert.equal(absent.late, null);
  const legacy = entryFromDoc({ status: "unknown-value" });
  assert.equal(legacy.status, "unset");
});

test("an entry with nothing in it is empty, a note alone is not", () => {
  assert.ok(entryIsEmpty({ status: "unset" }));
  assert.ok(!entryIsEmpty({ status: "unset", note: "חולה" }));
  assert.ok(!entryIsEmpty({ status: "present", late: { at: null } }));
});

test("the newest of two duplicate documents wins", () => {
  const a = { updatedAt: "2026-10-14T08:00:00.000Z", status: "present" };
  const b = { updatedAt: "2026-10-14T09:00:00.000Z", status: "absent" };
  assert.equal(newest(a, b), b);
  assert.equal(newest(b, a), b);
  assert.equal(newest<{ updatedAt?: string }>({}, a), a); // a missing timestamp loses
});

test("counts", () => {
  const c = countEntries([
    { status: "present", late: { at: "09:40" } },
    { status: "present", leftEarly: { at: null } },
    { status: "present", late: { at: null }, leftEarly: { at: "12:00" } },
    { status: "absent" },
    { status: "unset" },
  ]);
  assert.deepEqual(c, { present: 3, absent: 1, unset: 1, late: 2, leftEarly: 2 });
});

import { dayFillAction, suggestMark } from "../src/lib/attendance/model";

test("a present mark in a session fills an empty day but never overwrites a manual one", () => {
  assert.deepEqual(dayFillAction(undefined, "s1", "present", null), { type: "fill" });
  assert.deepEqual(dayFillAction({ status: "unset" }, "s1", "present", null), { type: "fill" });
  assert.equal(dayFillAction({ status: "absent", source: "manual" }, "s1", "present", null), null);
  assert.equal(dayFillAction({ status: "present", source: "manual" }, "s1", "present", null), null);
});

test("undoing a session mark takes back only what that session filled", () => {
  const filled = { status: "present" as const, source: "session" as const, derivedFrom: "s1" };
  assert.deepEqual(dayFillAction(filled, "s1", "unset", null), { type: "clear" });
  assert.deepEqual(dayFillAction(filled, "s1", "absent", null), { type: "clear" });
  assert.deepEqual(dayFillAction(filled, "s1", "absent", "s2"), { type: "rederive", sessionId: "s2" });
  assert.equal(dayFillAction(filled, "s2", "unset", null), null); // filled by another session
  assert.equal(dayFillAction({ status: "present", source: "manual" }, "s1", "unset", null), null);
});

const morning = { id: "m", start: "09:00", end: "11:00" };
const noon = { id: "n", start: "11:30", end: "13:00", date: "2026-10-14" };
const base = { daySessions: [morning, noon], today: "2026-10-14", nowTime: "11:35" };

test("suggestions: absent in the morning and present later points to a late arrival", () => {
  const h = suggestMark({ ...base, newStatus: "present", session: noon, others: [{ sessionId: "m", status: "absent" }] });
  assert.equal(h?.kind, "late");
  assert.equal(h?.at, "11:30");
});

test("suggestions: present in the morning and absent later points to an early leave at the end of the morning", () => {
  const h = suggestMark({ ...base, newStatus: "absent", session: noon, others: [{ sessionId: "m", status: "present" }] });
  assert.equal(h?.kind, "leftEarly");
  assert.equal(h?.at, "11:00");
});

test("suggestions: a tap well after a session began offers a late mark at the tap time, within the session only", () => {
  const first = { id: "m", start: "09:00", end: "11:00", date: "2026-10-14" };
  const late = suggestMark({ newStatus: "present", session: first, daySessions: [first], others: [], nowTime: "09:25", today: "2026-10-14" });
  assert.equal(late?.at, "09:25");
  assert.equal(suggestMark({ newStatus: "present", session: first, daySessions: [first], others: [], nowTime: "09:05", today: "2026-10-14" }), null);
  assert.equal(suggestMark({ newStatus: "present", session: first, daySessions: [first], others: [], nowTime: "11:30", today: "2026-10-14" }), null); // after it ended
  assert.equal(suggestMark({ newStatus: "present", session: first, daySessions: [first], others: [], nowTime: "09:25", today: "2026-10-13" }), null); // another day
});

test("suggestions: nothing when the person was already there earlier", () => {
  assert.equal(suggestMark({ ...base, newStatus: "present", session: noon, others: [{ sessionId: "m", status: "present" }] }), null);
});

test("who is away in a session: its own mark first, else a whole-day absence", () => {
  const marks = new Map<string, "present" | "absent" | "unset">([["a", "absent"], ["b", "present"]]);
  const dayAbsent = new Set(["b", "c"]);
  // a: absent in the session; b: came to this session despite a day absence; c: day absence only; d: nothing.
  assert.deepEqual(absentInSession(["a", "b", "c", "d"], marks, dayAbsent), ["a", "c"]);
  assert.deepEqual(absentInSession(["a", "c"], undefined, undefined), []);
  assert.deepEqual(absentInSession(["c"], undefined, dayAbsent), ["c"]);
  // Someone marked absent in a session they do not belong to is not counted there.
  assert.deepEqual(absentInSession(["d"], marks, dayAbsent), []);
});
