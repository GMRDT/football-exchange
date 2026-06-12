/**
 * Pure pricing formulas — the SINGLE source of truth implementation for
 * fair value, survival, mean reversion, drip and circuit breakers
 * (docs/MARKET_ENGINE.md; if this file and the doc diverge, the doc wins).
 *
 * No I/O, no Deno/Node globals: imported by the ingest/tick Edge Functions
 * (Deno) and unit-tested with Vitest (Node).
 *
 * ADR-004: NUMERIC values enter and leave as strings; all arithmetic is
 * decimal.js. float64 is never used for money or prices.
 */
import Decimal from 'decimal.js'

// Postgres round() on NUMERIC rounds half away from zero — mirror it so
// TS-computed values match what the SQL side would persist.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

/** Strings (NUMERIC over the wire) or Decimals. Deliberately NOT `number`. */
export type DecimalInput = string | Decimal

const SCALE = 6 // NUMERIC(20,6)

// MARKET_ENGINE.md §1.2 — per-event clamp (one event can never move V more
// than this).
export const EVENT_PCT_MIN = new Decimal('-0.15')
export const EVENT_PCT_MAX = new Decimal('0.25')

// §1.3 — tournament survival multipliers.
export const SURVIVAL_ADVANCE = new Decimal('1.15')
export const SURVIVAL_ELIMINATED = new Decimal('0.50')

export function dec(value: DecimalInput): Decimal {
  return value instanceof Decimal ? value : new Decimal(value)
}

/**
 * The one blessed number→Decimal conversion, for runtime PARAMETERS coming
 * out of market_params jsonb (λ, drip_minutes, breaker bounds — never money).
 * String(n) is the shortest exact representation of the JSON literal.
 */
export function decFromParam(value: number | string): Decimal {
  return new Decimal(String(value))
}

export function round6(value: DecimalInput): Decimal {
  return dec(value).toDecimalPlaces(SCALE, Decimal.ROUND_HALF_UP)
}

export function clamp(x: DecimalInput, lo: DecimalInput, hi: DecimalInput): Decimal {
  return Decimal.min(Decimal.max(dec(x), dec(lo)), dec(hi))
}

/**
 * §1.2: the clamped fractional fair-value move for one event. This same value
 * is the drip target `total_pct` (§2.2, drip_pct_factor = 1).
 * `c` = recency coefficient (MVP: 1.0 flat).
 */
export function eventDeltaPct(perfPoints: DecimalInput, c: DecimalInput = '1'): Decimal {
  return clamp(dec(perfPoints).times(dec(c)), EVENT_PCT_MIN, EVENT_PCT_MAX)
}

/** §1.2: V(t+1) = V(t) × (1 + clamp(perf × c, −0.15, +0.25)), at 6 dp. */
export function applyEventToFairValue(
  fairValue: DecimalInput,
  perfPoints: DecimalInput,
  c: DecimalInput = '1'
): Decimal {
  return round6(dec(fairValue).times(eventDeltaPct(perfPoints, c).plus(1)))
}

/** §1.3: V × 1.15 on advancing, V × 0.50 on elimination, at 6 dp. */
export function applySurvival(fairValue: DecimalInput, advanced: boolean): Decimal {
  return round6(dec(fairValue).times(advanced ? SURVIVAL_ADVANCE : SURVIVAL_ELIMINATED))
}

/** §2.3: P(new) = P × (1 − λ) + V × λ, at 6 dp. Fixed point at P == V. */
export function meanReversion(
  price: DecimalInput,
  fairValue: DecimalInput,
  lambda: DecimalInput
): Decimal {
  const l = dec(lambda)
  return round6(dec(price).times(new Decimal(1).minus(l)).plus(dec(fairValue).times(l)))
}

export type CircuitBreakerParams = {
  /** §4 max price change per day, e.g. '0.50'. */
  maxDailyPct: DecimalInput
  /** §4 absolute floor, e.g. '100'. */
  minPrice: DecimalInput
  /** §4 absolute cap as a multiple of base_value, e.g. '10'. */
  maxPriceMultiplier: DecimalInput
}

/**
 * §4 clamps, in the same order as trade(): daily band around refPrice (the
 * most recent price older than 24h, fallback base_value) → min-price floor →
 * base_value × multiplier cap. All bounds rounded to 6 dp like the SQL side.
 */
export function applyCircuitBreakers(
  priceNew: DecimalInput,
  baseValue: DecimalInput,
  refPrice: DecimalInput,
  params: CircuitBreakerParams
): Decimal {
  const ref = dec(refPrice)
  const maxDaily = dec(params.maxDailyPct)
  const lower = round6(ref.times(new Decimal(1).minus(maxDaily)))
  const upper = round6(ref.times(new Decimal(1).plus(maxDaily)))
  let p = clamp(dec(priceNew), lower, upper)
  p = Decimal.max(p, dec(params.minPrice))
  p = Decimal.min(p, round6(dec(baseValue).times(dec(params.maxPriceMultiplier))))
  return round6(p)
}

export type DripResult = {
  /** Multiplicative increment for this tick: P ×= (1 + applyNow). */
  applyNow: Decimal
  /** New applied_pct to persist (cumulative progress, 6 dp). */
  newAppliedPct: Decimal
  /** Drip window fully elapsed → apply remainder and delete the delta row. */
  done: boolean
}

/**
 * §2.2 wall-clock drip with exact telescoping.
 *
 *   progress  = clamp(elapsed_minutes / drip_minutes, 0, 1)
 *   target    = round6(total_pct × progress)        (= total_pct when done)
 *   applyNow  = (1 + target) / (1 + applied_pct) − 1
 *
 * The product of per-tick factors collapses to exactly (1 + total_pct)
 * regardless of tick count or spacing: ∏ (1+tᵢ)/(1+tᵢ₋₁) = (1+total)/(1+0).
 * A naive `target − applied` increment would compound geometrically
 * (3 × 5% → ×1.157625, not ×1.15). Denominator is safe: total_pct ≥ −0.15
 * (per-event clamp) ⇒ 1 + applied ≥ 0.85. Time is integer epoch ms (not
 * money); robust to missed/uneven ticks because progress is wall-clock.
 */
export function computeDrip(
  totalPct: DecimalInput,
  appliedPct: DecimalInput,
  createdAtMs: number,
  nowMs: number,
  dripMinutes: DecimalInput
): DripResult {
  const total = dec(totalPct)
  const applied = dec(appliedPct)
  const elapsedMin = new Decimal(Math.max(nowMs - createdAtMs, 0)).div(60_000)
  const progress = clamp(elapsedMin.div(dec(dripMinutes)), '0', '1')
  const done = progress.gte(1)
  const target = done ? total : round6(total.times(progress))
  const applyNow = new Decimal(1).plus(target).div(new Decimal(1).plus(applied)).minus(1)
  return { applyNow, newAppliedPct: target, done }
}
