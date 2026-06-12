/**
 * Pure tick computation: consumes the get_tick_state() snapshot and produces
 * the apply_tick() payload. All math delegated to market.ts (single-source
 * invariant); no I/O, so the convergence proof in the integration suite can
 * drive this exact code from Node.
 *
 * Order per task spec: drip → mean reversion → circuit breakers → snapshot.
 */
import { computeDrip, meanReversion, applyCircuitBreakers, dec, decFromParam, round6 } from './market.ts'

// ── get_tick_state() shape (NUMERIC as strings, time as epoch ms) ────────────

export type MarketParams = {
  lambda: number
  drip_minutes: number
  circuit_breakers: {
    max_daily_pct: number
    min_price: number
    max_price_multiplier: number
  }
}

export type TickPlayer = {
  id: string
  current_price: string
  fair_value: string
  base_value: string
  /** Daily-band reference: latest price older than 24h, fallback base_value. */
  ref_price: string
}

export type TickDelta = {
  id: string
  player_id: string
  total_pct: string
  applied_pct: string
  created_at_ms: number
}

export type TickState = {
  now_ms: number
  params: MarketParams
  players: TickPlayer[]
  deltas: TickDelta[]
}

// ── apply_tick() payload shape ────────────────────────────────────────────────

export type DeltaUpdate = {
  id: string
  new_applied_pct: string
  done: boolean
}

export type PlayerUpdate = {
  player_id: string
  /** Optimistic-concurrency guard: apply_tick skips the player if a trade
   * moved the price after this snapshot was taken. */
  expected_price: string
  new_price: string
  fair_value: string
  /** price_history row only when true; delta progress advances regardless. */
  price_changed: boolean
  deltas: DeltaUpdate[]
}

export type TickResult = {
  players: PlayerUpdate[]
}

export function runTick(state: TickState): TickResult {
  const lambda = decFromParam(state.params.lambda)
  const dripMinutes = decFromParam(state.params.drip_minutes)
  const breakers = {
    maxDailyPct: decFromParam(state.params.circuit_breakers.max_daily_pct),
    minPrice: decFromParam(state.params.circuit_breakers.min_price),
    maxPriceMultiplier: decFromParam(state.params.circuit_breakers.max_price_multiplier),
  }

  // get_tick_state orders deltas by (player_id, created_at); insertion order
  // per player preserves the FIFO drip sequence.
  const deltasByPlayer = new Map<string, TickDelta[]>()
  for (const delta of state.deltas) {
    const list = deltasByPlayer.get(delta.player_id)
    if (list) list.push(delta)
    else deltasByPlayer.set(delta.player_id, [delta])
  }

  const players: PlayerUpdate[] = []

  for (const player of state.players) {
    let price = dec(player.current_price)

    const deltaUpdates: DeltaUpdate[] = []
    for (const delta of deltasByPlayer.get(player.id) ?? []) {
      const { applyNow, newAppliedPct, done } = computeDrip(
        delta.total_pct,
        delta.applied_pct,
        delta.created_at_ms,
        state.now_ms,
        dripMinutes
      )
      price = round6(price.times(applyNow.plus(1)))
      deltaUpdates.push({ id: delta.id, new_applied_pct: newAppliedPct.toFixed(6), done })
    }

    price = meanReversion(price, player.fair_value, lambda)
    price = applyCircuitBreakers(price, player.base_value, player.ref_price, breakers)

    const priceChanged = !price.eq(dec(player.current_price))
    if (priceChanged || deltaUpdates.length > 0) {
      players.push({
        player_id: player.id,
        expected_price: player.current_price,
        new_price: price.toFixed(6),
        fair_value: player.fair_value,
        price_changed: priceChanged,
        deltas: deltaUpdates,
      })
    }
  }

  return { players }
}
