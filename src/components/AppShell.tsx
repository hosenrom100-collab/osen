"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

/**
 * עמודים ציבוריים עצמאיים (/forms): מקבלים רק את התוכן – בלי התחברות, בלי Firebase,
 * בלי תפריטים ובלי כפתור עזרה. המעטפת המלאה נטענת בייבוא דינמי, כך שהקוד שלה
 * (כולל Firebase) לא נטען כלל בעמודים האלה.
 */
const STANDALONE_PREFIXES = ["/forms"];

const FullAppShell = dynamic(() => import("./FullAppShell"));

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  if (STANDALONE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return <>{children}</>;
  }
  return <FullAppShell>{children}</FullAppShell>;
}
