'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

/**
 * TopNav — desktop top navigation (DESIGN.md §8, ≥lg only). Replaces the mobile
 * BottomNav at the lg breakpoint: brand · Market · Portfolio · Leaderboard ·
 * [spacer] · Sign in. Hidden below lg. Sticky so it stays while the list scrolls.
 */

const TABS = [
  { href: '/market', key: 'market' },
  { href: '/portfolio', key: 'portfolio' },
  { href: '/leaderboard', key: 'leaderboard' },
] as const

export function TopNav() {
  const t = useTranslations('nav')
  const tCommon = useTranslations('common')
  const tAuth = useTranslations('auth')
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 hidden border-b border-border/80 bg-surface/80 backdrop-blur-md lg:block">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-[18px] font-extrabold text-text">
          <span aria-hidden="true">⚽</span>
          {tCommon('appName')}
        </Link>

        <div className="flex items-center gap-1">
          {TABS.map(({ href, key }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={key}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 text-[15px] font-semibold transition-colors ${
                  active ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text'
                }`}
              >
                {t(key)}
              </Link>
            )
          })}
        </div>

        <Link
          href="/login"
          className="ml-auto inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-white transition hover:bg-primary-pressed"
        >
          {tAuth('signIn')}
        </Link>
      </nav>
    </header>
  )
}
