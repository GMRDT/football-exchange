#!/usr/bin/env tsx
/**
 * Financial invariant checker (ADR-001). Runs as service_role; exact BigInt
 * micros arithmetic with ZERO tolerance — any mismatch is a critical bug.
 *
 *   1. SUM(wallet_ledger.delta) == profiles.cash_balance per user
 *   2. holdings.shares >= 0
 *   3. players.current_price >= min_price (market_params.circuit_breakers)
 *   4. Latest ledger entry per user: balance_after == cash_balance
 *   5. SUM(holdings.shares) per player == players.shares_outstanding
 *
 * Exit 0 + summary when clean; exit 1 + per-violation detail otherwise.
 */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import type { Database } from '../src/lib/supabase/types'
import { microsToString, toMicros } from './lib/micros'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// Node.js 20 polyfill — @supabase/realtime-js checks globalThis.WebSocket at
// client creation time. Must run before createClient.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof globalThis.WebSocket === 'undefined') (globalThis as any).WebSocket = ws

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

const PAGE_SIZE = 1000

type TableName = 'profiles' | 'wallet_ledger' | 'holdings' | 'players'

/** Fetches every row of a table in PAGE_SIZE chunks with a stable order. */
async function fetchAll<Row>(table: TableName, columns: string, orderBy: string): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error(`Failed to fetch ${table}: ${error.message}`)
      process.exit(1)
    }
    const batch = (data ?? []) as Row[]
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return rows
  }
}

type ProfileRow = { id: string; username: string; cash_balance: number }
type LedgerRow = { user_id: string; delta: number; balance_after: number; created_at: string }
type HoldingRow = { user_id: string; player_id: string; shares: number }
type PlayerRow = {
  id: string
  full_name: string
  current_price: number
  shares_outstanding: number
}

const violations: string[] = []

function violation(message: string) {
  violations.push(message)
}

async function main() {
  const [profiles, ledger, holdings, players] = await Promise.all([
    fetchAll<ProfileRow>('profiles', 'id, username, cash_balance', 'id'),
    // created_at order so "latest entry per user" falls out of the scan.
    // Ties are broken by page order; trade() entries get distinct transaction
    // timestamps in practice.
    fetchAll<LedgerRow>('wallet_ledger', 'user_id, delta, balance_after, created_at', 'created_at'),
    fetchAll<HoldingRow>('holdings', 'user_id, player_id, shares', 'player_id'),
    fetchAll<PlayerRow>(
      'players',
      'id, full_name, current_price, shares_outstanding',
      'id'
    ),
  ])

  const { data: paramsRow, error: paramsError } = await supabase
    .from('market_params')
    .select('params')
    .limit(1)
    .single()
  if (paramsError || !paramsRow) {
    console.error(`Failed to fetch market_params: ${paramsError?.message}`)
    process.exit(1)
  }
  const params = paramsRow.params as { circuit_breakers?: { min_price?: number } }
  const minPriceMicros = toMicros(params.circuit_breakers?.min_price ?? 100)

  // ── 1 + 4: ledger sums and latest balance_after per user ──────────────────
  const ledgerSums = new Map<string, bigint>()
  const lastBalanceAfter = new Map<string, bigint>()
  for (const entry of ledger) {
    const sum = ledgerSums.get(entry.user_id) ?? 0n
    ledgerSums.set(entry.user_id, sum + toMicros(entry.delta))
    lastBalanceAfter.set(entry.user_id, toMicros(entry.balance_after))
  }

  for (const profile of profiles) {
    const balance = toMicros(profile.cash_balance)
    const sum = ledgerSums.get(profile.id) ?? 0n
    if (sum !== balance) {
      violation(
        `[1] ledger sum != cash_balance for user ${profile.username} (${profile.id}): ` +
          `sum=${microsToString(sum)} balance=${microsToString(balance)}`
      )
    }
    const last = lastBalanceAfter.get(profile.id)
    if (last !== undefined && last !== balance) {
      violation(
        `[4] last balance_after != cash_balance for user ${profile.username} (${profile.id}): ` +
          `balance_after=${microsToString(last)} balance=${microsToString(balance)}`
      )
    }
  }

  // ── 2 + 5: holdings non-negative, per-player share totals ─────────────────
  const sharesByPlayer = new Map<string, bigint>()
  for (const holding of holdings) {
    const shares = toMicros(holding.shares)
    if (shares < 0n) {
      violation(
        `[2] negative holding: user=${holding.user_id} player=${holding.player_id} ` +
          `shares=${microsToString(shares)}`
      )
    }
    const total = sharesByPlayer.get(holding.player_id) ?? 0n
    sharesByPlayer.set(holding.player_id, total + shares)
  }

  // ── 3 + 5: player price floor and shares_outstanding drift ────────────────
  for (const player of players) {
    const price = toMicros(player.current_price)
    if (price < minPriceMicros) {
      violation(
        `[3] price below floor: player ${player.full_name} (${player.id}) ` +
          `price=${microsToString(price)} min=${microsToString(minPriceMicros)}`
      )
    }
    const held = sharesByPlayer.get(player.id) ?? 0n
    const outstanding = toMicros(player.shares_outstanding)
    if (held !== outstanding) {
      violation(
        `[5] holdings drift: player ${player.full_name} (${player.id}) ` +
          `sum(holdings)=${microsToString(held)} shares_outstanding=${microsToString(outstanding)}`
      )
    }
  }

  // Orphan check: ledger users that no longer have a profile (FK should make
  // this impossible; belt and braces).
  for (const userId of ledgerSums.keys()) {
    if (!profiles.some((p) => p.id === userId)) {
      violation(`[1] ledger entries for unknown user ${userId}`)
    }
  }

  if (violations.length > 0) {
    console.error(`INVARIANT VIOLATIONS (${violations.length}):`)
    for (const message of violations) console.error(`  ✗ ${message}`)
    process.exit(1)
  }

  console.log('All invariants hold:')
  console.log(`  users checked:    ${profiles.length}`)
  console.log(`  ledger entries:   ${ledger.length}`)
  console.log(`  holdings rows:    ${holdings.length}`)
  console.log(`  players checked:  ${players.length}`)
  console.log('  checks: ledger-sum, holdings>=0, price-floor, balance_after, shares-drift')
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
