import { addDays, parseISO } from "date-fns";
import { SessionChange, Slot, Workshop } from "./types";
import { toISO } from "./dates";

/** Pure planning for "from this session onwards": the workshop is cut in two at the session's date. */

const changeIdFor = (workshopId: string, date: string, slotId: string) => `${workshopId}_${date}_${slotId}`;
const dayBefore = (iso: string) => toISO(addDays(parseISO(iso), -1));

export interface SlotEdit { day: number; start: string; end: string; locationId: string; staffIds: string[] }

export interface SplitPlan {
  /** The session is the first one of the workshop: no split, the slot is simply edited. */
  inPlace: boolean;
  /** Workshop: new end date (day before the split), or null when in place. */
  oldEndDate: string | null;
  /** In place: the edited slot list and staff. */
  inPlaceSlots: Slot[];
  /** Split: the continuation workshop (without id), starting on the session's date. */
  continuation: Omit<Workshop, "id"> | null;
  /** Split: change documents of the later sessions, to be re-created under the continuation (`newId` is theirs) and the old ones deleted. */
  moves: { oldId: string; newId: string; data: Omit<SessionChange, "id"> }[];
}

/**
 * `origDate` is the date the standing schedule puts the session on (not where it may have been moved to).
 * Changes dated on or after it move to the continuation, except the edited session's own change (its content is now the slot).
 */
export function planSplit(w: Workshop, slotId: string, origDate: string, edit: SlotEdit, changes: SessionChange[]): SplitPlan {
  const editSlot = (s: Slot): Slot => (s.id === slotId ? { ...s, day: edit.day, start: edit.start, end: edit.end, locationId: edit.locationId || undefined } as Slot : s);
  // A slot repeating every N weeks counts weeks from its anchor; keep the rhythm when the start date moves.
  const anchored = (s: Slot): Slot => ((s.every || 1) > 1 && !s.anchorDate ? { ...s, anchorDate: w.startDate } : s);
  const clean = (s: Slot): Slot => { const o = { ...s }; if (!o.locationId) delete o.locationId; return o; };

  if (origDate <= w.startDate) {
    return { inPlace: true, oldEndDate: null, inPlaceSlots: w.slots.map(editSlot).map(clean), continuation: null, moves: [] };
  }
  const { id: _id, ...rest } = w; void _id;
  const sameStaff = [...edit.staffIds].sort().join() === [...w.staffIds].sort().join();
  const continuation: Omit<Workshop, "id"> = {
    ...rest,
    startDate: origDate,
    slots: w.slots.map(anchored).map(editSlot).map(clean),
    staffIds: sameStaff ? w.staffIds : edit.staffIds,
    laneHint: w.laneHint,
    status: w.status,
  };
  if (continuation.laneHint === undefined) delete continuation.laneHint;
  const moves: SplitPlan["moves"] = [];
  const own = changeIdFor(w.id, origDate, slotId);
  for (const c of changes) {
    if (c.workshopId !== w.id || c.id === own) continue;
    const date = c.slotId === null ? c.newDate : c.originalDate;
    if (!date || date < origDate) continue;
    const { id: oldId, ...data } = c; void oldId;
    moves.push({ oldId: c.id, newId: c.slotId === null ? c.id : changeIdFor("__NEW__", c.originalDate!, c.slotId), data: { ...data, workshopId: "__NEW__" } });
  }
  return { inPlace: false, oldEndDate: dayBefore(origDate), inPlaceSlots: [], continuation, moves };
}

/** Fill in the continuation's real id in the planned moves. */
export function bindMoves(plan: SplitPlan, newWorkshopId: string) {
  return plan.moves.map(m => ({
    oldId: m.oldId,
    newId: m.newId.replace("__NEW__", newWorkshopId),
    data: { ...m.data, workshopId: newWorkshopId },
  }));
}
