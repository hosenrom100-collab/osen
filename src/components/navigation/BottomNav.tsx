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
      isActive: activeOverlay === "menu"
    }
  ];

  const items = staffItems;

  const go = (href: string) => {
    setActiveOverlay(null);
    router.push(href);
  };

  // Drawer rows: plain list, one neutral icon style. Only the pending badge carries colour.
  const menuRows: { key: string; label: string; icon: typeof Home; onClick: () => void; badge?: number; show: boolean }[] = [
    { key: "profile", label: "איזור אישי", icon: User, onClick: () => go("/profile"), show: true },
    { key: "shopping", label: "רכש", icon: ShoppingCart, onClick: () => go("/shopping"), show: true },
    { key: "catering", label: "הזמנת קייטרינג", icon: Utensils, onClick: () => go("/admin/catering"), show: !!(isAdmin || isLogistics) },
    { key: "store", label: "אישור קניות אד הוק", icon: ShoppingBag, onClick: () => go("/admin/store-requests"), badge: pendingStoreCount, show: canApproveStoreRequests },
    { key: "admin", label: "ממשק ניהול ובקרה", icon: Shield, onClick: () => go("/admin"), show: !!(isManager || isLogistics || role === "social_worker" || roles?.includes("social_worker")) },
    {
      key: "help", label: "מדריך עזרה", icon: HelpCircle, show: true,
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
        className={`fixed bottom-0 inset-x-0 z-50 md:hidden bg-[var(--surface)] border-t border-[var(--border)] transition-transform duration-300 ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <nav className="flex items-center justify-around h-16 px-2" dir="rtl">
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
                className="relative flex-1 flex flex-col items-center justify-center gap-1 h-full select-none cursor-pointer active:scale-95 transition-transform"
              >
                {isActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--accent)]" />}
                <item.icon className={`w-5 h-5 ${isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`} strokeWidth={isActive ? 2.25 : 1.75} />
                <span className={`text-[11px] font-semibold ${isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
        {/* Safe Area Inset for modern mobile devices */}
        <div className="h-[env(safe-area-inset-bottom)] bg-[var(--surface)]" />
      </div>

      {/* Overlays Backdrop */}
      <AnimatePresence>
        {activeOverlay !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveOverlay(null)}
            className="fixed inset-0 bg-slate-900/40 z-[45] md:hidden"
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
            className="fixed bottom-0 inset-x-0 bg-[var(--surface)] rounded-t-2xl z-50 px-5 pt-3 pb-2 shadow-2xl md:hidden text-right"
            dir="rtl"
          >
            <div className="w-10 h-1 bg-[var(--border-strong)] rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between pb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)]">{user?.displayName || "משתמש חוסן"}</h3>
                <p className="text-[11px] text-[var(--text-muted)]">תפריט</p>
              </div>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label={theme === "dark" ? "מצב בהיר" : "מצב כהה"}
                className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] transition-colors"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>

            <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {menuRows.filter(r => r.show).map(({ key, label, icon: Icon, onClick, badge }) => (
                <button key={key} onClick={onClick}
                  className="w-full flex items-center gap-3 py-3.5 text-right cursor-pointer active:bg-[var(--accent-soft)] transition-colors">
                  <Icon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                  <span className="flex-1 text-sm font-medium text-[var(--foreground)]">{label}</span>
                  {!!badge && badge > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center tabular-nums">{badge}</span>
                  )}
                  <ChevronLeft className="w-4 h-4 text-[var(--text-muted)]" />
                </button>
              ))}
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 py-3.5 text-right text-sm font-medium text-rose-600 cursor-pointer"
            >
              <LogOut className="w-[18px] h-[18px]" />
              התנתקות
            </button>
            <div className="h-[env(safe-area-inset-bottom)]" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
