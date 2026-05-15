"use client";

import { auth, db } from "@/lib/firebase/config";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc, updateDoc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
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
  workSchedule?:   Record<string, { start: string, end: string }>;
  onboardingComplete?: boolean;
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
  const [workSchedule,   setWorkSchedule]   = useState<Record<string, { start: string, end: string }> | undefined>();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean>(false);
  const router = useRouter();

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        unsubscribeUserDoc = onSnapshot(doc(db, "users", firebaseUser.uid), async (snap) => {
          if (snap.exists()) {
            const data       = snap.data();
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
            setOnboardingComplete(!!data.onboardingComplete);

            // Sync profile info if missing or outdated
            if (!data.photoURL && firebaseUser.photoURL) {
              await updateDoc(doc(db, "users", firebaseUser.uid), { 
                photoURL: firebaseUser.photoURL,
                displayName: data.displayName || firebaseUser.displayName,
                email: data.email || firebaseUser.email
              });
            }
          } else {
            // New user detected
            setIsWhitelisted(false);
            setRole(null);
            setRoles([]);
            setStatus("pending");
            setAssignedGroups([]);

            // If we are on the participant join page, don't auto-create here to avoid race conditions
            if (typeof window !== "undefined" && window.location.pathname.includes("/portal/join")) {
              setLoading(false);
              return;
            }

            // Auto-create document for staff who log in for the first time
            // This ensures they appear in the admin panel for approval
            const userRef = doc(db, "users", firebaseUser.uid);
            await setDoc(userRef, {
              email: firebaseUser.email || "",
              displayName: firebaseUser.displayName || "",
              photoURL: firebaseUser.photoURL || "",
              role: "employee",
              roles: ["employee"],
              status: "pending",
              onboardingComplete: false,
              createdAt: serverTimestamp(),
              assignedGroups: [],
              preferredProgramIds: [],
              fcmTokens: [],
            }, { merge: true });

            // Notify admins and managers
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
