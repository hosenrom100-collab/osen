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
  const { roles, role, loading, isWhitelisted } = useAuth();
  const router = useRouter();

  // Combine roles array and singular role for comparison
  const userRoles = [...roles];
  if (role && !userRoles.includes(role)) userRoles.push(role);

  const hasAccess = isWhitelisted && userRoles.some(r => allowedRoles.includes(r));

  useEffect(() => {
    if (!loading && redirectTo && !hasAccess) {
      router.push(redirectTo);
    }
  }, [loading, hasAccess, redirectTo, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
