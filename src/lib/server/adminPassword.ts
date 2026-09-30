import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { adminDb } from "@/lib/firebase/admin";

// Server-only doc; the collection is excluded from the Firestore admin override in firestore.rules.
const secretRef = () => adminDb.collection("admin_secrets").doc("actions_password");

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export async function isAdminPasswordSet(): Promise<boolean> {
  const snap = await secretRef().get();
  return snap.exists || !!process.env.ADMIN_ACTIONS_PASSWORD;
}

export async function setAdminPassword(password: string, updatedBy: string) {
  const { salt, hash } = hashPassword(password);
  await secretRef().set({ salt, hash, updatedBy, updatedAt: new Date() });
}

/** Returns null when no password is configured anywhere (callers must fail closed). */
export async function checkAdminPassword(candidate: string): Promise<boolean | null> {
  const data = (await secretRef().get()).data();
  if (data?.salt && data?.hash) {
    const actual = Buffer.from(data.hash as string, "hex");
    const given = scryptSync(candidate, data.salt as string, 64);
    return actual.length === given.length && timingSafeEqual(actual, given);
  }
  const fromEnv = process.env.ADMIN_ACTIONS_PASSWORD;
  return fromEnv ? candidate === fromEnv : null;
}
