"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardList, Users, ShoppingCart, User, BarChart3, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

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
    <aside className="hidden md:flex w-[200px] shrink-0 h-screen sticky top-0 flex-col bg-slate-950 border-l border-white/[0.07] z-20">

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-12 border-b border-white/[0.07] shrink-0">
        <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center shrink-0">
          <span className="text-white font-black text-[11px]">H</span>
        </div>
        <span className="text-sm font-bold text-white tracking-tight">Hosen Connect</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 px-2 pt-2 pb-1">ניווט</p>
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors ${
                active
                  ? "bg-emerald-500/10 text-emerald-400 font-medium"
                  : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]"
              }`}>
              <Icon className="w-[15px] h-[15px] shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 px-2 pt-3 pb-1">מנהל</p>
            {ADMIN_NAV.map(({ href, icon: Icon, label }) => {
              const active = pathname.startsWith(href);
              return (
                <Link key={href} href={href}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors ${
                    active
                      ? "bg-slate-500/10 text-slate-300 font-medium"
                      : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]"
                  }`}>
                  <Icon className="w-[15px] h-[15px] shrink-0" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-white/[0.07] p-2 shrink-0">
        <Link href="/profile"
          className="flex items-center gap-2.5 px-2 py-2 rounded hover:bg-white/[0.04] transition-colors group">
          <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-slate-300 truncate leading-tight">
              {user?.displayName || user?.email}
            </p>
            <p className="text-[9px] text-slate-600 leading-tight mt-0.5">
              {ROLE_HE[role ?? ""] ?? role}
            </p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
