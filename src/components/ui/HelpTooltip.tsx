"use client";

import React, { useState } from "react";
import { HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface HelpTooltipProps {
  content: string;
  position?: "top" | "bottom" | "right" | "left";
}

export default function HelpTooltip({ content, position = "top" }: HelpTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const getPositionClasses = () => {
    switch (position) {
      case "bottom":
        return "top-full left-1/2 -translate-x-1/2 mt-2";
      case "right":
        return "right-full top-1/2 -translate-y-1/2 ml-2";
      case "left":
        return "left-full top-1/2 -translate-y-1/2 mr-2";
      case "top":
      default:
        return "bottom-full left-1/2 -translate-x-1/2 mb-2";
    }
  };

  const getArrowClasses = () => {
    switch (position) {
      case "bottom":
        return "bottom-full left-1/2 -translate-x-1/2 border-b-slate-800 border-x-transparent border-t-transparent border-[6px]";
      case "right":
        return "left-full top-1/2 -translate-y-1/2 border-l-slate-800 border-y-transparent border-r-transparent border-[6px]";
      case "left":
        return "right-full top-1/2 -translate-y-1/2 border-r-slate-800 border-y-transparent border-l-transparent border-[6px]";
      case "top":
      default:
        return "top-full left-1/2 -translate-x-1/2 border-t-slate-800 border-x-transparent border-b-transparent border-[6px]";
    }
  };

  return (
    <div className="relative inline-flex items-center" dir="rtl">
      <button
        type="button"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 rounded-full focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer border-none bg-transparent"
        aria-label="מידע נוסף"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className={`absolute z-50 w-48 p-2.5 bg-slate-850 border border-slate-700/80 rounded-xl text-[10px] leading-relaxed text-slate-200 shadow-xl pointer-events-none text-right font-medium ${getPositionClasses()}`}
          >
            {content}
            <div className={`absolute w-0 h-0 ${getArrowClasses()}`} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
