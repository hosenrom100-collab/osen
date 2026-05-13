"use client";

import { useAuth, UserRole } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  fallback?: React.ReactNode;
  redirectTo?: string;
}

export function RoleGuard({ 
  children, 
  allowedRoles, 
  fallback = null,
  redirectTo 
}: RoleGuardProps) {
  const { role, loading, isWhitelisted } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && redirectTo && (!isWhitelisted || !role || !allowedRoles.includes(role))) {
      router.push(redirectTo);
    }
  }, [loading, role, isWhitelisted, allowedRoles, redirectTo, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isWhitelisted || !role || !allowedRoles.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
