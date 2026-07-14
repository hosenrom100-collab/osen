"use client";

import { auth, db } from "@/lib/firebase/config";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc, getDocFromServer, updateDoc, onSnapshot, setDoc, serverTimestamp, query, where, getDocs, collection, deleteDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export type UserRole = "admin" | "manager" | "instructor" | "social_worker" | "employee" | "logistics" | "participant";
export type UserStatus = "pending" | "approved" | "rejected" | "blocked";

interface AuthContextType {
  user:            User | null;
  loading:         boolean;
  role:            UserRole | null;
  roles:           UserRole[];
  status:          UserStatus | null;
  assignedGroups:  string[];
  primaryGroupId:  string | null;
  preferredProgramIds: string[];
  preferredGroupIds:   string[];
  setPrimaryGroupId: (id: string | null) => Promise<void>;
  setPreferredPrograms: (ids: string[]) => Promise<void>;
  setPreferredGroups:   (ids: string[]) => Promise<void>;
  isAdmin:         boolean;
  isManager:       boolean;
  isLogistics:     boolean;
  isInstructor:    boolean;
  isEmployee:      boolean;
  isParticipant:   boolean;
  isWhitelisted:   boolean;
  photoURL?:       string;
  phoneNumber?:    string;
  workSchedule?:   Record<string, { start: string, end: string, programs?: Record<string, { start: string, end: string }> }>;
  assignedProgramIds: string[];
  onboardingComplete?: boolean;
  signatureTitle?: string;
  signatureImage?: string;
  login:           () => Promise<void>;
  logout:          () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,           setUser]           = useState<User | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [role,           setRole]           = useState<UserRole | null>(null);
  const [roles,          setRoles]          = useState<UserRole[]>([]);
  const [status,         setStatus]         = useState<UserStatus | null>(null);
  const [assignedGroups,       setAssignedGroups]       = useState<string[]>([]);
  const [primaryGroupId,       setPrimaryGroupIdState]   = useState<string | null>(null);
  const [preferredProgramIds,  setPreferredProgramIdsState] = useState<string[]>([]);
  const [preferredGroupIds,    setPreferredGroupIdsState]   = useState<string[]>([]);
  const [isAdmin,        setIsAdmin]        = useState(false);
  const [isManager,      setIsManager]      = useState(false);
  const [isLogistics,    setIsLogistics]    = useState(false);
  const [isInstructor,   setIsInstructor]   = useState(false);
  const [isEmployee,     setIsEmployee]     = useState(false);
  const [isParticipant,  setIsParticipant]  = useState(false);
  const [isWhitelisted,  setIsWhitelisted]  = useState(false);
  const [phoneNumber,    setPhoneNumber]    = useState<string | undefined>();
  const [photoURL,       setPhotoURL]       = useState<string | undefined>();
  const [workSchedule,   setWorkSchedule]   = useState<Record<string, { start: string, end: string, programs?: Record<string, { start: string, end: string }> }> | undefined>();
  const [assignedProgramIds, setAssignedProgramIds] = useState<string[]>([]);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean>(false);
  const [signatureTitle, setSignatureTitleState] = useState<string | undefined>();
  const [signatureImage, setSignatureImageState] = useState<string | undefined>();
  const router = useRouter();

  useEffect(() => {
    // Dev login bypass
    if (typeof window !== "undefined" && window.location.hostname === "localhost" && (window.location.search.includes("mockUser=true") || localStorage.getItem("mockUser") === "true")) {
      localStorage.setItem("mockUser", "true");
      const mockFirebaseUser = {
        uid: "mock-uid-admin",
        displayName: "מלווה טיפולי בדיקה",
        email: "test@example.com",
        photoURL: null,
      } as any;
      
      setUser(mockFirebaseUser);
      setRole("admin");
      setRoles(["admin"]);
      setStatus("approved");
      setIsWhitelisted(true);
      setIsAdmin(true);
      setIsManager(true);
      setLoading(false);
      return;
    }

    let unsubscribeUserDoc: (() => void) | undefined;

    const handleUserData = async (data: any, firebaseUser: User) => {
      const userRole   = data.role as UserRole;
      const userRoles  = (data.roles as UserRole[]) || (userRole ? [userRole] : []);
      const userStatus = (data.status as UserStatus) || "pending";

      setStatus(userStatus);
      setRole(userRole || userRoles[0]);
      setRoles(userRoles);
      setAssignedGroups(data.assignedGroups || []);
      setPrimaryGroupIdState(data.primaryGroupId || null);
      setPreferredProgramIdsState(data.preferredProgramIds || []);
      setPreferredGroupIdsState(data.preferredGroupIds || []);

      const approved = userStatus === "approved";
      setIsWhitelisted(approved);
      
      // Check if any role matches admin/manager
      setIsAdmin(userRoles.includes("admin"));
      setIsManager(userRoles.includes("manager") || userRoles.includes("admin"));
      setIsLogistics(userRoles.includes("logistics"));
      setIsInstructor(userRoles.includes("instructor"));
      setIsEmployee(userRoles.includes("employee") || userRoles.includes("social_worker"));
      setIsParticipant(userRoles.includes("participant"));
      
      setPhoneNumber(data.phone);
      setPhotoURL(data.photoURL || firebaseUser.photoURL || undefined);
      setWorkSchedule(data.workSchedule);
      setAssignedProgramIds(data.assignedProgramIds || []);
      setOnboardingComplete(!!data.onboardingComplete);
      setSignatureTitleState(data.signatureTitle || undefined);
      setSignatureImageState(data.signatureImage || undefined);

      // Sync profile info if missing or outdated
      if ((!data.photoURL && firebaseUser.photoURL) || (!data.displayName && firebaseUser.displayName)) {
        const newName = data.displayName || data.name || firebaseUser.displayName || "";
        await updateDoc(doc(db, "users", firebaseUser.uid), { 
          photoURL: data.photoURL || firebaseUser.photoURL || "",
          displayName: newName,
          name: newName,
          email: data.email || firebaseUser.email || ""
        });
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        unsubscribeUserDoc = onSnapshot(doc(db, "users", firebaseUser.uid), async (snap) => {
          if (snap.exists()) {
            await handleUserData(snap.data(), firebaseUser);
          } else {
            // Snapshot shows document missing — could be a cache miss before server data arrives.
            // Always verify against the server to avoid overwriting an existing approved user's status.
            const userRef = doc(db, "users", firebaseUser.uid);

            let freshSnap;
            try {
              freshSnap = await getDocFromServer(userRef);
            } catch (e) {
              // Network error — cannot confirm user state. Do nothing and wait for the next snapshot.
              console.warn("Could not verify user document from server:", e);
              setLoading(false);
              return;
            }

            if (freshSnap.exists()) {
              // Document exists on the server — this was a cache false-negative.
              // Update status and other fields from server data immediately, then unblock loading.
              await handleUserData(freshSnap.data(), firebaseUser);
              setLoading(false);
              return;
            }

            // Server confirmed the document does not exist — this is a genuinely new user.
            setIsWhitelisted(false);
            setRole(null);
            setRoles([]);
            setStatus("pending");
            setAssignedGroups([]);

            // Participant join page handles its own document creation — skip here.
            if (typeof window !== "undefined" && window.location.pathname.includes("/portal/join")) {
              setLoading(false);
              return;
            }

            // Query for pre-created user profiles with this email
            const q = query(
              collection(db, "users"), 
              where("email", "==", (firebaseUser.email || "").toLowerCase()), 
              where("isPreCreated", "==", true)
            );
            const qSnap = await getDocs(q);

            let preCreatedData: any = {};
            let preCreatedDocId: string | null = null;
            if (!qSnap.empty) {
              preCreatedDocId = qSnap.docs[0].id;
              preCreatedData = qSnap.docs[0].data();
            }

            // Create the user document for the first time (no merge — document is confirmed new).
            const initialName = firebaseUser.displayName || preCreatedData.displayName || preCreatedData.name || "";
            const initialRoles = preCreatedData.roles || (preCreatedData.role ? [preCreatedData.role] : ["employee"]);
            const initialRole = preCreatedData.role || initialRoles[0] || "employee";
            const initialStatus = preCreatedData.status || "pending";

            await setDoc(userRef, {
              email: (firebaseUser.email || "").toLowerCase(),
              displayName: initialName,
              name: initialName,
              photoURL: firebaseUser.photoURL || "",
              role: initialRole,
              roles: initialRoles,
              status: initialStatus,
              onboardingComplete: !!preCreatedData.onboardingComplete,
              createdAt: serverTimestamp(),
              assignedGroups: preCreatedData.assignedGroupIds || preCreatedData.assignedGroups || [],
              assignedProgramIds: preCreatedData.assignedProgramIds || [],
              preferredProgramIds: [],
              fcmTokens: [],
            });

            // Delete the old pre-created placeholder document
            if (preCreatedDocId) {
              try {
                await deleteDoc(doc(db, "users", preCreatedDocId));
              } catch (delErr) {
                console.error("Failed to delete placeholder pre-created user doc:", delErr);
              }
            }

            // Notify admins and managers of the new sign-up if it wasn't pre-created/pre-approved
            if (!preCreatedDocId) {
              try {
                fetch("/api/notify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    role: ["admin", "manager"],
                    title: "איש צוות חדש ממתין לאישור",
                    body: `${firebaseUser.displayName || firebaseUser.email} נרשם למערכת וממתין לאישור.`,
                    link: "/admin/users"
                  })
                });
              } catch (e) {
                console.error("Notify failed:", e);
              }
            }
          }
          setLoading(false);
        }, (err) => {
          console.error("User doc error:", err);
          setLoading(false);
        });

      } else {
        setUser(null);
        setIsWhitelisted(false);
        setRole(null);
        setRoles([]);
        setStatus(null);
        setLoading(false);
        if (unsubscribeUserDoc) unsubscribeUserDoc();
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, []);

  const setPrimaryGroupId = async (id: string | null) => {
    setPrimaryGroupIdState(id);
    if (user) await updateDoc(doc(db, "users", user.uid), { primaryGroupId: id });
  };

  const setPreferredPrograms = async (ids: string[]) => {
    setPreferredProgramIdsState(ids);
    if (user) await updateDoc(doc(db, "users", user.uid), { preferredProgramIds: ids });
  };

  const setPreferredGroups = async (ids: string[]) => {
    setPreferredGroupIdsState(ids);
    if (user) await updateDoc(doc(db, "users", user.uid), { preferredGroupIds: ids });
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    localStorage.removeItem("mockUser");
    await signOut(auth);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{
      user, loading, role, roles, status, assignedGroups, primaryGroupId,
      preferredProgramIds, preferredGroupIds,
      setPrimaryGroupId, setPreferredPrograms, setPreferredGroups,
      isAdmin, isManager, isLogistics, isInstructor, isEmployee, isParticipant, isWhitelisted,
      phoneNumber, photoURL, workSchedule, onboardingComplete,
      signatureTitle, signatureImage,
      assignedProgramIds,
      login, logout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
