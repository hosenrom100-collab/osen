"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, ClipboardList, Users, ShoppingCart, 
  BarChart3, Settings, Clock, MessageSquare, Calendar
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";

const NAV = [
  { href: "/",           icon: Home,          label: "בית"       },
  { href: "/attendance", icon: ClipboardList, label: "נוכחות"   },
  { href: "/patients",   icon: Users,         label: "מטופלים"  },
  { href: "/shopping",   icon: ShoppingCart,  label: "קניות"    },
  { href: "/reports",    icon: BarChart3,     label: "דוחות"    },
  { href: "/calendar",   icon: ClipboardList, label: "לוח שנה"  },
];

const ADMIN_NAV = [
  { href: "/admin",                 icon: Settings,      label: "ניהול" },
  { href: "/admin/staff-attendance", icon: Clock,         label: "נוכחות צוות" },
  { href: "/admin/notifications",    icon: MessageSquare, label: "הודעות" },
  { href: "/admin/schedule",        icon: Calendar,      label: "עריכת לו״ז" },
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
  const { user, roles, role, isManager } = useAuth();

  if (pathname === "/login") return null;

  const initials = (user?.displayName || user?.email || "?").charAt(0).toUpperCase();
  const displayRole = role || roles[0] || "";

  return (
    <aside className="hidden md:flex w-64 shrink-0 h-screen sticky top-0 flex-col bg-[var(--background)] border-l border-[var(--border)] z-20 overflow-hidden shadow-2xl">

      {/* App Brand */}
      <div className="flex items-center gap-4 px-6 h-20 shrink-0 border-b border-[var(--border)] bg-[var(--background)]">
        <div className="w-10 h-10 bg-rose-600 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-600/20">
          <span className="text-white font-black text-lg">H</span>
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-black text-[var(--foreground)] tracking-tight leading-none">חוסן קונקט</span>
          <span className="text-[10px] text-rose-500 font-black uppercase tracking-widest mt-1">Hosen Connect</span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-8 space-y-10 no-scrollbar">
        
        {/* Workspace Section */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/20 px-3 mb-6">מרחב עבודה</p>
          <div className="space-y-1.5">
            {NAV.map(({ href, icon: Icon, label }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link key={href} href={href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-200 group relative ${
                    active
                      ? "bg-rose-600 text-white shadow-xl shadow-rose-600/20"
                      : "text-[var(--foreground)]/40 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/[0.03]"
                  }`}>
                  <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? "text-white" : "text-[var(--foreground)]/20 group-hover:text-[var(--foreground)]/60"}`} />
                  <span>{label}</span>
                  {active && (
                    <motion.div 
                      layoutId="sidebar-active"
                      className="absolute inset-0 bg-rose-600 rounded-2xl -z-10"
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
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--foreground)]/20 px-3 mb-6">ניהול ובקרה</p>
            <div className="space-y-1.5">
              {ADMIN_NAV.map(({ href, icon: Icon, label }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link key={href} href={href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-200 group ${
                      active
                        ? "bg-[var(--foreground)] text-[var(--background)]"
                        : "text-[var(--foreground)]/40 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/[0.03]"
                    }`}>
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? "text-[var(--background)]" : "text-[var(--foreground)]/20 group-hover:text-[var(--foreground)]/60"}`} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* User & Settings Footer */}
      <div className="mt-auto border-t border-[var(--border)] p-6 bg-[var(--foreground)]/[0.01]">
        <Link href="/profile"
          className="flex items-center gap-4 p-3 rounded-2xl hover:bg-[var(--foreground)]/[0.04] transition-all group border border-transparent hover:border-[var(--border)]">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-rose-600/10 border border-rose-500/20 flex items-center justify-center text-sm font-black text-rose-600 shadow-inner">
              {initials}
            </div>
            <div className="absolute -bottom-1 -left-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-[var(--background)] rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-[var(--foreground)] truncate leading-none mb-1.5">
              {user?.displayName || user?.email?.split('@')[0]}
            </p>
            <p className="text-[9px] text-[var(--foreground)]/30 font-black uppercase tracking-[0.1em]">
              {ROLE_HE[displayRole] || displayRole}
            </p>
          </div>
          <Settings className="w-4 h-4 text-[var(--foreground)]/20 group-hover:text-rose-500 transition-colors" />
        </Link>
      </div>
    </aside>
  );
}
