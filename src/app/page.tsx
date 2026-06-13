import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getMarketSummary } from '@/lib/market/summary'
import { TopMovers } from '@/components/landing/TopMovers'

/**
 * Landing (DESIGN.md §10, spec §5) — public, minimal. In 5 seconds: a World
 * Cup player market, virtual money, free, and you can see it right now. The
 * Top Movers block is live anonymous data, hydrated server-side then polled.
 */
export default async function LandingPage() {
  const supabase = await getSupabaseServerClient()
  const players = await getMarketSummary(supabase)

  const t = await getTranslations('landing')
  const tCommon = await getTranslations('common')
  const tAuth = await getTranslations('auth')

  const steps = [
    { title: t('step1Title'), body: t('step1Body') },
    { title: t('step2Title'), body: t('step2Body') },
    { title: t('step3Title'), body: t('step3Body') },
  ]

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4">
      {/* Header */}
      <header className="flex h-14 items-center justify-between">
        <span className="font-display text-[16px] font-bold text-text">
          <span aria-hidden="true">⚽ </span>
          {tCommon('appName')}
        </span>
        <Link
          href="/login"
          className="flex min-h-[44px] items-center px-2 text-[15px] font-semibold text-primary"
        >
          {tAuth('signIn')}
        </Link>
      </header>

      <main className="flex flex-1 flex-col gap-6 py-8">
        {/* Hero */}
        <section>
          <h1 className="font-display text-[32px] leading-10 font-extrabold text-text">
            {t('headline')}
          </h1>
          <p className="mt-3 text-[16px] leading-6 text-text-muted">{t('tagline')}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-primary text-[16px] font-semibold text-white transition hover:bg-primary-pressed active:bg-primary-pressed"
            >
              {t('startFree')}
            </Link>
            <Link
              href="/market"
              className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-border bg-surface text-[16px] font-semibold text-text transition active:bg-bg"
            >
              {t('seeMarket')}
            </Link>
          </div>
        </section>

        {/* Live top movers — the demo */}
        <TopMovers initialPlayers={players} />

        {/* How it works */}
        <section>
          <h2 className="text-[13px] leading-4 font-semibold tracking-wide text-text-muted uppercase">
            {t('howItWorks')}
          </h2>
          <ol className="mt-3 flex flex-col gap-3">
            {steps.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white tabular-nums"
                >
                  {i + 1}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] leading-5 font-semibold text-text">
                    {step.title}
                  </span>
                  <span className="text-[13px] leading-4 text-text-muted">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  )
}
