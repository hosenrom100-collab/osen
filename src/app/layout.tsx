import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { BottomNav } from "@/components/navigation/BottomNav";
import { PushNotificationManager } from "@/components/notifications/PushNotificationManager";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "חוסן-קונקט | ניהול מרכז חוסן",
  description: "אפליקציית ניהול מתקדמת לצוותי מרכז חוסן",
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
      <body className={`${inter.variable} font-sans antialiased bg-slate-950`}>
        <AuthProvider>
          <PushNotificationManager />
          <div className="min-h-screen pb-20 md:pb-0">
            {children}
          </div>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
