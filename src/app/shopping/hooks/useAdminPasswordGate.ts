"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface VerifyResult {
  success: boolean;
  error?: string;
}

export function useAdminPasswordGate() {
  const { user } = useAuth();
  const [verifying, setVerifying] = useState(false);

  const verify = useCallback(
    async (password: string): Promise<VerifyResult> => {
      if (!user || typeof user.getIdToken !== "function") {
        return { success: false, error: "לא מחובר" };
      }

      setVerifying(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/verify-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password }),
        });
        const data = await res.json();
        return { success: !!data.success, error: data.error };
      } catch {
        return { success: false, error: "שגיאת תקשורת, נסה שוב" };
      } finally {
        setVerifying(false);
      }
    },
    [user]
  );

  return { verify, verifying };
}
