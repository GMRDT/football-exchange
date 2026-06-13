'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useLocale, useTranslations } from 'next-intl'
import { KitAvatar } from '@/components/ui/KitAvatar'
import { PriceChange } from '@/components/ui/PriceChange'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCoins } from '@/lib/format'
import { portfolioKey } from '@/lib/swr/keys'
import { fetchPortfolio, type PortfolioResponse } from '@/lib/portfolio/summary'

/**
 * PortfolioScreen — authed Portfolio (DESIGN.md §10). Server hands the initial
 * snapshot; SWR polls /api/portfolio every 30s (same cadence as Market). Money is
 * rendered via formatCoins + the single-sourced `currency.ticker`; percentages via
 * PriceChange (the only component allowed to paint green/red).
 */
export function PortfolioScreen({ initial }: { initial: PortfolioResponse }) {
  const t = useTranslations('portfolio')
  const tMarket = useTranslations('market')
  const tCommon = useTranslations('common')
  const ticker = useTranslations('currency')('ticker')
  const locale = useLocale()

  const { data } = useSWR(portfolioKey(), fetchPortfolio, {
    refreshInterval: 30_000,
    fallbackData: initial,
    keepPreviousData: true,
  })
  const { positions, total_value, cash_balance, return_pct } = data ?? initial

  const [copied, setCopied] = useState(false)

  const coins = (n: number) => tMarket('coins', { amount: formatCoins(n, locale), ticker })

  // Signed, locale-aware money for P&L (e.g. "+1,940" / "-1,940"); ticker stays single-sourced.
  const signedCoins = (n: number) =>
    tMarket('coins', {
      amount: new Intl.NumberFormat(locale, {
        signDisplay: 'exceptZero',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(n),
      ticker,
    })

  const formatPct = (n: number) =>
    `${new Intl.NumberFormat(locale, {
      signDisplay: 'exceptZero',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n)}%`

  async function handleShare() {
    const text = t('shareText', {
      appName: tCommon('appName'),
      pct: formatPct(return_pct),
      value: formatCoins(total_value, locale),
      ticker,
    })
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: tCommon('appName'), text })
      } else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // user dismissed the native share sheet — no-op
    }
  }

  return (
    <main className="mx-auto max-w-lg">
      <header className="px-4 pt-6 pb-3">
        <h1 className="font-display text-[28px] leading-8 font-bold text-text">{t('title')}</h1>
      </header>

      {positions.length === 0 ? (
        <EmptyState icon="📊" message={t('empty')} ctaLabel={t('emptyCta')} ctaHref="/market" />
      ) : (
        <>
          {/* Aggregate (DESIGN §10) */}
          <section className="px-4 pb-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-display text-[32px] leading-9 font-extrabold text-text tabular-nums">
                  {coins(total_value)}
                </p>
                <p className="mt-0.5 text-[13px] text-text-muted">{t('totalValue')}</p>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <PriceChange pct={return_pct} />
                <p className="text-[13px] text-text-muted">{t('return')}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[15px] text-text-muted tabular-nums">
                {t('cash')}: {coins(cash_balance)}
              </p>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-[15px] font-semibold text-text transition active:scale-[0.98] active:bg-bg"
              >
                {t('share')}
                <span aria-hidden="true">📤</span>
              </button>
            </div>
          </section>

          {/* Positions */}
          <section className="border-t border-border">
            <h2 className="px-4 pt-4 pb-2 text-[13px] leading-4 font-semibold tracking-wide text-text-muted uppercase">
              {t('players', { count: positions.length })}
            </h2>
            <div>
              {positions.map((p) => (
                <Link
                  key={p.player_id}
                  href={`/market/${p.player_id}`}
                  className="flex min-h-[56px] items-center gap-3 px-4 py-2 transition active:bg-bg"
                >
                  <KitAvatar colors={p.avatar_colors} fullName={p.full_name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-text">{p.full_name}</p>
                    <p className="text-[13px] text-text-muted tabular-nums">
                      {p.shares} {t('sharesAbbr')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <p className="text-[15px] font-semibold text-text tabular-nums">
                      {coins(p.market_value)}
                    </p>
                    <span className="flex items-center gap-1.5">
                      <span className="text-[13px] text-text-muted tabular-nums">
                        {signedCoins(p.pnl_abs)}
                      </span>
                      <PriceChange pct={p.pnl_pct} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      {copied && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-20 z-50 mx-auto w-fit rounded-full bg-text px-4 py-2 text-[13px] font-medium text-white shadow-lg"
        >
          {t('shareCopied')}
        </div>
      )}
    </main>
  )
}
