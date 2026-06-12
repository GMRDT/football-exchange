import { BottomNav } from '@/components/layout/BottomNav'

/**
 * (app) shell: BottomNav on every app screen. No auth redirect here —
 * /market and /market/[id] are public by product decision (DESIGN.md §8);
 * /portfolio and /activity are gated by src/middleware.ts. Trade protection
 * lives in the component + the trade() RPC.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
      {children}
      <BottomNav />
    </div>
  )
}
