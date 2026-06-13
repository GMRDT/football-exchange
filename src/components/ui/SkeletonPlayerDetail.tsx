/**
 * SkeletonPlayerDetail (DESIGN.md §4) — mirrors the player detail header +
 * price block + sparkline area. No layout shift on content load.
 */
export function SkeletonPlayerDetail() {
  return (
    <main
      className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6"
      aria-hidden="true"
    >
      {/* Header row */}
      <header className="flex items-center gap-4">
        {/* KitAvatar lg: 54×72 */}
        <div className="h-[72px] w-[54px] shrink-0 rounded-xl animate-shimmer" />
        <div className="space-y-2">
          <div className="h-5 w-44 rounded animate-shimmer" />
          <div className="h-3 w-28 rounded animate-shimmer" />
        </div>
      </header>

      {/* Price block */}
      <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
        <div className="h-11 w-40 rounded animate-shimmer" />
        <div className="flex gap-2">
          <div className="h-5 w-16 rounded animate-shimmer" />
          <div className="h-5 w-28 rounded animate-shimmer" />
        </div>
        {/* Sparkline area */}
        <div className="h-[120px] w-full rounded animate-shimmer" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[72px] rounded-xl border border-border animate-shimmer"
          />
        ))}
      </div>
    </main>
  )
}
