"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  Home, Calendar, ClipboardList, FileText, MoreHorizontal, 
  User, MessageSquare, LogOut, Sun, Moon, Shield, X, ChevronLeft 
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isParticipant, logout, user } = useAuth();
  const { theme, setTheme } = useSettings();

  // Dialog overlay state
  const [activeOverlay, setActiveOverlay] = useState<"menu" | null>(null);

  // Scroll visibility logic
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Don't hide if menu overlay is open
      if (activeOverlay !== null) {
        setIsVisible(true);
        return;
      }

      // Hide menu when scrolling down, show when scrolling up
      if (currentScrollY > lastScrollY.current && currentScrollY > 40) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeOverlay]);

  // If not logged in, or on public/onboarding pages, do not show BottomNav
  if (!user || pathname === "/portal/join" || pathname === "/login") return null;

  // Handle logout
  const handleLogout = async () => {
    setActiveOverlay(null);
    await logout();
    router.push("/portal/join");
  };

  // Participant Navigation Items
  const participantItems = [
    {
      key: "home",
      label: "דף הבית",
      icon: Home,
      href: "/portal",
      isActive: pathname === "/portal"
    },
    {
      key: "schedule",
      label: "פעילויות",
      icon: Calendar,
      href: "/portal/schedule",
      isActive: pathname === "/portal/schedule"
    },
    {
      key: "attendance",
      label: "נוכחות",
      icon: ClipboardList,
      href: "/portal/attendance",
      isActive: pathname === "/portal/attendance"
    },
    {
      key: "docs",
      label: "מסמכים",
      icon: FileText,
      href: "/portal/docs",
      isActive: pathname === "/portal/docs"
    },
    {
      key: "menu",
      label: "תפריט",
      icon: MoreHorizontal,
      href: "#menu",
      isActive: activeOverlay === "menu"
    }
  ];

  // Staff / Admin Navigation Items
  const staffItems = [
    {
      key: "home",
      label: "לוח בקרה",
      icon: Home,
      href: "/",
      isActive: pathname === "/"
    },
    {
      key: "attendance",
      label: "נוכחות",
      icon: ClipboardList,
      href: "/attendance",
      isActive: pathname === "/attendance" || pathname.startsWith("/admin/patient-attendance")
    },
    {
      key: "patients",
      label: "משתתפים",
      icon: User,
      href: "/patients",
      isActive: pathname.startsWith("/patients")
    },
    {
      key: "inbox",
      label: "הודעות",
      icon: MessageSquare,
      href: "/admin/inbox",
      isActive: pathname.startsWith("/admin/inbox")
    },
    {
      key: "menu",
      label: "תפריט",
      icon: MoreHorizontal,
      href: "#menu",
      isActive: activeOverlay === "menu"
    }
  ];

  const items = isParticipant ? participantItems : staffItems;

  return (
    <>
      {/* Bottom Nav Bar */}
      <motion.div 
        initial={{ y: 0 }}
        animate={{ y: isVisible ? 0 : "100%" }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-[var(--surface)] border-t border-[var(--border)] shadow-[0_-4px_24px_rgba(0,85,212,0.05)]"
      >
        <nav className="flex items-center justify-around h-[68px] px-2" dir="rtl">
          {items.map((item) => {
            const isActive = item.isActive;
            return (
              <button
                key={item.key}
                onClick={() => {
                  if (item.key === "menu") {
                    setActiveOverlay(activeOverlay === "menu" ? null : "menu");
                  } else {
                    setActiveOverlay(null);
                    router.push(item.href);
                  }
                }}
                className="flex-1 flex flex-col items-center justify-center gap-1.5 h-full select-none cursor-pointer group active:scale-95 transition-transform"
              >
                <item.icon
                  className={`w-5.5 h-5.5 stroke-[2.2] transition-all duration-200 ${
                    isActive 
                      ? "text-teal-500 fill-teal-500/10 scale-105" 
                      : "text-[var(--text-secondary)] group-hover:text-teal-500"
                  }`}
                />
                <span
                  className={`text-[10px] font-black transition-colors duration-200 ${
                    isActive 
                      ? "text-teal-500" 
                      : "text-[var(--text-secondary)] group-hover:text-teal-500"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
        {/* Safe Area Inset for modern mobile devices */}
        <div className="h-[env(safe-area-inset-bottom)] bg-[var(--surface)]" />
      </motion.div>

      {/* Overlays Backdrop */}
      <AnimatePresence>
        {activeOverlay !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveOverlay(null)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[45] md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sliding Drawer Menu */}
      <AnimatePresence>
        {activeOverlay === "menu" && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 240 }}
            className="fixed bottom-0 inset-x-0 bg-[var(--surface)] rounded-t-[2.5rem] z-50 p-6 shadow-2xl md:hidden text-right border-t border-[var(--border)]"
            dir="rtl"
          >
            <div className="w-12 h-1.5 bg-[var(--foreground)]/10 rounded-full mx-auto mb-6" />
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-black text-[var(--foreground)]">תפריט אפשרויות</h3>
                {user && (
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-medium">
                    שלום, {user.displayName || "משתמש חוסן"}
                  </p>
                )}
              </div>
              <button 
                onClick={() => setActiveOverlay(null)}
                className="p-2 rounded-full bg-[var(--foreground)]/5 text-[var(--foreground)]/60 hover:bg-[var(--foreground)]/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              {/* Theme Toggle Button */}
              <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] transition-all text-right cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-teal-500 shadow-sm">
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </div>
                  <span className="font-black text-xs text-[var(--foreground)]">מצב תצוגה</span>
                </div>
                <span className="text-[10px] text-teal-500 font-black">{theme === 'dark' ? "מצב בהיר" : "מצב כהה"}</span>
              </button>

              {/* Personal Profile Button */}
              <button 
                onClick={() => {
                  setActiveOverlay(null);
                  router.push("/profile");
                }}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] transition-all text-right cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-teal-500 shadow-sm">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="font-black text-xs text-[var(--foreground)]">איזור אישי</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>

              {/* Administrative Console Button (Only for Staff/Admin) */}
              {!isParticipant && (
                <button 
                  onClick={() => {
                    setActiveOverlay(null);
                    router.push("/admin");
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] transition-all text-right cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-teal-500 shadow-sm">
                      <Shield className="w-4 h-4" />
                    </div>
                    <span className="font-black text-xs text-[var(--foreground)]">ממשק ניהול ובקרה</span>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>
              )}

              {/* Logout Button */}
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/15 transition-all text-rose-500 text-right font-black cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-rose-500/10 flex items-center justify-center text-rose-500 shadow-sm">
                  <LogOut className="w-4 h-4" />
                </div>
                <span className="text-xs">התנתקות מהמערכת</span>
              </button>
            </div>
            <div className="h-[env(safe-area-inset-bottom)]" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
