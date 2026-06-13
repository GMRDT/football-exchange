'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

/**
 * BottomNav — mobile tab bar (DESIGN.md §8): Market · Portfolio · Leaderboard.
 * A 2px primary line slides between tabs (DESIGN.md §4f, transform-based).
 * select-none prevents text selection on repeated taps.
 */

const TABS = [
  // routes exist → normal (default) prefetch
  { href: '/market', key: 'market', icon: MarketIcon, prefetch: undefined },
  { href: '/portfolio', key: 'portfolio', icon: PortfolioIcon, prefetch: undefined },
  { href: '/leaderboard', key: 'leaderboard', icon: LeaderboardIcon, prefetch: undefined },
] as const

export function BottomNav() {
  const t = useTranslations('nav')
  const pathname = usePathname()

  const activeIndex = TABS.findIndex(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`)
  )

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 select-none border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <div className="relative mx-auto flex h-14 max-w-lg items-stretch">
        {/* Sliding top-line indicator (DESIGN.md §4f) */}
        {activeIndex >= 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 h-0.5 w-1/3 bg-primary transition-transform duration-150"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
        )}

        {TABS.map(({ href, key, icon: Icon, prefetch }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={key}
              href={href}
              prefetch={prefetch}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] leading-4 font-medium transition-colors duration-150 active:opacity-70 ${
                active ? 'text-primary' : 'text-text-muted'
              }`}
            >
              <Icon />
              {t(key)}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function MarketIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 17l5-5 4 4 8-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 8h5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PortfolioIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function LeaderboardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 20v-6M12 20V4M19 20v-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
