import { Session } from "./types";

/** An iCalendar (.ics) feed of sessions, for Google / Apple calendar subscriptions. Times are local ("floating"), as shown in the app. */

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
/** Lines longer than 75 bytes are folded, as the format requires. */
function fold(line: string): string {
  const enc = new TextEncoder(), out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(calName: string, sessions: Session[], roomOf: (id?: string) => string | undefined, nowIso: string): string {
  const now = nowIso.replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Osen//Schedule//HE", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(calName)}`, "X-WR-TIMEZONE:Asia/Jerusalem", "REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
  for (const s of sessions) {
    const room = roomOf(s.locationId);
    lines.push(
      "BEGIN:VEVENT", `UID:${s.id}@osen`, `DTSTAMP:${now}`,
      `DTSTART:${stamp(s.date, s.start)}`, `DTEND:${stamp(s.date, s.end)}`,
      `SUMMARY:${esc(s.workshopName)}`,
      ...(room ? [`LOCATION:${esc(room)}`] : []),
      ...(s.note ? [`DESCRIPTION:${esc(s.note)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
