"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardList, Users, Settings, ShoppingCart, Calendar } from "lucide-react";
import { motion } from "framer-motion";

export function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", icon: Home, label: "בית" },
    { href: "/attendance", icon: ClipboardList, label: "נוכחות" },
    { href: "/patients", icon: Users, label: "מטופלים" },
    { href: "/shopping", icon: ShoppingCart, label: "קניות" },
    { href: "/calendar", icon: Calendar, label: "יומן" },
  ];

  // Don't show on login page
  if (pathname === "/login") return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-6 pt-2 md:hidden">
      <nav className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-[2.5rem] flex items-center justify-around h-16 px-4 shadow-2xl shadow-black">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="relative group">
              <div className={`flex flex-col items-center justify-center gap-1 transition-all duration-300 ${isActive ? "text-emerald-400" : "text-slate-500"}`}>
                <item.icon className={`w-5 h-5 ${isActive ? "fill-emerald-400/20" : ""}`} />
                <span className="text-[10px] font-bold tracking-tight">{item.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute -bottom-2 w-1 h-1 bg-emerald-400 rounded-full"
                  />
                )}
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
