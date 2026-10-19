import { test } from "node:test";
import assert from "node:assert/strict";
import { guestIdsOf, transferTargets, withoutGuests } from "../src/lib/workshops/transferCore";
import { participantsOf } from "../src/lib/workshops/people";
import type { Session, SessionChange, Workshop } from "../src/lib/workshops/types";
import type { PatientLite } from "../src/lib/workshops/data";

const session = (o: Partial<Session>): Session => ({
  id: "s", changeId: "w1_2026-10-20_a", workshopId: "w1", workshopName: "A", programId: "p", groupIds: [], slotId: "a",
  origDate: "2026-10-20", date: "2026-10-20", start: "09:00", end: "10:00", staffIds: [], kind: "normal", activity: "workshop",
  hasParticipants: true, audience: "participants", band: false, base: { start: "09:00", end: "10:00", staffIds: [] }, ...o,
});
const change = (o: Partial<SessionChange>): SessionChange => ({ id: "c", workshopId: "w2", slotId: "b", originalDate: "2026-10-20", dates: ["2026-10-20"], published: false, ...o });
const patient = (id: string, programId = "p"): PatientLite => ({ id, firstName: id, lastName: "", programIds: [programId], groupIds: [] });

test("targets: other workshops the same day that take place and have participants", () => {
  const from = session({ kind: "cancelled" });
  const list = [
    session({ id: "same-workshop", workshopId: "w1", changeId: "x1" }),
    session({ id: "late", workshopId: "w2", changeId: "x2", start: "11:00" }),
    session({ id: "early", workshopId: "w3", changeId: "x3", start: "08:00" }),
    session({ id: "other-day", workshopId: "w4", changeId: "x4", date: "2026-10-21" }),
    session({ id: "cancelled", workshopId: "w5", changeId: "x5", kind: "cancelled" }),
    session({ id: "moved-away", workshopId: "w6", changeId: "x6", kind: "moved-away" }),
    session({ id: "staff-meeting", workshopId: "w7", changeId: "x7", audience: "staff" }),
    session({ id: "lunch", workshopId: "block:l", changeId: null, fixedBlock: true }),
    session({ id: "no-participants", workshopId: "w8", changeId: "x8", hasParticipants: false }),
  ];
  assert.deepEqual(transferTargets(from, list).map(s => s.id), ["early", "late"]);
});

test("guests join the target session only, without doubles", () => {
  const w2: Workshop = { id: "w2", name: "B", programId: "q", startDate: "2026-10-01", endDate: "2026-12-31", slots: [], staffIds: [], participantIds: ["b1"], status: "active" };
  const patients = [patient("a1"), patient("a2"), patient("b1", "q")];
  const target = session({ workshopId: "w2", programId: "q", change: change({ guests: { from1: ["a1", "a2", "b1"] } }) });
  assert.deepEqual(participantsOf(target, w2, patients).map(p => p.id), ["b1", "a1", "a2"]);
  assert.deepEqual(participantsOf(session({ workshopId: "w2", programId: "q" }), w2, patients).map(p => p.id), ["b1"]);
  assert.deepEqual(guestIdsOf({ change: change({ guests: { f1: ["a1"], f2: ["a1", "a2"] } }) }), ["a1", "a2"]);
});

test("taking guests back out of a change document", () => {
  const base = { workshopId: "w2", slotId: "b", originalDate: "2026-10-20", dates: ["2026-10-20"], published: false, updatedBy: "u" };
  assert.equal(withoutGuests({ ...base, guests: { f1: ["a1"] } }, "f1"), null); // created only for the guests
  assert.deepEqual(withoutGuests({ ...base, newStart: "09:30", guests: { f1: ["a1"] } }, "f1"), { ...base, newStart: "09:30" });
  assert.deepEqual(withoutGuests({ ...base, guests: { f1: ["a1"], f2: ["a2"] } }, "f1"), { ...base, guests: { f2: ["a2"] } });
  const extra = { ...base, slotId: null, newDate: "2026-10-20", guests: { f1: ["a1"] } };
  assert.deepEqual(withoutGuests(extra, "f1"), { ...base, slotId: null, newDate: "2026-10-20" }); // an extra session is the document itself
});
