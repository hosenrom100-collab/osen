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

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

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

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
export const bucket = bucketName ? admin.storage().bucket(bucketName) : null;
export default admin;
