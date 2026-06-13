#!/usr/bin/env tsx
/**
 * E2E QA for F4.4 Portfolio (LOCAL stack only).
 *
 * Exercises the REAL production data path — `getPortfolioSummary()` from
 * src/lib/portfolio/summary.ts — against a real user with a real trade, through
 * RLS (security_invoker views + owner-only policies):
 *
 *   1. admin-create a confirmed user  → registration trigger grants 100k cash
 *   2. sign in as that user (anon key → JWT → RLS applies)
 *   3. assert fresh portfolio: 0 positions, cash == 100_000, return_pct == 0
 *   4. buy a few shares of the cheapest player via the `trade()` RPC
 *   5. assert the position shows up with correct shares + consistent P&L, cash
 *      dropped, and return_pct == ADR-007 ((total-100000)/100000*100) — the same
 *      view (v_portfolio_value) the leaderboard ranks on
 *   6. delete the test user (cleanup)
 *
 * Run: npx tsx scripts/e2e-portfolio.ts   (or: pnpm e2e:portfolio)
 */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import type { Database } from '../src/lib/supabase/types'
import { getPortfolioSummary } from '../src/lib/portfolio/summary'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// @supabase/realtime-js checks globalThis.WebSocket at client creation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof globalThis.WebSocket === 'undefined') (globalThis as any).WebSocket = ws

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!url || !serviceKey || !anonKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}
// Safety: this script CREATES and DELETES users — never let it touch a remote DB.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  console.error(`Refusing to run against non-local Supabase: ${url}`)
  process.exit(1)
}

let passed = 0
function assert(cond: unknown, label: string): asserts cond {
  if (!cond) {
    console.error(`  ✗ ${label}`)
    throw new Error(`assertion failed: ${label}`)
  }
  passed++
  console.log(`  ✓ ${label}`)
}

const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } })

async function main() {
  const stamp = Date.now()
  const email = `e2e_portfolio_${stamp}@example.com`
  const password = `Test-${stamp}!`
  const username = `e2e_${stamp}`

  console.log('› creating confirmed test user…')
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  })
  if (cErr || !created.user) throw cErr ?? new Error('createUser returned no user')
  const userId = created.user.id

  // Hoisted so cleanup (finally) can sell the test shares back before deleting the
  // user — otherwise the cascade-deleted holdings leave players.shares_outstanding
  // inflated and break invariant #5.
  let user: SupabaseClient<Database> | null = null
  let boughtPlayerId: string | null = null
  let boughtShares = 0

  try {
    user = createClient<Database>(url, anonKey, { auth: { persistSession: false } })
    const { error: sErr } = await user.auth.signInWithPassword({ email, password })
    if (sErr) throw sErr

    console.log('\n› fresh portfolio (registration trigger granted 100k):')
    const before = await getPortfolioSummary(user)
    assert(before !== null, 'getPortfolioSummary returns data for authed user')
    assert(before!.positions.length === 0, 'fresh user has 0 positions')
    assert(Math.abs(before!.cash_balance - 100_000) < 1e-6, 'fresh cash_balance == 100,000')
    assert(Math.abs(before!.total_value - 100_000) < 1e-6, 'fresh total_value == 100,000')
    assert(Math.abs(before!.return_pct - 0) < 1e-6, 'fresh return_pct == 0')

    // cheapest player so a few shares fit inside 100k cash
    const { data: players, error: pErr } = await admin
      .from('players')
      .select('id, full_name, current_price')
      .order('current_price', { ascending: true })
      .limit(1)
    if (pErr || !players?.length) throw pErr ?? new Error('no players seeded')
    const player = players[0]
    const shares = 3
    console.log(`\n› buying ${shares} shares of ${player.full_name} (price ${player.current_price}) via trade() RPC:`)

    const { data: tradeRes, error: tErr } = await user.rpc('trade', {
      p_player_id: player.id,
      p_shares: shares,
      p_side: 'buy',
    })
    if (tErr) throw tErr
    const ok = typeof tradeRes === 'object' && tradeRes !== null && (tradeRes as { ok?: unknown }).ok === true
    assert(ok, `trade() ok (response: ${JSON.stringify(tradeRes)})`)
    boughtPlayerId = player.id
    boughtShares = shares

    console.log('\n› portfolio after buy (real getPortfolioSummary):')
    const after = await getPortfolioSummary(user)
    assert(after !== null, 'portfolio fetch after buy')
    const pos = after!.positions.find((p) => p.player_id === player.id)
    assert(pos !== undefined, 'bought player appears in positions')
    assert(Math.abs(pos!.shares - shares) < 1e-6, `position shares == ${shares}`)
    assert(pos!.team_name.length > 0, 'position has team_name')
    assert(pos!.position_code.length > 0, 'position has position_code')
    assert(
      Math.abs(pos!.market_value - pos!.shares * pos!.current_price) < 1e-3,
      'market_value == shares × current_price',
    )
    assert(
      Math.abs(pos!.pnl_abs - (pos!.current_price - pos!.avg_cost) * pos!.shares) < 1e-3,
      'pnl_abs == (current_price − avg_cost) × shares',
    )
    assert(after!.cash_balance < before!.cash_balance, 'cash decreased after buy')

    // The headline check: % return == ADR-007 (same formula v_leaderboard ranks on)
    const expectedReturn = ((after!.total_value - 100_000) / 100_000) * 100
    assert(Math.abs(after!.return_pct - expectedReturn) < 1e-6, 'return_pct == (total−100000)/100000×100 (ADR-007)')

    const sumMv = after!.positions.reduce((s, p) => s + p.market_value, 0)
    assert(
      Math.abs(after!.total_value - (after!.cash_balance + sumMv)) < 1e-2,
      'total_value == cash_balance + Σ market_value',
    )

    console.log(`\n✅ E2E PASSED — ${passed} assertions`)
  } finally {
    console.log('\n› cleanup:')
    // Sell the shares back first so shares_outstanding returns to its original
    // value (buy +N then sell −N = net 0) — keeps invariant #5 intact.
    if (user && boughtShares > 0 && boughtPlayerId) {
      const { error } = await user.rpc('trade', {
        p_player_id: boughtPlayerId,
        p_shares: boughtShares,
        p_side: 'sell',
      })
      if (error) console.warn(`  ⚠ sell-back failed — run \`pnpm check-invariants\`: ${error.message}`)
      else console.log('  ✓ sold test shares back (shares_outstanding restored)')
    }
    await admin.auth.admin.deleteUser(userId)
    console.log('  ✓ deleted test user')
  }
}

main().catch((err) => {
  console.error('\n❌ E2E FAILED:', err instanceof Error ? err.message : err)
  process.exit(1)
})
