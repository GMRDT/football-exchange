/**
 * formatCoins — formats a FX coin amount with locale-aware thousand separators.
 * Monetary values arrive as strings from the DB (NUMERIC → string) to avoid
 * IEEE-754 precision loss; pass them directly here.
 */
export function formatCoins(amount: number | string, locale: string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * formatDate — formats a UTC date/datetime string in the user's locale and
 * their local timezone (browser infers TZ automatically via Intl).
 */
export function formatDate(date: Date | string, locale: string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}
