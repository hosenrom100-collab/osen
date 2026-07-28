import { Timestamp } from "firebase/firestore";

/** Safely converts a Firestore Timestamp or Date into a Date, or null if invalid/missing. */
export function toDateOrNull(value: Timestamp | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : value.toDate();
  return isNaN(d.getTime()) ? null : d;
}
