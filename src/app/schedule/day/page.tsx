"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addDays, parseISO } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Download, Printer, Send } from "lucide-react";
import { MiniCalendar } from "@/components/workshops/MiniCalendar";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { buildSessions } from "@/lib/workshops/buildWeek";
import { groupHue, hueStyle, programHue } from "@/lib/workshops/colors";
import { firstNames, participantsOf } from "@/lib/workshops/people";
import { dayOf, shortDate, toISO, weekDates, weekStartOf } from "@/lib/workshops/dates";
import { DAY_FULL, Session } from "@/lib/workshops/types";
import { useScheduleData } from "@/lib/workshops/useScheduleData";
import { btnGhost, btnPrimary, fieldCls } from "@/components/workshops/Dialog";

const readParam = (k: string) => { try { return new URLSearchParams(window.location.search).get(k) || ""; } catch { return ""; } };
const live = (s: Session) => s.kind !== "cancelled" && s.kind !== "moved-away";

// The card below uses inline styles only: html2canvas cannot read the modern colour functions Tailwind emits.
const INK = "#1f2937", SOFT = "#6b7280";

export default function DaySharePage() {
  const [date, setDate] = useState(() => readParam("date") || toISO(new Date()));
  const [programId, setProgramId] = useState(() => readParam("program"));
  const [groupId, setGroupId] = useState(() => readParam("group"));
  const [withNames, setWithNames] = useState(true);
  const [withStaffEvents, setWithStaffEvents] = useState(false); // team-only events stay out of what is shared with participants
  const [range, setRange] = useState<"day" | "week">(() => (readParam("range") === "week" ? "week" : "day"));
  const [calOpen, setCalOpen] = useState(false);
  const [toast, setToast] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  const sharing = useRef(false); // one image per tap, even if the button is pressed twice
  // A day, or the Sunday-to-Saturday week that contains it.
  const dates = useMemo(() => (range === "day" ? [date] : weekDates(weekStartOf(parseISO(date)))), [date, range]);
  const { refs, types, workshops, changes, closures, patients, loading } = useScheduleData(dates);

  const program = refs?.programs.find(p => p.id === programId);
  const programGroups = useMemo(() => refs?.groups.filter(g => g.programId === programId) || [], [refs, programId]);
  const group = programGroups.find(g => g.id === groupId);

  const sessions = useMemo(() => {
    if (!refs) return [];
    let list = buildSessions(dates, workshops, refs.programs, changes, closures, types);
    if (programId) list = list.filter(s => s.programId === programId);
    // Keep whole-program entries plus those of the chosen group.
    if (groupId) list = list.filter(s => s.groupIds.length === 0 || s.groupIds.includes(groupId));
    return list;
  }, [refs, types, dates, workshops, changes, closures, programId, groupId]);

  const closureOf = (d: string) => closures.find(c => c.date === d && (c.programIds.length === 0 || !programId || c.programIds.includes(programId)));
  // One block per day; in a week, days with nothing to show are left out.
  const byDay = dates
    .map(d => ({ date: d, closure: closureOf(d), list: sessions.filter(s => s.date === d && s.kind !== "moved-away") }))
    .filter(x => range === "day" || x.list.length > 0 || x.closure);

  const roomOf = (id?: string) => refs?.locations.find(l => l.id === id)?.name || "";
  const staffOf = (s: Session) => s.staffIds.map(id => refs?.staff.find(p => p.id === id)?.name || "").filter(Boolean).map(n => n.split(" ")[0]).join(", ");
  const groupsOf = (s: Session) => s.groupIds.map(id => refs?.groups.find(g => g.id === id)?.name || "").filter(Boolean).join(", ");
  const wById = useMemo(() => new Map(workshops.map(w => [w.id, w])), [workshops]);

  // A workshop with its own hand-picked participants lists them on its own line; the rest share one list.
  const customOf = (s: Session) => !!wById.get(s.workshopId)?.participantIds?.length;
  const ownNames = (s: Session) => (customOf(s) && live(s) && !s.fixedBlock ? firstNames(participantsOf(s, wById.get(s.workshopId), patients)) : []);

  // Participants of the day, by group (first names only).
  const attendees = useMemo(() => {
    const seen = new Map<string, (typeof patients)[number]>();
    sessions.filter(s => live(s) && !s.fixedBlock && !customOf(s)).forEach(s => participantsOf(s, wById.get(s.workshopId), patients).forEach(p => seen.set(p.id, p)));
    const all = [...seen.values()];
    if (!programGroups.length || group) return [{ label: group?.name || "", names: firstNames(all) }].filter(x => x.names.length);
    const out = programGroups.map(g => ({ label: g.name, names: firstNames(all.filter(p => p.groupIds.includes(g.id))) })).filter(x => x.names.length);
    const loose = all.filter(p => !p.groupIds.some(id => programGroups.some(g => g.id === id)));
    if (loose.length) out.push({ label: "", names: firstNames(loose) });
    return out;
  }, [sessions, patients, wById, programGroups, group]);
  const total = attendees.reduce((n, g) => n + g.names.length, 0);

  const title = [program?.name || "כל התוכניות", group?.name].filter(Boolean).join(" · ");
  const dayName = (d: string) => `יום ${DAY_FULL[dayOf(d)]} ${shortDate(d)}`;
  const dayTitle = range === "day" ? dayName(date) : `שבוע ${shortDate(dates[0])} – ${shortDate(dates[6])}`;
  const hue = programHue(program, programId);
  const tint = hueStyle(hue);

  const changeText = (s: Session) =>
    s.kind === "cancelled" ? "בוטל" : s.kind === "moved-away" ? `הוזז ל-${shortDate(s.change!.newDate!)}` : s.kind === "moved-in" ? "הוזז אלינו" :
    s.kind === "extra" ? "מפגש נוסף" : s.change?.newStart || s.change?.newEnd ? "שעה שונתה" : s.change?.staffIds ? "מחליף" : "";

  // One text per audience: participants get what/when/where, staff also see who leads it.
  const byGroup = !group && programGroups.length > 1;
  const buildText = (forStaff: boolean) => {
    const lines = [`*${title}*`, dayTitle, ""];
    byDay.forEach((day, i) => {
      if (range === "week") lines.push(`${i ? "\n" : ""}*${dayName(day.date)}*`);
      if (day.closure) lines.push(day.closure.reason || "אין פעילות");
      const shown = day.list.filter(s => forStaff || withStaffEvents || s.audience !== "staff");
      const line = (s: Session, perGroup: boolean) => {
        const shared = perGroup && !s.band && s.groupIds.length !== 1;
        const extra = [forStaff && !s.fixedBlock ? staffOf(s) : "", roomOf(s.locationId), !group && !perGroup ? groupsOf(s) : ""].filter(Boolean).join(" · ");
        const ch = changeText(s);
        lines.push(`${s.start}–${s.end}  ${s.workshopName}${shared ? " (משותף)" : ""}${extra ? ` (${extra})` : ""}${ch ? ` — *${ch}*` : ""}`);
        const own = withNames ? ownNames(s) : [];
        if (own.length) lines.push(`   משתתפים (${own.length}): ${own.join(", ")}`);
      };
      // Several groups, none picked: a separate schedule for each group (they rarely share), shared items in each.
      if (byGroup) {
        programGroups.forEach(g => {
          const mine = shown.filter(s => s.groupIds.length !== 1 || s.groupIds[0] === g.id);
          if (!mine.length) return;
          lines.push(`_${g.name}_`);
          mine.forEach(s => line(s, true));
        });
      } else shown.forEach(s => line(s, false));
    });
    if (withNames && total) {
      lines.push("", `*משתתפים (${total})*`);
      attendees.forEach(g => lines.push(`${g.label ? `${g.label}: ` : ""}${g.names.join(", ")}`));
    }
    return lines.join("\n");
  };

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };

  // WhatsApp cannot post into a chosen group from a link, so: copy, then open the group and paste.
  const shareTo = async (forStaff: boolean) => {
    const url = forStaff ? program?.staffGroupUrl : program?.participantsGroupUrl;
    const ok = await copy(buildText(forStaff));
    if (url) window.open(url, "_blank", "noopener");
    say(ok ? (url ? "ההודעה הועתקה. הדבק אותה בקבוצה שנפתחה." : "ההודעה הועתקה. לא הוגדר קישור לקבוצה בהגדרות הלוז של התוכנית.") : "לא הצלחתי להעתיק. סמן והעתק ידנית.");
  };

  const shareImage = async () => {
    if (!cardRef.current || sharing.current) return;
    sharing.current = true;
    try {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: "#ffffff" });
    const blob: Blob | null = await new Promise(r => canvas.toBlob(r, "image/png"));
    if (!blob) return say("יצירת התמונה נכשלה.");
    const file = new File([blob], `לוז-${range === "week" ? "שבוע-" : ""}${date}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; }
      catch (e) { if ((e as Error)?.name === "AbortError") return; /* cancelled: do not also download a second copy */ }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    URL.revokeObjectURL(a.href);
    say("התמונה נשמרה. אפשר לשלוח אותה בוואטסאפ.");
    } finally { sharing.current = false; }
  };

  if (loading || !refs) return <PageSkeleton />;

  const step = (dir: number) => setDate(toISO(addDays(new Date(`${date}T12:00:00`), dir * (range === "week" ? 7 : 1))));

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <style>{`@media print { aside, nav, .no-print { display: none !important; } @page { size: A4 portrait; margin: 10mm; } }`}</style>
      <div dir="rtl" className="min-h-screen bg-[#f3f4f1] text-[#1f2937] pb-24 md:pb-8">
        <div className="no-print bg-white border-b border-[#E5E7E0] px-3 py-2 flex flex-wrap items-center gap-2">
          <Link href="/schedule" className="text-sm underline ml-1">חזרה ליומן</Link>
          <select className={`${fieldCls} !w-auto !py-1.5`} value={programId} onChange={e => { setProgramId(e.target.value); setGroupId(""); }} aria-label="תוכנית">
            <option value="">כל התוכניות</option>
            {refs.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {programGroups.length > 1 && (
            <select className={`${fieldCls} !w-auto !py-1.5`} value={groupId} onChange={e => setGroupId(e.target.value)} aria-label="קבוצה">
              <option value="">כל הקבוצות</option>
              {programGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <div className="flex border border-[var(--border)] rounded-lg overflow-hidden" role="group" aria-label="טווח">
            {([["day", "יום"], ["week", "שבוע"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setRange(k)} aria-pressed={range === k}
                className={`px-3 py-1.5 text-sm ${range === k ? "bg-[var(--btn)] text-white font-bold" : "text-[#1f2937]/70 hover:bg-black/5"}`}>{l}</button>
            ))}
          </div>
          <div className="flex items-center relative">
            <button onClick={() => step(-1)} aria-label="הקודם" className="p-1.5 rounded-md hover:bg-black/5"><ChevronRight className="w-4 h-4" /></button>
            <button onClick={() => setCalOpen(o => !o)} aria-expanded={calOpen} aria-label="בחירה מלוח שנה"
              className="flex items-center gap-1.5 text-sm font-bold min-w-[9rem] justify-center px-2 py-1.5 rounded-md hover:bg-black/5">
              <CalendarDays className="w-4 h-4 opacity-60" />{dayTitle}
            </button>
            <button onClick={() => step(1)} aria-label="הבא" className="p-1.5 rounded-md hover:bg-black/5"><ChevronLeft className="w-4 h-4" /></button>
            {calOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCalOpen(false)} />
                <div className="absolute top-full mt-1 right-0 z-50">
                  <MiniCalendar value={date} range={range} onPick={iso => { setDate(iso); setCalOpen(false); }} />
                </div>
              </>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" checked={withNames} onChange={e => setWithNames(e.target.checked)} /> עם שמות משתתפים</label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" checked={withStaffEvents} onChange={e => setWithStaffEvents(e.target.checked)} /> כולל אירועי צוות</label>
        </div>

        <div className="max-w-md mx-auto px-3 pt-4">
          {/* The shareable card — inline styles only. */}
          <div ref={cardRef} style={{ background: "#ffffff", borderRadius: 14, overflow: "hidden", border: "1px solid #E5E7E0", color: INK }}>
            <div style={{ background: tint.bar, color: "#ffffff", padding: "16px 18px" }}>
              <div style={{ fontSize: 13, opacity: 0.85 }}>חוות רום · מרכז חוסן</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{title}</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{dayTitle}</div>
            </div>
            <div style={{ padding: "12px 14px" }}>
              {byDay.every(d => d.list.filter(s => withStaffEvents || s.audience !== "staff").length === 0 && !d.closure) && <div style={{ padding: "24px 0", textAlign: "center", color: SOFT }}>אין פעילות מתוכננת {range === "week" ? "בשבוע זה" : "ליום זה"}.</div>}
              {byDay.map(day => (
                <div key={day.date} style={{ marginBottom: range === "week" ? 10 : 0 }}>
                  {range === "week" && <div style={{ fontWeight: 800, fontSize: 14, padding: "6px 2px 2px", color: tint.ink }}>{dayName(day.date)}</div>}
                  {day.closure && <div style={{ padding: "10px 12px", marginBottom: 8, borderRadius: 8, background: "#f3f4f6", fontWeight: 700 }}>{day.closure.reason || "אין פעילות"}</div>}
                  {(() => {
                  const item = (s: Session) => {
                  const cancelled = s.kind === "cancelled";
                  const ch = changeText(s);
                  const t = hueStyle(programHue(refs.programs.find(p => p.id === s.programId), s.programId));
                  const room = roomOf(s.locationId), grp = byGroup ? (s.groupIds.length !== 1 && !s.band ? "משותף" : "") : !group ? groupsOf(s) : "";
                  if (s.band) {
                    return (
                      <div key={s.id} style={{ display: "flex", gap: 10, padding: "6px 10px", margin: "4px 0", borderRadius: 8, background: "#f3f4f6", color: SOFT, fontSize: 13 }}>
                        <span dir="ltr" style={{ fontWeight: 600 }}>{s.start}–{s.end}</span><span>{s.workshopName}{[room, grp].filter(Boolean).length ? ` · ${[room, grp].filter(Boolean).join(" · ")}` : ""}{s.note ? ` · ${s.note}` : ""}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 12, padding: "10px 12px", margin: "6px 0", borderRadius: 10, background: cancelled ? "#ffffff" : t.fill, border: `1px solid ${t.soft}`, borderInlineStart: `4px solid ${t.bar}`, opacity: cancelled ? 0.6 : 1 }}>
                      <div dir="ltr" style={{ minWidth: 52, textAlign: "center", fontWeight: 800, fontSize: 15, lineHeight: 1.25 }}>
                        <div>{s.start}</div><div style={{ fontWeight: 500, fontSize: 12, color: SOFT }}>{s.end}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 16, textDecoration: cancelled ? "line-through" : "none" }}>
                          {s.workshopName}
                          {ch && <span style={{ marginInlineStart: 8, fontSize: 12, fontWeight: 700, padding: "1px 7px", borderRadius: 6, background: cancelled ? "#fde2e2" : "#fff0c2", color: cancelled ? "#b42318" : "#8a5a00" }}>{ch}</span>}
                        </div>
                        {[room, grp, staffOf(s)].filter(Boolean).length > 0 && <div style={{ fontSize: 13, color: SOFT, marginTop: 2 }}>{[room, grp, staffOf(s)].filter(Boolean).join(" · ")}</div>}
                        {s.note && <div style={{ fontSize: 13, marginTop: 4 }}>{s.note}</div>}
                        {withNames && ownNames(s).length > 0 && <div style={{ fontSize: 13, marginTop: 4 }}><span style={{ fontWeight: 700 }}>משתתפים ({ownNames(s).length}): </span>{ownNames(s).join(", ")}</div>}
                      </div>
                    </div>
                  );
                  };
                  const shown = day.list.filter(s => withStaffEvents || s.audience !== "staff");
                  if (!byGroup) return shown.map(item);
                  // Several groups: shared items full width; a run of group-only items side by side, one column per group.
                  const segs: (Session | Session[])[] = [];
                  for (const s of shown) {
                    const own = s.groupIds.length === 1 && !s.band;
                    const last = segs[segs.length - 1];
                    if (own && Array.isArray(last)) last.push(s); else segs.push(own ? [s] : s);
                  }
                  return segs.map((seg, i) => !Array.isArray(seg) ? item(seg) : (
                    <div key={`seg${i}`} style={{ display: "grid", gridTemplateColumns: `repeat(${programGroups.length}, minmax(0, 1fr))`, gap: 8 }}>
                      {programGroups.map(g => {
                        const gh = hueStyle(groupHue(g.id, refs.groups, refs.programs) ?? 0);
                        const mine = seg.filter(s => s.groupIds[0] === g.id);
                        return (
                          <div key={g.id} style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, padding: "6px 2px 0", color: gh.ink, borderBottom: `2px solid ${gh.bar}` }}>{g.name}</div>
                            {mine.length ? mine.map(item) : <div style={{ fontSize: 12, color: SOFT, padding: "10px 2px" }}>אין פעילות</div>}
                          </div>
                        );
                      })}
                    </div>
                  ));
                  })()}
                </div>
              ))}
            </div>
            {withNames && total > 0 && (
              <div style={{ padding: "4px 18px 16px", borderTop: "1px solid #E5E7E0", marginTop: 4 }}>
                <div style={{ fontWeight: 800, fontSize: 14, margin: "12px 0 6px" }}>משתתפים ({total})</div>
                {attendees.map((g, i) => (
                  <div key={i} style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 4 }}>
                    {g.label && <span style={{ fontWeight: 700 }}>{g.label}: </span>}{g.names.join(", ")}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="no-print mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => shareTo(false)} className={`${btnPrimary} flex items-center justify-center gap-1.5`}><Send className="w-4 h-4" />לקבוצת המשתתפים</button>
            <button onClick={() => shareTo(true)} className={`${btnPrimary} flex items-center justify-center gap-1.5`}><Send className="w-4 h-4" />לקבוצת הצוות</button>
            <button onClick={shareImage} className={`${btnGhost} flex items-center justify-center gap-1.5`}><Download className="w-4 h-4" />שתף כתמונה</button>
            <button onClick={async () => say((await copy(buildText(false))) ? "הטקסט הועתק." : "לא הצלחתי להעתיק.")} className={`${btnGhost} flex items-center justify-center gap-1.5`}><Copy className="w-4 h-4" />העתק טקסט</button>
            <button onClick={() => window.print()} className={`${btnGhost} flex items-center justify-center gap-1.5 col-span-2`}><Printer className="w-4 h-4" />הדפסה</button>
          </div>
          {program && !program.participantsGroupUrl && !program.staffGroupUrl && (
            <p className="no-print text-xs text-[#6b7280] mt-3">כדי שהכפתורים יפתחו את קבוצות הקהילה, מגדירים את הקישורים ביומן: תפריט ⋯ ← הגדרות לוז.</p>
          )}
          {toast && <p role="status" className="no-print fixed bottom-20 md:bottom-6 inset-x-0 mx-auto w-fit max-w-[90vw] bg-[#1f2937] text-white text-sm px-4 py-2 rounded-md">{toast}</p>}
        </div>
      </div>
    </RoleGuard>
  );
}
