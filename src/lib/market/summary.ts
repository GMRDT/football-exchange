import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/types'

/**
 * Market summary: one row per player from the read-only get_market_summary()
 * RPC (migration 20260612000004), plus the derived daily % change.
 *
 * Prices arrive as NUMERIC-as-text (invariant #2); they are kept as strings
 * for display. daily_change_pct is a percentage (not monetary), so float
 * math is acceptable there.
 */

const numericString = z.string().regex(/^-?\d+(\.\d+)?$/, 'expected NUMERIC string')

// Recursive JSON validator matching the generated Json type (jsonb pass-through).
const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonSchema), z.record(jsonSchema)])
)

const summaryRowSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  team_id: z.string().uuid(),
  team_name: z.string(),
  position_code: z.string(),
  liquidity_tier: z.string(),
  avatar_colors: jsonSchema.nullable(),
  current_price: numericString,
  fair_value: numericString,
  price_24h_ago: numericString,
})

export const marketPlayerSchema = summaryRowSchema.extend({
  daily_change_pct: z.number(),
})

export const marketResponseSchema = z.object({
  players: z.array(marketPlayerSchema),
})

export type MarketPlayer = z.infer<typeof marketPlayerSchema>
export type MarketResponse = z.infer<typeof marketResponseSchema>

/** SWR fetcher for /api/market — shared by MarketScreen and the landing TopMovers. */
export async function fetchMarket(url: string): Promise<MarketResponse> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`market fetch failed: ${res.status}`)
  return marketResponseSchema.parse(await res.json())
}

export function dailyChangePct(currentPrice: string, price24hAgo: string): number {
  const current = parseFloat(currentPrice)
  const baseline = parseFloat(price24hAgo)
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline <= 0) return 0
  return ((current - baseline) / baseline) * 100
}

/** Shared by the /market server page and the /api/market route. */
export async function getMarketSummary(
  supabase: SupabaseClient<Database>
): Promise<MarketPlayer[]> {
  const { data, error } = await supabase.rpc('get_market_summary')
  if (error) throw new Error(`get_market_summary failed: ${error.message}`)

  // Validates DB shape (catches schema drift) before anything renders it.
  const rows = z.array(summaryRowSchema).parse(data ?? [])

  return rows.map((row) => ({
    ...row,
    daily_change_pct: dailyChangePct(row.current_price, row.price_24h_ago),
  }))
}

// ── Teams (for the market's group/country browse — DESIGN.md "football heart") ──
// Static reference data (48 rows): fetched once server-side and passed to the
// Market screen, not polled. `country` is an ISO-3166 alpha-2 code (UK nations use
// FIFA codes like SCT/ENG); `group_name` is the World Cup group letter (A–L).
const teamRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  country: z.string().nullable(),
  group_name: z.string().nullable(),
  is_eliminated: z.boolean(),
})

export type MarketTeam = z.infer<typeof teamRowSchema>

/** Anon-readable reference list (teams RLS is public). */
export async function getTeams(supabase: SupabaseClient<Database>): Promise<MarketTeam[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, country, group_name, is_eliminated')
    .order('group_name', { ascending: true })
  if (error) throw new Error(`teams failed: ${error.message}`)
  return z.array(teamRowSchema).parse(data ?? [])
}
