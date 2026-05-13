import { NextResponse } from "next/server";
import admin from "firebase-admin";

if (!admin.apps.length) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } else {
    console.warn("Firebase Admin not initialized: Missing environment variables.");
  }
}

export async function POST(req: Request) {
  try {
    const { userId, title, body } = await req.json();
    
    // 1. Get user tokens from Firestore
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData || !userData.fcmTokens || userData.fcmTokens.length === 0) {
      return NextResponse.json({ error: "No tokens found for user" }, { status: 404 });
    }

    const tokens = userData.fcmTokens;

    // 2. Send notification
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title,
        body,
      },
      webpush: {
        fcmOptions: {
          link: "/",
        },
      },
    });

    return NextResponse.json({ 
      success: true, 
      successCount: response.successCount,
      failureCount: response.failureCount 
    });

  } catch (error: any) {
    console.error("Error sending notification:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
