import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getLeaderboard } from '@/lib/leaderboard/summary'
import { LeaderboardScreen } from '@/components/leaderboard/LeaderboardScreen'

/**
 * /leaderboard — public (DESIGN.md §11). Server-fetches the initial snapshot;
 * LeaderboardScreen takes over with SWR polling (30s). No auth redirect — the
 * board is public; the signed-in user's row is just highlighted.
 */
export default async function LeaderboardPage() {
  const supabase = await getSupabaseServerClient()
  const initial = await getLeaderboard(supabase)

  return <LeaderboardScreen initial={initial} />
}
