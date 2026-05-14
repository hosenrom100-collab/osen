"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardList, Users, ShoppingCart, User, Calendar } from "lucide-react";
import { motion } from "framer-motion";
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
    <div className="fixed bottom-0 inset-x-0 z-50 px-4 pb-5 pt-2 md:hidden">
      <nav className="bg-[var(--card-bg)]/85 backdrop-blur-2xl border border-[var(--border)] rounded-[2.5rem] flex items-center justify-around h-16 px-2 shadow-2xl shadow-black/20">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-2xl min-w-[52px] transition-colors duration-200"
            >
              {/* Active pill background */}
              {isActive && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute inset-0 bg-emerald-500/15 rounded-2xl border border-emerald-500/25"
                  transition={{ type: "spring", damping: 24, stiffness: 300 }}
                />
              )}

              <item.icon
                className={`w-5 h-5 relative z-10 transition-colors duration-200 ${
                  isActive ? "text-emerald-500" : "text-[var(--foreground)]/40"
                }`}
              />
              <span
                className={`text-[10px] font-bold tracking-tight relative z-10 transition-colors duration-200 ${
                  isActive ? "text-emerald-500" : "text-[var(--foreground)]/40"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
