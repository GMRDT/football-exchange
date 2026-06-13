import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPortfolioSummary } from '@/lib/portfolio/summary'
import { PortfolioScreen } from '@/components/portfolio/PortfolioScreen'

/**
 * /portfolio — auth-required (DESIGN.md §8); `src/middleware.ts` already guards
 * it. Server-fetches the initial snapshot, then PortfolioScreen takes over with
 * SWR polling (30s), mirroring the Market page.
 */
export default async function PortfolioPage() {
  const supabase = await getSupabaseServerClient()
  const portfolio = await getPortfolioSummary(supabase)

  // Defensive: middleware should have redirected anon users already.
  if (!portfolio) redirect('/login?next=/portfolio')

  return <PortfolioScreen initial={portfolio} />
}
