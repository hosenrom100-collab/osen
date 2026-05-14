"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase/config";
import { useRouter } from "next/navigation";

export type UserRole   = "admin" | "manager" | "logistics" | "instructor" | "employee" | "social_worker";
export type UserStatus = "pending" | "approved" | "blocked";

interface AuthContextType {
  user:            User | null;
  loading:         boolean;
  role:            UserRole | null;
  status:          UserStatus | null;
  assignedGroups:  string[];
  /** The group the user has selected as their primary view */
  primaryGroupId:  string | null;
  setPrimaryGroupId: (id: string | null) => Promise<void>;
  /** Programs the user chose to show in their personal dashboard */
  preferredProgramIds: string[];
  setPreferredPrograms: (ids: string[]) => Promise<void>;
  /** Groups the user chose to show in their personal dashboard */
  preferredGroupIds: string[];
  setPreferredGroups: (ids: string[]) => Promise<void>;
  isAdmin:         boolean;
  isManager:       boolean;
  isLogistics:     boolean;
  isInstructor:    boolean;
  isEmployee:      boolean;
  isWhitelisted:   boolean;
  phoneNumber?:    string;
  workDays?:       number[]; // 0=Sunday, 1=Monday...
  login:           () => Promise<void>;
  logout:          () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,           setUser]           = useState<User | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [role,           setRole]           = useState<UserRole | null>(null);
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
  const [isWhitelisted,  setIsWhitelisted]  = useState(false);
  const [phoneNumber,    setPhoneNumber]    = useState<string | undefined>();
  const [workDays,       setWorkDays]       = useState<number[] | undefined>();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (snap.exists()) {
            const data       = snap.data();
            const userRole   = data.role as UserRole;
            const userStatus = (data.status as UserStatus) || "approved";

            setStatus(userStatus);
            setRole(userRole);
            setAssignedGroups(data.assignedGroups || []);
            setPrimaryGroupIdState(data.primaryGroupId || null);
            setPreferredProgramIdsState(data.preferredProgramIds || []);
            setPreferredGroupIdsState(data.preferredGroupIds || []);

            const approved = userStatus === "approved";
            setIsWhitelisted(approved);
            setIsAdmin(userRole === "admin");
            setIsManager(userRole === "manager" || userRole === "admin");
            setIsLogistics(userRole === "logistics");
            setIsInstructor(userRole === "instructor");
            setIsEmployee(userRole === "employee");
            setPhoneNumber(data.phone);
            setWorkDays(data.workDays);
            setUser(firebaseUser);
          } else {
            setUser(firebaseUser);
            setIsWhitelisted(false);
            setRole(null);
            setStatus("pending");
            setAssignedGroups([]);
            setPrimaryGroupIdState(null);
            setIsAdmin(false); setIsManager(false);
            setIsLogistics(false); setIsInstructor(false); setIsEmployee(false);
          }
        } catch {
          setUser(firebaseUser);
          setIsWhitelisted(false);
        }
      } else {
        setUser(null); setIsWhitelisted(false); setRole(null); setStatus(null);
        setAssignedGroups([]); setPrimaryGroupIdState(null);
        setIsAdmin(false); setIsManager(false);
        setIsLogistics(false); setIsInstructor(false); setIsEmployee(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
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
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const snap   = await getDoc(doc(db, "users", result.user.uid));
      if (!snap.exists()) {
        await setDoc(doc(db, "users", result.user.uid), {
          email:          result.user.email,
          name:           result.user.displayName,
          createdAt:      serverTimestamp(),
          role:           "employee",
          status:         "pending",
          assignedGroups: [],
          primaryGroupId: null,
        });
      }
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const logout = async () => {
    try { await signOut(auth); router.push("/login"); }
    catch (err) { console.error("Logout failed:", err); }
  };

  return (
    <AuthContext.Provider value={{
      user, loading, role, status, assignedGroups, primaryGroupId, setPrimaryGroupId,
      preferredProgramIds, setPreferredPrograms, preferredGroupIds, setPreferredGroups,
      isAdmin, isManager, isLogistics, isInstructor, isEmployee, isWhitelisted,
      phoneNumber, workDays,
      login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
