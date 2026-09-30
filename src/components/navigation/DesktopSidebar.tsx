"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, ClipboardList, Users, ShoppingCart, 
  Settings, Clock, MessageSquare, Calendar,
  Sun, Moon, HelpCircle, Utensils, ShoppingBag, ChevronsLeft, ChevronsRight
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { db } from "@/lib/firebase/config";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { motion } from "framer-motion";

const NAV = [
  { href: "/",           icon: Home,          label: "בית",           color: "text-indigo-400" },
  { href: "/schedule",   icon: Calendar,      label: "יומן שבועי",    color: "text-indigo-400" },
  { href: "/attendance", icon: ClipboardList, label: "נוכחות",        color: "text-emerald-400" },
  { href: "/patients",   icon: Users,         label: "משתתפים",       color: "text-sky-400" },
  { href: "/shopping",   icon: ShoppingCart,  label: "קניות",         color: "text-indigo-400" },
];

const ROLE_HE: Record<string, string> = {
  admin:         "אדמין",
  manager:       "מנהלת חוסן",
  instructor:    "מדריך",
  social_worker: 'עו"ס',
  employee:      "עובד",
  logistics:     "לוגיסטיקה",
};

export function DesktopSidebar() {
  const pathname = usePathname();
  const { user, roles, role, isAdmin, isManager, isLogistics, photoURL } = useAuth();
  const { theme, setTheme } = useSettings();

  const [pendingStoreCount, setPendingStoreCount] = useState(0);

  // A saved choice wins; otherwise the sidebar folds away on the wide schedule page.
  const [saved, setSaved] = useState<boolean | null>(null);
  useEffect(() => {
    try { const v = localStorage.getItem("sidebar.collapsed"); setSaved(v === null ? null : v === "1"); } catch { /* ignore */ }
  }, []);
  const collapsed = saved ?? pathname.startsWith("/schedule");
  const toggle = () => {
    setSaved(!collapsed);
    try { localStorage.setItem("sidebar.collapsed", collapsed ? "0" : "1"); } catch { /* ignore */ }
  };

  const canApproveStoreRequests = isAdmin || isManager || isLogistics;

  useEffect(() => {
    if (!canApproveStoreRequests) return;

    const q = query(
      collection(db, "storeAuthorizationRequests"),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setPendingStoreCount(snapshot.size);
      },
      (error) => {
        console.error("Error subscribing to store requests:", error);
      }
    );

    return () => unsubscribe();
  }, [canApproveStoreRequests]);

  const visibleAdminNav = [
    { href: "/admin",                 icon: Settings,      label: "ניהול",        color: "text-slate-400" },
    ...(canApproveStoreRequests ? [{
      href: "/admin/store-requests",
      icon: ShoppingBag,
      label: "אישור קניות אד הוק",
      color: "text-blue-400",
      badge: pendingStoreCount
    }] : []),
    ...((isAdmin || isLogistics) ? [{ href: "/admin/catering", icon: Utensils, label: "הזמנת קייטרינג", color: "text-amber-400" }] : [])
  ];

  if (pathname === "/login") return null;

  const initials = (user?.displayName || user?.email || "?").charAt(0).toUpperCase();
  const displayRole = role || roles[0] || "";

  return (
    <aside className={`hidden md:flex ${collapsed ? "w-[72px]" : "w-64"} shrink-0 h-screen sticky top-0 flex-col bg-[var(--sidebar-bg)] border-l border-[var(--border)] z-20 transition-[width] duration-200`}>

      {/* App Brand */}
      <div className={`flex items-center gap-3 h-20 shrink-0 border-b border-[var(--border-subtle)] ${collapsed ? "justify-center px-0" : "px-6"}`}>
        <div className="w-9 h-9 bg-[var(--accent)] text-white rounded-lg flex items-center justify-center">
          <span className="font-bold text-base italic">H</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-base font-bold text-[var(--foreground)] tracking-tight leading-none">חוסן קונקט</span>
            <span className="text-[11px] text-[var(--foreground)]/40 font-bold uppercase tracking-wider mt-1">Hosen Connect</span>
          </div>
        )}
        {!collapsed && (
          <button onClick={toggle} title="כיווץ סרגל הצד" aria-label="כיווץ סרגל הצד" className="mr-auto p-1.5 rounded-lg text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/5 hover:text-[var(--foreground)]">
            <ChevronsRight className="w-4 h-4" />
          </button>
        )}
      </div>
      {collapsed && (
        <button onClick={toggle} title="הרחבת סרגל הצד" aria-label="הרחבת סרגל הצד" className="mx-auto mt-3 p-1.5 rounded-lg text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/5 hover:text-[var(--foreground)]">
          <ChevronsLeft className="w-4 h-4" />
        </button>
      )}

      {/* Main Navigation */}
      <nav className={`flex-1 overflow-y-auto py-6 space-y-8 no-scrollbar ${collapsed ? "px-2" : "px-3"}`}>
        
        {/* Workspace Section */}
        <div>
          {!collapsed && <p className="text-xs font-bold text-[var(--foreground)]/40 px-4 mb-3">מרחב עבודה</p>}
          <div className="space-y-1">
            {NAV.filter(item => !(item.href === "/patients" && role === "instructor")).map(({ href, icon: Icon, label }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link key={href} href={href} title={collapsed ? label : undefined}
                  className={`flex items-center gap-3 ${collapsed ? "justify-center px-0" : "px-4"} py-2.5 rounded-lg text-sm font-bold transition-colors duration-150 group relative ${
                    active
                      ? "bg-[var(--primary-faint)] text-[var(--primary)]"
                      : "text-[var(--foreground)]/50 hover:text-[var(--primary)] hover:bg-[var(--foreground)]/5"
                  }`}>
                  <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? "text-[var(--primary)]" : "text-[var(--foreground)]/30 group-hover:text-[var(--primary)]/60"}`} />
                  {!collapsed && <span>{label}</span>}
                  {active && (
                    <motion.div 
                      layoutId="sidebar-active"
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[var(--primary)] rounded-full"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
        
        {/* Administration Section */}
        {(isManager || isLogistics || role === "social_worker" || roles?.includes("social_worker")) && (
          <div>
            {!collapsed && <p className="text-xs font-bold text-[var(--foreground)]/40 px-4 mb-3">ניהול ובקרה</p>}
            <div className="space-y-1">
              {visibleAdminNav.map(({ href, icon: Icon, label, badge }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link key={href} href={href} title={collapsed ? label : undefined}
                    className={`flex items-center gap-3 ${collapsed ? "justify-center px-0" : "px-4"} py-2.5 rounded-lg text-sm font-bold transition-colors duration-150 group relative ${
                      active
                        ? "bg-[var(--primary-faint)] text-[var(--primary)]"
                        : "text-[var(--foreground)]/50 hover:text-[var(--primary)] hover:bg-[var(--foreground)]/5"
                    }`}>
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? "text-[var(--primary)]" : "text-[var(--foreground)]/30 group-hover:text-[var(--primary)]/60"}`} />
                    {!collapsed && <span>{label}</span>}
                    {badge !== undefined && badge > 0 && (
                      <span className={`${collapsed ? "absolute top-0.5 left-1" : "mr-auto"} px-2 py-0.5 text-[11px] font-bold text-white bg-red-500 rounded-full shadow-sm`}>
                        {badge}
                      </span>
                    )}
                    {active && (
                      <motion.div 
                        layoutId="sidebar-active-admin"
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[var(--primary)] rounded-full"
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* User & Settings Footer */}
      <div className={`mt-auto border-t border-[var(--border-subtle)] ${collapsed ? "p-2" : "p-4"}`}>
        <Link href="/profile" title={collapsed ? "פרופיל" : undefined}
          className={`flex items-center ${collapsed ? "justify-center p-2" : "gap-3 p-3"} rounded-2xl hover:bg-[var(--foreground)]/5 transition-all group`}>
          <div className="relative shrink-0">
            {photoURL ? (
              <img 
                src={photoURL} 
                alt={user?.displayName || "Profile"} 
                className="w-10 h-10 rounded-2xl object-cover border border-[var(--border-subtle)] shadow-sm"
              />
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-[var(--foreground)]/5 border border-[var(--border-subtle)] flex items-center justify-center text-sm font-bold text-[var(--foreground)]/40">
                {initials}
              </div>
            )}
          </div>
          {!collapsed && <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[var(--foreground)] truncate leading-none mb-1">
              {user?.displayName || user?.email?.split('@')[0]}
            </p>
            <p className="text-[11px] text-[var(--foreground)]/45 font-semibold">
              {ROLE_HE[displayRole] || displayRole}
            </p>
          </div>}
          {!collapsed && <Settings className="w-4 h-4 text-[var(--foreground)]/20 group-hover:text-[var(--foreground)]/60 transition-colors" />}
        </Link>
        <div className={`mt-2 flex items-center justify-between gap-2 ${collapsed ? "flex-col" : ""}`}>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex-1 w-full py-2 px-3 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--foreground)]/60 hover:text-[var(--foreground)] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 text-xs font-bold"
            title={theme === 'dark' ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
            {!collapsed && <span>{theme === 'dark' ? "בהיר" : "כהה"}</span>}
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-help-drawer"))}
            className="flex-1 w-full py-2 px-3 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 text-[var(--foreground)]/60 hover:text-[var(--foreground)] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 text-xs font-bold"
            title="מדריך עזרה"
          >
            <HelpCircle className="w-4 h-4 text-indigo-500" />
            {!collapsed && <span>עזרה</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
