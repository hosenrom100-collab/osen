import { NextRequest, NextResponse } from "next/server";
import admin, { adminDb } from "@/lib/firebase/admin";

export async function GET(request: NextRequest) {
  try {
    const storeRequests = await adminDb
      .collection("storeAuthorizationRequests")
      .orderBy("createdAt", "desc")
      .get();

    const data = storeRequests.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching store requests:", error);
    return NextResponse.json(
      { error: "Failed to fetch requests" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Get next request number
    const lastRequest = await adminDb
      .collection("storeAuthorizationRequests")
      .orderBy("requestNumber", "desc")
      .limit(1)
      .get();

    const nextNumber = lastRequest.empty
      ? 1001
      : lastRequest.docs[0].data().requestNumber + 1;

    const docRef = await adminDb
      .collection("storeAuthorizationRequests")
      .add({
        ...body,
        requestNumber: nextNumber,
        status: "pending",
        createdAt: new Date(),
      });

    // Notify managers & logistics about the new purchase request
    try {
      const targetRoles = ["admin", "manager", "logistics"];
      const usersSnap = await adminDb.collection("users").get();
      const targetUserIds: string[] = [];
      const tokensByUser = new Map<string, string[]>();

      usersSnap.forEach((d) => {
        const data = d.data();
        const status = data.status ?? "approved";
        const userRoles = Array.isArray(data.roles) ? data.roles : (data.role ? [data.role] : []);
        const hasMatchingRole = targetRoles.some((r) => userRoles.includes(r));
        if (status === "approved" && hasMatchingRole) {
          targetUserIds.push(d.id);
          if (data.fcmTokens?.length) tokensByUser.set(d.id, data.fcmTokens);
        }
      });

      const title = `🛒 בקשת אישור קנייה אד הוק חדשה (בקשה #${nextNumber})`;
      const requestedByName = body.requestedByName || "עובד";
      const notificationBody = `העובד/ת ${requestedByName} הגיש/ה בקשה חדשה לקנייה אד הוק. לחץ לצפייה, עריכה ואישור PDF.`;
      const link = "/admin/store-requests";

      // 1. Save in notifications collection for in-app notification center
      await adminDb.collection("notifications").add({
        title,
        body: notificationBody,
        link,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        target: { role: targetRoles },
        recipientIds: targetUserIds,
        readBy: [],
        type: "system",
        senderId: body.requestedBy || null,
        senderName: requestedByName,
      });

      // 2. Send FCM Push Notification
      const allTokens = [...tokensByUser.values()].flat();
      if (allTokens.length > 0) {
        await admin.messaging().sendEachForMulticast({
          tokens: allTokens,
          notification: { title, body: notificationBody },
          data: { link, senderName: requestedByName },
          android: { priority: "high" },
          apns: { payload: { aps: { sound: "default" } } },
          webpush: {
            headers: { Urgency: "high" },
            notification: { icon: "/icon-192.png", badge: "/icon-192.png" },
            fcmOptions: { link },
          },
        });
      }
    } catch (notifyErr) {
      console.error("Error sending store request notification:", notifyErr);
    }

    return NextResponse.json({
      id: docRef.id,
      requestNumber: nextNumber,
    });
  } catch (error) {
    console.error("Error creating store request:", error);
    return NextResponse.json(
      { error: "Failed to create request" },
      { status: 500 }
    );
  }
}

