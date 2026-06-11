/**
 * Integration tests for the trade() RPC — the only financial write path.
 * Requires `supabase start` (local stack) and .env.local keys.
 *
 * Test fixture: starter-tier player at price 1000 (L=4000, k_d=2.5,
 * spread_base=1%), so all expected amounts are exact in BigInt micros:
 *   delta(n) = n × 0.000625    fee = gross/200    net = gross ± fee
 */
import { afterAll, beforeAll, expect, test } from 'vitest'
import {
  adminClient,
  anonClient,
  callTrade,
  createTestPlayer,
  createTestTeam,
  createTestUser,
  expectedAmounts,
  starterDeltaMicros,
  toMicros,
  type TestUser,
} from './helpers'

const STARTING_BALANCE = toMicros(100_000) // signup grant, in micros
const TIMEOUT = 30_000

const users: TestUser[] = []
const playerIds: string[] = []
let teamId: string

async function newUser(): Promise<TestUser> {
  const user = await createTestUser()
  users.push(user)
  return user
}

async function newPlayer(): Promise<string> {
  const id = await createTestPlayer(teamId)
  playerIds.push(id)
  return id
}

async function getPlayer(id: string) {
  const { data, error } = await adminClient
    .from('players')
    .select('current_price, shares_outstanding, fair_value')
    .eq('id', id)
    .single()
  if (error || !data) throw new Error(`getPlayer failed: ${error?.message}`)
  return data
}

async function getBalanceMicros(userId: string): Promise<bigint> {
  const { data, error } = await adminClient
    .from('profiles')
    .select('cash_balance')
    .eq('id', userId)
    .single()
  if (error || !data) throw new Error(`getBalanceMicros failed: ${error?.message}`)
  return toMicros(data.cash_balance)
}

async function getLedger(userId: string) {
  const { data, error } = await adminClient
    .from('wallet_ledger')
    .select('delta, balance_after, entry_type, ref_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error || !data) throw new Error(`getLedger failed: ${error?.message}`)
  return data
}

async function getHolding(userId: string, playerId: string) {
  const { data, error } = await adminClient
    .from('holdings')
    .select('shares, avg_cost')
    .eq('user_id', userId)
    .eq('player_id', playerId)
    .maybeSingle()
  if (error) throw new Error(`getHolding failed: ${error.message}`)
  return data
}

beforeAll(async () => {
  teamId = await createTestTeam()
}, TIMEOUT)

afterAll(async () => {
  // Order matters: users first (auth cascade removes profiles → ledger,
  // trades, holdings), then price data, then players (trades FK is RESTRICT,
  // so player deletion only works once the users' trades are gone).
  for (const user of users) {
    await adminClient.auth.admin.deleteUser(user.userId)
  }
  if (playerIds.length > 0) {
    await adminClient.from('price_history').delete().in('player_id', playerIds)
    await adminClient.from('pending_price_deltas').delete().in('player_id', playerIds)
    await adminClient.from('players').delete().in('id', playerIds)
  }
  if (teamId) {
    await adminClient.from('teams').delete().eq('id', teamId)
  }
}, 60_000)

// ── 1. Happy path: buy ────────────────────────────────────────────────────────

test(
  'buy 10 shares: exact ledger entry, balance, avg_cost, price impact, price_history',
  async () => {
    const user = await newUser()
    const playerId = await newPlayer()
    const pMid = toMicros((await getPlayer(playerId)).current_price)

    const res = await callTrade(user.client, playerId, 'buy', 10)
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const { gross, fee, net } = expectedAmounts(pMid, 10n, 'buy')
    expect(toMicros(res.gross)).toBe(gross)
    expect(toMicros(res.fee)).toBe(fee)
    expect(toMicros(res.net)).toBe(net)

    const ledger = await getLedger(user.userId)
    const tradeEntries = ledger.filter((e) => e.entry_type === 'trade')
    expect(tradeEntries).toHaveLength(1)
    expect(toMicros(tradeEntries[0].delta)).toBe(-net)
    expect(toMicros(tradeEntries[0].balance_after)).toBe(STARTING_BALANCE - net)
    expect(tradeEntries[0].ref_id).toBe(res.trade_id)

    expect(await getBalanceMicros(user.userId)).toBe(STARTING_BALANCE - net)
    expect(toMicros(res.new_balance)).toBe(STARTING_BALANCE - net)

    const holding = await getHolding(user.userId, playerId)
    expect(holding).not.toBeNull()
    expect(toMicros(holding!.shares)).toBe(toMicros(10))
    expect(toMicros(holding!.avg_cost)).toBe(net / 10n) // net/shares, exact

    const after = await getPlayer(playerId)
    const expectedPrice = pMid + starterDeltaMicros(10n)
    expect(toMicros(after.current_price)).toBe(expectedPrice)
    expect(toMicros(res.new_price)).toBe(expectedPrice)
    expect(toMicros(after.shares_outstanding)).toBe(toMicros(10))

    const { data: history } = await adminClient
      .from('price_history')
      .select('price, reason')
      .eq('player_id', playerId)
    const tradeRows = (history ?? []).filter((r) => r.reason === 'trade')
    expect(tradeRows).toHaveLength(1)
    expect(toMicros(tradeRows[0].price)).toBe(expectedPrice)
  },
  TIMEOUT
)

// ── 2. Happy path: sell ───────────────────────────────────────────────────────

test(
  'sell after buy: exact credit, avg_cost intact, price moves down',
  async () => {
    const user = await newUser()
    const playerId = await newPlayer()

    const buyRes = await callTrade(user.client, playerId, 'buy', 10)
    expect(buyRes.ok).toBe(true)
    if (!buyRes.ok) return
    const buyNet = toMicros(buyRes.net)
    const pAfterBuy = toMicros((await getPlayer(playerId)).current_price)

    const res = await callTrade(user.client, playerId, 'sell', 4)
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const { net } = expectedAmounts(pAfterBuy, 4n, 'sell')
    expect(toMicros(res.net)).toBe(net)

    const ledger = await getLedger(user.userId)
    const credits = ledger.filter((e) => e.entry_type === 'trade' && toMicros(e.delta) > 0n)
    expect(credits).toHaveLength(1)
    expect(toMicros(credits[0].delta)).toBe(net)

    expect(await getBalanceMicros(user.userId)).toBe(STARTING_BALANCE - buyNet + net)

    const holding = await getHolding(user.userId, playerId)
    expect(toMicros(holding!.shares)).toBe(toMicros(6))
    expect(toMicros(holding!.avg_cost)).toBe(buyNet / 10n) // untouched by the sell

    const after = await getPlayer(playerId)
    expect(toMicros(after.current_price)).toBe(pAfterBuy - starterDeltaMicros(4n))
    expect(toMicros(after.shares_outstanding)).toBe(toMicros(6))
  },
  TIMEOUT
)

// ── 3. insufficient_funds ─────────────────────────────────────────────────────

test(
  'buy beyond cash balance returns insufficient_funds and writes nothing',
  async () => {
    const user = await newUser()
    const playerId = await newPlayer()

    // 200 shares × 1000 × 1.005 = 201_000 > 100_000 (and 200 ≤ max_order_size)
    const res = await callTrade(user.client, playerId, 'buy', 200)
    expect(res).toMatchObject({ ok: false, code: 'insufficient_funds' })

    const ledger = await getLedger(user.userId)
    expect(ledger.filter((e) => e.entry_type === 'trade')).toHaveLength(0)
    expect(await getHolding(user.userId, playerId)).toBeNull()
    expect(toMicros((await getPlayer(playerId)).current_price)).toBe(toMicros(1000))
  },
  TIMEOUT
)

// ── 4. insufficient_shares ────────────────────────────────────────────────────

test(
  'sell without holdings returns insufficient_shares and writes nothing',
  async () => {
    const user = await newUser()
    const playerId = await newPlayer()

    const res = await callTrade(user.client, playerId, 'sell', 1)
    expect(res).toMatchObject({ ok: false, code: 'insufficient_shares' })

    const ledger = await getLedger(user.userId)
    expect(ledger.filter((e) => e.entry_type === 'trade')).toHaveLength(0)
    expect(toMicros((await getPlayer(playerId)).shares_outstanding)).toBe(0n)
  },
  TIMEOUT
)

// ── 5. invalid_input ──────────────────────────────────────────────────────────

test(
  'negative, zero, unknown side and oversized orders return invalid_input',
  async () => {
    const user = await newUser()
    const playerId = await newPlayer()

    for (const [side, shares] of [
      ['buy', -1],
      ['buy', 0],
      ['hold', 1],
      ['buy', 501], // max_order_size = 500
    ] as const) {
      const res = await callTrade(user.client, playerId, side, shares)
      expect(res).toMatchObject({ ok: false, code: 'invalid_input' })
    }
  },
  TIMEOUT
)

// ── 6. position_cap ───────────────────────────────────────────────────────────

test(
  'accumulated cost basis above 20_000 returns position_cap',
  async () => {
    const user = await newUser()
    const playerId = await newPlayer()

    // First buy: 19 × 1000 × 1.005 = 19_095 cost basis (under the cap).
    const first = await callTrade(user.client, playerId, 'buy', 19)
    expect(first.ok).toBe(true)

    // Second buy (~2_010) would push the basis past 20_000.
    const second = await callTrade(user.client, playerId, 'buy', 2)
    expect(second).toMatchObject({ ok: false, code: 'position_cap' })

    const ledger = await getLedger(user.userId)
    expect(ledger.filter((e) => e.entry_type === 'trade')).toHaveLength(1)
  },
  TIMEOUT
)

// ── 7. volume_cap ─────────────────────────────────────────────────────────────

test(
  'daily traded volume above 50_000 returns volume_cap',
  async () => {
    const user = await newUser()
    const playerId = await newPlayer()

    // buy 19 (~19_095) + sell 19 (~18_905) + buy 19 (~19_095) ≈ 57k > 50_000.
    const buy1 = await callTrade(user.client, playerId, 'buy', 19)
    expect(buy1.ok).toBe(true)
    const sell = await callTrade(user.client, playerId, 'sell', 19)
    expect(sell.ok).toBe(true)
    const buy2 = await callTrade(user.client, playerId, 'buy', 19)
    expect(buy2).toMatchObject({ ok: false, code: 'volume_cap' })
  },
  TIMEOUT
)

// ── 8. rate_limited ───────────────────────────────────────────────────────────

test(
  '11th trade inside 60 seconds returns rate_limited',
  async () => {
    const user = await newUser()
    const playerId = await newPlayer()

    for (let i = 0; i < 10; i++) {
      const res = await callTrade(user.client, playerId, 'buy', 1)
      expect(res.ok).toBe(true)
    }

    const eleventh = await callTrade(user.client, playerId, 'buy', 1)
    expect(eleventh).toMatchObject({ ok: false, code: 'rate_limited' })
  },
  TIMEOUT
)

// ── 9. unauthorized (anon) ────────────────────────────────────────────────────

test(
  'anon client cannot execute trade() at all (EXECUTE revoked)',
  async () => {
    const playerId = await newPlayer()

    const { data, error } = await anonClient().rpc('trade', {
      p_player_id: playerId,
      p_side: 'buy',
      p_shares: 1,
    })
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  },
  TIMEOUT
)

// ── 10. Concurrency A: two users, same player ─────────────────────────────────

test(
  'two users buying the same player concurrently both succeed with exact 2×delta',
  async () => {
    const userA = await newUser()
    const userB = await newUser()
    const playerId = await newPlayer()
    const p0 = toMicros((await getPlayer(playerId)).current_price)

    const [resA, resB] = await Promise.all([
      callTrade(userA.client, playerId, 'buy', 8),
      callTrade(userB.client, playerId, 'buy', 8),
    ])
    expect(resA.ok).toBe(true)
    expect(resB.ok).toBe(true)

    const after = await getPlayer(playerId)
    expect(toMicros(after.current_price)).toBe(p0 + 2n * starterDeltaMicros(8n))
    expect(toMicros(after.shares_outstanding)).toBe(toMicros(16))
  },
  TIMEOUT
)

// ── 11. Concurrency B: same user, two simultaneous buys ───────────────────────

test(
  'same user double-firing buys gets serialized with no double-spend',
  async () => {
    const user = await newUser()
    const playerId = await newPlayer()
    const p0 = toMicros((await getPlayer(playerId)).current_price)

    const [res1, res2] = await Promise.all([
      callTrade(user.client, playerId, 'buy', 5),
      callTrade(user.client, playerId, 'buy', 5),
    ])
    expect(res1.ok).toBe(true)
    expect(res2.ok).toBe(true)
    if (!res1.ok || !res2.ok) return

    // The profile lock serializes them: one executes at p0, the other at
    // p0 + delta(5). Which is which is nondeterministic.
    const { net: netFirst } = expectedAmounts(p0, 5n, 'buy')
    const { net: netSecond } = expectedAmounts(p0 + starterDeltaMicros(5n), 5n, 'buy')
    const nets = [toMicros(res1.net), toMicros(res2.net)].sort((a, b) => (a < b ? -1 : 1))
    expect(nets).toEqual([netFirst, netSecond].sort((a, b) => (a < b ? -1 : 1)))

    const balance = await getBalanceMicros(user.userId)
    expect(balance).toBe(STARTING_BALANCE - netFirst - netSecond)

    const ledger = await getLedger(user.userId)
    const sum = ledger.reduce((acc, e) => acc + toMicros(e.delta), 0n)
    expect(sum).toBe(balance)
    expect(toMicros(ledger[ledger.length - 1].balance_after)).toBe(balance)

    const holding = await getHolding(user.userId, playerId)
    expect(toMicros(holding!.shares)).toBe(toMicros(10))
  },
  TIMEOUT
)

// ── 12. Final invariant across all test users ─────────────────────────────────

test(
  'invariant: sum of wallet_ledger deltas equals cash_balance for every test user',
  async () => {
    expect(users.length).toBeGreaterThan(0)
    for (const user of users) {
      const ledger = await getLedger(user.userId)
      const sum = ledger.reduce((acc, e) => acc + toMicros(e.delta), 0n)
      expect(sum).toBe(await getBalanceMicros(user.userId))
    }
  },
  TIMEOUT
)
