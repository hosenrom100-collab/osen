"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  Home, Folder, PlusCircle, Search, MoreHorizontal, 
  Calendar, FileText, ClipboardList, LogOut, Sun, Moon, 
  User, Shield, Settings, X, ChevronLeft, MessageSquare, ShoppingCart 
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

  // Dialog overlays state
  const [activeOverlay, setActiveOverlay] = useState<"actions" | "search" | "menu" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Scroll visibility logic
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Don't hide if menu overlays are open
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

  // Hide the navigation entirely on secondary/inner pages
  const isMainPage = pathname === "/" || pathname === "/portal";
  if (!isMainPage) return null;

  // Handle logout
  const handleLogout = async () => {
    setActiveOverlay(null);
    await logout();
    router.push("/portal/join");
  };

  // Main Nav Items configurations matching screenshot exactly
  const navItems = [
    {
      key: "home",
      label: "דף הבית",
      icon: Home,
      href: isParticipant ? "/portal" : "/",
      action: () => {
        setActiveOverlay(null);
        router.push(isParticipant ? "/portal" : "/");
      }
    },
    {
      key: "schedule",
      label: "נוכחות",
      icon: ClipboardList,
      href: isParticipant ? "/portal/schedule" : "/attendance",
      action: () => {
        setActiveOverlay(null);
        router.push(isParticipant ? "/portal/schedule" : "/attendance");
      }
    },
    {
      key: "all_actions",
      label: "כל הפעולות",
      icon: PlusCircle,
      href: "#all-actions",
      action: () => setActiveOverlay(activeOverlay === "actions" ? null : "actions")
    },
    {
      key: "search",
      label: "חיפוש",
      icon: Search,
      href: "#search",
      action: () => setActiveOverlay(activeOverlay === "search" ? null : "search")
    },
    {
      key: "menu",
      label: "תפריט",
      icon: MoreHorizontal,
      href: "#menu",
      action: () => setActiveOverlay(activeOverlay === "menu" ? null : "menu")
    }
  ];

  return (
    <>
      {/* Bottom Nav Bar */}
      <motion.div 
        initial={{ y: 0 }}
        animate={{ y: isVisible ? 0 : "100%" }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-[var(--surface)] border-t border-[var(--border)] shadow-[0_-4px_24px_rgba(0,85,212,0.06)]"
      >
        <nav className="flex items-center justify-around h-[70px] px-2" dir="rtl">
          {navItems.map((item) => {
            const isCurrentActive = 
              item.key === "home" && activeOverlay === null;

            const isOverlayActive = activeOverlay === item.key;
            const isActive = isCurrentActive || isOverlayActive;

            return (
              <button
                key={item.key}
                onClick={item.action}
                className="flex-1 flex flex-col items-center justify-center gap-1 h-full select-none cursor-pointer group active:scale-95 transition-transform"
              >
                <item.icon
                  className={`w-6 h-6 stroke-[2] transition-all duration-200 ${
                    isActive 
                      ? "text-[var(--primary)] fill-[var(--primary)]/10 scale-110" 
                      : "text-[var(--text-secondary)] group-hover:text-[var(--primary)]"
                  }`}
                />
                <span
                  className={`text-[11px] font-bold tracking-normal transition-colors duration-200 ${
                    isActive 
                      ? "text-[var(--primary)]" 
                      : "text-[var(--text-secondary)] group-hover:text-[var(--primary)]"
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
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[45] md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sliding Dialogs / Drawers */}
      <AnimatePresence>
        {/* All Actions Drawer */}
        {activeOverlay === "actions" && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed bottom-0 inset-x-0 bg-[var(--surface)] rounded-t-[2.5rem] z-50 p-6 shadow-2xl md:hidden text-right border-t border-[var(--border)]"
            dir="rtl"
          >
            <div className="w-12 h-1.5 bg-[var(--foreground)]/10 rounded-full mx-auto mb-6" />
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-extrabold text-[var(--foreground)]">כל הפעולות</h3>
              <button 
                onClick={() => setActiveOverlay(null)}
                className="p-1.5 rounded-full bg-[var(--foreground)]/5 text-[var(--foreground)]/60 hover:bg-[var(--foreground)]/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {(isParticipant
                ? [
                    { label: "לוח פעילויות", icon: Calendar, href: "/portal/schedule", desc: "סדר יום וסדנאות" },
                    { label: "הפקת מסמכים", icon: FileText, href: "/portal/docs", desc: "אישורים וטפסים" },
                    { label: "דיווח נוכחות", icon: ClipboardList, href: "/portal/attendance", desc: "היסטוריית הגעה" },
                    { label: "פרטי התקשרות", icon: User, href: "/profile", desc: "פרטים אישיים" },
                  ]
                : [
                    { label: "נוכחות משתתפים", icon: ClipboardList, href: "/attendance", desc: "יומן הגעה יומי" },
                    { label: "רשימת משתתפים", icon: User, href: "/patients", desc: "כרטיסי משתתף ומעקב" },
                    { label: "תיבת הודעות", icon: MessageSquare, href: "/admin/inbox", desc: "צ'אטים עם משתתפים" },
                    { label: "דוחות ונתונים", icon: FileText, href: "/reports", desc: "סיכומי פעילות חוסן" },
                  ]
              ).map((act, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setActiveOverlay(null);
                    router.push(act.href);
                  }}
                  className="flex flex-col items-start p-4 rounded-2xl bg-[var(--primary-faint)] border border-[var(--primary)]/5 hover:bg-[var(--primary-faint)]/80 transition-colors text-right"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--surface)] flex items-center justify-center text-[var(--primary)] mb-3 shadow-sm">
                    <act.icon className="w-5 h-5" />
                  </div>
                  <span className="font-extrabold text-sm text-[var(--foreground)]">{act.label}</span>
                  <span className="text-[10px] text-[var(--text-secondary)] mt-0.5">{act.desc}</span>
                </button>
              ))}
            </div>
            <div className="h-[env(safe-area-inset-bottom)]" />
          </motion.div>
        )}

        {/* Search Overlay Drawer */}
        {activeOverlay === "search" && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed bottom-0 inset-x-0 bg-[var(--surface)] rounded-t-[2.5rem] z-50 p-6 shadow-2xl md:hidden text-right border-t border-[var(--border)]"
            dir="rtl"
          >
            <div className="w-12 h-1.5 bg-[var(--foreground)]/10 rounded-full mx-auto mb-6" />
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-extrabold text-[var(--foreground)]">חיפוש מהיר</h3>
              <button 
                onClick={() => setActiveOverlay(null)}
                className="p-1.5 rounded-full bg-[var(--foreground)]/5 text-[var(--foreground)]/60 hover:bg-[var(--foreground)]/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative mb-6">
              <input 
                type="text" 
                placeholder="חפש פעילויות, מסמכים או עדכונים..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-12 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl px-11 text-right text-sm font-medium focus:bg-[var(--surface)] focus:border-[var(--primary)] outline-none transition-all text-[var(--foreground)]"
                autoFocus
              />
              <Search className="w-5 h-5 text-[var(--text-secondary)] absolute right-4 top-3.5" />
            </div>

            <div className="space-y-3 mb-6 max-h-[160px] overflow-y-auto">
              {searchQuery.trim() === "" ? (
                <div className="text-center py-6 text-xs text-[var(--text-secondary)]">
                  הקלד מילת מפתח לחיפוש מהיר במערכת חוסן
                </div>
              ) : (
                <div className="space-y-2">
                  {(isParticipant
                    ? [
                        { title: "לוח סדנאות ופעילויות", category: "פעילויות", href: "/portal/schedule" },
                        { title: "טופס אישור השתתפות", category: "מסמכים", href: "/portal/docs" },
                        { title: "צפייה בדוח נוכחות חודשי", category: "נוכחות", href: "/portal/attendance" }
                      ]
                    : [
                        { title: "נוכחות ורישום משתתפים", category: "נוכחות", href: "/attendance" },
                        { title: "כרטיסי משתתפים ומעקב", category: "משתתפים", href: "/patients" },
                        { title: "דוחות וסטטיסטיקה", category: "דוחות", href: "/reports" },
                        { title: "רכש וקניות קבוצתיות", category: "קניות", href: "/shopping" },
                        { title: "לוח שנה ושיבוצים", category: "לוח שנה", href: "/calendar" }
                      ]
                  )
                    .filter(item => item.title.includes(searchQuery))
                    .map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setActiveOverlay(null);
                          router.push(item.href);
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[var(--foreground)]/5 transition-colors text-right"
                      >
                        <span className="text-xs text-[var(--primary)] bg-[var(--primary-faint)] px-2 py-0.5 rounded-md font-bold">{item.category}</span>
                        <span className="text-sm font-bold text-[var(--foreground)]">{item.title}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div className="h-[env(safe-area-inset-bottom)]" />
          </motion.div>
        )}

        {/* Triple Dot Main Menu Drawer */}
        {activeOverlay === "menu" && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed bottom-0 inset-x-0 bg-[var(--surface)] rounded-t-[2.5rem] z-50 p-6 shadow-2xl md:hidden text-right border-t border-[var(--border)]"
            dir="rtl"
          >
            <div className="w-12 h-1.5 bg-[var(--foreground)]/10 rounded-full mx-auto mb-6" />
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-extrabold text-[var(--foreground)]">תפריט אפשרויות</h3>
                {user && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{user.displayName || "משתמש מערכת"}</p>}
              </div>
              <button 
                onClick={() => setActiveOverlay(null)}
                className="p-1.5 rounded-full bg-[var(--foreground)]/5 text-[var(--foreground)]/60 hover:bg-[var(--foreground)]/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 mb-6">
              <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] transition-colors text-right"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--surface)] flex items-center justify-center text-[var(--primary)] shadow-sm">
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </div>
                  <span className="font-extrabold text-sm text-[var(--foreground)]">מצב תצוגה</span>
                </div>
                <span className="text-xs text-[var(--text-secondary)] font-medium">{theme === 'dark' ? "בהיר" : "כהה"}</span>
              </button>

               <button 
                onClick={() => {
                  setActiveOverlay(null);
                  router.push("/profile");
                }}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] transition-colors text-right"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--surface)] flex items-center justify-center text-[var(--primary)] shadow-sm">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="font-extrabold text-sm text-[var(--foreground)]">איזור אישי</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>

              {!isParticipant && (
                <button 
                  onClick={() => {
                    setActiveOverlay(null);
                    router.push("/admin");
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 border border-[var(--border)] transition-colors text-right"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--surface)] flex items-center justify-center text-[var(--primary)] shadow-sm">
                      <Shield className="w-4 h-4" />
                    </div>
                    <span className="font-extrabold text-sm text-[var(--foreground)]">ממשק ניהול ובקרה</span>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>
              )}

              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors text-rose-600 text-right font-extrabold"
              >
                <div className="w-9 h-9 rounded-xl bg-[var(--surface)] flex items-center justify-center text-rose-500 shadow-sm border border-rose-500/10">
                  <LogOut className="w-4 h-4" />
                </div>
                <span>התנתקות מהמערכת</span>
              </button>
            </div>
            <div className="h-[env(safe-area-inset-bottom)]" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
