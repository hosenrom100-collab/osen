import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Offline persistence (IndexedDB) with multi-tab support, so staff on an unreliable farm
// connection keep seeing previously-loaded data and queued writes sync on reconnect.
// Falls back to plain getFirestore on the server (no IndexedDB there) and if persistence
// was already initialized by another module in this session.
const db =
  typeof window !== "undefined"
    ? (() => {
        try {
          return initializeFirestore(app, {
            localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
          });
        } catch {
          // Firestore was already initialized elsewhere (e.g. Fast Refresh) — reuse it.
          return getFirestore(app);
        }
      })()
    : getFirestore(app);

const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, db, storage, googleProvider };

// Messaging is only supported in certain environments
export const messaging = async () => {
  const supported = await isSupported();
  return supported ? getMessaging(app) : null;
};
