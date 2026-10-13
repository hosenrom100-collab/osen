// Layout checks for parallel sessions. Run: npx tsx scripts/check-lanes.ts
import { laneByFrame, laneByGroup, laneStable } from "../src/lib/workshops/lanes";
const m = (id: string, st: string, en: string, groupIds: string[] = [], audience = "participants") => ({ id, workshopId: id, start: st, end: en, groupIds, audience } as any);
const show = (r: any) => `${r.lanes} tracks | ` + r.placed.map((p: any) => `${p.s.id}:${p.lane}+${p.span}`).join(" ");
let ok = true; const check = (name: string, got: string, want: string) => { const pass = got === want; ok &&= pass; console.log(pass ? "ok  " : "FAIL", name, got, pass ? "" : `(want ${want})`); };
// Two groups, different times, no joint: each in own lane, full lane.
check("groups apart", show(laneByGroup([m("a","09:00","10:00",["A"]), m("b","09:30","11:00",["B"])], ["A","B"], x => x)), "2 tracks | a:0+1 b:1+1");
// Joint spans both lanes.
check("joint", show(laneByGroup([m("j","08:00","09:00"), m("a","09:00","10:00",["A"])], ["A","B"], x => x)), "2 tracks | j:0+2 a:0+1");
// Joint overlapping group A (lane 0): joint takes the left half of lane 0 + lane 1; a takes right half of lane 0.
check("joint vs A", show(laneByGroup([m("j","09:00","10:00"), m("a","09:00","10:00",["A"])], ["A","B"], x => x)), "4 tracks | j:1+3 a:0+1");
// Joint overlapping group B (lane 1): joint takes lane 0 + right half of lane 1.
check("joint vs B", show(laneByGroup([m("j","09:00","10:00"), m("b","09:00","10:00",["B"])], ["A","B"], x => x)), "4 tracks | j:0+3 b:3+1");
// Two sessions in the same group lane at once: equal halves of that lane.
check("same lane", show(laneByGroup([m("a","09:00","10:00",["A"]), m("c","09:00","10:00",["A"])], ["A","B"], x => x)), "4 tracks | a:0+1 c:1+1");
// Single group: staff event beside participants: 2/3 and 1/3, staff on the left.
check("staff side", show(laneStable([m("w","09:00","10:00"), m("t","09:00","10:00",[],"staff")], new Map())), "3 tracks | w:0+2 t:2+1");
// Two in parallel and three in parallel on the same day: halves and thirds.
check("halves+thirds", show(laneStable([m("a","09:00","10:00"), m("b","09:00","10:00"), m("x","11:00","12:00"), m("y","11:00","12:00"), m("z","11:00","12:00")], new Map())), "6 tracks | a:0+3 b:3+3 x:0+2 y:2+2 z:4+2");
// Two programs side by side: P1 has groups A and B (lanes 0,1), P2 has one lane (2). A whole-P1 session spans only P1's lanes.
const prog = (s: any) => ({ p1: s.id.startsWith("p1"), a: s.groupIds.includes("A"), b: s.groupIds.includes("B") });
const frameOf = (s: any) => { const k = prog(s); if (!k.p1) return [2]; return k.a ? [0] : k.b ? [1] : [0, 1]; };
check("two programs: joint stays inside its program", show(laneByFrame([m("p1j","09:00","10:00"), m("p2x","09:00","10:00")], ["A","B","P2"], frameOf)), "3 tracks | p1j:0+2 p2x:2+1");
check("two programs: groups keep their lanes", show(laneByFrame([m("p1a","09:00","10:00",["A"]), m("p1b","09:00","10:00",["B"]), m("p2x","09:00","10:00")], ["A","B","P2"], frameOf)), "3 tracks | p1a:0+1 p1b:1+1 p2x:2+1");
console.log(ok ? "ALL OK" : "SOME FAILED");
