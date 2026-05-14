"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardList, Users, ShoppingCart, User, BarChart3, Settings } from "lucide-react";
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
  { href: "/admin",    icon: Settings, label: "ניהול" },
];

const ROLE_HE: Record<string, string> = {
  admin:         "מנהל מערכת",
  manager:       "מנהל",
  instructor:    "מדריך",
  social_worker: 'עו"ס',
  employee:      "עובד",
  logistics:     "לוגיסטיקה",
};

export function DesktopSidebar() {
  const pathname = usePathname();
  const { user, role, isAdmin } = useAuth();

  if (pathname === "/login") return null;

  const initials = (user?.displayName || user?.email || "?").charAt(0).toUpperCase();

  return (
    <aside className="hidden md:flex w-60 shrink-0 h-screen sticky top-0 flex-col bg-sidebar-bg border-l border-border z-20 overflow-hidden">

      {/* App Brand */}
      <div className="flex items-center gap-3 px-6 h-16 shrink-0 bg-background/50">
        <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/10">
          <span className="text-white font-black text-sm">H</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-bold text-foreground tracking-tight leading-none">מרכז חוסן</span>
          <span className="text-[10px] text-emerald-500/70 font-semibold tracking-wider mt-1">חוות רום</span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-8 no-scrollbar">
        
        {/* Workspace Section */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-foreground/40 px-3 mb-4">מרחב עבודה</p>
          <div className="space-y-1">
            {NAV.map(({ href, icon: Icon, label }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link key={href} href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group ${
                    active
                      ? "bg-emerald-500/10 text-emerald-500 font-semibold shadow-[inset_0_0_0_1px_rgba(16,185,129,0.1)]"
                      : "text-foreground/60 hover:text-foreground hover:bg-foreground/[0.03]"
                  }`}>
                  <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? "text-emerald-500" : "text-foreground/40 group-hover:text-foreground/70"}`} />
                  <span>{label}</span>
                  {active && <motion.div layoutId="activeNav" className="mr-auto w-1 h-4 bg-emerald-500 rounded-full" />}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Administration Section */}
        {isAdmin && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-foreground/40 px-3 mb-4">ניהול ובקרה</p>
            <div className="space-y-1">
              {ADMIN_NAV.map(({ href, icon: Icon, label }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link key={href} href={href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group ${
                      active
                        ? "bg-foreground/10 text-foreground font-semibold"
                        : "text-foreground/60 hover:text-foreground hover:bg-foreground/[0.03]"
                    }`}>
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? "text-foreground" : "text-foreground/40 group-hover:text-foreground/70"}`} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* User & Settings Footer */}
      <div className="mt-auto border-t border-border p-4 bg-background/30">
        <Link href="/profile"
          className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.04] transition-all group">
          <div className="relative">
          <div className="w-9 h-9 rounded-full bg-foreground/5 border border-border flex items-center justify-center text-xs font-bold text-foreground/70 transition-colors group-hover:border-emerald-500/50">
              {initials}
            </div>
            <div className="absolute -bottom-0.5 -left-0.5 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground truncate leading-none mb-1">
              {user?.displayName || user?.email?.split('@')[0]}
            </p>
            <p className="text-[10px] text-foreground/50 font-medium truncate uppercase tracking-tight">
              {ROLE_HE[role ?? ""] ?? role}
            </p>
          </div>
          <Settings className="w-3.5 h-3.5 text-foreground/30 group-hover:text-foreground/50 transition-colors" />
        </Link>
      </div>
    </aside>
  );
}
