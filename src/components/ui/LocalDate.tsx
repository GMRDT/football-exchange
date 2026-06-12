'use client'

import { useLocale } from 'next-intl'
import { formatDate } from '@/lib/format'

/**
 * LocalDate — renders a UTC timestamp in the USER's timezone (CLAUDE.md:
 * kickoff times always in the user's timezone). Must be a client component:
 * the server only knows its own TZ. suppressHydrationWarning absorbs the
 * server-TZ vs user-TZ first paint difference.
 */
export function LocalDate({ iso }: { iso: string }) {
  const locale = useLocale()
  return <time dateTime={iso} suppressHydrationWarning>{formatDate(iso, locale)}</time>
}
