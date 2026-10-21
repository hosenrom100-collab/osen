import { test } from "node:test";
import assert from "node:assert/strict";
import { opensAttendance } from "../src/lib/workshops/attendanceEntry";
import type { Session } from "../src/lib/workshops/types";

const base: Session = {
  id: "w1_2026-10-21_s1", changeId: "w1_2026-10-21_s1", workshopId: "w1", workshopName: "קרמיקה",
  programId: "p1", groupIds: [], slotId: "s1", origDate: null, date: "2026-10-21", start: "09:00", end: "10:00",
  staffIds: [], kind: "normal", activity: "workshop", hasParticipants: true, audience: "participants", band: false,
  base: { start: "09:00", end: "10:00", staffIds: [] },
};

test("a workshop session with participants opens its attendance check", () => {
  assert.equal(opensAttendance(base, 8, true), true);
  assert.equal(opensAttendance({ ...base, kind: "moved-in" }, 8, true), true);
  assert.equal(opensAttendance({ ...base, kind: "extra" }, 8, true), true);
});

test("nothing opens for someone who cannot mark attendance", () => {
  assert.equal(opensAttendance(base, 8, false), false);
});

test("cancelled sessions, bands, fixed blocks and empty sessions are not clickable", () => {
  assert.equal(opensAttendance({ ...base, kind: "cancelled" }, 8, true), false);
  assert.equal(opensAttendance({ ...base, band: true }, 8, true), false);
  assert.equal(opensAttendance({ ...base, fixedBlock: true }, 8, true), false);
  assert.equal(opensAttendance({ ...base, changeId: null }, 8, true), false);
  assert.equal(opensAttendance(base, 0, true), false);
});
