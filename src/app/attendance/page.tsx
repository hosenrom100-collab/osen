"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { PageSkeleton } from "@/components/ui/Skeleton";
/**
 * The attendance gate redirects directly to patient-attendance.
 * If the user has a primary group set, it pre-selects that group.
 * Staff attendance is available only through the admin panel.
 */
function AttendanceRedirect() {
  const { primaryGroupId, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const url = primaryGroupId
      ? `/admin/patient-attendance?group=${primaryGroupId}`
      : "/admin/patient-attendance";
    router.replace(url);
  }, [loading, primaryGroupId, router]);

  return (
    <PageSkeleton />
  );
}

export default function AttendancePage() {
  return (
    <RoleGuard
      allowedRoles={["admin","manager","instructor","employee","social_worker","logistics"]}
      redirectTo="/"
    >
      <AttendanceRedirect />
    </RoleGuard>
  );
}
