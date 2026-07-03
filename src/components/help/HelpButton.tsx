"use client";

import React, { useState } from "react";
import { HelpCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import HelpDrawer from "./HelpDrawer";

export default function HelpButton() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Hide help button on login and welcome screens
  if (pathname === "/login" || pathname === "/welcome") {
    return null;
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 left-4 md:bottom-5 md:left-5 z-50 w-12 h-12 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer border-none outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 focus:ring-offset-slate-900"
        aria-label="פתח מדריך עזרה"
        title="מדריך עזרה"
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {/* Slide-out Drawer */}
      <HelpDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
