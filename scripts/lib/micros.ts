/**
 * Exact money arithmetic in integer micros (1 unit = 10⁻⁶ FX coins).
 * NUMERIC(20,6) values map losslessly to BigInt micros — comparisons use
 * tolerance ZERO (ADR-004: never float64 for money).
 */

/**
 * Converts a NUMERIC value to BigInt micros.
 * - Strings are parsed exactly (PostgREST `::text` casts, response payloads).
 * - Numbers go through toFixed(6): exact for our magnitudes (≤ ~10⁹ with
 *   6 decimals fits in float64's 15 significant-digit roundtrip guarantee).
 */
export function toMicros(value: string | number): bigint {
  const s = typeof value === 'number' ? value.toFixed(6) : value.trim()
  const negative = s.startsWith('-')
  const abs = negative ? s.slice(1) : s
  const [intPart, fracPart = ''] = abs.split('.')
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) {
    throw new Error(`toMicros: not a numeric string: "${s}"`)
  }
  if (fracPart.length > 6) {
    // NUMERIC(20,6) can never produce more than 6 decimals; longer input
    // means a value bypassed the DB or a test computed with floats.
    throw new Error(`toMicros: more than 6 decimal places in "${s}"`)
  }
  const micros = BigInt(intPart || '0') * 1_000_000n + BigInt(fracPart.padEnd(6, '0') || '0')
  return negative ? -micros : micros
}

/** Renders BigInt micros back to a 6-decimal string (for error messages). */
export function microsToString(micros: bigint): string {
  const negative = micros < 0n
  const abs = negative ? -micros : micros
  const intPart = abs / 1_000_000n
  const fracPart = abs % 1_000_000n
  return `${negative ? '-' : ''}${intPart}.${fracPart.toString().padStart(6, '0')}`
}
