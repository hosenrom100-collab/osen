import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { Session, Slot, Workshop } from "./types";
import { addMinutes, isOpenEnd, isOpenStart, toISO, weekStartOf } from "./dates";

/** Pure planning for "copy the schedule": what to write, decided here; the dialog only writes it. */

/** Groups a weekly meeting is for: its own list, otherwise the workshop's (same rule as buildWeek; not imported to keep this file free of Firebase). */
const slotGroups = (w: Workshop, slot: { groupIds?: string[] }) => (slot.groupIds?.length ? slot.groupIds : w.groupIds || []);
const shiftDate = (iso: string, days: number) => toISO(addDays(parseISO(iso), days));
const newId = () => Math.random().toString(36).slice(2, 9);

/** Whole weeks between the week of `from` and the week of `to` (so weekdays are kept), in days. */
export function weeksBetween(from: string, to: string): number {
  return differenceInCalendarDays(weekStartOf(parseISO(to)), weekStartOf(parseISO(from)));
}

export type NewWorkshop = Omit<Workshop, "id">;

/**
 * A new cycle: copies of the chosen workshops, moved to start in the week of `newStart`.
 * Every date moves by the same whole number of weeks (the earliest start is the anchor), so weekdays and
 * "every N weeks" rhythms are kept. Staff and participants are copied only when asked.
 */
export function planProgramCopy(list: Workshop[], newStart: string, o: { staff: boolean; participants: boolean }): NewWorkshop[] {
  const starts = list.map(w => w.startDate).filter(d => !isOpenStart(d)).sort();
  if (!starts.length) return [];
  const delta = weeksBetween(starts[0], newStart);
  return list.map(w => {
    const { id: _id, ...rest } = w;
    void _id;
    return {
      ...rest,
      startDate: isOpenStart(w.startDate) ? w.startDate : shiftDate(w.startDate, delta),
      endDate: isOpenEnd(w.endDate) ? w.endDate : shiftDate(w.endDate, delta),
      slots: w.slots.map(s => ({ ...s, id: newId(), ...(s.anchorDate ? { anchorDate: shiftDate(s.anchorDate, delta) } : {}) })),
      staffIds: o.staff ? w.staffIds : [],
      participantIds: o.participants ? w.participantIds : [],
      status: "active" as const,
    };
  });
}

export interface WorkshopPatch { id: string; groupIds: string[]; slots: Slot[] }

/**
 * Gives group `to` the same weekly meetings as group `from` (optionally `shiftMin` minutes later/earlier).
 * Only meetings that belong to `from` alone are copied; meetings `to` already has at that time are skipped.
 */
export function planGroupCopy(list: Workshop[], from: string, to: string, shiftMin: number): WorkshopPatch[] {
  const out: WorkshopPatch[] = [];
  for (const w of list) {
    const mine = w.slots.filter(s => { const g = slotGroups(w, s); return g.length === 1 && g[0] === from; });
    const fresh: Slot[] = mine
      .map(s => ({ ...s, id: newId(), groupIds: [to], start: addMinutes(s.start, shiftMin), end: addMinutes(s.end, shiftMin) }))
      .filter(c => !w.slots.some(s => s.day === c.day && s.start === c.start && s.end === c.end && slotGroups(w, s).includes(to)));
    if (!fresh.length) continue;
    const base = w.groupIds || [];
    // A workshop for the whole program (no group list) stays that way.
    out.push({ id: w.id, groupIds: base.length && !base.includes(to) ? [...base, to] : base, slots: [...w.slots, ...fresh] });
  }
  return out;
}

export interface NewExtra {
  workshopId: string; slotId: null; originalDate: null; newDate: string; newStart: string; newEnd: string;
  staffIds: string[]; locationId: string; note: string; kind: string; title: string; dates: string[]; published: false;
}

/**
 * One-off sessions to create for the exceptions of some days (extra, moved-in or changed sessions) at `offsetDays` later.
 * Regular unchanged meetings are not copied: they come back by themselves every week.
 */
export function planExceptionsCopy(sessions: Session[], dates: string[], offsetDays: number): NewExtra[] {
  const set = new Set(dates);
  return sessions
    .filter(s => set.has(s.date) && !s.fixedBlock && s.kind !== "cancelled" && s.kind !== "moved-away" && (s.kind === "extra" || s.kind === "moved-in" || !!s.change))
    .map(s => {
      const date = shiftDate(s.date, offsetDays);
      return {
        workshopId: s.workshopId, slotId: null, originalDate: null, newDate: date, newStart: s.start, newEnd: s.end,
        staffIds: s.staffIds, locationId: s.locationId || "", note: s.note || "", kind: s.activity, title: s.workshopName, dates: [date], published: false as const,
      };
    });
}
