import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMinutes, countEntries, dayAttendanceId, entryFromDoc, entryIsEmpty, isValidTime, newest, timeInIsrael,
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
