"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  Home, Calendar, ClipboardList, FileText, MoreHorizontal, 
  User, MessageSquare, LogOut, Sun, Moon, Shield, X, ChevronLeft,
  ShoppingCart, HelpCircle, Utensils, ShoppingBag
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase/config";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user, role, roles, isAdmin, isManager, isLogistics } = useAuth();
  const { theme, setTheme } = useSettings();

  // Store requests pending count
  const [pendingStoreCount, setPendingStoreCount] = useState(0);
  const canApproveStoreRequests = isAdmin || isManager || isLogistics;

  useEffect(() => {
    if (!canApproveStoreRequests) return;
    const q = query(
      collection(db, "storeAuthorizationRequests"),
      where("status", "==", "pending")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingStoreCount(snapshot.size);
    }, (err) => console.error(err));
    return () => unsubscribe();
  }, [canApproveStoreRequests]);

  // Dialog overlay state
  const [activeOverlay, setActiveOverlay] = useState<"menu" | null>(null);

  // Scroll visibility logic
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      let currentScrollY = 0;

      // Handle document/window scrolling
      if (e.target === document || e.target === window) {
        currentScrollY = window.scrollY || document.documentElement.scrollTop;
      } else {
        // Handle nested container scrolling
        const target = e.target as HTMLElement;
        if (!target || target.scrollTop === undefined || target.clientHeight === 0) return;
        // Ignore scrolling inside small elements (e.g. dropdowns or small modals)
        if (target.clientHeight < 300) return;
        currentScrollY = target.scrollTop;
      }

      // Ignore very small scrolls
      if (Math.abs(currentScrollY - lastScrollY.current) < 10) return;
      
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    // Use capture phase to catch scroll events from any overflow-y-auto child
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, []);

  // If not logged in, or on public/onboarding pages, do not show BottomNav
  if (!user || pathname === "/login") return null;

  // Handle logout
  const handleLogout = async () => {
    setActiveOverlay(null);
    await logout();
    router.push("/login");
  };

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
      key: "shopping",
      label: "רכש",
      icon: ShoppingCart,
      href: "/shopping",
      isActive: pathname.startsWith("/shopping")
    },
    ...(role !== "instructor" ? [{
      key: "patients",
      label: "משתתפים",
      icon: User,
      href: "/patients",
      isActive: pathname.startsWith("/patients")
    }] : []),
    {
      key: "menu",
      label: "תפריט",
      icon: MoreHorizontal,
      href: "#menu",
      isActive: activeOverlay === "menu",
      badge: pendingStoreCount
    }
  ];

  const items = staffItems;

  const go = (href: string) => {
    setActiveOverlay(null);
    router.push(href);
  };

  // Drawer rows: list with styled icon badges and pending counts
  const menuRows = [
    { 
      key: "profile", 
      label: "איזור אישי", 
      icon: User, 
      onClick: () => go("/profile"), 
      show: true,
      iconColor: "text-[var(--primary)]",
      iconBg: "bg-[var(--accent-soft)]"
    },
    { 
      key: "shopping", 
      label: "רכש", 
      icon: ShoppingCart, 
      onClick: () => go("/shopping"), 
      show: true,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      iconBg: "bg-emerald-500/10"
    },
    { 
      key: "catering", 
      label: "הזמנת קייטרינג", 
      icon: Utensils, 
      onClick: () => go("/admin/catering"), 
      show: !!(isAdmin || isLogistics),
      iconColor: "text-amber-600 dark:text-amber-400",
      iconBg: "bg-amber-500/10"
    },
    { 
      key: "store", 
      label: "אישור קניות אד הוק", 
      icon: ShoppingBag, 
      onClick: () => go("/admin/store-requests"), 
      badge: pendingStoreCount, 
      show: canApproveStoreRequests,
      iconColor: "text-blue-600 dark:text-blue-400",
      iconBg: "bg-blue-500/10"
    },
    { 
      key: "admin", 
      label: "ממשק ניהול ובקרה", 
      icon: Shield, 
      onClick: () => go("/admin"), 
      show: !!(isManager || isLogistics || role === "social_worker" || roles?.includes("social_worker")),
      iconColor: "text-purple-600 dark:text-purple-400",
      iconBg: "bg-purple-500/10"
    },
    {
      key: "help", 
      label: "מדריך עזרה", 
      icon: HelpCircle, 
      show: true,
      iconColor: "text-teal-600 dark:text-teal-400",
      iconBg: "bg-teal-500/10",
      onClick: () => {
        setActiveOverlay(null);
        setTimeout(() => window.dispatchEvent(new CustomEvent("open-help-drawer")), 200);
      },
    },
  ];

  return (
    <>
      {/* Bottom Nav Bar */}
      <div
        className={`fixed bottom-0 inset-x-0 z-50 md:hidden bg-white/90 dark:bg-[#0b1120]/90 backdrop-blur-xl border-t border-slate-200/80 dark:border-white/10 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.45)] transition-transform duration-300 ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <nav className="flex items-center justify-around h-16 px-3" dir="rtl">
          {items.map((item) => {
            const isActive = item.isActive;
            return (
              <button
                key={item.key}
                onClick={() => {
                  if (item.key === "menu") {
                    setActiveOverlay(activeOverlay === "menu" ? null : "menu");
                  } else {
                    go(item.href);
                  }
                }}
                aria-current={isActive ? "page" : undefined}
                className="relative flex-1 flex flex-col items-center justify-center h-full select-none cursor-pointer active:scale-95 transition-transform group py-1"
              >
                <div className="relative flex flex-col items-center justify-center">
                  {isActive && (
                    <motion.div
                      layoutId="bottomNavActivePill"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      className="absolute -inset-x-3 -inset-y-1 bg-[var(--accent-soft)] dark:bg-[var(--accent-soft)] rounded-2xl border border-[var(--accent-line)]/50 shadow-sm"
                    />
                  )}
                  <div className="relative z-10 flex flex-col items-center gap-0.5">
                    <item.icon
                      className={`w-5 h-5 transition-all duration-200 ${
                        isActive
                          ? "text-[var(--primary)] scale-105"
                          : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                      }`}
                      strokeWidth={isActive ? 2.4 : 1.8}
                    />
                    <span
                      className={`text-[11px] font-bold tracking-tight transition-colors duration-200 ${
                        isActive
                          ? "text-[var(--primary)]"
                          : "text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200"
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>

                  {/* Badge */}
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1 -right-2 z-20 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-[#0b1120] tabular-nums shadow-sm">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </nav>
        {/* Safe Area Inset for modern mobile devices */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>

      {/* Overlays Backdrop */}
      <AnimatePresence>
        {activeOverlay !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveOverlay(null)}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-[45] md:hidden"
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
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-2xl rounded-t-3xl z-50 px-5 pt-3.5 pb-3 shadow-[0_-12px_40px_rgba(0,0,0,0.25)] border-t border-slate-200/80 dark:border-white/10 md:hidden text-right"
            dir="rtl"
          >
            {/* Grabber Bar */}
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />

            {/* Header User Card */}
            <div className="flex items-center justify-between pb-3.5 mb-2 border-b border-slate-200/70 dark:border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--primary-faint)] border border-[var(--accent-line)]/40 flex items-center justify-center text-[var(--primary)] font-bold text-sm shadow-xs">
                  {(user?.displayName || user?.email || "ח").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">{user?.displayName || "משתמש חוסן"}</h3>
                  <p className="text-[11px] text-[var(--text-muted)] font-medium">תפריט פעולות וניווט</p>
                </div>
              </div>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label={theme === "dark" ? "מצב בהיר" : "מצב כהה"}
                className="p-2.5 rounded-xl text-[var(--text-secondary)] bg-slate-100 dark:bg-slate-800/80 hover:bg-[var(--accent-soft)] transition-colors border border-slate-200/60 dark:border-white/5"
              >
                {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
              </button>
            </div>

            {/* Menu List */}
            <div className="space-y-1">
              {menuRows.filter(r => r.show).map(({ key, label, icon: Icon, onClick, badge, iconColor, iconBg }) => (
                <button
                  key={key}
                  onClick={onClick}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/50 active:bg-[var(--accent-soft)] transition-all group"
                >
                  <div className={`w-8 h-8 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center shrink-0 transition-transform group-hover:scale-105`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="flex-1 text-sm font-semibold text-[var(--foreground)]">{label}</span>
                  {!!badge && badge > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center tabular-nums shadow-xs">
                      {badge}
                    </span>
                  )}
                  <ChevronLeft className="w-4 h-4 text-slate-400 dark:text-slate-600 group-hover:translate-x-[-2px] transition-transform" />
                </button>
              ))}
            </div>

            {/* Logout Button */}
            <div className="pt-2 mt-2 border-t border-slate-200/70 dark:border-white/[0.08]">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <LogOut className="w-4 h-4" />
                </div>
                <span>התנתקות</span>
              </button>
            </div>

            <div className="h-[env(safe-area-inset-bottom)]" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
