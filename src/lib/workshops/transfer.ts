import { db } from "@/lib/firebase/config";
import { deleteField, doc, getDoc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { ParticipantTransfer, Session } from "./types";
import { withoutGuests } from "./transferCore";

export * from "./transferCore";

const stampOf = (userId?: string) => ({ updatedAt: serverTimestamp(), updatedBy: userId || null });

/** Puts the transferred participants on the target session (creating its change document when it has none yet). */
export async function addGuests(fromChangeId: string, t: ParticipantTransfer, userId?: string) {
  const ref = doc(db, "session_changes", t.toChangeId);
  const exists = (await getDoc(ref)).exists();
  // A session with no change yet has no document: create it with what the weekly query needs.
  const base = exists ? {} : { workshopId: t.toWorkshopId, slotId: t.toSlotId, originalDate: t.toOrigDate, dates: [t.toDate], published: false };
  await setDoc(ref, { ...base, guests: { [fromChangeId]: t.patientIds }, ...stampOf(userId) }, { merge: true });
}

/**
 * One-time move of a cancelled session's participants to a session of another workshop.
 * Returns an undo function that takes them back out of it.
 */
export async function transferParticipants(from: Session, to: Session, patientIds: string[], userId?: string): Promise<() => Promise<void>> {
  if (!from.changeId || !to.changeId) throw new Error("session has no change id");
  const t: ParticipantTransfer = {
    toChangeId: to.changeId, toWorkshopId: to.workshopId, toName: to.workshopName, toStart: to.start,
    toDate: to.date, toSlotId: to.slotId, toOrigDate: to.origDate, patientIds,
  };
  await addGuests(from.changeId, t, userId);
  await setDoc(doc(db, "session_changes", from.changeId), { transfer: t, ...stampOf(userId) }, { merge: true });
  const fromId = from.changeId;
  return () => cancelTransfer(fromId, t);
}

/** Takes transferred participants back out of the target session. `clearSource: false` when the caller rewrites the cancelled session's document itself. */
export async function cancelTransfer(fromChangeId: string, t: ParticipantTransfer, { clearSource = true } = {}) {
  const toRef = doc(db, "session_changes", t.toChangeId);
  const snap = await getDoc(toRef);
  const batch = writeBatch(db);
  if (snap.exists()) {
    const next = withoutGuests(snap.data(), fromChangeId);
    if (next) batch.set(toRef, next); else batch.delete(toRef);
  }
  if (clearSource) {
    const fromRef = doc(db, "session_changes", fromChangeId);
    if ((await getDoc(fromRef)).exists()) batch.update(fromRef, { transfer: deleteField() });
  }
  await batch.commit();
}
