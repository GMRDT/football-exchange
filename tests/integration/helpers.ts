/**
 * Shared helpers for integration tests. Requires `supabase start` and the
 * local keys in .env.local. Not a test suite (does not match *.test.ts).
 */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import ws from 'ws'
import type { Database } from '../../src/lib/supabase/types'
import { toMicros } from '../../scripts/lib/micros'

export { toMicros }
export { microsToString } from '../../scripts/lib/micros'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// Node.js 20 polyfill — @supabase/realtime-js checks globalThis.WebSocket at
// client creation time. Must run before createClient.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof globalThis.WebSocket === 'undefined') (globalThis as any).WebSocket = ws

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error(
    'Integration tests need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (supabase start)'
  )
}

// Narrowed copies: the if-throw above does not narrow the original consts
// inside function bodies (closures), so capture them as plain strings here.
const url: string = supabaseUrl
const serviceKey: string = serviceRoleKey
const anonApiKey: string = anonKey

/** Service-role client: bypasses RLS, used for fixtures and assertions. */
export const adminClient = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export type TypedClient = typeof adminClient

/** Fresh unauthenticated client (anon key, no session). */
export function anonClient(): TypedClient {
  return createClient<Database>(url, anonApiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type TestUser = { userId: string; email: string; client: TypedClient }

/**
 * Creates a confirmed auth user and returns an authenticated client.
 * The signup trigger gives every user a 100_000 balance + signup ledger entry.
 */
export async function createTestUser(): Promise<TestUser> {
  const email = `f2-test-${crypto.randomUUID()}@test.local`
  const password = `pw-${crypto.randomUUID()}`

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`createTestUser: admin createUser failed: ${error?.message}`)
  }

  const client = anonClient()
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) {
    throw new Error(`createTestUser: signInWithPassword failed: ${signInError.message}`)
  }

  return { userId: data.user.id, email, client }
}

/** Creates a throwaway team for test players. */
export async function createTestTeam(): Promise<string> {
  const { data, error } = await adminClient
    .from('teams')
    .insert({ name: `F2 Test Team ${crypto.randomUUID().slice(0, 8)}`, country: 'TST' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createTestTeam failed: ${error?.message}`)
  return data.id
}

export type TestPlayerOverrides = {
  base_value?: number
  current_price?: number
  fair_value?: number
  liquidity_tier?: 'star' | 'starter' | 'prospect'
}

/**
 * Creates a test player. Defaults: starter tier (L=4000, k_d=2.5) at price
 * 1000 — chosen so integer-share trades stay exact in micros arithmetic.
 */
export async function createTestPlayer(
  teamId: string,
  overrides: TestPlayerOverrides = {}
): Promise<string> {
  const { data: position, error: posError } = await adminClient
    .from('positions')
    .select('id')
    .eq('code', 'FWD')
    .single()
  if (posError || !position) throw new Error(`createTestPlayer: position lookup failed`)

  const base = overrides.base_value ?? 1000
  const { data, error } = await adminClient
    .from('players')
    .insert({
      full_name: `F2 Test Player ${crypto.randomUUID().slice(0, 8)}`,
      team_id: teamId,
      position_id: position.id,
      base_value: base,
      fair_value: overrides.fair_value ?? base,
      current_price: overrides.current_price ?? base,
      liquidity_tier: overrides.liquidity_tier ?? 'starter',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createTestPlayer failed: ${error?.message}`)
  return data.id
}

// ── Trade RPC contract (Zod) ──────────────────────────────────────────────────

export const TradeErrorCodeSchema = z.enum([
  'unauthorized',
  'invalid_input',
  'trading_paused',
  'player_not_found',
  'rate_limited',
  'insufficient_funds',
  'insufficient_shares',
  'position_cap',
  'volume_cap',
])

const NUMERIC_STRING = /^-?\d+(\.\d{1,6})?$/

export const TradeResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    trade_id: z.string().uuid(),
    execution_price: z.string().regex(NUMERIC_STRING),
    shares: z.string().regex(NUMERIC_STRING),
    gross: z.string().regex(NUMERIC_STRING),
    fee: z.string().regex(NUMERIC_STRING),
    net: z.string().regex(NUMERIC_STRING),
    new_balance: z.string().regex(NUMERIC_STRING),
    new_price: z.string().regex(NUMERIC_STRING),
  }),
  z.object({
    ok: z.literal(false),
    code: TradeErrorCodeSchema,
    message: z.string(),
  }),
])

export type TradeResponse = z.infer<typeof TradeResponseSchema>

/** Calls trade() and validates the jsonb payload against the contract. */
export async function callTrade(
  client: TypedClient,
  playerId: string,
  side: string,
  shares: number
): Promise<TradeResponse> {
  const { data, error } = await client.rpc('trade', {
    p_player_id: playerId,
    p_side: side,
    p_shares: shares,
  })
  if (error) throw new Error(`trade() rpc transport error: ${error.message}`)
  return TradeResponseSchema.parse(data)
}

// ── Exact expected-amount math (BigInt micros) ───────────────────────────────

/** Integer division rounding half away from zero — matches SQL round(). */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const absRem = remainder < 0n ? -remainder : remainder
  if (absRem * 2n >= denominator) {
    return numerator < 0n ? quotient - 1n : quotient + 1n
  }
  return quotient
}

/**
 * Expected gross/fee/net for an integer-share trade at spread_base = 1%
 * (fee factor = spread/2 = 1/200), mirroring the SQL formulas exactly.
 */
export function expectedAmounts(
  pMidMicros: bigint,
  shares: bigint,
  side: 'buy' | 'sell'
): { gross: bigint; fee: bigint; net: bigint } {
  const gross = pMidMicros * shares
  const fee = divRound(gross, 200n)
  const net = side === 'buy' ? gross + fee : gross - fee
  return { gross, fee, net }
}

/** Price-impact delta in micros for the starter tier: shares/4000 × 2.5. */
export function starterDeltaMicros(shares: bigint): bigint {
  return shares * 625n
}
