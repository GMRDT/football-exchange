import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { KitAvatar } from '@/components/ui/KitAvatar'
import { PriceChange } from '@/components/ui/PriceChange'
import { formatCoins } from '@/lib/format'
import type { MarketPlayer } from '@/lib/market/summary'

/**
 * PlayerRow — the PlayerCard atom (DESIGN.md §4) as a market list row.
 * Whole row is the tap target (≥44px) linking to the player detail.
 */
export function PlayerRow({ player }: { player: MarketPlayer }) {
  const locale = useLocale()
  const tPositions = useTranslations('positions')

  return (
    <Link
      href={`/market/${player.id}`}
      className="flex min-h-[56px] items-center gap-3 border-b border-border bg-surface px-4 py-2 transition active:bg-bg"
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

      <span className="flex flex-col items-end gap-0.5">
        <span className="text-[15px] leading-5 font-semibold text-text tabular-nums">
          {formatCoins(player.current_price, locale)}
        </span>
        <PriceChange pct={player.daily_change_pct} />
      </span>
    </Link>
  )
}
