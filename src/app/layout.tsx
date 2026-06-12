import type { Metadata } from "next";
import { Inter, Assistant } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { BottomNav } from "@/components/navigation/BottomNav";
import { DesktopSidebar } from "@/components/navigation/DesktopSidebar";
import { SettingsProvider } from "@/context/SettingsContext";
import { StaffOnboardingModal } from "@/components/auth/StaffOnboardingModal";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  variable: "--font-assistant",
  weight: ["300", "400", "500", "600", "700", "800"],
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
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className={`${assistant.variable} ${inter.variable} font-sans antialiased`}>
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
          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
