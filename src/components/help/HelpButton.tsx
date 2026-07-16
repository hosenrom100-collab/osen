"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import HelpDrawer from "./HelpDrawer";

export default function HelpButton() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleOpenHelp = () => setIsOpen(true);
    window.addEventListener("open-help-drawer", handleOpenHelp);
    return () => {
      window.removeEventListener("open-help-drawer", handleOpenHelp);
    };
  }, []);

  // Hide help system entirely on login and welcome screens
  if (pathname === "/login" || pathname === "/welcome") {
    return null;
  }

  return (
    <HelpDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
  );
}
