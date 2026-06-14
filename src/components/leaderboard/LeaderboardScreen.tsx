'use client'

import useSWR from 'swr'
import { useLocale, useTranslations } from 'next-intl'
import { PriceChange } from '@/components/ui/PriceChange'
import { EmptyState } from '@/components/ui/EmptyState'
import { Reveal } from '@/components/ui/Reveal'
import { formatCoins } from '@/lib/format'
import { leaderboardKey } from '@/lib/swr/keys'
import {
  fetchLeaderboard,
  type LeaderboardEntry,
  type LeaderboardResponse,
} from '@/lib/leaderboard/summary'

/**
 * LeaderboardScreen — public global leaderboard (DESIGN.md §11). Server hands the
 * initial snapshot; SWR polls /api/leaderboard every 30s (same cadence as Market /
 * Portfolio). Ranked by % return (ADR-007). The signed-in user's row is tinted +
 * chipped; if they rank outside the top N, their row is pinned at the bottom.
 * Percentages go through PriceChange (the only component allowed to paint green/red).
 */

const medal = (rank: number) =>
  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`

/** One leaderboard row — presentational, so it stays hoisted out of render. */
function LeaderboardRow({
  rankLabel,
  username,
  returnPct,
  valueLabel,
  isCurrentUser,
  youLabel,
  index,
}: {
  rankLabel: string
  username: string
  returnPct: number
  valueLabel: string
  isCurrentUser: boolean
  youLabel: string
  index?: number
}) {
  return (
    <div
      className={`flex min-h-[56px] items-center gap-3 px-4 py-2 ${index !== undefined ? 'animate-row-entrance' : ''} ${isCurrentUser ? 'bg-primary/[0.06] ring-1 ring-inset ring-primary/15' : ''}`}
      style={index !== undefined ? { animationDelay: `${Math.min(index, 12) * 25}ms` } : undefined}
    >
      <span className="w-8 shrink-0 text-center text-[15px] font-semibold text-text-muted tabular-nums">
        {rankLabel}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p className="truncate text-[15px] font-semibold text-text">{username}</p>
        {isCurrentUser && (
          <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
            {youLabel}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <PriceChange pct={returnPct} />
        <span className="text-[13px] text-text-muted tabular-nums">{valueLabel}</span>
      </div>
    </div>
  )
}

export function LeaderboardScreen({ initial }: { initial: LeaderboardResponse }) {
  const t = useTranslations('leaderboard')
  const tMarket = useTranslations('market')
  const ticker = useTranslations('currency')('ticker')
  const locale = useLocale()

  const { data } = useSWR(leaderboardKey(), fetchLeaderboard, {
    refreshInterval: 30_000,
    fallbackData: initial,
    keepPreviousData: true,
  })
  const { entries, currentUserId, currentUserEntry } = data ?? initial

  const coins = (n: number) => tMarket('coins', { amount: formatCoins(n, locale), ticker })
  const youLabel = t('you')

  const row = (entry: LeaderboardEntry, isCurrentUser: boolean, index?: number) => (
    <LeaderboardRow
      key={entry.user_id}
      rankLabel={medal(entry.rank)}
      username={entry.username}
      returnPct={entry.return_pct}
      valueLabel={coins(entry.total_value)}
      isCurrentUser={isCurrentUser}
      youLabel={youLabel}
      index={index}
    />
  )

  return (
    <main className="mx-auto max-w-lg">
      <header className="px-4 pt-6 pb-3">
        <Reveal>
          <h1 className="font-display text-[28px] leading-8 font-bold text-text">{t('title')}</h1>
        </Reveal>
      </header>

      {entries.length === 0 ? (
        <EmptyState icon="🏆" message={t('empty')} ctaLabel={t('emptyCta')} ctaHref="/market" />
      ) : (
        <>
          {/* Column header */}
          <div className="flex items-center gap-3 border-t border-border px-4 pt-3 pb-2 text-[12px] leading-4 font-semibold tracking-wide text-text-muted uppercase">
            <span className="w-8 shrink-0 text-center">{t('rank')}</span>
            <span className="flex-1">{t('trader')}</span>
            <span>{t('return')}</span>
          </div>

          <section>
            {entries.map((entry, i) => row(entry, entry.user_id === currentUserId, i))}
          </section>

          {/* Signed-in user outside the top N — pin their row so they always see their standing. */}
          {currentUserEntry && (
            <section className="border-t border-border">
              <h2 className="px-4 pt-4 pb-2 text-[13px] leading-4 font-semibold tracking-wide text-text-muted uppercase">
                {t('yourRank')}
              </h2>
              {row(currentUserEntry, true)}
            </section>
          )}
        </>
      )}
    </main>
  )
}
