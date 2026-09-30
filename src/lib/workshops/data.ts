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
    .map(d => {
      const x = d.data();
      return {
        id: d.id, name: x.name, activeDays: x.activeDays || [], color: x.scheduleColor, laneMode: x.laneMode || "stable",
        dailyBlocks: x.dailyBlocks || [], staffGroupUrl: x.staffGroupUrl || "", participantsGroupUrl: x.participantsGroupUrl || "",
      } as Program;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
  const staff: Person[] = userSnap.docs
    .filter(d => {
      const u = d.data();
      const roles: string[] = u.roles || (u.role ? [u.role] : []);
      return roles.some(r => STAFF_ROLES.includes(r)) && u.status !== "rejected";
    })
    .map(d => {
      const u = d.data();
      return {
        id: d.id, name: u.displayName || u.email || "ללא שם",
        roles: (u.roles || (u.role ? [u.role] : [])) as string[],
        programIds: (u.assignedProgramIds || []) as string[], groupIds: (u.assignedGroupIds || []) as string[],
      } as Person;
    })
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

export interface PatientLite {
  id: string;
  firstName: string;
  lastName: string;
  programIds: string[];
  groupIds: string[];
  startDate?: string;
  endDate?: string;
}

/** Active participants — used for the headcount and name list of each session. Empty when the read is not allowed. */
export async function loadPatients(): Promise<PatientLite[]> {
  try {
    const snap = await getDocs(query(collection(db, "patients"), where("status", "==", "active")));
    return snap.docs.map(d => {
      const x = d.data();
      const parts = String(x.fullName || "").trim().split(/\s+/);
      return {
        id: d.id,
        firstName: String(x.firstName || parts[0] || "").trim(),
        lastName: String(x.lastName || parts.slice(1).join(" ") || "").trim(),
        programIds: x.programIds?.length ? x.programIds : x.programId ? [x.programId] : [],
        groupIds: x.groupIds || [],
        startDate: x.startDate, endDate: x.endDate,
      } as PatientLite;
    });
  } catch { return []; }
}
