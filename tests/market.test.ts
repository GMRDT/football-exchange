/**
 * Unit tests for the pure market formulas (MARKET_ENGINE.md §1, §2, §4).
 * Every assertion is an exact 6-dp string comparison — any float drift fails.
 */
import { describe, expect, test } from 'vitest'
import Decimal from 'decimal.js'
import {
  applyCircuitBreakers,
  applyEventToFairValue,
  applySurvival,
  clamp,
  computeDrip,
  eventDeltaPct,
  meanReversion,
  round6,
} from '../supabase/functions/_shared/market'

const MINUTE_MS = 60_000

const BREAKERS = {
  maxDailyPct: '0.50',
  minPrice: '100',
  maxPriceMultiplier: '10',
}

describe('clamp / eventDeltaPct (§1.2 per-event cap)', () => {
  test('+0.30 perf delta is capped at +0.25', () => {
    expect(eventDeltaPct('0.30').toFixed(6)).toBe('0.250000')
  })

  test('-0.20 perf delta is capped at -0.15', () => {
    expect(eventDeltaPct('-0.20').toFixed(6)).toBe('-0.150000')
  })

  test('in-range deltas pass through exactly', () => {
    expect(eventDeltaPct('0.08').toFixed(6)).toBe('0.080000')
    expect(eventDeltaPct('-0.12').toFixed(6)).toBe('-0.120000')
  })

  test('recency coefficient scales before clamping', () => {
    // 0.20 × 2 = 0.40 → capped at 0.25
    expect(eventDeltaPct('0.20', '2').toFixed(6)).toBe('0.250000')
  })

  test('clamp boundary values are inclusive', () => {
    expect(clamp('0.25', '-0.15', '0.25').toFixed(6)).toBe('0.250000')
    expect(clamp('-0.15', '-0.15', '0.25').toFixed(6)).toBe('-0.150000')
  })
})

describe('applyEventToFairValue (§1.2)', () => {
  test('goal (+0.08) on V=1000 → 1080', () => {
    expect(applyEventToFairValue('1000', '0.08').toFixed(6)).toBe('1080.000000')
  })

  test('capped event: +0.30 on V=1000 → 1250 (not 1300)', () => {
    expect(applyEventToFairValue('1000', '0.30').toFixed(6)).toBe('1250.000000')
  })

  test('capped negative: -0.20 on V=1000 → 850 (not 800)', () => {
    expect(applyEventToFairValue('1000', '-0.20').toFixed(6)).toBe('850.000000')
  })
})

describe('applySurvival (§1.3)', () => {
  test('advance: V × 1.15', () => {
    expect(applySurvival('1000', true).toFixed(6)).toBe('1150.000000')
  })

  test('elimination: V × 0.50', () => {
    expect(applySurvival('1000', false).toFixed(6)).toBe('500.000000')
  })
})

describe('meanReversion (§2.3)', () => {
  test('P=1000, V=1100, λ=0.05 → 1005 exactly', () => {
    expect(meanReversion('1000', '1100', '0.05').toFixed(6)).toBe('1005.000000')
  })

  test('fixed point: P == V → no change', () => {
    expect(meanReversion('1234.567891', '1234.567891', '0.05').toFixed(6)).toBe('1234.567891')
  })

  test('converges monotonically toward V from both sides', () => {
    for (const start of ['800', '1400']) {
      let price = start
      let gap = new Decimal(price).minus('1100').abs()
      for (let i = 0; i < 30; i++) {
        price = meanReversion(price, '1100', '0.05').toFixed(6)
        const newGap = new Decimal(price).minus('1100').abs()
        expect(newGap.lte(gap)).toBe(true)
        gap = newGap
      }
      expect(gap.lt(new Decimal(start).minus('1100').abs())).toBe(true)
    }
  })

  test('decimal precision: awkward values stay exact at 6 dp', () => {
    // float64: 1000.1 × 0.95 = 950.0949999999999 → would drift.
    expect(meanReversion('1000.1', '2000.3', '0.05').toFixed(6)).toBe('1050.110000')

    // Repeated reversion never produces more than 6 decimal places and never
    // overshoots the fair value.
    let price = '100.123457'
    for (let i = 0; i < 100; i++) {
      const next = meanReversion(price, '100.7', '0.05')
      expect(next.toFixed(6)).toMatch(/^\d+\.\d{6}$/)
      expect(next.decimalPlaces()).toBeLessThanOrEqual(6)
      expect(next.lte('100.7')).toBe(true)
      price = next.toFixed(6)
    }
  })
})

describe('applyCircuitBreakers (§4, same order as trade())', () => {
  test('min-price floor at 100', () => {
    // ref=150 → daily band [75, 225]; 60 → 75 → floored to 100.
    expect(applyCircuitBreakers('60', '150', '150', BREAKERS).toFixed(6)).toBe('100.000000')
  })

  test('max cap at base_value × 10', () => {
    // band [500, 1500] does not bind; cap 100 × 10 = 1000 does.
    expect(applyCircuitBreakers('1400', '100', '1000', BREAKERS).toFixed(6)).toBe('1000.000000')
  })

  test('daily band ±50% of refPrice', () => {
    expect(applyCircuitBreakers('1600', '1000', '1000', BREAKERS).toFixed(6)).toBe('1500.000000')
    expect(applyCircuitBreakers('400', '1000', '1000', BREAKERS).toFixed(6)).toBe('500.000000')
  })

  test('band boundaries are inclusive (no clamp at exactly ±50%)', () => {
    expect(applyCircuitBreakers('1500', '1000', '1000', BREAKERS).toFixed(6)).toBe('1500.000000')
    expect(applyCircuitBreakers('500', '1000', '1000', BREAKERS).toFixed(6)).toBe('500.000000')
  })

  test('in-range price passes through unchanged', () => {
    expect(applyCircuitBreakers('1234.567891', '1000', '1000', BREAKERS).toFixed(6)).toBe(
      '1234.567891'
    )
  })
})

describe('computeDrip (§2.2 wall-clock, exact telescoping)', () => {
  const t0 = 1_750_000_000_000 // arbitrary epoch ms

  function dripChain(
    startPrice: string,
    totalPct: string,
    tickOffsetsMs: number[],
    dripMinutes = '3'
  ): { price: string; doneAtEnd: boolean } {
    let price = new Decimal(startPrice)
    let applied = '0'
    let done = false
    for (const offset of tickOffsetsMs) {
      const step = computeDrip(totalPct, applied, t0, t0 + offset, dripMinutes)
      price = round6(price.times(step.applyNow.plus(1)))
      applied = step.newAppliedPct.toFixed(6)
      done = step.done
    }
    return { price: price.toFixed(6), doneAtEnd: done }
  }

  test('even ticks apply exactly total_pct: 3×(0.15/3) → ×1.15, not ×1.157625', () => {
    const { price, doneAtEnd } = dripChain('1000', '0.15', [
      1 * MINUTE_MS,
      2 * MINUTE_MS,
      3 * MINUTE_MS,
    ])
    expect(price).toBe('1150.000000') // naive compounding would give 1157.625000
    expect(doneAtEnd).toBe(true)
  })

  test('uneven/missed ticks still land exactly on total_pct', () => {
    const { price, doneAtEnd } = dripChain('1000', '0.15', [45_000, 170_000, 200_000])
    expect(price).toBe('1150.000000')
    expect(doneAtEnd).toBe(true)
  })

  test('single tick at t ≥ drip_minutes applies the full move and is done', () => {
    const step = computeDrip('0.15', '0', t0, t0 + 3 * MINUTE_MS, '3')
    expect(step.applyNow.toFixed(6)).toBe('0.150000')
    expect(step.newAppliedPct.toFixed(6)).toBe('0.150000')
    expect(step.done).toBe(true)
  })

  test('negative delta drips down exactly', () => {
    const { price } = dripChain('1000', '-0.12', [MINUTE_MS, 2 * MINUTE_MS, 5 * MINUTE_MS])
    expect(price).toBe('880.000000')
  })

  test('two ticks at the same instant: second applies zero', () => {
    const first = computeDrip('0.15', '0', t0, t0 + MINUTE_MS, '3')
    const second = computeDrip(
      '0.15',
      first.newAppliedPct.toFixed(6),
      t0,
      t0 + MINUTE_MS,
      '3'
    )
    expect(second.applyNow.toFixed(6)).toBe('0.000000')
    expect(second.done).toBe(false)
  })

  test('progress is clamped: t before created_at applies zero', () => {
    const step = computeDrip('0.15', '0', t0, t0 - MINUTE_MS, '3')
    expect(step.applyNow.toFixed(6)).toBe('0.000000')
    expect(step.done).toBe(false)
  })
})
