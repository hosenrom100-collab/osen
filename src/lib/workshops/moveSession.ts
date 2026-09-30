import { db } from "@/lib/firebase/config";
import { deleteDoc, deleteField, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Session } from "./types";

export interface MoveTo { date: string; start: string; end: string }

// Fields that keep a change document alive even when the time is back to the original.
const OTHER = ["staffIds", "locationId", "note", "kind", "cancelled"];

/**
 * Saves a new date/time for one session as an exception on top of the standing schedule.
 * Returns an undo function that puts the change document back exactly as it was.
 */
export async function moveSession(s: Session, to: MoveTo, userId?: string): Promise<() => Promise<void>> {
  if (!s.changeId) throw new Error("session has no change id");
  const ref = doc(db, "session_changes", s.changeId);
  const prev = s.change ? (({ id: _id, ...rest }) => rest)(s.change) : null;

  if (s.slotId === null) {
    // One-off session: the change document is the session itself.
    await setDoc(ref, { newDate: to.date, newStart: to.start, newEnd: to.end, dates: [to.date], published: false, updatedAt: serverTimestamp(), updatedBy: userId || null }, { merge: true });
  } else {
    const differs = to.date !== s.origDate || to.start !== s.base.start || to.end !== s.base.end;
    const keep = !!prev && OTHER.some(k => k in prev);
    if (!differs && !keep) {
      await deleteDoc(ref).catch(() => {});
    } else {
      await setDoc(ref, {
        workshopId: s.workshopId, slotId: s.slotId, originalDate: s.origDate,
        newDate: to.date !== s.origDate ? to.date : deleteField(),
        newStart: to.start !== s.base.start ? to.start : deleteField(),
        newEnd: to.end !== s.base.end ? to.end : deleteField(),
        dates: [s.origDate, ...(to.date !== s.origDate ? [to.date] : [])].filter(Boolean),
        published: false, updatedAt: serverTimestamp(), updatedBy: userId || null,
      }, { merge: true });
    }
  }
  return async () => { if (prev) await setDoc(ref, prev); else await deleteDoc(ref).catch(() => {}); };
}
