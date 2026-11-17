import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, Timestamp, writeBatch } from "firebase/firestore";

let env: RulesTestEnvironment;

const HOUR = 3600_000;

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

beforeEach(async () => { await seed(null); });

// ── create ──
// The shopping list is ongoing (daily, never closes), so there is no freeze: staff can always
// add under their own name and the only limits are who an item is attributed to and its status.
test("staff can add under their own name, on either list, at any time", async () => {
  await assertSucceeds(addDoc(collection(as("staff"), "shopping_requests"), newItem()));
  await assertSucceeds(addDoc(collection(as("staff"), "shopping_requests"), newItem({ listType: "large" })));
});

test("an item without listType (older documents) can still be added", async () => {
  const { listType: _omit, ...legacy } = newItem();
  await assertSucceeds(addDoc(collection(as("staff"), "shopping_requests"), legacy));
});

test("staff cannot add under someone else's name, or skip the approved status", async () => {
  await assertFails(addDoc(collection(as("staff"), "shopping_requests"), newItem({ requestedBy: "manager" })));
  await assertFails(addDoc(collection(as("staff"), "shopping_requests"), newItem({ status: "purchased" })));
});

test("logistics and managers can add on someone else's behalf", async () => {
  await assertSucceeds(addDoc(collection(as("logistics"), "shopping_requests"), newItem({ requestedBy: "staff" })));
  await assertSucceeds(addDoc(collection(as("manager"), "shopping_requests"), newItem({ requestedBy: "staff" })));
});

// ── update ──
test("staff can edit, move between lists and soft-delete an item", async () => {
  await seed(null, { a: existing() });
  const ref = doc(as("staff"), "shopping_requests", "a");
  await assertSucceeds(updateDoc(ref, { quantity: "3" }));
  await assertSucceeds(updateDoc(ref, { status: "purchased" }));
  await assertSucceeds(updateDoc(ref, { listType: "large" }));
  await assertSucceeds(updateDoc(ref, { status: "deleted" }));
});

test("nobody but a manager can rewrite who requested an item or when", async () => {
  await seed(null, { a: existing() });
  const ref = doc(as("staff"), "shopping_requests", "a");
  await assertFails(updateDoc(ref, { requestedBy: "manager" }));
  await assertFails(updateDoc(ref, { createdAt: new Date() }));
});

test("logistics and managers can update and delete", async () => {
  await seed(null, { a: existing(), b: existing() });
  await assertSucceeds(updateDoc(doc(as("logistics"), "shopping_requests", "a"), { status: "purchased" }));
  await assertSucceeds(deleteDoc(doc(as("manager"), "shopping_requests", "b")));
});

test("staff can never permanently delete", async () => {
  await seed(null, { a: existing() });
  await assertFails(deleteDoc(doc(as("staff"), "shopping_requests", "a")));
});

test("staff can read items and the shopping settings, but not write the settings", async () => {
  await seed({ categories: ["ירקות"] }, { a: existing() });
  await assertSucceeds(getDoc(doc(as("staff"), "shopping_requests", "a")));
  await assertSucceeds(getDoc(doc(as("staff"), "settings", "shopping")));
  await assertFails(setDoc(doc(as("staff"), "settings", "shopping"), { categories: [] }, { merge: true }));
});

test("an unauthenticated client can do nothing", async () => {
  await assertFails(addDoc(collection(env.unauthenticatedContext().firestore(), "shopping_requests"), newItem()));
});

// ── role lookup (the helpers were rewritten to stay under Firestore's 1000-expression limit) ──
async function seedUsers(users: Record<string, Record<string, unknown>>) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, data] of Object.entries(users)) await setDoc(doc(db, "users", uid), data);
  });
}

test("roles are honoured from the `role` field alone or the `roles` array alone", async () => {
  await seedUsers({ onlyRole: { role: "employee" }, onlyArray: { roles: ["employee"] }, logisticsArray: { roles: ["social_worker", "logistics"] } });
  const items = (uid: string) => collection(as(uid), "shopping_requests");
  await assertSucceeds(addDoc(items("onlyRole"), newItem({ requestedBy: "onlyRole" })));
  await assertSucceeds(addDoc(items("onlyArray"), newItem({ requestedBy: "onlyArray" })));
  // only a shopping manager may attribute an item to someone else — logistics found through the array can
  await assertFails(addDoc(items("onlyArray"), newItem({ requestedBy: "onlyRole" })));
  await assertSucceeds(addDoc(items("logisticsArray"), newItem({ requestedBy: "onlyRole" })));
});

test("a signed-in user who is not staff cannot add", async () => {
  await seedUsers({ outsider: { role: "participant" }, empty: {} });
  await assertFails(addDoc(collection(as("outsider"), "shopping_requests"), newItem({ requestedBy: "outsider" })));
  await assertFails(addDoc(collection(as("empty"), "shopping_requests"), newItem({ requestedBy: "empty" })));
  await assertFails(addDoc(collection(as("nobody-has-a-user-doc"), "shopping_requests"), newItem({ requestedBy: "nobody-has-a-user-doc" })));
});

test("the admin override still reaches collections no rule mentions", async () => {
  await seedUsers({ adm: { role: "admin" } });
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
  const data = { programId: "prog1", date: "2026-10-19", breakfastIds: ["p1", "p2"], instructorId: "s1" };
  await assertSucceeds(setDoc(duty("manager"), data));
  await assertFails(setDoc(duty("staff"), data));
  await assertFails(deleteDoc(duty("logistics")));
  await assertSucceeds(getDoc(duty("staff")));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "daily_duties", "prog1_2026-10-19")));
  await assertSucceeds(deleteDoc(duty("manager")));
});

// ── rehabilitation plans ──

test("rehab plans: care staff read and write them, participants and logistics cannot", async () => {
  await seedAttendance();
  const plan = (uid: string, id = "p1") => doc(as(uid), "rehab_plans", id);
  const data = { patientId: "p1", goal: "מטרה", areas: [], objectives: [], ways: [], supports: [] };
  await assertSucceeds(setDoc(plan("staff"), data));
  await assertSucceeds(getDoc(plan("staff")));
  await assertSucceeds(setDoc(plan("manager"), { ...data, goal: "מטרה אחרת" }));
  await assertFails(setDoc(plan("staff", "p2"), data)); // the id must be the participant's
  await assertFails(getDoc(plan("participant")));       // not even their own
  await assertFails(setDoc(plan("participant"), data));
  await assertFails(getDoc(plan("logistics")));
  await assertFails(setDoc(plan("logistics"), data));
});

// ── accompanying instructor (מדריך מלווה): read-only patient file, otherwise a regular employee ──

test("accompanying instructor reads patient files but cannot write them; can add shopping items", async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", "companion"), { role: "accompanying_instructor", roles: ["accompanying_instructor"] });
    await setDoc(doc(db, "patients", "p1"), { firstName: "א" });
  });
  await assertSucceeds(getDoc(doc(as("companion"), "patients", "p1")));
  await assertFails(updateDoc(doc(as("companion"), "patients", "p1"), { firstName: "ב" }));
  await assertFails(setDoc(doc(as("companion"), "documents", "d1"), { patientId: "p1" }));
  // like an instructor, they can still mark attendance
  await assertSucceeds(setDoc(doc(as("companion"), "attendance", "p1_2026-01-01"), {
    patientId: "p1", date: "2026-01-01", status: "present",
  }));
  await assertSucceeds(addDoc(collection(as("companion"), "shopping_requests"), newItem({ requestedBy: "companion" })));
});

// ── programs & groups: delete is for manager/admin only ──
async function seedProgram() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of Object.entries({ admin: "admin", manager: "manager", instructor: "instructor", employee: "employee", logistics: "logistics" })) {
      await setDoc(doc(db, "users", uid), { role, roles: [role] });
    }
    await setDoc(doc(db, "programs", "p1"), { name: "תוכנית", activeDays: [1, 2, 3], status: "active" });
    await setDoc(doc(db, "groups", "g1"), { name: "קבוצה", programId: "p1" });
  });
}

test("admin and manager can delete a program and its groups", async () => {
  for (const uid of ["admin", "manager"]) {
    await seedProgram();
    await assertSucceeds(deleteDoc(doc(as(uid), "groups", "g1")));
    await assertSucceeds(deleteDoc(doc(as(uid), "programs", "p1")));
  }
});

test("instructor, employee and logistics cannot delete a program or a group", async () => {
  for (const uid of ["instructor", "employee", "logistics"]) {
    await seedProgram();
    await assertFails(deleteDoc(doc(as(uid), "programs", "p1")));
    await assertFails(deleteDoc(doc(as(uid), "groups", "g1")));
  }
});

test("an unauthenticated visitor cannot delete a program", async () => {
  await seedProgram();
  await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), "programs", "p1")));
});
