import { NextResponse } from "next/server";
import admin from "firebase-admin";

if (!admin.apps.length) {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) {
    privateKey = privateKey.trim();
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  const projectId    = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail  = process.env.FIREBASE_CLIENT_EMAIL;

  if (projectId && clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    } catch (err) {
      console.error("Firebase Admin init failed:", err);
    }
  }
}

// Send a push notification to a specific user, or to all users matching a role.
// Body: { userId?, role?, title, body, link? }
export async function POST(req: Request) {
  try {
    const { userId, role, title, body, link = "/" } = await req.json();

    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

    // Map: uid → fcmTokens[]
    const tokensByUser = new Map<string, string[]>();

    if (userId) {
      const snap = await admin.firestore().collection("users").doc(userId).get();
      const data = snap.data();
      if (data?.fcmTokens?.length) {
        tokensByUser.set(userId, data.fcmTokens);
      }
    } else if (role) {
      const roles = Array.isArray(role) ? role : [role];
      const snap = await admin.firestore().collection("users").get();
      snap.forEach((d) => {
        const data = d.data();
        if (roles.includes(data.role) && data.fcmTokens?.length) {
          tokensByUser.set(d.id, data.fcmTokens);
        }
      });
    } else {
      return NextResponse.json({ error: "userId or role required" }, { status: 400 });
    }

    const allTokens = [...tokensByUser.values()].flat();
    if (allTokens.length === 0) {
      return NextResponse.json({ success: true, sent: 0, note: "no tokens" });
    }

    const result = await admin.messaging().sendEachForMulticast({
      tokens: allTokens,
      notification: { title, body: body || "" },
      webpush: {
        notification: { icon: "/icon-192.png", badge: "/icon-192.png" },
        fcmOptions: { link },
      },
    });

    // Clean up expired / invalid tokens
    if (result.failureCount > 0) {
      const staleTokens = new Set<string>();
      result.responses.forEach((resp, idx) => {
        const code = resp.error?.code ?? "";
        if (
          !resp.success &&
          (code.includes("invalid-registration-token") ||
            code.includes("registration-token-not-registered"))
        ) {
          staleTokens.add(allTokens[idx]);
        }
      });

      if (staleTokens.size > 0) {
        const db = admin.firestore();
        const batch = db.batch();
        for (const [uid, tokens] of tokensByUser) {
          const clean = tokens.filter((t) => !staleTokens.has(t));
          if (clean.length !== tokens.length) {
            batch.update(db.collection("users").doc(uid), { fcmTokens: clean });
          }
        }
        await batch.commit();
      }
    }

    return NextResponse.json({ success: true, sent: result.successCount, failed: result.failureCount });
  } catch (err: any) {
    console.error("Notify error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
