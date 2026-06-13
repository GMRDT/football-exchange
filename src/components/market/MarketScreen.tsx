'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
import { KitAvatar } from '@/components/ui/KitAvatar'
import { PriceChange } from '@/components/ui/PriceChange'
import { PlayerRow } from '@/components/market/PlayerRow'
import { EmptyState } from '@/components/ui/EmptyState'
import { marketKey } from '@/lib/swr/keys'
import { fetchMarket, type MarketPlayer } from '@/lib/market/summary'

type SortMode = 'change' | 'price'

export function MarketScreen({ initialPlayers }: { initialPlayers: MarketPlayer[] }) {
  const t = useTranslations('market')

  const { data } = useSWR(marketKey(), fetchMarket, {
    refreshInterval: 30_000,
    fallbackData: { players: initialPlayers },
    keepPreviousData: true,
  })
  const players = useMemo(() => data?.players ?? [], [data])

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('change')

  // FIRST MOUNT ONLY: entrance animation for market rows (DESIGN.md §4c).
  // State starts false; flips to true after all staggered animations complete
  // (15 rows × 25ms + 250ms duration ≈ 625ms — wait 700ms to be safe).
  // After that, index={undefined} prevents the class from being applied on
  // SWR polls. Stable key={player.id} ensures rows never remount on poll.
  const [entranceDone, setEntranceDone] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setEntranceDone(true), 700)
    return () => clearTimeout(id)
  }, [])

  const gainers = useMemo(
    () =>
      players
        .filter((p) => p.daily_change_pct > 0)
        .sort((a, b) => b.daily_change_pct - a.daily_change_pct)
        .slice(0, 5),
    [players]
  )
  const losers = useMemo(
    () =>
      players
        .filter((p) => p.daily_change_pct < 0)
        .sort((a, b) => a.daily_change_pct - b.daily_change_pct)
        .slice(0, 5),
    [players]
  )

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    const filtered = q
      ? players.filter(
          (p) =>
            p.full_name.toLocaleLowerCase().includes(q) ||
            p.team_name.toLocaleLowerCase().includes(q)
        )
      : players
    return [...filtered].sort((a, b) =>
      sort === 'price'
        ? parseFloat(b.current_price) - parseFloat(a.current_price)
        : b.daily_change_pct - a.daily_change_pct
    )
  }, [players, query, sort])

  return (
    <main className="mx-auto max-w-lg">
      <header className="px-4 pt-6 pb-3">
        <h1 className="font-display text-[28px] leading-8 font-bold text-text">{t('title')}</h1>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          className="mt-3 h-11 w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-text placeholder:text-text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </header>

      {players.length === 0 ? (
        <EmptyState icon="⚽" message={t('empty')} />
      ) : (
        <>
          <MoverSection label={t('topGainers')} movers={gainers} />
          <MoverSection label={t('topLosers')} movers={losers} />

          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <SortChip active={sort === 'change'} onClick={() => setSort('change')}>
              {t('sortChange')}
            </SortChip>
            <SortChip active={sort === 'price'} onClick={() => setSort('price')}>
              {t('sortPrice')}
            </SortChip>
          </div>

          {list.length === 0 ? (
            <EmptyState icon="🔍" message={t('noResults')} />
          ) : (
            <div className="border-t border-border">
              {list.map((player, i) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  index={entranceDone ? undefined : i}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}

function MoverSection({ label, movers }: { label: string; movers: MarketPlayer[] }) {
  if (movers.length === 0) return null
  return (
    <section className="pt-3">
      <h2 className="px-4 text-[13px] leading-4 font-semibold tracking-wide text-text-muted uppercase">
        {label}
      </h2>
      <div className="flex gap-2 overflow-x-auto px-4 py-2">
        {movers.map((p) => (
          <Link
            key={p.id}
            href={`/market/${p.id}`}
            className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 transition active:bg-bg"
          >
            <KitAvatar colors={p.avatar_colors} fullName={p.full_name} size="md" />
            <span className="flex flex-col items-start gap-0.5">
              <span className="max-w-[96px] truncate text-[13px] leading-4 font-semibold text-text">
                {p.full_name}
              </span>
              <PriceChange pct={p.daily_change_pct} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function SortChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[44px] select-none rounded-xl px-4 text-[13px] font-semibold transition active:scale-[0.98] ${
        active
          ? 'bg-primary text-white'
          : 'border border-border bg-surface text-text-muted active:bg-bg'
      }`}
    >
      {children}
    </button>
  )
}
