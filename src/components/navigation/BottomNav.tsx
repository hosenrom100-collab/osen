"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardList, Users, ShoppingCart, Calendar } from "lucide-react";
import { motion } from "framer-motion";

const navItems = [
  { href: "/",          icon: Home,          label: "בית"      },
  { href: "/attendance", icon: ClipboardList, label: "נוכחות"  },
  { href: "/patients",   icon: Users,         label: "מטופלים" },
  { href: "/shopping",   icon: ShoppingCart,  label: "קניות"   },
  { href: "/calendar",   icon: Calendar,      label: "יומן"    },
];

export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 px-4 pb-5 pt-2 md:hidden">
      <nav className="bg-slate-900/85 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] flex items-center justify-around h-16 px-2 shadow-2xl shadow-black/60">
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
                  isActive ? "text-emerald-400" : "text-slate-500"
                }`}
              />
              <span
                className={`text-[10px] font-bold tracking-tight relative z-10 transition-colors duration-200 ${
                  isActive ? "text-emerald-400" : "text-slate-600"
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
