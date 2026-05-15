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

// Send a push notification to a specific user, or to all users matching a role/group/program.
// Body: { userId?, role?, groupId?, programId?, everyone?, title, body, link? }
export async function POST(req: Request) {
  try {
    const { 
      userId, role, groupId, programId, everyone, 
      title, body, link = "/", senderId, senderName 
    } = await req.json();

    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

    // Map: uid → fcmTokens[]
    const tokensByUser = new Map<string, string[]>();

    const targetUserIds = new Set<string>();

    if (userId) {
      console.log(`[Notify] Targeting specific user: ${userId}`);
      targetUserIds.add(userId);
      const snap = await admin.firestore().collection("users").doc(userId).get();
      const data = snap.data();
      if (data?.fcmTokens?.length) {
        console.log(`[Notify] Found ${data.fcmTokens.length} tokens for user ${userId}`);
        tokensByUser.set(userId, data.fcmTokens);
      } else {
        console.log(`[Notify] No FCM tokens found for user ${userId}`);
      }
    } else if (role) {
      console.log(`[Notify] Targeting role: ${role}`);
      const roles = Array.isArray(role) ? role : [role];
      const snap = await admin.firestore().collection("users").get();
      snap.forEach((d) => {
        const data = d.data();
        const status = data.status ?? "approved";
        if (status === "approved" && roles.includes(data.role)) {
          targetUserIds.add(d.id);
          if (data.fcmTokens?.length) tokensByUser.set(d.id, data.fcmTokens);
        }
      });
    } else if (groupId) {
      console.log(`[Notify] Targeting group: ${groupId}`);
      const snap = await admin.firestore().collection("users").get();
      snap.forEach((d) => {
        const data = d.data();
        const status = data.status ?? "approved";
        if (
          status === "approved" &&
          Array.isArray(data.assignedGroups) &&
          data.assignedGroups.includes(groupId)
        ) {
          targetUserIds.add(d.id);
          if (data.fcmTokens?.length) tokensByUser.set(d.id, data.fcmTokens);
        }
      });
    } else if (programId) {
      console.log(`[Notify] Targeting program: ${programId}`);
      const snap = await admin.firestore().collection("users").get();
      snap.forEach((d) => {
        const data = d.data();
        const status = data.status ?? "approved";
        if (
          status === "approved" &&
          Array.isArray(data.preferredProgramIds) &&
          data.preferredProgramIds.includes(programId)
        ) {
          targetUserIds.add(d.id);
          if (data.fcmTokens?.length) tokensByUser.set(d.id, data.fcmTokens);
        }
      });
    } else if (everyone) {
      console.log(`[Notify] Targeting everyone`);
      const snap = await admin.firestore().collection("users").get();
      snap.forEach((d) => {
        const data = d.data();
        const status = data.status ?? "approved";
        if (status === "approved") {
          targetUserIds.add(d.id);
          if (data.fcmTokens?.length) tokensByUser.set(d.id, data.fcmTokens);
        }
      });
    } else {
      return NextResponse.json({ error: "target required: userId, role, groupId, programId, or everyone=true" }, { status: 400 });
    }

    console.log(`[Notify] Total target recipients: ${targetUserIds.size}`);
    const allTokens = [...tokensByUser.values()].flat();
    console.log(`[Notify] Total FCM tokens to send: ${allTokens.length}`);
    
    // Send push only if we have tokens
    let successCount = 0;
    let failureCount = 0;
    
    if (allTokens.length > 0) {
      const result = await admin.messaging().sendEachForMulticast({
        tokens: allTokens,
        notification: { title, body: body || "" },
        data: { 
          link: String(link || "/"),
          senderName: String(senderName || "מערכת")
        },
        webpush: {
          notification: { icon: "/icon-192.png", badge: "/icon-192.png" },
          fcmOptions: { link: String(link || "/") },
        },
      });
      successCount = result.successCount;
      failureCount = result.failureCount;
      console.log(`[Notify] Multicast result: ${successCount} success, ${failureCount} failure`);

      // Clean up stale tokens
      if (result.failureCount > 0) {
        const staleTokens = new Set<string>();
        result.responses.forEach((resp, idx) => {
          const code = resp.error?.code ?? "";
          if (!resp.success && (code.includes("invalid-registration-token") || code.includes("registration-token-not-registered"))) {
            staleTokens.add(allTokens[idx]);
          }
        });
        if (staleTokens.size > 0) {
          const db = admin.firestore();
          const batch = db.batch();
          for (const [uid, tokens] of tokensByUser) {
            const clean = tokens.filter((t) => !staleTokens.has(t));
            if (clean.length !== tokens.length) batch.update(db.collection("users").doc(uid), { fcmTokens: clean });
          }
          await batch.commit();
        }
      }
    }

    // Store in Firestore for dashboard & read receipts
    try {
      const db = admin.firestore();
      await db.collection("notifications").add({
        title,
        body: body || "",
        link,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        target: { 
          userId: userId || null, 
          role: role || null, 
          groupId: groupId || null, 
          programId: programId || null, 
          everyone: everyone || null 
        },
        recipientIds: Array.from(targetUserIds),
        readBy: [], 
        type: "system",
        senderId: senderId || null,
        senderName: senderName || "מערכת"
      });
    } catch (e) {
      console.error("Failed to store notification:", e);
    }

    return NextResponse.json({ success: true, sent: successCount, failed: failureCount });
  } catch (err: any) {
    console.error("Notify error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
