import { test } from "node:test";
import assert from "node:assert/strict";
import {
  absenceDateFields, absenceFromDoc, approvedDays, daysInRange, formatAbsenceRange, MAX_ABSENCE_DAYS,
} from "../src/lib/attendance/staffAbsence";

test("a range lists every day, across a month end", () => {
  assert.deepEqual(daysInRange("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(daysInRange("2026-10-14", "2026-10-14"), ["2026-10-14"]);
});

test("invalid or too long ranges give nothing", () => {
  assert.deepEqual(daysInRange("2026-10-14", "2026-10-13"), []);
  assert.deepEqual(daysInRange("2026-10-14", ""), []);
  assert.deepEqual(daysInRange("2026-01-01", "2027-01-01"), []);
  assert.equal(daysInRange("2026-01-01", "2026-12-31").length, 0);
  const max = daysInRange("2026-01-01", "2026-04-30");
  assert.equal(max.length, MAX_ABSENCE_DAYS);
});

test("old single-day documents read as a one-day absence", () => {
  const a = absenceFromDoc("x", { userId: "u1", userName: "דנה", date: "2026-10-14", status: "approved", reason: "מחלה" });
  assert.deepEqual(a.dates, ["2026-10-14"]);
  assert.equal(a.startDate, "2026-10-14");
  assert.equal(a.endDate, "2026-10-14");
});

test("stored fields keep `date` equal to the first day", () => {
  assert.deepEqual(absenceDateFields(["2026-10-16", "2026-10-14", "2026-10-15"]), {
    dates: ["2026-10-14", "2026-10-15", "2026-10-16"], date: "2026-10-14", startDate: "2026-10-14", endDate: "2026-10-16",
  });
});

test("the calendar sees each approved day of a range, and nothing pending", () => {
  const range = absenceFromDoc("r", { userId: "u1", status: "approved", ...absenceDateFields(daysInRange("2026-10-14", "2026-10-20")) });
  const pending = absenceFromDoc("p", { userId: "u2", status: "pending", date: "2026-10-18" });
  assert.deepEqual(approvedDays([range, pending], ["2026-10-18", "2026-10-19", "2026-10-21"]), [
    { userId: "u1", date: "2026-10-18" }, { userId: "u1", date: "2026-10-19" },
  ]);
});

test("range label", () => {
  assert.equal(formatAbsenceRange({ startDate: "2026-10-14", endDate: "2026-10-14" }), "14.10");
  assert.equal(formatAbsenceRange({ startDate: "2026-10-14", endDate: "2026-10-18" }), "14.10–18.10");
});
