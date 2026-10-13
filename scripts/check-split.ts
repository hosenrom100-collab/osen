import { bindMoves, planSplit } from "../src/lib/workshops/splitSeries";
import { SessionChange, Workshop } from "../src/lib/workshops/types";

let bad = 0;
const t = (n: string, ok: boolean) => { console.log(`${ok ? "ok  " : "FAIL"} ${n}`); if (!ok) bad++; };
const w: Workshop = { id: "w1", name: "A", programId: "p", startDate: "2026-10-04", endDate: "2026-12-27", status: "active", staffIds: ["u1"], participantIds: ["x"],
  slots: [{ id: "s1", day: 1, start: "09:00", end: "10:00" }, { id: "s2", day: 3, start: "11:00", end: "12:00", every: 2 }] };
const edit = { day: 1, start: "10:00", end: "11:00", locationId: "r1", staffIds: ["u1"] };
const ch = (o: Partial<SessionChange>): SessionChange => ({ id: "c", workshopId: "w1", slotId: "s2", originalDate: "2026-11-11", dates: [], published: false, ...o });

const p = planSplit(w, "s1", "2026-11-09", edit, [
  ch({ id: "w1_2026-11-11_s2", slotId: "s2", originalDate: "2026-11-11", cancelled: true }),
  ch({ id: "w1_2026-10-14_s2", originalDate: "2026-10-14", cancelled: true }),
  ch({ id: "w1_2026-11-09_s1", slotId: "s1", originalDate: "2026-11-09", newStart: "10:00" }),
  ch({ id: "extra1", slotId: null, originalDate: null, newDate: "2026-11-20" }),
  ch({ id: "extra0", slotId: null, originalDate: null, newDate: "2026-10-20" }),
]);
t("split: not in place, old workshop ends the day before", !p.inPlace && p.oldEndDate === "2026-11-08");
t("split: continuation starts on the session date, same end", p.continuation!.startDate === "2026-11-09" && p.continuation!.endDate === "2026-12-27");
t("split: only the edited slot changed", p.continuation!.slots[0].start === "10:00" && p.continuation!.slots[0].locationId === "r1" && p.continuation!.slots[1].start === "11:00");
t("split: 2-week rhythm pinned to the old start", p.continuation!.slots[1].anchorDate === "2026-10-04");
t("split: later changes move, earlier stay, own change dropped", p.moves.length === 2 && p.moves.some(m => m.oldId === "w1_2026-11-11_s2") && p.moves.some(m => m.oldId === "extra1"));
const b = bindMoves(p, "w2");
t("split: moved change ids follow the new workshop", b.find(m => m.oldId === "w1_2026-11-11_s2")!.newId === "w2_2026-11-11_s2" && b.every(m => m.data.workshopId === "w2"));
const f = planSplit(w, "s1", "2026-10-04", edit, []);
t("first session: edited in place", f.inPlace && f.inPlaceSlots[0].start === "10:00" && f.continuation === null);
console.log(bad ? `${bad} FAILED` : "ALL OK"); process.exit(bad ? 1 : 0);
