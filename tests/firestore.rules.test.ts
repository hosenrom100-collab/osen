import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, Timestamp, deleteField, writeBatch } from "firebase/firestore";

let env: RulesTestEnvironment;

const HOUR = 3600_000;
const past = () => Timestamp.fromMillis(Date.now() - HOUR);
const future = () => Timestamp.fromMillis(Date.now() + HOUR);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-osen-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
after(async () => { await env.cleanup(); });

const ROLES: Record<string, string> = { staff: "employee", logistics: "logistics", manager: "manager" };

async function seed(settings: Record<string, unknown> | null, items: Record<string, Record<string, unknown>> = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of Object.entries(ROLES)) await setDoc(doc(db, "users", uid), { role, roles: [role] });
    if (settings) await setDoc(doc(db, "settings", "shopping"), settings);
    for (const [id, data] of Object.entries(items)) await setDoc(doc(db, "shopping_requests", id), data);
  });
}

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const newItem = (over: Record<string, unknown> = {}) => ({
  name: "חלב", category: "מוצרי חלב", quantity: "1", status: "approved",
  requestedBy: "staff", requestedByName: "עובד", createdAt: new Date(), listType: "supermarket", ...over,
});
const existing = (over: Record<string, unknown> = {}) => newItem({ createdAt: Timestamp.fromMillis(Date.now() - 5 * HOUR), ...over });
const frozen = (list: "supermarket" | "large") => ({ freezeAt: { supermarket: future(), large: future(), [list]: past() } });

beforeEach(async () => { await seed({ cutoffConfig: { enabled: true, day: 1, time: "16:00" } }); });

// ── create ──
test("staff can add while the list is open", async () => {
  await seed({ freezeAt: { supermarket: future(), large: future() } });
  await assertSucceeds(addDoc(collection(as("staff"), "shopping_requests"), newItem()));
});

test("staff cannot add once the list is frozen", async () => {
  await seed(frozen("supermarket"));
  await assertFails(addDoc(collection(as("staff"), "shopping_requests"), newItem()));
});

test("a frozen supermarket list does not block the large list, and vice versa", async () => {
  await seed(frozen("supermarket"));
  await assertSucceeds(addDoc(collection(as("staff"), "shopping_requests"), newItem({ listType: "large" })));
  await seed(frozen("large"));
  await assertSucceeds(addDoc(collection(as("staff"), "shopping_requests"), newItem()));
  await assertFails(addDoc(collection(as("staff"), "shopping_requests"), newItem({ listType: "large" })));
});

test("an item without listType counts as supermarket", async () => {
  await seed(frozen("supermarket"));
  const { listType: _omit, ...legacy } = newItem();
  await assertFails(addDoc(collection(as("staff"), "shopping_requests"), legacy));
});

test("a missing or null boundary means not frozen", async () => {
  await seed(null);
  await assertSucceeds(addDoc(collection(as("staff"), "shopping_requests"), newItem()));
  await seed({ freezeAt: { supermarket: null, large: null } });
  await assertSucceeds(addDoc(collection(as("staff"), "shopping_requests"), newItem()));
  await seed({ cutoffConfig: { enabled: false } });
  await assertSucceeds(addDoc(collection(as("staff"), "shopping_requests"), newItem()));
});

test("staff still cannot add under someone else's name", async () => {
  await seed({ freezeAt: { supermarket: future(), large: future() } });
  await assertFails(addDoc(collection(as("staff"), "shopping_requests"), newItem({ requestedBy: "manager" })));
});

test("logistics and managers can add to a frozen list", async () => {
  await seed(frozen("supermarket"));
  await assertSucceeds(addDoc(collection(as("logistics"), "shopping_requests"), newItem({ requestedBy: "logistics" })));
  await assertSucceeds(addDoc(collection(as("manager"), "shopping_requests"), newItem({ requestedBy: "manager" })));
});

// ── update ──
test("staff can edit an item while its list is open", async () => {
  await seed({ freezeAt: { supermarket: future(), large: future() } }, { a: existing() });
  const ref = doc(as("staff"), "shopping_requests", "a");
  await assertSucceeds(updateDoc(ref, { quantity: "3" }));
  await assertSucceeds(updateDoc(ref, { status: "deleted" }));
});

test("staff cannot change anything on a frozen list", async () => {
  await seed(frozen("supermarket"), { a: existing() });
  const ref = doc(as("staff"), "shopping_requests", "a");
  await assertFails(updateDoc(ref, { quantity: "3" }));
  await assertFails(updateDoc(ref, { notes: "x" }));
  await assertFails(updateDoc(ref, { status: "purchased" }));
  await assertFails(updateDoc(ref, { status: "deleted" }));
});

test("moving an item into a frozen list is an add and is refused", async () => {
  await seed(frozen("large"), { a: existing() });
  await assertFails(updateDoc(doc(as("staff"), "shopping_requests", "a"), { listType: "large" }));
});

test("moving an item out of a frozen list is refused too", async () => {
  await seed(frozen("supermarket"), { a: existing() });
  await assertFails(updateDoc(doc(as("staff"), "shopping_requests", "a"), { listType: "large" }));
});

test("moving between two open lists works", async () => {
  await seed({ freezeAt: { supermarket: future(), large: future() } }, { a: existing() });
  await assertSucceeds(updateDoc(doc(as("staff"), "shopping_requests", "a"), { listType: "large" }));
});

test("nobody but a manager can rewrite who requested an item or when", async () => {
  await seed({ freezeAt: { supermarket: future(), large: future() } }, { a: existing() });
  const ref = doc(as("staff"), "shopping_requests", "a");
  await assertFails(updateDoc(ref, { requestedBy: "manager" }));
  await assertFails(updateDoc(ref, { createdAt: new Date() }));
});

test("logistics and managers can update and delete on a frozen list", async () => {
  await seed(frozen("supermarket"), { a: existing(), b: existing() });
  await assertSucceeds(updateDoc(doc(as("logistics"), "shopping_requests", "a"), { status: "purchased" }));
  await assertSucceeds(deleteDoc(doc(as("manager"), "shopping_requests", "b")));
});

test("staff can never permanently delete", async () => {
  await seed({ freezeAt: { supermarket: future(), large: future() } }, { a: existing() });
  await assertFails(deleteDoc(doc(as("staff"), "shopping_requests", "a")));
});

// ── the boundary itself ──
test("staff can read items and settings on a frozen list", async () => {
  await seed(frozen("supermarket"), { a: existing() });
  await assertSucceeds(getDoc(doc(as("staff"), "shopping_requests", "a")));
  await assertSucceeds(getDoc(doc(as("staff"), "settings", "shopping")));
});

test("staff cannot move the boundary themselves", async () => {
  await seed(frozen("supermarket"));
  await assertFails(setDoc(doc(as("staff"), "settings", "shopping"), { freezeAt: { supermarket: future() } }, { merge: true }));
  await assertFails(updateDoc(doc(as("staff"), "settings", "shopping"), { freezeAt: deleteField() }));
});

test("an unauthenticated client can do nothing", async () => {
  await seed({ freezeAt: { supermarket: future(), large: future() } });
  await assertFails(addDoc(collection(env.unauthenticatedContext().firestore(), "shopping_requests"), newItem()));
});

// ── role lookup (the helpers were rewritten to stay under Firestore's 1000-expression limit) ──
async function seedUsers(users: Record<string, Record<string, unknown>>, settings: Record<string, unknown>) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, data] of Object.entries(users)) await setDoc(doc(db, "users", uid), data);
    await setDoc(doc(db, "settings", "shopping"), settings);
  });
}

test("roles are honoured from the `role` field alone or the `roles` array alone", async () => {
  await seedUsers(
    { onlyRole: { role: "employee" }, onlyArray: { roles: ["employee"] }, logisticsArray: { roles: ["social_worker", "logistics"] } },
    frozen("supermarket")
  );
  const items = (uid: string) => collection(as(uid), "shopping_requests");
  // staff on an open list (the large list is not frozen)
  await assertSucceeds(addDoc(items("onlyRole"), newItem({ requestedBy: "onlyRole", listType: "large" })));
  await assertSucceeds(addDoc(items("onlyArray"), newItem({ requestedBy: "onlyArray", listType: "large" })));
  // ...and blocked on the frozen one
  await assertFails(addDoc(items("onlyRole"), newItem({ requestedBy: "onlyRole" })));
  await assertFails(addDoc(items("onlyArray"), newItem({ requestedBy: "onlyArray" })));
  // logistics found through the array is exempt
  await assertSucceeds(addDoc(items("logisticsArray"), newItem({ requestedBy: "logisticsArray" })));
});

test("a signed-in user who is not staff cannot add, even to an open list", async () => {
  await seedUsers({ outsider: { role: "participant" }, empty: {} }, { freezeAt: { supermarket: future(), large: future() } });
  await assertFails(addDoc(collection(as("outsider"), "shopping_requests"), newItem({ requestedBy: "outsider" })));
  await assertFails(addDoc(collection(as("empty"), "shopping_requests"), newItem({ requestedBy: "empty" })));
  await assertFails(addDoc(collection(as("nobody-has-a-user-doc"), "shopping_requests"), newItem({ requestedBy: "nobody-has-a-user-doc" })));
});

test("the admin override still reaches collections no rule mentions", async () => {
  await seedUsers({ adm: { role: "admin" } }, { freezeAt: { supermarket: past(), large: past() } });
  await assertSucceeds(setDoc(doc(as("adm"), "some_unlisted_collection", "x"), { a: 1 }));
  await assertSucceeds(addDoc(collection(as("adm"), "shopping_requests"), newItem({ requestedBy: "adm" })));
});

// ── attendance ──
const dayDoc = (over: Record<string, unknown> = {}) => ({
  patientId: "p1", date: "2026-10-14", status: "present", updatedAt: "2026-10-14T07:00:00.000Z", ...over,
});
const att = (uid: string, id = "p1_2026-10-14") => doc(as(uid), "attendance", id);

async function seedAttendance() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of Object.entries(ROLES)) await setDoc(doc(db, "users", uid), { role, roles: [role] });
    await setDoc(doc(db, "users", "participant"), { role: "participant", patientId: "p1" });
    await setDoc(doc(db, "users", "other"), { role: "participant", patientId: "p2" });
    await setDoc(doc(db, "attendance", "p1_2026-10-13"), dayDoc({ date: "2026-10-13" }));
    await setDoc(doc(db, "attendance_notes", "p1_2026-10-13"), { text: "חולה", patientId: "p1", date: "2026-10-13", kind: "day" });
  });
}

test("staff write a day's attendance, with late and early-leave marks", async () => {
  await seedAttendance();
  await assertSucceeds(setDoc(att("staff"), dayDoc()));
  await assertSucceeds(setDoc(att("staff"), dayDoc({ late: { at: "09:40" }, leftEarly: { at: null }, hasNote: true, source: "manual" })));
  await assertSucceeds(setDoc(att("staff"), dayDoc({ status: "unset", hasNote: true })));
  await assertSucceeds(deleteDoc(att("staff")));
});

test("attendance: the id must belong to the patient and date, and only known statuses and times pass", async () => {
  await seedAttendance();
  await assertFails(setDoc(att("staff", "p2_2026-10-14"), dayDoc())); // someone else's document
  await assertFails(setDoc(att("staff", "p1_group_2026-10-15"), dayDoc())); // another date
  await assertFails(setDoc(att("staff"), dayDoc({ status: "late" })));
  await assertFails(setDoc(att("staff"), dayDoc({ late: { at: "9:40" } })));
  await assertFails(setDoc(att("staff"), dayDoc({ late: { at: "25:00" } })));
  await assertFails(setDoc(att("staff"), dayDoc({ note: "הערה שלא שייכת למסמך הזה" })));
  await assertFails(setDoc(att("staff"), dayDoc({ date: "14/10/2026" })));
});

test("a participant cannot write attendance, and reads only their own", async () => {
  await seedAttendance();
  await assertFails(setDoc(att("participant"), dayDoc()));
  await assertFails(deleteDoc(att("participant", "p1_2026-10-13")));
  await assertSucceeds(getDoc(att("participant", "p1_2026-10-13")));
  await assertFails(getDoc(att("other", "p1_2026-10-13")));
});

test("notes: staff only, one short line", async () => {
  await seedAttendance();
  const note = (uid: string, id: string, text: string) =>
    setDoc(doc(as(uid), "attendance_notes", id), { text, patientId: "p1", date: "2026-10-14", kind: "day" });
  await assertSucceeds(note("staff", "p1_2026-10-14", "ללא אישור"));
  await assertFails(note("staff", "p1_2026-10-14", ""));
  await assertFails(note("staff", "p1_2026-10-14", "א".repeat(81)));
  await assertSucceeds(note("staff", "p1_2026-10-14", "א".repeat(80)));
  await assertFails(note("participant", "p1_2026-10-14", "חולה"));
  await assertFails(getDoc(doc(as("participant"), "attendance_notes", "p1_2026-10-13"))); // not even their own
  await assertSucceeds(getDoc(doc(as("staff"), "attendance_notes", "p1_2026-10-13")));
});

test("session attendance: the id is session and participant", async () => {
  await seedAttendance();
  const sess = (uid: string, id: string, over: Record<string, unknown> = {}) =>
    setDoc(doc(as(uid), "session_attendance", id), {
      patientId: "p1", sessionId: "w1_2026-10-14_s1", date: "2026-10-14", workshopId: "w1", slotId: "s1",
      programId: "pr1", status: "present", updatedAt: "2026-10-14T07:00:00.000Z", ...over,
    });
  await assertSucceeds(sess("staff", "w1_2026-10-14_s1_p1"));
  await assertSucceeds(sess("staff", "w1_2026-10-14_s1_p1", { late: { at: "10:30" } }));
  await assertFails(sess("staff", "w1_2026-10-14_s1_p2")); // wrong id
  await assertFails(sess("staff", "w1_2026-10-14_s1_p1", { status: "unset" }));
  await assertFails(sess("participant", "w1_2026-10-14_s1_p1"));
});

// ── the exact batch the attendance screens send ──
test("the day-attendance batch (document + note delete + legacy delete) is accepted for staff", async () => {
  await seedAttendance();
  const db = as("staff");
  const b = writeBatch(db);
  b.set(doc(db, "attendance", "p1_2026-10-14"), {
    patientId: "p1", date: "2026-10-14", status: "present", hasNote: false, source: "manual",
    updatedBy: "staff", updatedAt: "2026-10-14T07:00:00.000Z", contextId: "g1",
  });
  b.delete(doc(db, "attendance_notes", "p1_2026-10-14"));
  b.delete(doc(db, "attendance", "p1_g1_2026-10-14"));
  await assertSucceeds(b.commit());
});

test("a screen still running the previous version (id with the group in it) can still save", async () => {
  await seedAttendance();
  await assertSucceeds(setDoc(att("staff", "p1_group7_2026-10-14"), {
    patientId: "p1", date: "2026-10-14", status: "present", contextId: "group7", updatedAt: "2026-10-14T07:00:00.000Z",
  }));
});

// ── breakfast duty ──

test("breakfast duty: everyone signed in reads it, only managers write it", async () => {
  await seed(null);
  const duty = (uid: string) => doc(as(uid), "daily_duties", "prog1_2026-10-19");
  const data = { programId: "prog1", date: "2026-10-19", breakfastIds: ["p1", "p2"] };
  await assertSucceeds(setDoc(duty("manager"), data));
  await assertFails(setDoc(duty("staff"), data));
  await assertFails(deleteDoc(duty("logistics")));
  await assertSucceeds(getDoc(duty("staff")));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "daily_duties", "prog1_2026-10-19")));
  await assertSucceeds(deleteDoc(duty("manager")));
});
