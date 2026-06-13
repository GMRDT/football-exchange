'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { KitAvatar } from '@/components/ui/KitAvatar'
import { PriceChange } from '@/components/ui/PriceChange'
import { formatCoins } from '@/lib/format'
import type { MarketPlayer } from '@/lib/market/summary'

/**
 * PlayerRow — the PlayerCard atom (DESIGN.md §4) as a market list row.
 *
 * `index` drives the entrance-stagger animation on first mount (DESIGN.md §4c).
 * When undefined (SWR poll re-renders), no animation fires — the element is
 * already visible and CSS animations don't restart without an unmount/remount.
 *
 * Price flash (DESIGN.md §4a): when SWR returns a changed price, the right
 * cell background flashes 400ms in the semantic direction color.
 */

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
}: {
  player: MarketPlayer
  index?: number
}) {
  const locale = useLocale()
  const tPositions = useTranslations('positions')
  const flash = usePriceFlash(player.current_price)

  // Entrance animation fires on mount via CSS; stagger capped at 15 rows.
  const hasEntrance = index !== undefined
  const entranceDelay = hasEntrance ? `${Math.min(index, 15) * 25}ms` : undefined

  const flashClass =
    flash === 'up'
      ? 'animate-price-flash-up'
      : flash === 'down'
        ? 'animate-price-flash-down'
        : ''

  return (
    <Link
      href={`/market/${player.id}`}
      className={`flex min-h-[56px] items-center gap-3 border-b border-border bg-surface px-4 py-2 transition active:bg-bg ${hasEntrance ? 'animate-row-entrance' : ''}`}
      style={entranceDelay ? { animationDelay: entranceDelay } : undefined}
    >
      <KitAvatar colors={player.avatar_colors} fullName={player.full_name} size="sm" />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] leading-6 font-semibold text-text">
          {player.full_name}
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
