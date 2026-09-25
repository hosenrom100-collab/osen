"use client";

import { motion } from "framer-motion";

interface SwitchVisualProps {
  checked: boolean;
  tone?: "accent" | "danger";
}

/** The track + knob only, for use inside another clickable row (a button can't nest a button). */
export function SwitchVisual({ checked, tone = "accent" }: SwitchVisualProps) {
  const on = tone === "danger" ? "bg-rose-500" : "bg-[var(--accent)]";
  return (
    <span aria-hidden className={`relative inline-block w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${checked ? on : "bg-[var(--fill-strong)]"}`}>
      {/* RTL: the knob rests at the right when off and travels left when on */}
      <motion.span
        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white shadow-[var(--shadow-card)]"
        animate={{ x: checked ? -20 : 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 32 }}
      />
    </span>
  );
}

interface SwitchProps extends SwitchVisualProps {
  onChange: (next: boolean) => void;
  label: string;
}

/** The one on/off control used across the shopping screens. */
export function Switch({ checked, onChange, label, tone = "accent" }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="border-none bg-transparent p-0 cursor-pointer rounded-full"
    >
      <SwitchVisual checked={checked} tone={tone} />
    </button>
  );
}
