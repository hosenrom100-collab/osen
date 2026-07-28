"use client";

import { AnimatePresence, motion } from "framer-motion";
import { WifiOff } from "lucide-react";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";

export function ConnectionStatusBanner() {
  const { isOnline } = useConnectionStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          role="status"
          aria-live="polite"
          className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-2 py-2 px-4 bg-amber-500 text-white text-xs font-bold text-center"
          dir="rtl"
        >
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>אין חיבור לאינטרנט — השינויים יסונכרנו אוטומטית כשהחיבור יחזור</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
