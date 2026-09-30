import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Group, Person, Program, STAFF_ROLES } from "./types";

export interface Refs {
  programs: Program[];
  staff: Person[];
  locations: Person[];
  groups: Group[];
}

export async function loadRefs(): Promise<Refs> {
  const [progSnap, userSnap, locSnap, groupSnap] = await Promise.all([
    getDocs(collection(db, "programs")),
    getDocs(collection(db, "users")),
    getDocs(collection(db, "locations")),
    getDocs(collection(db, "groups")),
  ]);
  const programs: Program[] = progSnap.docs
    .filter(d => (d.data().status || "active") === "active")
    .map(d => ({ id: d.id, name: d.data().name, activeDays: d.data().activeDays || [] }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
  const staff: Person[] = userSnap.docs
    .filter(d => {
      const u = d.data();
      const roles: string[] = u.roles || (u.role ? [u.role] : []);
      return roles.some(r => STAFF_ROLES.includes(r)) && u.status !== "rejected";
    })
    .map(d => ({ id: d.id, name: d.data().displayName || d.data().email || "ללא שם" }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
  const locations: Person[] = locSnap.docs
    .filter(d => d.data().active !== false)
    .map(d => ({ id: d.id, name: d.data().name }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
  const groups: Group[] = groupSnap.docs
    .map(d => ({ id: d.id, name: d.data().name, programId: d.data().programId }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
  return { programs, staff, locations, groups };
}

/** Approved absence requests for a set of dates. */
export async function loadAbsences(dates: string[]) {
  const snap = await getDocs(query(collection(db, "absence_requests"), where("status", "==", "approved")));
  const set = new Set(dates);
  return snap.docs
    .map(d => ({ userId: d.data().userId as string, date: d.data().date as string }))
    .filter(a => set.has(a.date));
}

export async function notifyStaff(userIds: string[], title: string, body: string) {
  if (userIds.length === 0) return;
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds, title, body, link: "/schedule" }),
    });
  } catch { /* notification failures must not block saving */ }
}
