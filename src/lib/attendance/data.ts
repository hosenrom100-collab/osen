import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import {
  AttendanceEntry, dayAttendanceId, entryFromDoc, entryIsEmpty, newest, NOTE_MAX,
} from "./model";

export interface StoredDay extends AttendanceEntry {
  /** Every document id found for this participant and day (older screens used other ids). */
  docIds: string[];
}

/** All of one day's attendance by participant, with each participant's note merged in. */
export async function loadDayAttendance(date: string): Promise<Map<string, StoredDay>> {
  const [attSnap, notesSnap] = await Promise.all([
    getDocs(query(collection(db, "attendance"), where("date", "==", date))),
    getDocs(query(collection(db, "attendance_notes"), where("date", "==", date), where("kind", "==", "day"))).catch(
      () => null
    ),
  ]);

  const notes = new Map<string, string>();
  notesSnap?.forEach((d) => {
    const data = d.data();
    if (typeof data.patientId === "string" && typeof data.text === "string") notes.set(data.patientId, data.text);
  });

  const picked = new Map<string, { id: string; data: Record<string, unknown>; ids: string[] }>();
  attSnap.forEach((d) => {
    const data = d.data();
    const pid = data.patientId;
    if (typeof pid !== "string") return;
    const cur = picked.get(pid);
    if (!cur) picked.set(pid, { id: d.id, data, ids: [d.id] });
    else {
      cur.ids.push(d.id);
      if (newest(cur.data, data) === data) {
        cur.id = d.id;
        cur.data = data;
      }
    }
  });

  const result = new Map<string, StoredDay>();
  for (const [pid, p] of picked) result.set(pid, { ...entryFromDoc(p.data, notes.get(pid)), docIds: p.ids });
  // A participant can have a note and no attendance document yet.
  for (const [pid, text] of notes) if (!result.has(pid)) result.set(pid, { ...entryFromDoc(undefined, text), docIds: [] });
  return result;
}

interface SaveArgs {
  patientId: string;
  date: string;
  entry: AttendanceEntry;
  uid: string;
  /** Which screen wrote it, for information only. */
  contextId?: string;
  /** Ids of older documents for the same participant and day, removed as part of the save. */
  legacyIds?: string[];
}

/**
 * Saves one participant's day in a single batch: the attendance document, the note and the
 * removal of older duplicates. An entry with nothing in it deletes the document.
 */
export async function saveDayEntry({ patientId, date, entry, uid, contextId, legacyIds = [] }: SaveArgs) {
  const id = dayAttendanceId(patientId, date);
  const now = new Date().toISOString();
  const note = entry.note?.trim().slice(0, NOTE_MAX) || "";
  const batch = writeBatch(db);

  if (entryIsEmpty({ ...entry, note })) {
    batch.delete(doc(db, "attendance", id));
  } else {
    const data: Record<string, unknown> = {
      patientId,
      date,
      status: entry.status,
      hasNote: note.length > 0,
      source: entry.source ?? "manual",
      updatedBy: uid,
      updatedAt: now,
    };
    if (contextId) data.contextId = contextId;
    if (entry.derivedFrom) data.derivedFrom = entry.derivedFrom;
    if (entry.status === "present" && entry.late) data.late = { at: entry.late.at };
    if (entry.status === "present" && entry.leftEarly) data.leftEarly = { at: entry.leftEarly.at };
    batch.set(doc(db, "attendance", id), data);
  }

  const noteRef = doc(db, "attendance_notes", id);
  if (note) batch.set(noteRef, { text: note, patientId, date, kind: "day", updatedBy: uid, updatedAt: now });
  else batch.delete(noteRef);

  for (const legacy of legacyIds) if (legacy !== id) batch.delete(doc(db, "attendance", legacy));
  await batch.commit();
}

// ── Workshop sessions ───────────────────────────────────────────────────────────────────

export interface SessionRecord extends AttendanceEntry {
  patientId: string;
  /** The session this mark belongs to (Session.changeId; stable when a session is moved). */
  sessionId: string;
}

/** Every session mark of one date, notes merged in. Filter by `sessionId` for a single session. */
export async function loadSessionDay(date: string): Promise<SessionRecord[]> {
  const [snap, notesSnap] = await Promise.all([
    getDocs(query(collection(db, "session_attendance"), where("date", "==", date))),
    getDocs(query(collection(db, "attendance_notes"), where("date", "==", date), where("kind", "==", "session"))).catch(
      () => null
    ),
  ]);
  const notes = new Map<string, string>();
  notesSnap?.forEach((d) => {
    const n = d.data();
    if (typeof n.text === "string") notes.set(d.id, n.text);
  });
  const out: SessionRecord[] = [];
  snap.forEach((d) => {
    const x = d.data();
    if (typeof x.patientId !== "string" || typeof x.sessionId !== "string") return;
    out.push({ ...entryFromDoc(x, notes.get(d.id)), patientId: x.patientId, sessionId: x.sessionId });
  });
  return out;
}

interface SaveSessionArgs {
  session: { changeId: string; workshopId: string; slotId: string | null; programId: string; date: string };
  patientId: string;
  entry: AttendanceEntry;
  uid: string;
}

/** One participant's mark in one session, with its note. "unset" removes the mark (the note stays). */
export async function saveSessionEntry({ session, patientId, entry, uid }: SaveSessionArgs) {
  const id = `${session.changeId}_${patientId}`;
  const now = new Date().toISOString();
  const note = entry.note?.trim().slice(0, NOTE_MAX) || "";
  const batch = writeBatch(db);

  if (entry.status === "unset") {
    batch.delete(doc(db, "session_attendance", id));
  } else {
    const data: Record<string, unknown> = {
      patientId,
      date: session.date,
      sessionId: session.changeId,
      workshopId: session.workshopId,
      slotId: session.slotId,
      programId: session.programId,
      status: entry.status,
      hasNote: note.length > 0,
      updatedBy: uid,
      updatedAt: now,
    };
    if (entry.status === "present" && entry.late) data.late = { at: entry.late.at };
    if (entry.status === "present" && entry.leftEarly) data.leftEarly = { at: entry.leftEarly.at };
    batch.set(doc(db, "session_attendance", id), data);
  }

  const noteRef = doc(db, "attendance_notes", id);
  if (note) {
    batch.set(noteRef, { text: note, patientId, date: session.date, kind: "session", sessionId: session.changeId, updatedBy: uid, updatedAt: now });
  } else {
    batch.delete(noteRef);
  }
  await batch.commit();
}

export interface AbsenceMarks {
  /** Session marks: sessionId → participant → status. */
  session: Map<string, Map<string, AttendanceEntry["status"]>>;
  /** Participants marked absent for the whole day: date → participant ids. */
  dayAbsent: Map<string, Set<string>>;
}

/** Session marks and whole-day absences for a range of dates, for counting who is away (see absentInSession). */
export async function loadAbsenceMarks(from: string, to: string): Promise<AbsenceMarks> {
  const [sesSnap, daySnap] = await Promise.all([
    getDocs(query(collection(db, "session_attendance"), where("date", ">=", from), where("date", "<=", to))),
    getDocs(query(collection(db, "attendance"), where("date", ">=", from), where("date", "<=", to))),
  ]);
  const session: AbsenceMarks["session"] = new Map();
  sesSnap.forEach((d) => {
    const x = d.data();
    if (typeof x.patientId !== "string" || typeof x.sessionId !== "string") return;
    const m = session.get(x.sessionId) ?? new Map();
    m.set(x.patientId, entryFromDoc(x).status);
    session.set(x.sessionId, m);
  });
  // Older screens may have left more than one document per participant and day: the newest wins.
  const picked = new Map<string, Record<string, unknown>>();
  daySnap.forEach((d) => {
    const x = d.data();
    if (typeof x.patientId !== "string" || typeof x.date !== "string") return;
    const key = `${x.patientId}|${x.date}`;
    const cur = picked.get(key);
    picked.set(key, cur ? newest(cur, x) : x);
  });
  const dayAbsent: AbsenceMarks["dayAbsent"] = new Map();
  for (const x of picked.values()) {
    if (entryFromDoc(x).status !== "absent") continue;
    const s = dayAbsent.get(x.date as string) ?? new Set();
    s.add(x.patientId as string);
    dayAbsent.set(x.date as string, s);
  }
  return { session, dayAbsent };
}
