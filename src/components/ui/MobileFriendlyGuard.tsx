"use client";

import React from "react";
import { Monitor, ArrowRight, Laptop } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

interface MobileFriendlyGuardProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  alternativeView?: React.ReactNode; // Optional simplified mobile alternative
  fallbackUrl?: string; // Where to redirect if they go back
  fallbackLabel?: string;
}

export function MobileFriendlyGuard({
  children,
  title = "הממשק מותאם למחשב בלבד",
  description = "כדי לבצע פעולות אלו בצורה הנוחה, היסודית והבטוחה ביותר, מומלץ להיכנס למערכת ממחשב אישי.",
  alternativeView,
  fallbackUrl = "/portal",
  fallbackLabel = "חזרה למרכז חוסן",
}: MobileFriendlyGuardProps) {
  const router = useRouter();

  return (
    <>
      {/* Desktop View: renders the full desktop interface */}
      <div className="hidden md:block">
        {children}
      </div>

      {/* Mobile View: renders the premium responsive companion guard */}
      <div className="block md:hidden min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-4 py-8" dir="rtl">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.06)] relative overflow-hidden"
        >
          {/* Glassmorphic decorative circles */}
          <div className="absolute -top-10 -left-10 w-24 h-24 rounded-full bg-teal-500/10 blur-xl pointer-events-none" />
          <div className="absolute -bottom-10 -right-10 w-24 h-24 rounded-full bg-blue-500/10 blur-xl pointer-events-none" />

          <div className="flex flex-col items-center text-center relative z-10">
            {/* Elegant Device Icon Container */}
            <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-500 mb-6 shadow-sm">
              <Laptop className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-[var(--foreground)] mb-2 tracking-tight">
              {title}
            </h3>
            
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-6 max-w-[280px]">
              {description}
            </p>

            {/* If an alternative simplified mobile view is supplied, render it here */}
            {alternativeView ? (
              <div className="w-full border-t border-[var(--border)] pt-5 mt-1 mb-5">
                <div className="text-[10px] font-black text-teal-500 uppercase tracking-wider mb-3 text-right">
                  תקציר מהיר לנייד:
                </div>
                {alternativeView}
              </div>
            ) : null}

            {/* Back action button */}
            <button
              onClick={() => router.push(fallbackUrl)}
              className="w-full flex items-center justify-center gap-2 h-11 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-black shadow-md shadow-teal-500/10 active:scale-98 transition-all"
            >
              <span>{fallbackLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
