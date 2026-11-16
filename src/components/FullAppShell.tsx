"use client";

import { AuthProvider } from "@/context/AuthContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { BottomNav } from "@/components/navigation/BottomNav";
import { DesktopSidebar } from "@/components/navigation/DesktopSidebar";
import { StaffOnboardingModal } from "@/components/auth/StaffOnboardingModal";
import HelpButton from "@/components/help/HelpButton";

/** מעטפת האפליקציה המלאה (התחברות, תפריטים, עזרה). נטענת רק מחוץ לעמודים הציבוריים. */
export default function FullAppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>
        <StaffOnboardingModal />
        <div className="flex min-h-screen">
          <DesktopSidebar />
          <div className="flex-1 min-w-0 pb-20 md:pb-0 md:h-screen md:overflow-y-auto">
            {children}
          </div>
        </div>
        <BottomNav />
        <HelpButton />
      </SettingsProvider>
    </AuthProvider>
  );
}
