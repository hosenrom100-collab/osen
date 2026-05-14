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
  const { user, roles, role, isManager, photoURL } = useAuth();

  if (pathname === "/login") return null;

  const initials = (user?.displayName || user?.email || "?").charAt(0).toUpperCase();
  const displayRole = role || roles[0] || "";

  return (
    <aside className="hidden md:flex w-64 shrink-0 h-screen sticky top-0 flex-col bg-white border-l border-slate-100 z-20 overflow-hidden">

      {/* App Brand */}
      <div className="flex items-center gap-3 px-6 h-20 shrink-0 border-b border-slate-50">
        <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center">
          <span className="text-white font-black text-base italic">H</span>
        </div>
        <div className="flex flex-col">
          <span className="text-base font-black text-slate-900 tracking-tight leading-none">חוסן קונקט</span>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Hosen Connect</span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-8 no-scrollbar">
        
        {/* Workspace Section */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-4 mb-4">מרחב עבודה</p>
          <div className="space-y-1">
            {NAV.map(({ href, icon: Icon, label }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link key={href} href={href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 group relative ${
                    active
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-400 hover:text-slate-900 hover:bg-slate-50"
                  }`}>
                  <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                  <span>{label}</span>
                  {active && (
                    <motion.div 
                      layoutId="sidebar-active"
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-slate-900 rounded-full"
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
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-4 mb-4">ניהול ובקרה</p>
            <div className="space-y-1">
              {ADMIN_NAV.map(({ href, icon: Icon, label }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link key={href} href={href}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 group relative ${
                      active
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-400 hover:text-slate-900 hover:bg-slate-50"
                    }`}>
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                    <span>{label}</span>
                    {active && (
                      <motion.div 
                        layoutId="sidebar-active-admin"
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-slate-900 rounded-full"
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
      <div className="mt-auto border-t border-slate-50 p-4">
        <Link href="/profile"
          className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 transition-all group">
          <div className="relative shrink-0">
            {photoURL ? (
              <img 
                src={photoURL} 
                alt={user?.displayName || "Profile"} 
                className="w-10 h-10 rounded-2xl object-cover border border-slate-100 shadow-sm"
              />
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-sm font-black text-slate-500">
                {initials}
              </div>
            )}
            <div className="absolute -bottom-0.5 -left-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-slate-900 truncate leading-none mb-1">
              {user?.displayName || user?.email?.split('@')[0]}
            </p>
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.05em]">
              {ROLE_HE[displayRole] || displayRole}
            </p>
          </div>
          <Settings className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition-colors" />
        </Link>
      </div>
    </aside>
  );
}
