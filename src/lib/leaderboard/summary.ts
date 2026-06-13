import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

/**
 * Global leaderboard (F4.5): every trader ranked by % return. Shared by the
 * /leaderboard server page and the /api/leaderboard route (SWR poll), mirroring
 * lib/portfolio/summary.ts and lib/market/summary.ts.
 *
 * Reads the `v_leaderboard` materialized view (refreshed every minute by the
 * `refresh-leaderboard` cron). The ranking metric — `return_pct` — is computed
 * in SQL from the SAME `v_portfolio_value` the Portfolio screen reads, so the two
 * screens agree by construction (ADR-007). This is a public, read-only path: no
 * balance mutation, no service key. The session is consulted only to flag the
 * current user's row (and to surface their rank when they fall outside the top N).
 *
 * NUMERIC/return columns arrive as JS numbers (or NUMERIC-as-text) from PostgREST;
 * `z.coerce.number()` normalizes both. GC magnitudes (≤ ~1e7, 6dp) and small ranks
 * are exactly representable in a double — same justification as portfolio/summary.ts.
 */

const TOP_LIMIT = 100

// Fallback when a profile somehow has no username (NOT NULL in practice; the view
// just loses that constraint). Locale-neutral, so it stays out of the dictionaries.
const USERNAME_FALLBACK = '—'

export const leaderboardEntrySchema = z.object({
  user_id: z.string().uuid(),
  username: z.string(),
  total_value: z.number(),
  return_pct: z.number(),
  rank: z.number(),
})

export const leaderboardResponseSchema = z.object({
  entries: z.array(leaderboardEntrySchema),
  currentUserId: z.string().uuid().nullable(),
  currentUserEntry: leaderboardEntrySchema.nullable(),
})

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>

// DB shape of a v_leaderboard row (all columns nullable — view drops NOT NULL).
const rawRowSchema = z.object({
  user_id: z.string().uuid().nullable(),
  username: z.string().nullable(),
  total_value: z.coerce.number().nullable(),
  return_pct: z.coerce.number().nullable(),
  rank: z.coerce.number().nullable(),
})

type RawRow = z.infer<typeof rawRowSchema>

/** Drop rows missing a rankable identity; coalesce the (in practice always-present) username. */
function toEntry(row: RawRow): LeaderboardEntry | null {
  if (
    row.user_id === null ||
    row.rank === null ||
    row.total_value === null ||
    row.return_pct === null
  ) {
    return null
  }
  return {
    user_id: row.user_id,
    username: row.username ?? USERNAME_FALLBACK,
    total_value: row.total_value,
    return_pct: row.return_pct,
    rank: row.rank,
  }
}

/** SWR fetcher for /api/leaderboard (mirrors fetchPortfolio / fetchMarket). */
export async function fetchLeaderboard(url: string): Promise<LeaderboardResponse> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`leaderboard fetch failed: ${res.status}`)
  return leaderboardResponseSchema.parse(await res.json())
}

/**
 * Shared by the /leaderboard server page and the /api/leaderboard route. Public:
 * returns the top-N entries for everyone. When a user is signed in, `currentUserId`
 * is set; if they rank outside the top N, `currentUserEntry` carries their own row
 * so the UI can pin it.
 */
export async function getLeaderboard(
  supabase: SupabaseClient<Database>
): Promise<LeaderboardResponse> {
  const topRes = await supabase
    .from('v_leaderboard')
    .select('*')
    .order('rank', { ascending: true })
    .limit(TOP_LIMIT)
  if (topRes.error) throw new Error(`v_leaderboard: ${topRes.error.message}`)

  const entries = z
    .array(rawRowSchema)
    .parse(topRes.data ?? [])
    .map(toEntry)
    .filter((e): e is LeaderboardEntry => e !== null)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const currentUserId = user?.id ?? null

  let currentUserEntry: LeaderboardEntry | null = null
  if (currentUserId && !entries.some((e) => e.user_id === currentUserId)) {
    // User is signed in but outside the top N — fetch just their row so the UI can pin it.
    const ownRes = await supabase
      .from('v_leaderboard')
      .select('*')
      .eq('user_id', currentUserId)
      .maybeSingle()
    if (ownRes.error) throw new Error(`v_leaderboard(self): ${ownRes.error.message}`)
    currentUserEntry = ownRes.data ? toEntry(rawRowSchema.parse(ownRes.data)) : null
  }

  return { entries, currentUserId, currentUserEntry }
}
