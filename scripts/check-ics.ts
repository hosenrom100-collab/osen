import { buildIcs } from "../src/lib/workshops/ics";
import { Session } from "../src/lib/workshops/types";
const s = { id: "a1", workshopName: "סדנת, בישול; חדשה", date: "2026-10-05", start: "09:00", end: "10:30", locationId: "r", note: "שורה\nשנייה" } as unknown as Session;
const out = buildIcs("הלוז שלי", [s], () => "מטבח", "2026-10-13T08:00:00.000Z");
const ok = (n: string, c: boolean) => { console.log(`${c ? "ok  " : "FAIL"} ${n}`); if (!c) process.exitCode = 1; };
ok("has event with local times", out.includes("DTSTART:20261005T090000") && out.includes("DTEND:20261005T103000"));
ok("escapes commas, semicolons and newlines", out.includes("\\,") && out.includes("\;") && out.includes("\\n"));
ok("CRLF line endings, folded under 75 bytes", out.split("\r\n").every(l => new TextEncoder().encode(l).length <= 75));
ok("calendar wrapper", out.startsWith("BEGIN:VCALENDAR") && out.trimEnd().endsWith("END:VCALENDAR"));
