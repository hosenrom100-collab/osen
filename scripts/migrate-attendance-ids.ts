/**
 * One-off: merges attendance documents written under older ids (`{patientId}_{contextId}_{date}`)
 * into the single day document `{patientId}_{date}`. The newest document of a participant and day
 * wins; the rest are deleted. Prints what it would do and changes nothing without --apply.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-attendance-ids.ts           # dry run
 *   npx tsx --env-file=.env.local scripts/migrate-attendance-ids.ts --apply   # do it
 */
import { adminDb } from "../src/lib/firebase/admin";

const apply = process.argv.includes("--apply");

async function main() {
  const snap = await adminDb.collection("attendance").get();
  const byDay = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const d of snap.docs) {
    const { patientId, date } = d.data();
    if (typeof patientId !== "string" || typeof date !== "string") continue;
    const key = `${patientId}_${date}`;
    byDay.set(key, [...(byDay.get(key) ?? []), d]);
  }

  let toRewrite = 0, toDelete = 0, conflicts = 0;
  let batch = adminDb.batch();
  let pending = 0;
  const flush = async () => { if (apply && pending) await batch.commit(); batch = adminDb.batch(); pending = 0; };

  for (const [key, docs] of byDay) {
    if (docs.length === 1 && docs[0].id === key) continue;
    const newest = docs.reduce((a, b) => ((b.data().updatedAt ?? "") > (a.data().updatedAt ?? "") ? b : a));
    if (new Set(docs.map((d) => d.data().status)).size > 1) {
      conflicts++;
      console.log(`conflict ${key}: ${docs.map((d) => `${d.id}=${d.data().status}@${d.data().updatedAt}`).join(" | ")} -> keeping ${newest.id}`);
    }
    const data = { ...newest.data(), source: newest.data().source ?? "manual" };
    batch.set(adminDb.collection("attendance").doc(key), data);
    toRewrite++;
    for (const d of docs) if (d.id !== key) { batch.delete(d.ref); toDelete++; pending++; }
    pending++;
    if (pending >= 400) await flush();
  }
  await flush();
  console.log(`${apply ? "applied" : "dry run"}: ${toRewrite} day documents written, ${toDelete} old documents removed, ${conflicts} conflicts resolved by newest.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
