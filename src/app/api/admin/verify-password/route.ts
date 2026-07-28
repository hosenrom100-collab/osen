import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

const ALLOWED_ROLES = ["admin", "manager", "logistics"];
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

function getUserRoles(data: FirebaseFirestore.DocumentData | undefined): string[] {
  if (!data) return [];
  const roles = Array.isArray(data.roles) ? data.roles : [];
  return data.role ? [...roles, data.role] : roles;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ success: false, error: "לא מחובר" }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ success: false, error: "לא מחובר" }, { status: 401 });
    }

    const userSnap = await adminDb.collection("users").doc(uid).get();
    const roles = getUserRoles(userSnap.data());
    if (!roles.some((r) => ALLOWED_ROLES.includes(r))) {
      return NextResponse.json({ success: false, error: "אין הרשאה" }, { status: 403 });
    }

    const { password } = await req.json();
    if (typeof password !== "string") {
      return NextResponse.json({ success: false, error: "סיסמה חסרה" }, { status: 400 });
    }

    const attemptsRef = adminDb.collection("admin_password_attempts").doc(uid);
    const now = Date.now();

    const throttled = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(attemptsRef);
      const data = snap.data();

      if (data?.lockedUntil && data.lockedUntil > now) {
        return data.lockedUntil as number;
      }

      const windowStart = data?.firstAttemptAt ?? now;
      const withinWindow = now - windowStart < WINDOW_MS;
      const count = withinWindow ? (data?.count ?? 0) : 0;

      if (withinWindow && count >= MAX_ATTEMPTS) {
        const lockedUntil = now + LOCK_MS;
        tx.set(attemptsRef, { count, firstAttemptAt: windowStart, lockedUntil }, { merge: true });
        return lockedUntil;
      }

      tx.set(
        attemptsRef,
        {
          count: count + 1,
          firstAttemptAt: withinWindow ? windowStart : now,
          lockedUntil: FieldValue.delete(),
        },
        { merge: true }
      );
      return null;
    });

    if (throttled) {
      const minutes = Math.max(1, Math.ceil((throttled - now) / 60000));
      return NextResponse.json(
        { success: false, error: `יותר מדי ניסיונות, נסה שוב בעוד ${minutes} דקות` },
        { status: 429 }
      );
    }

    if (password.trim() !== process.env.ADMIN_ACTIONS_PASSWORD) {
      return NextResponse.json({ success: false, error: "סיסמת מנהל שגויה" }, { status: 401 });
    }

    await attemptsRef.delete();
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("verify-password error:", err);
    const message = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
