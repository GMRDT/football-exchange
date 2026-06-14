'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useLocale, useTranslations } from 'next-intl'
import { KitAvatar } from '@/components/ui/KitAvatar'
import { PriceChange } from '@/components/ui/PriceChange'
import { marketKey } from '@/lib/swr/keys'
import { fetchMarket, type MarketPlayer } from '@/lib/market/summary'
import { formatCoins } from '@/lib/format'

/**
 * Landing Top Movers (DESIGN.md §8/§10): live anonymous reads as the demo.
 * Top 3 by |daily change|; price-desc tiebreak so a flat market (fresh seed)
 * still shows the stars instead of an arbitrary trio.
 */
export function TopMovers({ initialPlayers }: { initialPlayers: MarketPlayer[] }) {
  const t = useTranslations('landing')
  const tMarket = useTranslations('market')
  const ticker = useTranslations('currency')('ticker')
  const locale = useLocale()

  const { data } = useSWR(marketKey(), fetchMarket, {
    refreshInterval: 30_000,
    fallbackData: { players: initialPlayers },
    keepPreviousData: true,
  })

  const movers = useMemo(() => {
    const players = data?.players ?? []
    return [...players]
      .sort(
        (a, b) =>
          Math.abs(b.daily_change_pct) - Math.abs(a.daily_change_pct) ||
          parseFloat(b.current_price) - parseFloat(a.current_price)
      )
      .slice(0, 3)
  }, [data])

  if (movers.length === 0) return null

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm shadow-black/[0.03] lg:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] leading-4 font-semibold tracking-wide text-text-muted uppercase">
          {t('topMovers')}
        </h2>
        {/* Live indicator — brand accent, not a price color (DESIGN §2 golden rule) */}
        <span aria-hidden="true" className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      </div>
      <div className="mt-2 divide-y divide-border">
        {movers.map((p) => (
          <Link
            key={p.id}
            href={`/market/${p.id}`}
            className="-mx-2 flex min-h-[56px] items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-bg active:bg-bg"
          >
            <KitAvatar colors={p.avatar_colors} fullName={p.full_name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text">
              {p.full_name}
            </span>
            <span className="text-[15px] font-semibold text-text tabular-nums">
              {tMarket('coins', { amount: formatCoins(p.current_price, locale), ticker })}
            </span>
            <PriceChange pct={p.daily_change_pct} />
          </Link>
        ))}
      </div>
    </section>
  )
}
