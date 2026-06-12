/**
 * Unit tests for runTick: drip → reversion → breakers composition on
 * synthetic get_tick_state() snapshots.
 */
import { expect, test } from 'vitest'
import { runTick, type TickState } from '../supabase/functions/_shared/tick-core'

const NOW = 1_750_000_000_000
const MINUTE_MS = 60_000

const PARAMS = {
  lambda: 0.05,
  drip_minutes: 3,
  circuit_breakers: { max_daily_pct: 0.5, min_price: 100, max_price_multiplier: 10 },
}

function state(partial: Partial<TickState>): TickState {
  return { now_ms: NOW, params: PARAMS, players: [], deltas: [], ...partial }
}

const PLAYER = {
  id: 'p1',
  current_price: '1000.000000',
  fair_value: '1080.000000',
  base_value: '1000.000000',
  ref_price: '1000.000000',
}

test('drip + reversion move price toward fair value', () => {
  const result = runTick(
    state({
      players: [PLAYER],
      deltas: [
        {
          id: 'd1',
          player_id: 'p1',
          total_pct: '0.080000',
          applied_pct: '0.000000',
          created_at_ms: NOW - MINUTE_MS,
        },
      ],
    })
  )

  expect(result.players).toHaveLength(1)
  const update = result.players[0]
  expect(update.expected_price).toBe('1000.000000')
  expect(update.price_changed).toBe(true)
  // drip: target = 0.08/3 → 0.026667 → P = 1026.667; reversion toward 1080.
  expect(Number(update.new_price)).toBeGreaterThan(1026)
  expect(Number(update.new_price)).toBeLessThan(1080)
  expect(update.deltas).toEqual([
    { id: 'd1', new_applied_pct: '0.026667', done: false },
  ])
})

test('delta past the drip window is marked done', () => {
  const result = runTick(
    state({
      players: [PLAYER],
      deltas: [
        {
          id: 'd1',
          player_id: 'p1',
          total_pct: '0.080000',
          applied_pct: '0.026667',
          created_at_ms: NOW - 10 * MINUTE_MS,
        },
      ],
    })
  )
  expect(result.players[0].deltas).toEqual([
    { id: 'd1', new_applied_pct: '0.080000', done: true },
  ])
})

test('settled player (P == V, no deltas) produces no update at all', () => {
  const result = runTick(
    state({
      players: [{ ...PLAYER, current_price: '1080.000000', fair_value: '1080.000000' }],
    })
  )
  expect(result.players).toEqual([])
})

test('breaker-bound player: price unchanged but delta progress still advances', () => {
  // Price already at the absolute cap (base 100 × 10 = 1000); the drip pushes
  // up, the breaker clamps back — applied_pct must advance anyway so the
  // consumed drip never replays after the band moves.
  const result = runTick(
    state({
      players: [
        {
          id: 'p1',
          current_price: '1000.000000',
          fair_value: '1000.000000',
          base_value: '100.000000',
          ref_price: '1000.000000',
        },
      ],
      deltas: [
        {
          id: 'd1',
          player_id: 'p1',
          total_pct: '0.100000',
          applied_pct: '0.000000',
          created_at_ms: NOW - MINUTE_MS,
        },
      ],
    })
  )

  expect(result.players).toHaveLength(1)
  const update = result.players[0]
  expect(update.new_price).toBe('1000.000000')
  expect(update.price_changed).toBe(false)
  expect(update.deltas[0].new_applied_pct).toBe('0.033333')
})

test('multiple deltas for one player apply in FIFO order in a single update', () => {
  const result = runTick(
    state({
      players: [PLAYER],
      deltas: [
        {
          id: 'd1',
          player_id: 'p1',
          total_pct: '0.080000',
          applied_pct: '0.000000',
          created_at_ms: NOW - 2 * MINUTE_MS,
        },
        {
          id: 'd2',
          player_id: 'p1',
          total_pct: '-0.030000',
          applied_pct: '0.000000',
          created_at_ms: NOW - MINUTE_MS,
        },
      ],
    })
  )
  expect(result.players).toHaveLength(1)
  expect(result.players[0].deltas.map((d) => d.id)).toEqual(['d1', 'd2'])
})

test('reversion-only player converges and eventually settles to no-op', () => {
  let price = '900.000000'
  let lastGap = Math.abs(900 - 1080)
  for (let i = 0; i < 500; i++) {
    const result = runTick(state({ players: [{ ...PLAYER, current_price: price }] }))
    if (result.players.length === 0) {
      // settled: reversion step rounds to zero at 6 dp
      expect(lastGap).toBeLessThan(0.001)
      return
    }
    price = result.players[0].new_price
    const gap = Math.abs(Number(price) - 1080)
    expect(gap).toBeLessThanOrEqual(lastGap)
    lastGap = gap
  }
  throw new Error('player never settled')
})
