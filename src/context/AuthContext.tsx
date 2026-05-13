"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User 
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase/config";
import { useRouter } from "next/navigation";

export type UserRole = "admin" | "manager" | "logistics" | "instructor" | "employee" | "social_worker";
export type UserStatus = "pending" | "approved" | "blocked";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  role: UserRole | null;
  status: UserStatus | null;
  assignedGroups: string[]; // Group IDs the user is associated with
  isAdmin: boolean;
  isManager: boolean;
  isLogistics: boolean;
  isInstructor: boolean;
  isEmployee: boolean;
  isWhitelisted: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [assignedGroups, setAssignedGroups] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [isLogistics, setIsLogistics] = useState(false);
  const [isInstructor, setIsInstructor] = useState(false);
  const [isEmployee, setIsEmployee] = useState(false);
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const userRole = userData.role as UserRole;
            const userStatus = (userData.status as UserStatus) || "approved"; // Default to approved for existing users
            
            setStatus(userStatus);
            setRole(userRole);
            setAssignedGroups(userData.assignedGroups || []);
            
            const approved = userStatus === "approved";
            setIsWhitelisted(approved);
            
            setIsAdmin(userRole === "admin");
            setIsManager(userRole === "manager" || userRole === "admin");
            setIsLogistics(userRole === "logistics");
            setIsInstructor(userRole === "instructor");
            setIsEmployee(userRole === "employee");
            setUser(user);
          } else {
            setUser(user);
            setIsWhitelisted(false);
            setRole(null);
            setStatus("pending");
            setAssignedGroups([]);
            setIsAdmin(false);
            setIsManager(false);
            setIsLogistics(false);
            setIsInstructor(false);
            setIsEmployee(false);
          }
        } catch (error) {
          console.error("Error checking user record:", error);
          // If we get a permission error, it usually means the rules are blocking us
          // or the user document doesn't exist and rules are strict.
          setUser(user);
          setIsWhitelisted(false);
        }
      } else {
        setUser(null);
        setIsWhitelisted(false);
        setRole(null);
        setStatus(null);
        setAssignedGroups([]);
        setIsAdmin(false);
        setIsManager(false);
        setIsLogistics(false);
        setIsInstructor(false);
        setIsEmployee(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          email: user.email,
          name: user.displayName,
          createdAt: serverTimestamp(),
          role: "employee",
          status: "pending",
          assignedGroups: []
        });
      }
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      role,
      status,
      assignedGroups,
      isAdmin, 
      isManager,
      isLogistics,
      isInstructor,
      isEmployee,
      isWhitelisted, 
      login, 
      logout 
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
