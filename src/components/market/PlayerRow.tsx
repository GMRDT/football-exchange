'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { KitAvatar } from '@/components/ui/KitAvatar'
import { PriceChange } from '@/components/ui/PriceChange'
import { formatCoins } from '@/lib/format'
import type { MarketPlayer } from '@/lib/market/summary'

/**
 * PlayerRow — the PlayerCard atom (DESIGN.md §4) as a market list row, with an
 * optional rank number (gamified browse) and a 🔥 tag for strong gainers.
 *
 * `index` drives the entrance-stagger animation on first mount (DESIGN.md §4c).
 * When undefined (SWR poll re-renders), no animation fires. Price flash (§4a):
 * when SWR returns a changed price, the right cell flashes 400ms in the
 * semantic direction color.
 */

const HOT_THRESHOLD = 5 // % daily change above which a row earns the 🔥 tag

function usePriceFlash(price: string): 'up' | 'down' | null {
  const prev = useRef(price)
  const [dir, setDir] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (price !== prev.current) {
      setDir(parseFloat(price) > parseFloat(prev.current) ? 'up' : 'down')
      prev.current = price
      const id = setTimeout(() => setDir(null), 400)
      return () => clearTimeout(id)
    }
  }, [price])

  return dir
}

export function PlayerRow({
  player,
  index,
  rank,
}: {
  player: MarketPlayer
  index?: number
  rank?: number
}) {
  const locale = useLocale()
  const tPositions = useTranslations('positions')
  const flash = usePriceFlash(player.current_price)

  const hasEntrance = index !== undefined
  const entranceDelay = hasEntrance ? `${Math.min(index, 15) * 25}ms` : undefined
  const hot = player.daily_change_pct >= HOT_THRESHOLD

  const flashClass =
    flash === 'up'
      ? 'animate-price-flash-up'
      : flash === 'down'
        ? 'animate-price-flash-down'
        : ''

  return (
    <Link
      href={`/market/${player.id}`}
      className={`group flex min-h-[60px] items-center gap-3 border-b border-border bg-surface px-4 py-2.5 transition hover:bg-bg active:bg-bg ${hasEntrance ? 'animate-row-entrance' : ''}`}
      style={entranceDelay ? { animationDelay: entranceDelay } : undefined}
    >
      {rank !== undefined && (
        <span className="w-5 shrink-0 text-center text-[13px] font-semibold text-text-muted tabular-nums">
          {rank}
        </span>
      )}

      <KitAvatar colors={player.avatar_colors} fullName={player.full_name} size="sm" />

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[16px] leading-6 font-semibold text-text">
            {player.full_name}
          </span>
          {hot && (
            <span aria-hidden="true" className="shrink-0 text-[13px]" title="Hot">
              🔥
            </span>
          )}
        </span>
        <span className="block truncate text-[13px] leading-4 text-text-muted">
          {player.team_name} · {tPositions(player.position_code)}
        </span>
      </span>

      <span className={`flex flex-col items-end gap-0.5 rounded px-1 ${flashClass}`}>
        <span className="tnum text-[15px] leading-5 font-semibold text-text">
          {formatCoins(player.current_price, locale)}
        </span>
        <PriceChange pct={player.daily_change_pct} />
      </span>
    </Link>
  )
}
