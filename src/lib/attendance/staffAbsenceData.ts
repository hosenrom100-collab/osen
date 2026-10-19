import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { absenceDateFields, absenceFromDoc, AbsenceStatus, daysInRange, StaffAbsence } from "./staffAbsence";

const COL = "absence_requests";

/** Every absence (any status) that covers `date`, new range documents and old single-day ones alike. */
export async function loadAbsencesOn(date: string): Promise<StaffAbsence[]> {
  const [ranged, legacy] = await Promise.all([
    getDocs(query(collection(db, COL), where("dates", "array-contains", date))),
    getDocs(query(collection(db, COL), where("date", "==", date))),
  ]);
  const byId = new Map<string, StaffAbsence>();
  [...ranged.docs, ...legacy.docs].forEach(d => byId.set(d.id, absenceFromDoc(d.id, d.data())));
  return [...byId.values()].filter(a => a.dates.includes(date));
}

/** Every approved absence (callers narrow it to the days they show). */
export async function loadApprovedAbsences(): Promise<StaffAbsence[]> {
  const snap = await getDocs(query(collection(db, COL), where("status", "==", "approved")));
  return snap.docs.map(d => absenceFromDoc(d.id, d.data()));
}

export interface NewAbsence {
  userId: string;
  userName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: AbsenceStatus;
  createdBy?: string;
  createdByName?: string;
}

/** Saves one absence covering the whole range. Throws with a Hebrew message when the range is not valid. */
export async function addAbsence(a: NewAbsence): Promise<string> {
  const days = daysInRange(a.startDate, a.endDate || a.startDate);
  if (days.length === 0) throw new Error("טווח התאריכים אינו תקין (עד 120 יום, תאריך הסיום אחרי תאריך ההתחלה)");
  const ref = await addDoc(collection(db, COL), {
    userId: a.userId,
    userName: a.userName,
    reason: a.reason,
    status: a.status,
    ...absenceDateFields(days),
    createdAt: new Date().toISOString(),
    ...(a.createdBy ? { createdBy: a.createdBy, createdByName: a.createdByName || "" } : {}),
  });
  return ref.id;
}

export async function setAbsenceStatus(id: string, status: AbsenceStatus) {
  await updateDoc(doc(db, COL, id), { status });
}

/** Takes one day out of an absence; removes the absence when it was its last day. */
export async function removeAbsenceDay(a: StaffAbsence, date: string) {
  const rest = a.dates.filter(d => d !== date);
  if (rest.length === 0) await deleteDoc(doc(db, COL, a.id));
  else await updateDoc(doc(db, COL, a.id), absenceDateFields(rest));
}
