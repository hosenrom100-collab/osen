import { Closure, Program, Session, SessionChange, Workshop } from "./types";
import { dayOf } from "./dates";
import { ActivityType, DEFAULT_TYPES, typeById } from "./activityTypes";

/** Groups a weekly meeting is for: its own list, otherwise the workshop's. */
export const slotGroups = (w: Workshop, slot: { groupIds?: string[] }) =>
  slot.groupIds?.length ? slot.groupIds : w.groupIds || [];

export const changeIdFor = (workshopId: string, date: string, slotId: string) =>
  `${workshopId}_${date}_${slotId}`;

/**
 * Turns the standing schedule (workshops + slots) plus exceptions (changes, closures)
 * into the concrete sessions for the given dates. Pure — no I/O.
 */
export function buildSessions(
  dates: string[],
  workshops: Workshop[],
  programs: Program[],
  changes: SessionChange[],
  closures: Closure[],
  types: ActivityType[] = DEFAULT_TYPES
): Session[] {
  const dateSet = new Set(dates);
  const progById = new Map(programs.map(p => [p.id, p]));
  const wById = new Map(workshops.map(w => [w.id, w]));
  const changeById = new Map(changes.map(c => [c.id, c]));
  const out: Session[] = [];

  const isClosed = (programId: string, date: string) =>
    closures.some(c => c.date === date && (c.programIds.length === 0 || c.programIds.includes(programId)));

  const make = (
    w: Workshop, date: string, slotId: string | null, origDate: string | null,
    base: Session["base"], kind: Session["kind"], change?: SessionChange, changeId: string | null = null
  ): Session => ({
    id: `${changeId ?? w.id}_${date}_${kind}`,
    changeId,
    workshopId: w.id,
    workshopName: w.name,
    programId: w.programId,
    groupIds: base.groupIds ?? w.groupIds ?? [],
    slotId,
    origDate,
    date,
    start: change?.newStart ?? base.start,
    end: change?.newEnd ?? base.end,
    locationId: change?.locationId ?? base.locationId,
    staffIds: change?.staffIds ?? base.staffIds,
    kind,
    activity: change?.kind || w.kind || "workshop",
    band: typeById(types, change?.kind || w.kind).band,
    hasParticipants: typeById(types, change?.kind || w.kind).hasParticipants,
    change,
    note: change?.note,
    base,
  });

  const runsOn = (w: Workshop, date: string) =>
    w.status === "active" && date >= w.startDate && date <= w.endDate;

  // 1. Regular sessions on each visible date.
  for (const date of dates) {
    const day = dayOf(date);
    for (const w of workshops) {
      if (!runsOn(w, date)) continue;
      const prog = progById.get(w.programId);
      if (prog && !prog.activeDays.includes(day)) continue;
      if (isClosed(w.programId, date)) continue;
      for (const slot of w.slots) {
        if (slot.day !== day) continue;
        const base = { start: slot.start, end: slot.end, staffIds: w.staffIds, locationId: slot.locationId, groupIds: slotGroups(w, slot) };
        const id = changeIdFor(w.id, date, slot.id);
        const ch = changeById.get(id);
        if (!ch) { out.push(make(w, date, slot.id, date, base, "normal", undefined, id)); continue; }
        if (ch.cancelled) { out.push(make(w, date, slot.id, date, base, "cancelled", ch, id)); continue; }
        if (ch.newDate && ch.newDate !== date) { out.push(make(w, date, slot.id, date, base, "moved-away", ch, id)); continue; }
        out.push(make(w, date, slot.id, date, base, "normal", ch, id));
      }
    }
  }

  // 2. Sessions that were moved INTO a visible date, and one-off extra sessions.
  for (const ch of changes) {
    const w = wById.get(ch.workshopId);
    if (!w || w.status !== "active") continue;
    if (ch.slotId === null) {
      const date = ch.newDate;
      if (!date || !dateSet.has(date)) continue;
      const base = { start: ch.newStart ?? "", end: ch.newEnd ?? "", staffIds: w.staffIds, locationId: undefined };
      out.push(make(w, date, null, null, base, "extra", ch, ch.id));
      continue;
    }
    if (ch.cancelled || !ch.newDate || ch.newDate === ch.originalDate || !dateSet.has(ch.newDate)) continue;
    const slot = w.slots.find(s => s.id === ch.slotId);
    if (!slot) continue;
    const base = { start: slot.start, end: slot.end, staffIds: w.staffIds, locationId: slot.locationId, groupIds: slotGroups(w, slot) };
    out.push(make(w, ch.newDate, slot.id, ch.originalDate, base, "moved-in", ch, ch.id));
  }

  // 3. Each program's fixed daily blocks (meals, breaks, transport), on its active days.
  for (const date of dates) {
    const day = dayOf(date);
    for (const prog of programs) {
      if (!prog.activeDays.includes(day) || isClosed(prog.id, date)) continue;
      for (const b of prog.dailyBlocks || []) {
        if (b.days?.length && !b.days.includes(day)) continue;
        out.push({
          id: `block_${prog.id}_${b.id}_${date}`, changeId: null, workshopId: `block:${b.id}`, workshopName: b.label,
          programId: prog.id, groupIds: b.groupIds || [], slotId: null, origDate: date, date,
          start: b.start, end: b.end, staffIds: [], kind: "normal", activity: b.kind, band: typeById(types, b.kind).band, hasParticipants: false, fixedBlock: true,
          base: { start: b.start, end: b.end, staffIds: [], groupIds: b.groupIds || [] },
        });
      }
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

/** Sessions that actually take place (not cancelled / moved away). */
export const isLive = (s: Session) => s.kind !== "cancelled" && s.kind !== "moved-away";
