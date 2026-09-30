import { Session } from "./types";

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export interface Placed { s: Session; lane: number; span: number }
export interface DayLanes { lanes: number; laneLabels?: string[]; placed: Placed[] }

const overlap = (a: Session, b: Session) => a.start < b.end && b.start < a.end;

/** Do sessions of different groups of this program ever run at the same time? */
export function groupsRunInParallel(list: Session[]): boolean {
  return list.some((a, i) => list.slice(i + 1).some(b =>
    a.date === b.date && overlap(a, b) && a.groupIds.length > 0 && b.groupIds.length > 0 && !a.groupIds.some(g => b.groupIds.includes(g))));
}

/**
 * One lane per group, fixed for the whole day: a session of group A is always in A's lane.
 * Whole-program sessions span every lane; a session of several groups spans from the first to the last.
 */
export function laneByGroup(day: Session[], groupIds: string[], groupName: (id: string) => string): DayLanes {
  const n = Math.max(groupIds.length, 1);
  const placed = day.map(s => {
    const idx = s.groupIds.map(g => groupIds.indexOf(g)).filter(i => i >= 0);
    if (!idx.length) return { s, lane: 0, span: n };
    const lo = Math.min(...idx), hi = Math.max(...idx);
    return { s, lane: lo, span: hi - lo + 1 };
  });
  return { lanes: n, laneLabels: groupIds.map(groupName), placed };
}

/**
 * Parallel sessions side by side with stable sides: the lane count is the day's widest overlap, a workshop keeps the
 * lane it had earlier in the week (`pref`), and a session with free lanes next to it stretches over them.
 */
export function laneStable(day: Session[], pref: Map<string, number>): DayLanes {
  const sorted = [...day].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const laneOf = new Map<string, number>();
  const taken: Session[][] = []; // sessions per lane
  const free = (lane: number, s: Session) => !(taken[lane] || []).some(o => overlap(o, s));

  // Lanes needed = widest overlap of the day.
  let width = 1;
  for (const s of sorted) width = Math.max(width, sorted.filter(o => overlap(o, s)).length);
  for (let i = 0; i < width; i++) taken.push([]);

  for (const s of sorted) {
    const want = pref.get(s.workshopId);
    let lane = want !== undefined && want < width && free(want, s) ? want : -1;
    if (lane < 0) lane = taken.findIndex((_, i) => free(i, s));
    if (lane < 0) lane = 0;
    taken[lane].push(s);
    laneOf.set(s.id, lane);
    if (pref.get(s.workshopId) === undefined) pref.set(s.workshopId, lane);
  }
  const placed = sorted.map(s => {
    const lane = laneOf.get(s.id)!;
    let span = 1;
    while (lane + span < width && free(lane + span, s)) span++;
    return { s, lane, span };
  });
  return { lanes: width, placed };
}

/**
 * Time rows shared by every column: the sorted distinct start/end times. Row i runs from times[i] to times[i+1].
 * `covered[i]` is false for stretches with no activity anywhere (drawn as a thin separator).
 */
export function timeRows(all: Session[]) {
  const set = new Set<number>();
  all.forEach(s => { set.add(mins(s.start)); set.add(mins(s.end)); });
  const times = [...set].sort((a, b) => a - b);
  const covered = times.slice(0, -1).map((t, i) => all.some(s => mins(s.start) <= t && mins(s.end) >= times[i + 1]));
  const rowOf = (t: string) => times.indexOf(mins(t));
  return { times, covered, rowOf };
}
