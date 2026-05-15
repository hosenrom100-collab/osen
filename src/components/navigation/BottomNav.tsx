"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardList, Users, ShoppingCart, User, Calendar } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const staffItems = [
  { href: "/",           icon: Home,          label: "בית"       },
  { href: "/attendance", icon: ClipboardList, label: "נוכחות"   },
  { href: "/patients",   icon: Users,         label: "מטופלים"  },
  { href: "/shopping",   icon: ShoppingCart,  label: "קניות"    },
  { href: "/profile",    icon: User,          label: "אזור אישי" },
];

const participantItems = [
  { href: "/portal",   icon: Calendar, label: "פעילויות" },
  { href: "/profile",  icon: User,     label: "אזור אישי" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { isParticipant } = useAuth();

  if (pathname === "/login" || pathname === "/portal/join") return null;

  const navItems = isParticipant ? participantItems : staffItems;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-[var(--background)] border-t border-[var(--border)]">
      <nav className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href) || 
                (item.href === "/attendance" && pathname.startsWith("/admin/patient-attendance"));

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center gap-1.5 h-full transition-colors duration-200"
            >
              <item.icon
                className={`w-5 h-5 transition-colors duration-200 ${
                  isActive ? "text-emerald-500" : "text-[var(--foreground)]/30"
                }`}
              />
              <span
                className={`text-[9px] font-black uppercase tracking-widest transition-colors duration-200 ${
                  isActive ? "text-emerald-500" : "text-[var(--foreground)]/30"
                }`}
              >
                {item.label}
              </span>
              
              {/* Simple active indicator dot */}
              {isActive && (
                <div className="absolute bottom-1 w-1 h-1 bg-emerald-500 rounded-full" />
              )}
            </Link>
          );
        })}
      </nav>
      {/* Safe Area Inset for modern mobile devices */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
