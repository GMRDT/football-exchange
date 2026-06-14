import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getMarketSummary, getTeams } from '@/lib/market/summary'
import { MarketScreen } from '@/components/market/MarketScreen'

/**
 * /market — public (DESIGN.md §8). Server-fetches the initial snapshot + the
 * static team reference (for the group/position browse); MarketScreen takes over
 * with SWR polling (30s) for live prices.
 */
export default async function MarketPage() {
  const supabase = await getSupabaseServerClient()
  const [players, teams] = await Promise.all([getMarketSummary(supabase), getTeams(supabase)])

  return <MarketScreen initialPlayers={players} teams={teams} />
}
