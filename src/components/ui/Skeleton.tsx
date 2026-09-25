import { clsx } from "clsx";

/** Animated placeholder. Size it with className to mirror the data it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("skeleton", className)} />;
}

/** A list of rows shaped like a title + trailing value + thin bar (attendance / list rows). */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[var(--border)]" aria-busy="true" aria-label="טוען">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="py-3 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-1 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Full-screen shell used while auth / first data load is pending. */
export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--background)]" aria-busy="true" aria-label="טוען">
      <div className="h-12 border-b border-[var(--border)] flex items-center gap-2 px-4">
        <Skeleton className="w-7 h-7 rounded-full" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="px-4 md:px-6 max-w-6xl mx-auto pt-5 space-y-6">
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-12" />
            </div>
          ))}
        </div>
        <SkeletonRows rows={4} />
      </div>
    </div>
  );
}
