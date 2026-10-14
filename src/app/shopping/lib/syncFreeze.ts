import type { User } from "firebase/auth";

/** Asks the server to bring `freezeAt` in line with the lists. Resolves false on any failure. */
export async function syncFreeze(user: Pick<User, "getIdToken"> | null | undefined): Promise<boolean> {
  try {
    if (!user || typeof user.getIdToken !== "function") return false;
    const token = await user.getIdToken();
    const res = await fetch("/api/shopping/sync-freeze", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** True for the error Firestore raises when a rule rejects the write (a frozen list, for staff). */
export function isPermissionDenied(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "permission-denied";
}
