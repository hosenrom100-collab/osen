import { Session } from "./types";

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export interface Placed { s: Session; lane: number; span: number; side?: number }
/** `lanes`: grid tracks of the column; `minLanes`: how many cards stand side by side at most (sizes the column's minimum width). */
export interface DayLanes { lanes: number; minLanes?: number; unit?: number; laneLabels?: string[]; placed: Placed[] }

const overlap = (a: Session, b: Session) => a.start < b.end && b.start < a.end;

/** Do sessions of different groups of this program ever run at the same time? */
export function groupsRunInParallel(list: Session[]): boolean {
  return list.some((a, i) => list.slice(i + 1).some(b =>
    a.date === b.date && overlap(a, b) && a.groupIds.length > 0 && b.groupIds.length > 0 && !a.groupIds.some(g => b.groupIds.includes(g))));
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (list: number[]) => list.reduce((l, w) => (l * w) / gcd(l, w), 1);
/** Tracks a column is cut into so every share is whole; too many different splits fall back to the widest. */
const tracksFor = (units: number[]) => { const l = lcm(units); return l <= 12 ? l : Math.max(...units); };

/** Chains of sessions that run into each other. */
function overlapBlocks(list: Session[]): Session[][] {
  const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const blocks: Session[][] = [];
  let blockEnd = "";
  for (const s of sorted) {
    if (blocks.length && s.start < blockEnd) { blocks[blocks.length - 1].push(s); if (s.end > blockEnd) blockEnd = s.end; }
    else { blocks.push([s]); blockEnd = s.end; }
  }
  return blocks;
}

/** Greedy sides for a block, honouring a wanted side when it is free. Returns side per session and the number of sides. */
function sides(block: Session[], want: (s: Session) => number | undefined): { side: Map<string, number>; width: number } {
  let width = 1;
  for (const s of block) width = Math.max(width, block.filter(o => overlap(o, s)).length);
  const taken: Session[][] = Array.from({ length: width }, () => []);
  const side = new Map<string, number>();
  for (const s of block) {
    const free = (i: number) => !taken[i].some(o => overlap(o, s));
    const w = want(s);
    let i = w !== undefined && w < taken.length && free(w) ? w : taken.findIndex((_, j) => free(j));
    if (i < 0) { taken.push([]); i = taken.length - 1; }
    taken[i].push(s);
    side.set(s.id, i);
  }
  return { side, width: taken.length };
}

/**
 * One fixed lane per group, the same on every day, so each group is always in its place.
 * A session of one group stays in its lane; a joint session (several groups, or the whole program) spans their lanes.
 * Two things at the same time in one lane share it equally; a joint session that runs into a group's own session
 * keeps the side that touches its other lanes, so it still reads as one card.
 */
export function laneByGroup(day: Session[], groupIds: string[], groupName: (id: string) => string): DayLanes {
  const n = Math.max(groupIds.length, 1);
  const range = new Map<string, [number, number]>();
  for (const s of day) {
    const idx = s.groupIds.map(g => groupIds.indexOf(g)).filter(i => i >= 0);
    range.set(s.id, idx.length ? [Math.min(...idx), Math.max(...idx)] : [0, n - 1]);
  }
  const joint = (s: Session) => { const [lo, hi] = range.get(s.id)!; return hi > lo; };

  // Per lane: which share of it each session gets.
  const share = new Map<string, { side: number; width: number }>(); // key: sessionId|lane
  const widths: number[] = [];
  for (let g = 0; g < n; g++) {
    const inLane = day.filter(s => { const [lo, hi] = range.get(s.id)!; return lo <= g && g <= hi; });
    for (const block of overlapBlocks(inLane)) {
      // Joint sessions first, at the side facing their other lanes.
      const ordered = [...block.filter(joint), ...block.filter(s => !joint(s))];
      const width0 = Math.max(1, ...block.map(s => block.filter(o => overlap(o, s)).length));
      const { side, width } = sides(ordered, s => {
        if (!joint(s) || width0 === 1) return undefined;
        const [lo] = range.get(s.id)!;
        return g === lo ? width0 - 1 : 0;
      });
      widths.push(width);
      block.forEach(s => share.set(`${s.id}|${g}`, { side: side.get(s.id)!, width }));
    }
  }
  const U = tracksFor(widths.length ? widths : [1]);
  const part = (id: string, g: number): [number, number] => {
    const { side, width } = share.get(`${id}|${g}`)!;
    const unit = U % width === 0 ? U / width : 1;
    return [g * U + side * unit, g * U + (side + 1) * unit];
  };
  const placed: Placed[] = day.map(s => {
    const [lo, hi] = range.get(s.id)!;
    const [from, firstEnd] = part(s.id, lo);
    let to = firstEnd;
    for (let g = lo + 1; g <= hi; g++) { const [a, b] = part(s.id, g); if (a !== to) break; to = b; } // stop where it would not be one piece
    return { s, lane: from, span: to - from };
  });
  return { lanes: n * U, minLanes: n, unit: U, laneLabels: groupIds.map(groupName), placed };
}

/**
 * Parallel sessions with no group lanes (one group, or all programs), always in equal widths. Sessions that run into
 * each other form a block; k sessions side by side get 1/k each and a lone session takes the whole column.
 * Staff-only events that run alongside participants' activities go to the left and narrower (half a share),
 * so the participants' day reads first. A workshop keeps the side it had earlier in the week (`pref`).
 */
export function laneStable(day: Session[], pref: Map<string, number>): DayLanes {
  const isStaff = (s: Session) => s.audience === "staff";
  const laid = overlapBlocks(day).map(block => {
    const remember = (s: Session, i: number) => { if (pref.get(s.workshopId) === undefined) pref.set(s.workshopId, i); };
    const people = block.filter(s => !isStaff(s)), staff = block.filter(isStaff);
    if (people.length && staff.length) {
      const a = sides(people, s => pref.get(s.workshopId)), b = sides(staff, () => undefined);
      people.forEach(s => remember(s, a.side.get(s.id)!));
      const units = 2 * a.width + b.width;
      const cells = [
        ...people.map(s => ({ s, at: 2 * a.side.get(s.id)!, span: 2, side: a.side.get(s.id)! })),
        ...staff.map(s => ({ s, at: 2 * a.width + b.side.get(s.id)!, span: 1, side: a.width + b.side.get(s.id)! })),
      ];
      return { units, cards: a.width + b.width, cells };
    }
    const { side, width } = sides(block, s => pref.get(s.workshopId));
    block.forEach(s => remember(s, side.get(s.id)!));
    return { units: width, cards: width, cells: block.map(s => ({ s, at: side.get(s.id)!, span: 1, side: side.get(s.id)! })) };
  });
  const total = tracksFor(laid.length ? laid.map(x => x.units) : [1]);
  const placed: Placed[] = laid.flatMap(({ units, cells }) => {
    const k = total % units === 0 ? total / units : 1;
    return cells.map(c => ({ s: c.s, lane: c.at * k, span: c.span * k, side: c.side }));
  });
  return { lanes: total, minLanes: Math.max(1, ...laid.map(x => x.cards)), placed };
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
