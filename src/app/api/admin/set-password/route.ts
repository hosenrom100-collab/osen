import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isAdminPasswordSet, setAdminPassword } from "@/lib/server/adminPassword";

// Admin-only (not manager/logistics): these roles can use the password but not change it.
async function requireAdmin(req: Request): Promise<string | NextResponse> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ success: false, error: "לא מחובר" }, { status: 401 });
  try {
    const { uid } = await adminAuth.verifyIdToken(token);
    const data = (await adminDb.collection("users").doc(uid).get()).data();
    const roles: string[] = [...(Array.isArray(data?.roles) ? data.roles : []), ...(data?.role ? [data.role] : [])];
    if (!roles.includes("admin")) return NextResponse.json({ success: false, error: "אין הרשאה" }, { status: 403 });
    return uid;
  } catch {
    return NextResponse.json({ success: false, error: "לא מחובר" }, { status: 401 });
  }
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ success: true, isSet: await isAdminPasswordSet() });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { password } = await req.json();
    if (typeof password !== "string" || password.trim().length < 4) {
      return NextResponse.json({ success: false, error: "הסיסמה חייבת להכיל לפחות 4 תווים" }, { status: 400 });
    }
    await setAdminPassword(password.trim(), auth);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("set-password error:", err);
    return NextResponse.json({ success: false, error: "שגיאה בשמירת הסיסמה" }, { status: 500 });
  }
}
