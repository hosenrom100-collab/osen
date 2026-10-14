import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { computeFreezeAt, LIST_KEYS, listKeyOf } from "@/app/shopping/lib/freeze";
import type { CutoffConfig } from "@/app/shopping/types";

// Same set as `isStaff()` in firestore.rules.
const STAFF_ROLES = [
  "admin", "manager", "logistics", "social_worker", "instructor", "employee", "professional_manager",
];

function getUserRoles(data: FirebaseFirestore.DocumentData | undefined): string[] {
  if (!data) return [];
  const roles = Array.isArray(data.roles) ? data.roles : [];
  return data.role ? [...roles, data.role] : roles;
}

/**
 * Brings `settings/shopping.freezeAt` in line with the real state of each list.
 *
 * The Firestore rules freeze a list for non-managers once `request.time >= freezeAt`. Rules cannot
 * look at the items, so this route does: it recomputes the boundary from the stored cutoff config
 * and the items that exist right now. It takes no input from the caller and is idempotent, so any
 * staff member may call it. It can only set the boundary to a real cutoff of the saved config, and
 * only a list that holds no items from before the last cutoff moves forward, which is what lets an
 * empty week unfreeze without a manager.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "לא מחובר" }, { status: 401 });

    let uid: string;
    try {
      uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch {
      return NextResponse.json({ error: "לא מחובר" }, { status: 401 });
    }

    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!getUserRoles(userSnap.data()).some((r) => STAFF_ROLES.includes(r))) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    const settingsRef = adminDb.collection("settings").doc("shopping");
    const settings = (await settingsRef.get()).data();
    const config = settings?.cutoffConfig as CutoffConfig | undefined;

    const itemsSnap = await adminDb
      .collection("shopping_requests")
      .where("status", "in", ["pending", "approved", "purchased"])
      .get();
    const byList = { supermarket: [] as { createdAt: Date }[], large: [] as { createdAt: Date }[] };
    for (const d of itemsSnap.docs) {
      const data = d.data();
      const createdAt = data.createdAt?.toDate?.();
      if (createdAt) byList[listKeyOf(data)].push({ createdAt });
    }

    const now = new Date();
    const next: Record<string, Timestamp | null> = {};
    const changed: string[] = [];
    for (const key of LIST_KEYS) {
      const at = computeFreezeAt(config, byList[key], now);
      next[key] = at ? Timestamp.fromDate(at) : null;
      const current = settings?.freezeAt?.[key]?.toMillis?.() ?? null;
      if (current !== (at ? at.getTime() : null)) changed.push(key);
    }

    if (changed.length > 0) {
      await settingsRef.set({ freezeAt: next }, { merge: true });
    }
    return NextResponse.json({ ok: true, changed });
  } catch (err) {
    console.error("sync-freeze failed:", err);
    return NextResponse.json({ error: "שגיאה בסנכרון ההקפאה" }, { status: 500 });
  }
}
