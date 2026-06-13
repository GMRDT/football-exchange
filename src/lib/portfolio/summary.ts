import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/types'

/**
 * Portfolio summary for the authenticated user: their open positions plus the
 * aggregate (total value, cash, % return). Shared by the /portfolio server page
 * and the /api/portfolio route (SWR poll), mirroring lib/market/summary.ts.
 *
 * The aggregate `total_value` and `return_pct` come straight from the
 * `v_portfolio_value` view (the SAME source `v_leaderboard` selects from), so the
 * % return shown here matches the leaderboard by construction (ADR-007).
 *
 * NUMERIC columns arrive as JS numbers from PostgREST; all math here is
 * display-only (no balance mutation — every money move still goes through the
 * `trade()` RPC, invariant #1). GC magnitudes (≤ ~1e7, 6dp) are exactly
 * representable in a double, same justification as market/[id]/page.tsx.
 */

// jsonb pass-through for avatar_colors, matching the generated Json type.
const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonSchema), z.record(jsonSchema)])
)

const positionSchema = z.object({
  player_id: z.string().uuid(),
  full_name: z.string(),
  team_name: z.string(),
  position_code: z.string(),
  avatar_colors: jsonSchema.nullable(),
  shares: z.number(),
  avg_cost: z.number(),
  current_price: z.number(),
  market_value: z.number(),
  pnl_abs: z.number(),
  pnl_pct: z.number(),
})

export const portfolioResponseSchema = z.object({
  positions: z.array(positionSchema),
  total_value: z.number(),
  cash_balance: z.number(),
  return_pct: z.number(),
})

export type PortfolioPosition = z.infer<typeof positionSchema>
export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>

/** SWR fetcher for /api/portfolio (401 when the session is gone → SWR keeps last data). */
export async function fetchPortfolio(url: string): Promise<PortfolioResponse> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`portfolio fetch failed: ${res.status}`)
  return portfolioResponseSchema.parse(await res.json())
}

// DB shape of the holdings⨝players read (validated before render to catch drift).
const holdingRowSchema = z.object({
  shares: z.number(),
  avg_cost: z.number(),
  players: z.object({
    id: z.string().uuid(),
    full_name: z.string(),
    current_price: z.number(),
    avatar_colors: jsonSchema.nullable(),
    teams: z.object({ name: z.string() }).nullable(),
    positions: z.object({ code: z.string() }).nullable(),
  }),
})

/**
 * Shared by the /portfolio server page and the /api/portfolio route.
 * Returns null when there is no authenticated user (caller maps to redirect/401).
 */
export async function getPortfolioSummary(
  supabase: SupabaseClient<Database>
): Promise<PortfolioResponse | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [holdingsRes, valueRes, profileRes] = await Promise.all([
    supabase
      .from('holdings')
      .select(
        'shares, avg_cost, players!holdings_player_id_fkey(id, full_name, current_price, avatar_colors, teams!players_team_id_fkey(name), positions(code))'
      )
      .eq('user_id', user.id)
      .gt('shares', 0),
    supabase.from('v_portfolio_value').select('total_value, return_pct').maybeSingle(),
    supabase.from('profiles').select('cash_balance').eq('id', user.id).maybeSingle(),
  ])

  if (holdingsRes.error) throw new Error(`holdings: ${holdingsRes.error.message}`)
  if (valueRes.error) throw new Error(`v_portfolio_value: ${valueRes.error.message}`)
  if (profileRes.error) throw new Error(`profiles: ${profileRes.error.message}`)

  const rows = z.array(holdingRowSchema).parse(holdingsRes.data ?? [])

  const positions: PortfolioPosition[] = rows
    .map((r) => {
      const cp = r.players.current_price
      return {
        player_id: r.players.id,
        full_name: r.players.full_name,
        team_name: r.players.teams?.name ?? '',
        position_code: r.players.positions?.code ?? '',
        avatar_colors: r.players.avatar_colors,
        shares: r.shares,
        avg_cost: r.avg_cost,
        current_price: cp,
        market_value: r.shares * cp,
        pnl_abs: (cp - r.avg_cost) * r.shares,
        pnl_pct: r.avg_cost > 0 ? ((cp - r.avg_cost) / r.avg_cost) * 100 : 0,
      }
    })
    .sort((a, b) => b.market_value - a.market_value)

  const cash_balance = profileRes.data?.cash_balance ?? 0
  // Aggregate from the canonical view; fall back to cash-only if the view row is
  // missing (brand-new account with no holdings yet).
  const total_value = valueRes.data?.total_value ?? cash_balance
  const return_pct = valueRes.data?.return_pct ?? 0

  return { positions, total_value, cash_balance, return_pct }
}
