import {
  collection, doc, getDocs, query, where, writeBatch,
  type DocumentReference, type DocumentData, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export interface ProgramImpact {
  groups: number;
  workshops: number;
  patients: number;
  staff: number;
}

const without = (arr: unknown, ...ids: string[]): string[] =>
  (Array.isArray(arr) ? arr : []).filter((x: string) => !ids.includes(x));

const has = (arr: unknown, id: string) => Array.isArray(arr) && arr.includes(id);

/** כמה רשומות קשורות יושפעו ממחיקת התוכנית (להצגה באישור המחיקה) */
export async function getProgramImpact(programId: string): Promise<ProgramImpact> {
  const [groups, workshops, patientsA, patientsB, staff] = await Promise.all([
    getDocs(query(collection(db, "groups"), where("programId", "==", programId))),
    getDocs(query(collection(db, "workshops"), where("programId", "==", programId))),
    getDocs(query(collection(db, "patients"), where("programIds", "array-contains", programId))),
    getDocs(query(collection(db, "patients"), where("programId", "==", programId))),
    getDocs(query(collection(db, "users"), where("programIds", "array-contains", programId))),
  ]);
  const patientIds = new Set([...patientsA.docs, ...patientsB.docs].map(d => d.id));
  return { groups: groups.size, workshops: workshops.size, patients: patientIds.size, staff: staff.size };
}

/**
 * מחיקת תוכנית עם ניקוי כל מה שמפנה אליה:
 *  - הקבוצות של התוכנית (והסרת השיוך אליהן ממטופלים ואנשי צוות)
 *  - הסרת התוכנית משיוכי מטופלים ואנשי צוות
 *  - הסדנאות של התוכנית ושינויי המפגשים שלהן
 *  - סגירות: הסרת התוכנית מהרשימה (סגירה שהייתה רק לתוכנית הזו נמחקת)
 * מסמך התוכנית עצמו נמחק אחרון, כך שאם משהו נכשל באמצע אפשר לנסות שוב.
 * היסטוריית נוכחות (attendance) נשארת ללא שינוי.
 * ההרשאה נאכפת בכללי Firestore (מנהל/אדמין בלבד) ובממשק.
 */
export async function deleteProgramCascade(programId: string): Promise<void> {
  const deletes: DocumentReference[] = [];
  const updates = new Map<string, { ref: DocumentReference; data: Record<string, unknown> }>();
  const patch = (ref: DocumentReference, data: Record<string, unknown>) => {
    const cur = updates.get(ref.path);
    updates.set(ref.path, { ref, data: { ...(cur?.data ?? {}), ...data } });
  };

  // ── קבוצות התוכנית ──
  const groupsSnap = await getDocs(query(collection(db, "groups"), where("programId", "==", programId)));
  const groupIds = groupsSnap.docs.map(g => g.id);
  groupsSnap.docs.forEach(g => deletes.push(g.ref));

  const collect = async (col: string, field: string, ids: string[]) => {
    const found = new Map<string, QueryDocumentSnapshot<DocumentData>>();
    const snaps = await Promise.all(
      ids.map(id => getDocs(query(collection(db, col), where(field, "array-contains", id)))),
    );
    snaps.forEach(s => s.docs.forEach(d => found.set(d.id, d)));
    return found;
  };

  // ── מטופלים ──
  const patients = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  (await collect("patients", "groupIds", groupIds)).forEach((d, k) => patients.set(k, d));
  (await collect("patients", "programIds", [programId])).forEach((d, k) => patients.set(k, d));
  const legacy = await getDocs(query(collection(db, "patients"), where("programId", "==", programId)));
  legacy.docs.forEach(d => patients.set(d.id, d));

  patients.forEach(p => {
    const data = p.data();
    const update: Record<string, unknown> = {};
    if (groupIds.length && Array.isArray(data.groupIds) && data.groupIds.some((g: string) => groupIds.includes(g))) {
      const newGroups = without(data.groupIds, ...groupIds);
      update.groupIds = newGroups;
      if (groupIds.includes(data.hosenType)) update.hosenType = newGroups[0] || "";
    } else if (groupIds.includes(data.hosenType)) {
      update.hosenType = "";
    }
    if (has(data.programIds, programId) || data.programId === programId) {
      const newPrograms = without(data.programIds, programId);
      if (Array.isArray(data.programIds)) update.programIds = newPrograms;
      if (data.programId === programId) update.programId = newPrograms[0] || "";
    }
    if (Object.keys(update).length) patch(p.ref, update);
  });

  // ── אנשי צוות ──
  const staff = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  for (const [field, ids] of [
    ["assignedGroupIds", groupIds], ["preferredGroupIds", groupIds],
    ["programIds", [programId]], ["preferredProgramIds", [programId]],
  ] as [string, string[]][]) {
    (await collect("users", field, ids)).forEach((d, k) => staff.set(k, d));
  }
  staff.forEach(u => {
    const data = u.data();
    const update: Record<string, unknown> = {};
    for (const [field, ids] of [
      ["assignedGroupIds", groupIds], ["preferredGroupIds", groupIds],
      ["programIds", [programId]], ["preferredProgramIds", [programId]],
    ] as [string, string[]][]) {
      if (Array.isArray(data[field]) && data[field].some((x: string) => ids.includes(x))) {
        update[field] = without(data[field], ...ids);
      }
    }
    if (Object.keys(update).length) patch(u.ref, update);
  });

  // ── סדנאות התוכנית ושינויי המפגשים שלהן ──
  const workshops = await getDocs(query(collection(db, "workshops"), where("programId", "==", programId)));
  for (const w of workshops.docs) {
    const changes = await getDocs(query(collection(db, "session_changes"), where("workshopId", "==", w.id)));
    changes.docs.forEach(c => deletes.push(c.ref));
    deletes.push(w.ref);
  }

  // ── סגירות ──
  const closures = await getDocs(query(collection(db, "closures"), where("programIds", "array-contains", programId)));
  closures.docs.forEach(c => {
    const rest = without(c.data().programIds, programId);
    // רשימה ריקה פירושה "כל התוכניות" – לכן סגירה שהייתה רק לתוכנית הזו נמחקת ולא מתרחבת
    if (rest.length === 0) deletes.push(c.ref);
    else patch(c.ref, { programIds: rest });
  });

  // ── ביצוע במנות (מגבלת 500 פעולות לבאטץ') ──
  type Op = { kind: "delete"; ref: DocumentReference } | { kind: "update"; ref: DocumentReference; data: Record<string, unknown> };
  const ops: Op[] = [
    ...[...updates.values()].map(u => ({ kind: "update" as const, ref: u.ref, data: u.data })),
    ...deletes.map(ref => ({ kind: "delete" as const, ref })),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(op => (op.kind === "delete" ? batch.delete(op.ref) : batch.update(op.ref, op.data)));
    await batch.commit();
  }

  // התוכנית עצמה – אחרון
  const last = writeBatch(db);
  last.delete(doc(db, "programs", programId));
  await last.commit();
}
