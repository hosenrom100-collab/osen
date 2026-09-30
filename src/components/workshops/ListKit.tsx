"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

// Admin lists are always on white, like the calendar, whatever the app theme is.
export const WHITE_VARS = {
  "--background": "#ffffff", "--card-bg": "#ffffff", "--foreground": "#1f2937",
  "--border": "#E5E7E0", "--border-subtle": "#EEF0E9", "--accent": "#5f7332", "--accent-soft": "rgba(95,115,50,0.07)",
} as React.CSSProperties;

export type Dir = "asc" | "desc";

/** Column header that sorts on click: first ascending, then descending. */
export function SortTh<K extends string>({ k, sort, dir, onSort, children, className = "" }: {
  k: K; sort: K; dir: Dir; onSort: (k: K) => void; children: React.ReactNode; className?: string;
}) {
  const on = sort === k;
  return (
    <th scope="col" aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`font-semibold text-start ${className}`}>
      <button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 py-2.5 hover:text-[var(--foreground)] ${on ? "text-[var(--foreground)]" : ""}`}>
        {children}
        {on ? (dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
      </button>
    </th>
  );
}

/** Next sort state after a header click. */
export function nextSort<K extends string>(cur: { sort: K; dir: Dir }, k: K): { sort: K; dir: Dir } {
  return cur.sort === k ? { sort: k, dir: cur.dir === "asc" ? "desc" : "asc" } : { sort: k, dir: "asc" };
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="flex border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--card-bg)]" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} aria-pressed={value === k}
          className={`px-3 py-1.5 text-sm ${value === k ? "bg-[var(--accent)] text-white font-bold" : "text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/5"}`}>{l}</button>
      ))}
    </div>
  );
}

export const selectCls = "text-sm bg-[var(--card-bg)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--accent)]";

export function TypeBadge({ label, fill, ink, bar }: { label: string; fill: string; ink: string; bar: string }) {
  return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold border-s-[3px]" style={{ backgroundColor: fill, color: ink, borderInlineStartColor: bar }}>{label}</span>;
}
