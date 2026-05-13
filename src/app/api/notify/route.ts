import { NextResponse } from "next/server";
import admin from "firebase-admin";

if (!admin.apps.length) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Handle private key formatting and potential extra quotes from env vars
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  
  if (privateKey) {
    // Remove potential surrounding quotes
    privateKey = privateKey.trim();
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.substring(1, privateKey.length - 1);
    }
    // Handle escaped newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  if (projectId && clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } catch (error) {
      console.error("Failed to initialize Firebase Admin:", error);
    }
  } else {
    console.warn("Firebase Admin not initialized: Missing or invalid environment variables.");
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
