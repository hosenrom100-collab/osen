import { Session } from "./types";

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export interface Placed { s: Session; lane: number; span: number; side?: number }
/** `lanes`: grid tracks of the column; `minLanes`: how many cards stand side by side at most (sizes the column's minimum width). */
export interface DayLanes { lanes: number; minLanes?: number; laneLabels?: string[]; placed: Placed[] }

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

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Parallel sessions side by side, always in equal widths. Sessions that run into each other form a block; a block with
 * k sessions side by side gives each 1/k of the column, and a lone session takes the whole column. Different blocks of the
 * day may have different k, so the column is divided into the least common multiple of them and each block's cards span
 * an equal share. A workshop keeps the side it had earlier in the week (`pref`).
 */
export function laneStable(day: Session[], pref: Map<string, number>): DayLanes {
  const sorted = [...day].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  // Blocks of sessions that chain-overlap.
  const blocks: Session[][] = [];
  let blockEnd = "";
  for (const s of sorted) {
    if (blocks.length && s.start < blockEnd) { blocks[blocks.length - 1].push(s); if (s.end > blockEnd) blockEnd = s.end; }
    else { blocks.push([s]); blockEnd = s.end; }
  }

  // Sides inside each block: as many as the block's widest overlap, preferring each workshop's remembered side.
  const sided = blocks.map(block => {
    let width = 1;
    for (const s of block) width = Math.max(width, block.filter(o => overlap(o, s)).length);
    const taken: Session[][] = Array.from({ length: width }, () => []);
    const free = (lane: number, s: Session) => !taken[lane].some(o => overlap(o, s));
    const side = new Map<string, number>();
    for (const s of block) {
      const want = pref.get(s.workshopId);
      let lane = want !== undefined && want < width && free(want, s) ? want : -1;
      if (lane < 0) lane = taken.findIndex((_, i) => free(i, s));
      if (lane < 0) lane = 0;
      taken[lane].push(s);
      side.set(s.id, lane);
      if (pref.get(s.workshopId) === undefined) pref.set(s.workshopId, lane);
    }
    return { block, width, side };
  });

  const widths = sided.map(x => x.width);
  let total = widths.reduce((l, w) => (l * w) / gcd(l, w), 1);
  if (total > 12) total = Math.max(...widths); // too many different splits: fall back to the widest block's lanes
  const placed: Placed[] = sided.flatMap(({ block, width, side }) => {
    const unit = total % width === 0 ? total / width : 1;
    const span = total % width === 0 ? unit : 1;
    return block.map(s => { const i = side.get(s.id)!; return { s, lane: i * unit, span, side: i }; });
  });
  return { lanes: total, minLanes: Math.max(...widths), placed };
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
