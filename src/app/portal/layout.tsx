"use client";

import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useRouter, usePathname } from "next/navigation";
import { 
  Calendar, BarChart3, FileText, LayoutDashboard, 
  LogOut, Sun, Moon, Bell, Menu, X, User,
  ChevronLeft, Shield, Globe
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, role, onboardingComplete } = useAuth();
  const { theme, setTheme } = useSettings();
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Guard: if not onboardingComplete, let children handle it (it will show verify screen)
  
  const navItems = [
    { label: "לוח בקרה", icon: LayoutDashboard, href: "/portal" },
    { label: "לוח פעילויות", icon: Calendar, href: "/portal/schedule" },
    { label: "נוכחות", icon: BarChart3, href: "/portal/attendance" },
    { label: "מסמכים", icon: FileText, href: "/portal/docs" },
  ];

  const handleLogout = async () => {
    await logout();
    router.push("/portal/join");
  };

  if (!user) return <div className="min-h-screen bg-[var(--background)]" />;

  return (
    <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col md:flex-row">
      
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-l border-[var(--border)] bg-[var(--surface)] sticky top-0 h-screen z-50">
        <div className="p-8 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-2xl bg-teal-500 flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">מרכז חוסן</h1>
              <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-widest">איזור משתתפים</p>
            </div>
          </div>

          <nav className="flex-1 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all group ${
                  pathname === item.href 
                  ? "bg-teal-500 text-white shadow-lg shadow-teal-500/10" 
                  : "text-[var(--muted)] hover:bg-[var(--foreground)]/5 hover:text-[var(--foreground)]"
                }`}
              >
                <item.icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${pathname === item.href ? "text-white" : "text-teal-500/60"}`} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-6 space-y-4">
            <div className="p-4 rounded-2xl bg-[var(--background)] border border-[var(--border)]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-500">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black truncate">{user?.displayName}</p>
                  <p className="text-[10px] text-[var(--muted)]">משתתף/ת פעיל/ה</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase text-rose-500 hover:bg-rose-500/5 rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                התנתקות מהמערכת
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Header - Mobile */}
      <header className="md:hidden sticky top-0 z-50 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-teal-500 flex items-center justify-center text-white">
            <Shield className="w-5 h-5" />
          </div>
          <span className="font-black text-sm">מרכז חוסן</span>
        </div>
        
        <div className="flex items-center gap-2">
          <NotificationCenter />
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)]"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed inset-0 z-[60] bg-[var(--background)] md:hidden p-6 pt-24"
          >
            <div className="space-y-4">
              {navItems.map((item) => (
                <button
                  key={item.href}
                  onClick={() => {
                    router.push(item.href);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-4 px-6 py-5 rounded-2xl text-lg font-black transition-all ${
                    pathname === item.href 
                    ? "bg-teal-500 text-white shadow-2xl shadow-teal-500/20" 
                    : "bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  <item.icon className="w-6 h-6" />
                  {item.label}
                </button>
              ))}
              
              <div className="pt-8 space-y-4">
                 <button 
                   onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                   className="w-full flex items-center justify-between px-6 py-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)]"
                 >
                   <span className="font-black">מצב {theme === 'dark' ? 'יום' : 'לילה'}</span>
                   {theme === 'dark' ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
                 </button>
                 <button 
                   onClick={handleLogout}
                   className="w-full flex items-center gap-4 px-6 py-5 rounded-2xl bg-rose-500/5 border border-rose-500/10 text-rose-500 font-black"
                 >
                   <LogOut className="w-6 h-6" />
                   התנתקות
                 </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header - Desktop only */}
        <header className="hidden md:flex items-center justify-between h-20 px-10 border-b border-[var(--border)] bg-[var(--background)]/50 backdrop-blur-md sticky top-0 z-40">
          <div className="flex items-center gap-4">
             <h2 className="text-xl font-black">{navItems.find(i => i.href === pathname)?.label || "איזור אישי"}</h2>
             <div className="h-4 w-[1px] bg-[var(--border)]" />
             <p className="text-xs text-[var(--muted)] font-medium">שלום, {user?.displayName?.split(" ")[0]}</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1">
              <button 
                onClick={() => setTheme('light')}
                className={`p-1.5 rounded-lg transition-all ${theme === 'light' ? 'bg-[var(--background)] shadow-sm text-teal-500' : 'text-[var(--muted)]'}`}
              >
                <Sun className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setTheme('dark')}
                className={`p-1.5 rounded-lg transition-all ${theme === 'dark' ? 'bg-[var(--background)] shadow-sm text-teal-500' : 'text-[var(--muted)]'}`}
              >
                <Moon className="w-4 h-4" />
              </button>
            </div>
            <div className="h-6 w-[1px] bg-[var(--border)]" />
            <NotificationCenter />
          </div>
        </header>

        <div className="flex-1 p-4 md:p-10 max-w-7xl mx-auto w-full">
           {children}
        </div>
      </main>
    </div>
  );
}
