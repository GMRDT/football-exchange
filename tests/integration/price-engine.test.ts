/**
 * Integration tests for the F3 price engine RPCs against the local stack.
 * Requires `supabase start` and .env.local keys.
 *
 * The two acceptance proofs live here:
 *  - IDEMPOTENCY: the same synthetic goal ingested twice updates fair_value
 *    exactly once and enqueues exactly one drip delta.
 *  - CONVERGENCE: repeated ticks move current_price toward fair_value with
 *    |P − V| / V shrinking monotonically; the drip completes within its
 *    window and the delta row is deleted.
 *
 * The tick loop drives the SAME pure runTick() the Edge Function uses, with
 * the state snapshot filtered to this suite's players so a parallel test
 * file's fixtures are never touched. The wall clock is fast-forwarded by
 * backdating pending_price_deltas.created_at (service role bypasses RLS).
 */
import { afterAll, beforeAll, expect, test } from 'vitest'
import { adminClient, anonClient, createTestPlayer, createTestTeam, toMicros } from './helpers'
import { runTick, type TickState } from '../../supabase/functions/_shared/tick-core'
import { applySurvival } from '../../supabase/functions/_shared/market'
import type { Json } from '../../src/lib/supabase/types'

const MINUTE_MS = 60_000

const teamIds: string[] = []
const playerIds: string[] = []
const matchIds: string[] = []

let goalEventTypeId: string

async function newTeam(): Promise<string> {
  const id = await createTestTeam()
  teamIds.push(id)
  return id
}

async function newPlayer(teamId: string): Promise<string> {
  const id = await createTestPlayer(teamId)
  playerIds.push(id)
  return id
}

async function newMatch(
  homeTeamId: string,
  awayTeamId: string,
  roundSortOrder: 1 | 3 = 1
): Promise<string> {
  const { data: round, error: roundError } = await adminClient
    .from('rounds')
    .select('id')
    .eq('sort_order', roundSortOrder)
    .single()
  if (roundError || !round) throw new Error(`round lookup failed: ${roundError?.message}`)

  const { data, error } = await adminClient
    .from('matches')
    .insert({
      api_fixture_id: Math.floor(Math.random() * 1_000_000_000),
      round_id: round.id,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      kickoff_utc: new Date(Date.now() - 2 * 60 * MINUTE_MS).toISOString(),
      status: '2H',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`newMatch failed: ${error?.message}`)
  matchIds.push(data.id)
  return data.id
}

async function getPlayer(id: string) {
  const { data, error } = await adminClient
    .from('players')
    .select('current_price, fair_value')
    .eq('id', id)
    .single()
  if (error || !data) throw new Error(`getPlayer failed: ${error?.message}`)
  return data
}

async function getDeltas(playerId: string) {
  const { data, error } = await adminClient
    .from('pending_price_deltas')
    .select('id, total_pct, applied_pct')
    .eq('player_id', playerId)
  if (error || !data) throw new Error(`getDeltas failed: ${error?.message}`)
  return data
}

type IngestEventArgs = {
  p_match_id: string
  p_player_id: string | null
  p_event_type_id: string
  p_minute: number | null
  p_api_event_key: string
  p_expected_fair_value: string | null
  p_new_fair_value: string | null
  p_total_pct: string | null
}

/** NUMERIC args travel as strings (ADR-004); the generated types say number
 * but PostgREST coerces text → numeric exactly. */
function rpcIngestEvent(client: ReturnType<typeof anonClient>, args: IngestEventArgs) {
  return client.rpc('ingest_event', args as never)
}

async function ingestGoal(matchId: string, playerId: string, key: string, expectedFv: string, newFv: string) {
  return rpcIngestEvent(adminClient, {
    p_match_id: matchId,
    p_player_id: playerId,
    p_event_type_id: goalEventTypeId,
    p_minute: 23,
    p_api_event_key: key,
    p_expected_fair_value: expectedFv,
    p_new_fair_value: newFv,
    p_total_pct: '0.08',
  })
}

/** Backdates every pending delta of a player so the wall-clock drip advances. */
async function backdateDeltas(playerId: string, minutesAgo: number) {
  const { error } = await adminClient
    .from('pending_price_deltas')
    .update({ created_at: new Date(Date.now() - minutesAgo * MINUTE_MS).toISOString() })
    .eq('player_id', playerId)
  if (error) throw new Error(`backdateDeltas failed: ${error.message}`)
}

/** One engine tick restricted to this suite's players. */
async function tickMine(): Promise<ReturnType<typeof runTick>> {
  const { data, error } = await adminClient.rpc('get_tick_state')
  if (error) throw new Error(`get_tick_state failed: ${error.message}`)
  const state = data as unknown as TickState
  state.players = state.players.filter((p) => playerIds.includes(p.id))
  state.deltas = state.deltas.filter((d) => playerIds.includes(d.player_id))
  const result = runTick(state)
  if (result.players.length > 0) {
    const { error: applyError } = await adminClient.rpc('apply_tick', {
      p: result as unknown as Json,
    })
    if (applyError) throw new Error(`apply_tick failed: ${applyError.message}`)
  }
  return result
}

beforeAll(async () => {
  const { data, error } = await adminClient
    .from('event_types')
    .select('id')
    .eq('code', 'goal')
    .single()
  if (error || !data) throw new Error(`event_types lookup failed: ${error?.message}`)
  goalEventTypeId = data.id
}, 30_000)

afterAll(async () => {
  // matches first (match_events cascade), then price data, players, teams.
  if (matchIds.length > 0) await adminClient.from('matches').delete().in('id', matchIds)
  if (playerIds.length > 0) {
    await adminClient.from('pending_price_deltas').delete().in('player_id', playerIds)
    await adminClient.from('price_history').delete().in('player_id', playerIds)
    await adminClient.from('players').delete().in('id', playerIds)
  }
  if (teamIds.length > 0) await adminClient.from('teams').delete().in('id', teamIds)
}, 60_000)

// ── 1. Idempotency proof ──────────────────────────────────────────────────────

test('same goal ingested twice: fair_value moves once, exactly one delta', async () => {
  const teamId = await newTeam()
  const playerId = await newPlayer(teamId) // base = fair = price = 1000
  const matchId = await newMatch(teamId, await newTeam())
  const key = `it-idem-${playerId}`

  const first = await ingestGoal(matchId, playerId, key, '1000', '1080')
  expect(first.error).toBeNull()
  expect((first.data as { inserted: boolean }).inserted).toBe(true)

  // The poller re-returns the full event list: identical key, fresh FV read.
  const second = await ingestGoal(matchId, playerId, key, '1080', '1166.4')
  expect(second.error).toBeNull()
  expect((second.data as { inserted: boolean }).inserted).toBe(false)

  const player = await getPlayer(playerId)
  expect(toMicros(player.fair_value)).toBe(toMicros('1080')) // applied exactly once

  const deltas = await getDeltas(playerId)
  expect(deltas).toHaveLength(1)
  expect(toMicros(deltas[0].total_pct)).toBe(toMicros('0.08'))
  expect(toMicros(deltas[0].applied_pct)).toBe(0n)
})

test('stale fair-value read: whole ingest_event rolls back, retry path works', async () => {
  const teamId = await newTeam()
  const playerId = await newPlayer(teamId)
  const matchId = await newMatch(teamId, await newTeam())
  const key = `it-conflict-${playerId}`

  // Wrong expected FV (player is at 1000) → fv_conflict, NOTHING persisted.
  const stale = await ingestGoal(matchId, playerId, key, '999', '1078.92')
  expect(stale.error?.message).toContain('fv_conflict')

  const { count } = await adminClient
    .from('match_events')
    .select('id', { count: 'exact', head: true })
    .eq('api_event_key', key)
  expect(count).toBe(0) // event insert rolled back with the FV update
  expect(await getDeltas(playerId)).toHaveLength(0)

  // Retry with the fresh value (what the Edge Function does) succeeds.
  const retry = await ingestGoal(matchId, playerId, key, '1000', '1080')
  expect(retry.error).toBeNull()
  expect((retry.data as { inserted: boolean }).inserted).toBe(true)
})

// ── 2. Convergence proof ──────────────────────────────────────────────────────

test('after a goal, ticks shrink |P−V|/V monotonically and the drip completes', async () => {
  const teamId = await newTeam()
  const playerId = await newPlayer(teamId) // P = V = 1000
  const matchId = await newMatch(teamId, await newTeam())

  const goal = await ingestGoal(matchId, playerId, `it-conv-${playerId}`, '1000', '1080')
  expect(goal.error).toBeNull()

  const gapPct = async () => {
    const p = await getPlayer(playerId)
    return Math.abs(Number(p.current_price) - Number(p.fair_value)) / Number(p.fair_value)
  }

  let lastGap = await gapPct() // 80 / 1080 ≈ 7.4%
  expect(lastGap).toBeGreaterThan(0.07)

  // Fast-forward the wall clock through the 3-minute drip window, then keep
  // ticking on pure mean reversion.
  const minutesAgo = [1, 2, 3, 4, 4, 4, 4, 4]
  for (const minutes of minutesAgo) {
    await backdateDeltas(playerId, minutes)
    await tickMine()
    const gap = await gapPct()
    expect(gap).toBeLessThanOrEqual(lastGap)
    lastGap = gap
  }

  // Drip done within its window → delta deleted; price close to fair value.
  expect(await getDeltas(playerId)).toHaveLength(0)
  expect(lastGap).toBeLessThan(0.01)

  // Snapshots were written with reason 'tick' for the changed prices.
  const { count } = await adminClient
    .from('price_history')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId)
    .eq('reason', 'tick')
  expect(count).toBeGreaterThan(0)
})

test('apply_tick skips a player whose price moved since the snapshot', async () => {
  const teamId = await newTeam()
  const playerId = await newPlayer(teamId)

  const { data, error } = await adminClient.rpc('apply_tick', {
    p: {
      players: [
        {
          player_id: playerId,
          expected_price: '999.000000', // stale: actual price is 1000
          new_price: '1234.000000',
          fair_value: '1000.000000',
          price_changed: true,
          deltas: [],
        },
      ],
    } as unknown as Json,
  })
  expect(error).toBeNull()
  expect(data).toMatchObject({ players_updated: 0, players_skipped: 1 })

  const player = await getPlayer(playerId)
  expect(toMicros(player.current_price)).toBe(toMicros('1000'))
})

// ── 3. FT reconciliation ──────────────────────────────────────────────────────

test('finalize_match applies survival exactly once and is idempotent', async () => {
  const winnerTeam = await newTeam()
  const loserTeam = await newTeam()
  const winnerPlayer = await newPlayer(winnerTeam)
  const loserPlayer = await newPlayer(loserTeam)
  const matchId = await newMatch(winnerTeam, loserTeam, 3) // knockout round

  const { data: round } = await adminClient
    .from('rounds')
    .select('id')
    .eq('sort_order', 3)
    .single()

  const fairValues = [
    { player_id: winnerPlayer, fair_value: applySurvival('1000', true).toFixed(6) },
    { player_id: loserPlayer, fair_value: applySurvival('1000', false).toFixed(6) },
  ]
  const eliminated = { team_id: loserTeam, round_id: round?.id }

  const first = await adminClient.rpc('finalize_match', {
    p_match_id: matchId,
    p_fair_values: fairValues as unknown as Json,
    p_eliminated: eliminated as unknown as Json,
  })
  expect(first.error).toBeNull()
  expect(first.data).toMatchObject({ processed: true, fair_values_applied: 2 })

  expect(toMicros((await getPlayer(winnerPlayer)).fair_value)).toBe(toMicros('1150'))
  expect(toMicros((await getPlayer(loserPlayer)).fair_value)).toBe(toMicros('500'))

  const { data: team } = await adminClient
    .from('teams')
    .select('is_eliminated, eliminated_round_id')
    .eq('id', loserTeam)
    .single()
  expect(team?.is_eliminated).toBe(true)
  expect(team?.eliminated_round_id).toBe(round?.id)

  // Second call must be a complete no-op (processed guard).
  const second = await adminClient.rpc('finalize_match', {
    p_match_id: matchId,
    p_fair_values: fairValues as unknown as Json,
    p_eliminated: eliminated as unknown as Json,
  })
  expect(second.error).toBeNull()
  expect(second.data).toMatchObject({ processed: false })
  expect(toMicros((await getPlayer(winnerPlayer)).fair_value)).toBe(toMicros('1150'))
  expect(toMicros((await getPlayer(loserPlayer)).fair_value)).toBe(toMicros('500'))
})

// ── 4. Privileges: engine RPCs are service-role only ─────────────────────────

test('anon role cannot execute any price-engine RPC', async () => {
  const anon = anonClient()
  for (const fn of ['get_tick_state', 'get_ingest_state', 'check_cron_health'] as const) {
    const { error } = await anon.rpc(fn)
    expect(error, fn).not.toBeNull()
    expect(error?.code, fn).toBe('42501') // insufficient_privilege
  }

  const { error: ingestError } = await rpcIngestEvent(anon, {
    p_match_id: crypto.randomUUID(),
    p_player_id: null,
    p_event_type_id: crypto.randomUUID(),
    p_minute: 1,
    p_api_event_key: 'anon-key',
    p_expected_fair_value: '1',
    p_new_fair_value: '1',
    p_total_pct: '0',
  })
  expect(ingestError?.code).toBe('42501')
})
