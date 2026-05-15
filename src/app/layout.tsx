import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { BottomNav } from "@/components/navigation/BottomNav";
import { DesktopSidebar } from "@/components/navigation/DesktopSidebar";
import { PushNotificationManager } from "@/components/notifications/PushNotificationManager";
import { SettingsProvider } from "@/context/SettingsContext";
import { StaffOnboardingModal } from "@/components/auth/StaffOnboardingModal";
import { SmartAssistant } from "@/components/ai/SmartAssistant";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "מרכז חוסן | חוות רום",
  description: "מערכת ניהול מתקדמת - מרכז חוסן, חוות רום",
  manifest: "/manifest.ts",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Hosen Connect",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AuthProvider>
          <SettingsProvider>
            <PushNotificationManager />
            <StaffOnboardingModal />
            <div className="flex min-h-screen">
              <DesktopSidebar />
              <div className="flex-1 min-w-0 pb-20 md:pb-0 md:h-screen md:overflow-y-auto">
                {children}
              </div>
            </div>
            <BottomNav />
            <SmartAssistant />
          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
