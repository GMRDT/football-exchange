/**
 * SkeletonRow (DESIGN.md §4) — mirrors PlayerRow dimensions exactly so there
 * is zero layout shift when real content loads. Full-screen spinners are
 * prohibited; this is the loading state for market lists.
 */
export function SkeletonRow() {
  return (
    <div
      aria-hidden="true"
      className="flex min-h-[56px] items-center gap-3 border-b border-border bg-surface px-4 py-2"
    >
      {/* KitAvatar sm: 24×32 */}
      <div className="h-8 w-6 shrink-0 rounded-md animate-shimmer" />

      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-36 rounded animate-shimmer" />
        <div className="h-3 w-24 rounded animate-shimmer" />
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <div className="h-4 w-14 rounded animate-shimmer" />
        <div className="h-4 w-10 rounded animate-shimmer" />
      </div>
    </div>
  )
}
