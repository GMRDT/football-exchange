#!/usr/bin/env tsx
/**
 * E2E QA for F4.5 Global Leaderboard (LOCAL stack only).
 *
 * Exercises the REAL production data path — `getLeaderboard()` from
 * src/lib/leaderboard/summary.ts — against two real users, through the
 * `v_leaderboard` materialized view and RLS:
 *
 *   1. admin-create two confirmed users A and B  → trigger grants each 100k cash
 *   2. B buys a few shares of the cheapest player (spread → return goes negative);
 *      A stays flat at 0% → deterministic ordering A ranks ABOVE B
 *   3. refresh v_leaderboard so the fresh users appear (see refreshLeaderboard)
 *   4. read getLeaderboard(clientA) and assert: both present, ranks non-decreasing,
 *      A.rank < B.rank, currentUserId == A, A is in-list (currentUserEntry null),
 *      and each return_pct matches the live v_portfolio_value (ADR-007 cross-check)
 *   5. sell B's shares back + delete both users (cleanup)
 *
 * Run: npx tsx scripts/e2e-leaderboard.ts   (or: pnpm e2e:leaderboard)
 */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'
import ws from 'ws'
import type { Database } from '../src/lib/supabase/types'
import { getLeaderboard } from '../src/lib/leaderboard/summary'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// @supabase/realtime-js checks globalThis.WebSocket at client creation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof globalThis.WebSocket === 'undefined') (globalThis as any).WebSocket = ws

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
// Local Postgres DSN — only used to REFRESH the matview (Supabase local defaults).
const pgDsn =
  process.env.SUPABASE_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

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

/**
 * Refresh v_leaderboard so freshly-created users are visible immediately.
 * v_leaderboard is a MATERIALIZED view (in prod the `refresh-leaderboard` cron
 * runs it every minute). The supabase-js admin client cannot issue this: PostgREST
 * exposes REST queries + RPCs only, not `REFRESH MATERIALIZED VIEW`, and no refresh
 * RPC exists. So we connect to local Postgres directly. Dev/local-only — gated by
 * the non-local guard above. Non-concurrent refresh is fine locally (brief lock).
 */
async function refreshLeaderboard() {
  const pg = new PgClient({ connectionString: pgDsn })
  await pg.connect()
  try {
    await pg.query('refresh materialized view public.v_leaderboard')
  } finally {
    await pg.end()
  }
}

type TestUser = {
  id: string
  email: string
  password: string
  username: string
  client: SupabaseClient<Database>
}

async function createUser(tag: string): Promise<TestUser> {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  const email = `e2e_leaderboard_${tag}_${stamp}@example.com`
  const password = `Test-${stamp}!`
  const username = `e2e_${tag}_${stamp}`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  })
  if (error || !created.user) throw error ?? new Error('createUser returned no user')

  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } })
  const { error: sErr } = await client.auth.signInWithPassword({ email, password })
  if (sErr) throw sErr

  return { id: created.user.id, email, password, username, client }
}

async function ownReturnPct(client: SupabaseClient<Database>): Promise<{ return_pct: number; total_value: number }> {
  const { data, error } = await client
    .from('v_portfolio_value')
    .select('return_pct, total_value')
    .maybeSingle()
  if (error) throw error
  return { return_pct: Number(data?.return_pct ?? 0), total_value: Number(data?.total_value ?? 0) }
}

async function main() {
  console.log('› creating two confirmed test users (A flat, B buys)…')
  const userA = await createUser('a')
  const userB = await createUser('b')

  let boughtPlayerId: string | null = null
  let boughtShares = 0

  try {
    // B buys the cheapest player so a few shares fit inside 100k; the spread pushes
    // B's return slightly negative while A stays flat at 0% → A ranks above B.
    const { data: players, error: pErr } = await admin
      .from('players')
      .select('id, full_name, current_price')
      .order('current_price', { ascending: true })
      .limit(1)
    if (pErr || !players?.length) throw pErr ?? new Error('no players seeded')
    const player = players[0]
    const shares = 3
    console.log(`\n› B buys ${shares} shares of ${player.full_name} (price ${player.current_price}) via trade():`)
    const { data: tradeRes, error: tErr } = await userB.client.rpc('trade', {
      p_player_id: player.id,
      p_shares: shares,
      p_side: 'buy',
    })
    if (tErr) throw tErr
    const ok = typeof tradeRes === 'object' && tradeRes !== null && (tradeRes as { ok?: unknown }).ok === true
    assert(ok, `trade() ok (response: ${JSON.stringify(tradeRes)})`)
    boughtPlayerId = player.id
    boughtShares = shares

    console.log('\n› refreshing v_leaderboard (matview) so both users appear:')
    await refreshLeaderboard()
    console.log('  ✓ refreshed')

    console.log('\n› leaderboard from A’s perspective (real getLeaderboard):')
    const board = await getLeaderboard(userA.client)
    assert(board.entries.length >= 2, 'leaderboard has at least the two test users')
    assert(board.currentUserId === userA.id, 'currentUserId == signed-in user (A)')

    const entryA = board.entries.find((e) => e.user_id === userA.id)
    const entryB = board.entries.find((e) => e.user_id === userB.id)
    assert(entryA !== undefined, 'user A appears in the leaderboard')
    assert(entryB !== undefined, 'user B appears in the leaderboard')
    assert(board.currentUserEntry === null, 'A is in the top list → no pinned currentUserEntry')

    // Ranks are non-decreasing in the returned order (ordered by rank asc).
    const ordered = board.entries.every(
      (e, i) => i === 0 || board.entries[i - 1].rank <= e.rank,
    )
    assert(ordered, 'entries are ordered by rank ascending')
    assert(entryA!.rank < entryB!.rank, 'A (flat) ranks above B (bought, spread → negative)')

    // A is flat: total 100k, 0% return.
    assert(Math.abs(entryA!.total_value - 100_000) < 1e-6, 'A total_value == 100,000 (flat)')
    assert(Math.abs(entryA!.return_pct - 0) < 1e-6, 'A return_pct == 0 (flat)')
    assert(entryB!.return_pct < 0, 'B return_pct is negative after buy (spread)')

    // ADR-007: the ranking metric equals (total-100000)/100000*100 for both.
    const adr = (v: number) => ((v - 100_000) / 100_000) * 100
    assert(Math.abs(entryA!.return_pct - adr(entryA!.total_value)) < 1e-6, 'A return_pct == ADR-007 formula')
    assert(Math.abs(entryB!.return_pct - adr(entryB!.total_value)) < 1e-6, 'B return_pct == ADR-007 formula')

    // Cross-check against the live v_portfolio_value each user owns (the matview’s source).
    const liveA = await ownReturnPct(userA.client)
    const liveB = await ownReturnPct(userB.client)
    assert(Math.abs(entryA!.return_pct - liveA.return_pct) < 1e-6, 'A return_pct matches live v_portfolio_value')
    assert(Math.abs(entryB!.return_pct - liveB.return_pct) < 1e-6, 'B return_pct matches live v_portfolio_value')

    console.log(`\n✅ E2E PASSED — ${passed} assertions`)
  } finally {
    console.log('\n› cleanup:')
    // Sell B's shares back first so shares_outstanding returns to its original value
    // (buy +N then sell −N = net 0) — keeps invariant #5 intact.
    if (boughtShares > 0 && boughtPlayerId) {
      const { error } = await userB.client.rpc('trade', {
        p_player_id: boughtPlayerId,
        p_shares: boughtShares,
        p_side: 'sell',
      })
      if (error) console.warn(`  ⚠ sell-back failed — run \`pnpm check-invariants\`: ${error.message}`)
      else console.log('  ✓ sold B test shares back (shares_outstanding restored)')
    }
    await admin.auth.admin.deleteUser(userA.id)
    await admin.auth.admin.deleteUser(userB.id)
    console.log('  ✓ deleted test users')
  }
}

main().catch((err) => {
  console.error('\n❌ E2E FAILED:', err instanceof Error ? err.message : err)
  process.exit(1)
})
