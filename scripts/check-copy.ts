import { planExceptionsCopy, planGroupCopy, planProgramCopy } from "../src/lib/workshops/copyPlan";
import { Session, Workshop } from "../src/lib/workshops/types";

let bad = 0;
const t = (name: string, ok: boolean) => { console.log(`${ok ? "ok  " : "FAIL"} ${name}`); if (!ok) bad++; };
const w = (o: Partial<Workshop>): Workshop => ({ id: "w1", name: "A", programId: "p", startDate: "2026-10-04", endDate: "2026-12-27", slots: [{ id: "s1", day: 1, start: "09:00", end: "10:00", anchorDate: "2026-10-04", every: 2 }], staffIds: ["u1"], participantIds: ["x"], status: "active", ...o });

// 2026-10-04 is a Sunday; new cycle starting Wed 2027-01-06 → week of 2027-01-03 → +91 days.
const [c] = planProgramCopy([w({})], "2027-01-06", { staff: true, participants: false });
t("program copy shifts start by whole weeks", c.startDate === "2027-01-03");
t("program copy shifts end", c.endDate === "2027-03-28");
t("program copy shifts anchor, keeps rhythm", c.slots[0].anchorDate === "2027-01-03" && c.slots[0].every === 2);
t("program copy new slot ids", c.slots[0].id !== "s1");
t("program copy staff yes / participants no", c.staffIds.length === 1 && c.participantIds.length === 0);
const [o] = planProgramCopy([w({ endDate: "9999-12-31" })], "2027-01-06", { staff: false, participants: false });
t("open end stays open", o.endDate === "9999-12-31" && o.staffIds.length === 0);

const gw = w({ groupIds: ["a"], slots: [{ id: "s1", day: 1, start: "09:00", end: "10:00", groupIds: ["a"] }, { id: "s2", day: 2, start: "11:00", end: "12:00", groupIds: ["a", "b"] }] });
const [p] = planGroupCopy([gw], "a", "b", 30);
t("group copy adds one slot for b, shifted", p.slots.length === 3 && p.slots[2].start === "09:30" && p.slots[2].groupIds?.[0] === "b");
t("group copy adds b to the workshop groups", p.groupIds.includes("b"));
t("group copy again is a no-op for identical times", planGroupCopy([{ ...gw, slots: p.slots, groupIds: p.groupIds }], "a", "b", 30).length === 0);

const s = { id: "x", workshopId: "w1", workshopName: "A", date: "2026-10-05", start: "09:00", end: "10:00", staffIds: ["u1"], kind: "extra", activity: "workshop" } as unknown as Session;
const reg = { ...s, id: "y", kind: "normal", change: undefined } as unknown as Session;
const r = planExceptionsCopy([s, reg], ["2026-10-05"], 7);
t("exceptions copy: only the one-off, a week later", r.length === 1 && r[0].newDate === "2026-10-12" && r[0].dates[0] === "2026-10-12");

console.log(bad ? `${bad} FAILED` : "ALL OK");
process.exit(bad ? 1 : 0);
