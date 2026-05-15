"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, ClipboardList, Users, ShoppingCart, 
  BarChart3, Settings, Clock, MessageSquare, Calendar
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import { NotificationCenter } from "../notifications/NotificationCenter";

const NAV = [
  { href: "/",           icon: Home,          label: "בית",           color: "text-indigo-400" },
  { href: "/attendance", icon: ClipboardList, label: "נוכחות",        color: "text-emerald-400" },
  { href: "/patients",   icon: Users,         label: "מטופלים",       color: "text-sky-400" },
  { href: "/shopping",   icon: ShoppingCart,  label: "קניות",         color: "text-orange-400" },
  { href: "/reports",    icon: BarChart3,     label: "דוחות",         color: "text-rose-400" },
  { href: "/calendar",   icon: ClipboardList, label: "לוח שנה",       color: "text-violet-400" },
];

const ADMIN_NAV = [
  { href: "/admin",                 icon: Settings,      label: "ניהול",        color: "text-slate-400" },
  { href: "/admin/staff-attendance", icon: Clock,         label: "נוכחות צוות",   color: "text-amber-400" },
  { href: "/admin/notifications",    icon: MessageSquare, label: "הודעות",        color: "text-pink-400" },
  { href: "/admin/schedule",        icon: Calendar,      label: "עריכת לו״ז",    color: "text-cyan-400" },
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
  const { user, roles, role, isManager, photoURL, isParticipant } = useAuth();

  if (pathname === "/login" || pathname.startsWith("/portal") || isParticipant) return null;

  const initials = (user?.displayName || user?.email || "?").charAt(0).toUpperCase();
  const displayRole = role || roles[0] || "";

  return (
    <aside className="hidden md:flex w-64 shrink-0 h-screen sticky top-0 flex-col bg-[var(--sidebar-bg)] border-l border-[var(--border)] z-20 overflow-hidden">

      {/* App Brand */}
      <div className="flex items-center gap-3 px-6 h-20 shrink-0 border-b border-[var(--border-subtle)]">
        <div className="w-9 h-9 bg-[var(--foreground)] text-[var(--background)] rounded-xl flex items-center justify-center">
          <span className="font-black text-base italic">H</span>
        </div>
        <div className="flex flex-col">
          <span className="text-base font-black text-[var(--foreground)] tracking-tight leading-none">חוסן קונקט</span>
          <span className="text-[9px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest mt-1">Hosen Connect</span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-8 no-scrollbar">
        
        {/* Workspace Section */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/30 px-4 mb-4">מרחב עבודה</p>
          <div className="space-y-1">
            {NAV.map(({ href, icon: Icon, label, color }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link key={href} href={href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 group relative ${
                    active
                      ? "bg-[var(--foreground)]/10 text-[var(--foreground)]"
                      : "text-[var(--foreground)]/40 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5"
                  }`}>
                  <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? color : "text-[var(--foreground)]/30 group-hover:text-[var(--foreground)]/60"}`} />
                  <span>{label}</span>
                  {active && (
                    <motion.div 
                      layoutId="sidebar-active"
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[var(--foreground)] rounded-full"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Administration Section */}
        {isManager && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/30 px-4 mb-4">ניהול ובקרה</p>
            <div className="space-y-1">
              {ADMIN_NAV.map(({ href, icon: Icon, label, color }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link key={href} href={href}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 group relative ${
                      active
                        ? "bg-[var(--foreground)]/10 text-[var(--foreground)]"
                        : "text-[var(--foreground)]/40 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5"
                    }`}>
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? color : "text-[var(--foreground)]/30 group-hover:text-[var(--foreground)]/60"}`} />
                    <span>{label}</span>
                    {active && (
                      <motion.div 
                        layoutId="sidebar-active-admin"
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[var(--foreground)] rounded-full"
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
      <div className="mt-auto border-t border-[var(--border-subtle)] p-4">
        <Link href="/profile"
          className="flex items-center gap-3 p-3 rounded-2xl hover:bg-[var(--foreground)]/5 transition-all group">
          <div className="relative shrink-0">
            {photoURL ? (
              <img 
                src={photoURL} 
                alt={user?.displayName || "Profile"} 
                className="w-10 h-10 rounded-2xl object-cover border border-[var(--border-subtle)] shadow-sm"
              />
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-[var(--foreground)]/5 border border-[var(--border-subtle)] flex items-center justify-center text-sm font-black text-[var(--foreground)]/40">
                {initials}
              </div>
            )}
            <div className="absolute -bottom-0.5 -left-0.5 w-3 h-3 bg-emerald-500 border-2 border-[var(--sidebar-bg)] rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-[var(--foreground)] truncate leading-none mb-1">
              {user?.displayName || user?.email?.split('@')[0]}
            </p>
            <p className="text-[9px] text-[var(--foreground)]/40 font-black uppercase tracking-[0.05em]">
              {ROLE_HE[displayRole] || displayRole}
            </p>
          </div>
          <NotificationCenter />
          <Settings className="w-4 h-4 text-[var(--foreground)]/20 group-hover:text-[var(--foreground)]/60 transition-colors" />
        </Link>
      </div>
    </aside>
  );
}
