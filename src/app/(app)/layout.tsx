import { BottomNav } from '@/components/layout/BottomNav'
import { TopNav } from '@/components/layout/TopNav'

/**
 * (app) shell (DESIGN.md §8): TopNav on desktop (≥lg), BottomNav on mobile.
 * No auth redirect here — /market and /market/[id] are public by product
 * decision; /portfolio and /activity are gated by src/middleware.ts. Trade
 * protection lives in the component + the trade() RPC.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <TopNav />
      {/* Bottom padding clears the mobile tab bar; removed once TopNav takes over at lg. */}
      <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>
      <BottomNav />
    </div>
  )
}
