"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addDays } from "date-fns";
import { Calendar, ChevronLeft, Settings2, Users } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { buildSessions } from "@/lib/workshops/buildWeek";
import { hueStyle, programHue } from "@/lib/workshops/colors";
import { shortDate, toISO } from "@/lib/workshops/dates";
import { firstNames, participantsOf } from "@/lib/workshops/people";
import { DAY_FULL, Session } from "@/lib/workshops/types";
import { useScheduleData } from "@/lib/workshops/useScheduleData";
import { dayOf } from "@/lib/workshops/dates";

interface Pref { programId: string; groupId: string; mine: boolean }
const EMPTY: Pref = { programId: "", groupId: "", mine: false };
const KEY = "home.schedulePref";

const readLocal = (): Pref => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return EMPTY; } };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Home-screen schedule: one day, for the program/group each person picks for themselves. */
export function TodaySchedule() {
  const { user, isManager } = useAuth();
  const [offset, setOffset] = useState(0);
  const date = toISO(addDays(new Date(), offset));
  const dates = useMemo(() => [date], [date]);
  const { refs, workshops, changes, closures, patients, loading } = useScheduleData(dates);
  const [pref, setPref] = useState<Pref>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setPref(readLocal());
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then(s => {
      const p = s.data()?.schedulePref;
      if (p) { setPref({ ...EMPTY, ...p }); try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }
    }).catch(() => {});
  }, [user]);
  useEffect(() => { setNow(nowMin()); const t = setInterval(() => setNow(nowMin()), 60000); return () => clearInterval(t); }, []);

  const change = (p: Pref) => {
    setPref(p);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
    if (user) setDoc(doc(db, "users", user.uid), { schedulePref: p }, { merge: true }).catch(() => {});
  };

  const sessions = useMemo(() => {
    if (!refs) return [];
    let list = buildSessions(dates, workshops, refs.programs, changes, closures).filter(s => s.kind !== "moved-away");
    if (pref.programId) list = list.filter(s => s.programId === pref.programId);
    if (pref.groupId) list = list.filter(s => s.groupIds.length === 0 || s.groupIds.includes(pref.groupId));
    if (pref.mine && user) list = list.filter(s => s.fixedBlock || s.staffIds.includes(user.uid));
    return list;
  }, [refs, dates, workshops, changes, closures, pref, user]);

  if (loading || !refs) return <div className="h-40 animate-pulse bg-[var(--foreground)]/[0.04] rounded-lg" aria-hidden />;

  const program = refs.programs.find(p => p.id === pref.programId);
  const groups = refs.groups.filter(g => g.programId === pref.programId);
  const closure = closures.find(c => c.date === date && (c.programIds.length === 0 || !pref.programId || c.programIds.includes(pref.programId)));
  const wById = new Map(workshops.map(w => [w.id, w]));
  const nameOf = (id: string) => (refs.staff.find(p => p.id === id)?.name || "").split(" ")[0];
  const roomOf = (id?: string) => refs.locations.find(l => l.id === id)?.name || "";
  const label = [program?.name || "כל התוכניות", groups.find(g => g.id === pref.groupId)?.name].filter(Boolean).join(" · ");
  const dayLabel = offset === 0 ? "היום" : offset === 1 ? "מחר" : `יום ${DAY_FULL[dayOf(date)]}`;
  const sel = "text-sm bg-transparent border border-[var(--border)] rounded-md px-2 py-1.5 outline-none focus:border-[var(--primary)]";

  const state = (s: Session) => offset !== 0 ? "later" : now >= mins(s.end) ? "done" : now >= mins(s.start) ? "now" : "later";

  return (
    <section aria-label="הלוז" className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--card-bg,var(--surface))]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <Calendar className="w-4 h-4 text-[var(--foreground)]/50" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold leading-tight">לוז {dayLabel} <span className="font-normal text-[var(--foreground)]/50 tabular-nums">{shortDate(date)}</span></h2>
          <p className="text-xs text-[var(--foreground)]/55 truncate">{label}{pref.mine ? " · המפגשים שלי" : ""}</p>
        </div>
        <div className="flex border border-[var(--border)] rounded-md overflow-hidden text-xs" role="group" aria-label="יום">
          {[0, 1].map(o => <button key={o} onClick={() => setOffset(o)} aria-pressed={offset === o} className={`px-2.5 py-1 ${offset === o ? "bg-[var(--primary)] text-white font-bold" : "text-[var(--foreground)]/65"}`}>{o === 0 ? "היום" : "מחר"}</button>)}
        </div>
        <button onClick={() => setEditing(e => !e)} aria-label="בחירת מה להציג" aria-expanded={editing} className="p-1.5 rounded-md text-[var(--foreground)]/50 hover:bg-[var(--foreground)]/5"><Settings2 className="w-4 h-4" /></button>
      </div>

      {editing && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--foreground)]/[0.03]">
          <select className={sel} value={pref.programId} aria-label="תוכנית" onChange={e => change({ ...pref, programId: e.target.value, groupId: "" })}>
            <option value="">כל התוכניות</option>
            {refs.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {groups.length > 1 && (
            <select className={sel} value={pref.groupId} aria-label="קבוצה" onChange={e => change({ ...pref, groupId: e.target.value })}>
              <option value="">כל הקבוצות</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" checked={pref.mine} onChange={e => change({ ...pref, mine: e.target.checked })} /> רק המפגשים שלי</label>
          <span className="text-xs text-[var(--foreground)]/45 mr-auto">הבחירה נשמרת לחשבון שלך</span>
        </div>
      )}

      <div className="px-3 py-2">
        {closure && <p className="px-2 py-2 mb-1 text-sm font-semibold rounded-md bg-[var(--foreground)]/[0.05]">{closure.reason || "אין פעילות"}</p>}
        {sessions.length === 0 && !closure && <p className="py-8 text-center text-sm text-[var(--foreground)]/50">אין פעילות מתוכננת.</p>}
        <ul>
          {sessions.map(s => {
            const st = state(s);
            const dead = s.kind === "cancelled";
            const t = hueStyle(programHue(refs.programs.find(p => p.id === s.programId), s.programId));
            const count = s.fixedBlock || !s.hasParticipants ? 0 : firstNames(participantsOf(s, wById.get(s.workshopId), patients)).length;
            const meta = [s.fixedBlock ? "" : s.staffIds.map(nameOf).filter(Boolean).join(", "), roomOf(s.locationId), !pref.groupId ? s.groupIds.map(id => refs.groups.find(g => g.id === id)?.name).filter(Boolean).join(", ") : ""].filter(Boolean).join(" · ");
            const tag = dead ? "בוטל" : s.kind === "moved-in" ? "הוזז אלינו" : s.kind === "extra" ? "מפגש נוסף" : s.change?.newStart || s.change?.newEnd ? "שעה שונתה" : s.change?.staffIds ? "מחליף" : "";
            return (
              <li key={s.id} className={`flex items-stretch gap-3 py-1.5 ${st === "done" ? "opacity-50" : ""}`}>
                <div dir="ltr" className="w-12 shrink-0 text-center text-sm font-bold tabular-nums leading-tight pt-0.5">
                  {s.start}<div className="text-[11px] font-normal text-[var(--foreground)]/50">{s.end}</div>
                </div>
                {s.band ? (
                  <div className="flex-1 min-w-0 self-center rounded-md bg-[var(--foreground)]/[0.05] px-2.5 py-1 text-xs text-[var(--foreground)]/60 font-medium">{s.workshopName}{meta ? ` · ${meta}` : ""}</div>
                ) : (
                  <div className="flex-1 min-w-0 rounded-md border border-s-[3px] px-2.5 py-1.5"
                    style={{ backgroundColor: dead ? undefined : t.fill, borderColor: t.soft, borderInlineStartColor: st === "now" ? "#d92d20" : t.bar }}>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${dead ? "line-through text-[var(--foreground)]/45" : ""}`}>{s.workshopName}</span>
                      {st === "now" && <span className="text-[11px] font-bold text-[#d92d20]">עכשיו</span>}
                      {tag && <span className="px-1.5 rounded text-[11px] font-bold leading-4 bg-[#fff0c2] text-[#8a5a00]">{tag}</span>}
                      {count > 0 && !dead && <span className="mr-auto flex items-center gap-0.5 text-xs font-semibold tabular-nums text-[var(--foreground)]/65"><Users className="w-3 h-3" />{count}</span>}
                    </div>
                    {meta && !dead && <p className="text-xs text-[var(--foreground)]/65 mt-0.5">{meta}</p>}
                    {s.note && <p className="text-xs mt-0.5 text-[var(--foreground)]/75">{s.note}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)] text-xs font-bold">
        <Link href={`/schedule?${pref.programId ? `program=${pref.programId}&` : ""}${pref.groupId ? `group=${pref.groupId}&` : ""}view=day`} className="text-[var(--primary)] flex items-center gap-0.5 hover:underline">ליומן המלא <ChevronLeft className="w-3 h-3" /></Link>
        {isManager && <Link href={`/schedule/day?date=${date}${pref.programId ? `&program=${pref.programId}` : ""}${pref.groupId ? `&group=${pref.groupId}` : ""}`} className="text-[var(--foreground)]/60 hover:underline">שיתוף לוז היום</Link>}
      </div>
    </section>
  );
}
