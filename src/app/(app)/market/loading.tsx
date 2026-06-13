import { SkeletonRow } from '@/components/ui/SkeletonRow'

export default function MarketLoading() {
  return (
    <main className="mx-auto max-w-lg">
      <header className="px-4 pt-6 pb-3">
        <div className="h-8 w-40 animate-shimmer rounded-lg" />
        <div className="mt-3 h-11 w-full animate-shimmer rounded-xl" />
      </header>
      <div className="border-t border-border">
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </main>
  )
}
