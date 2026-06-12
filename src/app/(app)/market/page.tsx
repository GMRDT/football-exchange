import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getMarketSummary } from '@/lib/market/summary'
import { MarketScreen } from '@/components/market/MarketScreen'

/**
 * /market — public (DESIGN.md §8). Server-fetches the initial snapshot;
 * MarketScreen takes over with SWR polling (30s).
 */
export default async function MarketPage() {
  const supabase = await getSupabaseServerClient()
  const players = await getMarketSummary(supabase)

  return <MarketScreen initialPlayers={players} />
}
