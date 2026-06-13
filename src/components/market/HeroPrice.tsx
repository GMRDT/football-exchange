'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCountAnimation } from '@/hooks/useCountAnimation'
import { formatCoins } from '@/lib/format'

/**
 * HeroPrice — animated count-up for the player detail hero price.
 * Receives `currentPrice` from the server; when the page refreshes after a
 * trade (router.refresh()), the new prop triggers a smooth 300ms count
 * animation via rAF (DESIGN.md §4b). Respects prefers-reduced-motion.
 */
export function HeroPrice({ currentPrice }: { currentPrice: string }) {
  const t = useTranslations('market')
  const ticker = useTranslations('currency')('ticker')
  const locale = useLocale()
  const animated = useCountAnimation(parseFloat(currentPrice))

  return (
    <p className="tnum font-display text-[40px] leading-[44px] font-extrabold text-text">
      {t('coins', { amount: formatCoins(animated, locale), ticker })}
    </p>
  )
}
