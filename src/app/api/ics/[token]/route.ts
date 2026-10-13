import { adminDb } from "@/lib/firebase/admin";
import { buildSessions } from "@/lib/workshops/buildWeek";
import { buildIcs } from "@/lib/workshops/ics";
import { rangeDates, toISO } from "@/lib/workshops/dates";
import { Closure, Program, SessionChange, Workshop } from "@/lib/workshops/types";
import { addDays } from "date-fns";

export const dynamic = "force-dynamic";

/** Personal calendar feed: the sessions of one staff member, from 4 weeks back to 3 months ahead. The secret is the token in the link. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response("Not found", { status: 404 });
  const users = await adminDb.collection("users").where("icsToken", "==", token).limit(1).get();
  if (users.empty) return new Response("Not found", { status: 404 });
  const me = users.docs[0];

  const today = new Date();
  const dates = rangeDates(toISO(addDays(today, -28)), toISO(addDays(today, 92)));
  const [wSnap, pSnap, lSnap, cSnap, ...chSnaps] = await Promise.all([
    adminDb.collection("workshops").where("endDate", ">=", dates[0]).get(),
    adminDb.collection("programs").get(),
    adminDb.collection("locations").get(),
    adminDb.collection("closures").where("date", ">=", dates[0]).where("date", "<=", dates[dates.length - 1]).get(),
    // `array-contains-any` takes at most 30 values per query.
    ...Array.from({ length: Math.ceil(dates.length / 30) }, (_, i) => adminDb.collection("session_changes").where("dates", "array-contains-any", dates.slice(i * 30, i * 30 + 30)).get()),
  ]);
  const workshops = wSnap.docs.map(d => ({ id: d.id, ...d.data() } as Workshop)).filter(w => w.startDate <= dates[dates.length - 1]);
  const programs = pSnap.docs.filter(d => (d.data().status || "active") === "active").map(d => ({ id: d.id, name: d.data().name, activeDays: d.data().activeDays || [], dailyBlocks: [] } as Program));
  const changes = [...new Map(chSnaps.flatMap(s => s.docs).map(d => [d.id, { id: d.id, ...d.data() } as SessionChange])).values()];
  const closures = cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Closure));
  const rooms = new Map(lSnap.docs.map(d => [d.id, String(d.data().name || "")]));

  const mine = buildSessions(dates, workshops, programs, changes, closures)
    .filter(s => !s.fixedBlock && s.kind !== "cancelled" && s.kind !== "moved-away" && s.staffIds.includes(me.id));
  const name = `הלוז שלי · ${me.data().displayName || me.data().name || ""}`.trim();
  return new Response(buildIcs(name, mine, id => (id ? rooms.get(id) : undefined), new Date().toISOString()), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=600" },
  });
}
