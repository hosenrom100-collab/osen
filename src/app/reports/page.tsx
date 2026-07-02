"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReportsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/patients");
  }, [router]);
  return null;
}
