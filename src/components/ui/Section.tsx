import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Small muted section title with an optional trailing link. No box: spacing + divider do the grouping. */
export function Section({
  title, href, linkLabel, children, className = "",
}: { title: string; href?: string; linkLabel?: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
        <h2 className="text-xs font-semibold tracking-wider text-[var(--text-secondary)]">{title}</h2>
        {href && (
          <Link href={href} className="text-xs font-semibold text-[var(--accent-text)] hover:underline flex items-center gap-0.5">
            {linkLabel} <ChevronLeft className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="pt-3">{children}</div>
    </section>
  );
}

/** Related figures in one row, split by hairlines instead of one card each. */
export function StatRow({ items }: { items: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "alert" }[] }) {
  return (
    <dl className="grid grid-flow-col auto-cols-fr divide-x divide-x-reverse divide-[var(--border)] border-y border-[var(--border)] py-3">
      {items.map((it) => (
        <div key={it.label} className="px-3 first:ps-0 last:pe-0">
          <dt className="text-[11px] font-semibold text-[var(--text-secondary)]">{it.label}</dt>
          <dd className={`mt-1 text-2xl font-bold leading-none tabular-nums ${it.tone === "alert" ? "text-amber-600" : "text-[var(--foreground)]"}`}>
            {it.value}
          </dd>
          {it.hint && <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{it.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

/** Compact icon + micro-label grid. One neutral style; only the count badge carries meaning. */
export function QuickActionGrid({
  actions,
}: { actions: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; badge?: number }[] }) {
  return (
    <nav aria-label="פעולות מהירות" className="grid grid-cols-4 gap-1">
      {actions.map(({ href, icon: Icon, label, badge }) => (
        <Link key={href} href={href}
          className="relative flex flex-col items-center gap-1.5 py-2.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-text)] active:scale-[0.97] transition">
          <Icon className="w-5 h-5" />
          <span className="text-[11px] font-semibold leading-tight text-center">{label}</span>
          {!!badge && badge > 0 && (
            <span className="absolute top-1 end-3 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">{badge}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
