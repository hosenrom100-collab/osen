import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, Timestamp, deleteField } from "firebase/firestore";

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
