import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getMarketSummary } from '@/lib/market/summary'
import { TopMovers } from '@/components/landing/TopMovers'

/**
 * Landing (DESIGN.md §10, spec §5) — public. In 5 seconds: a World Cup player
 * market, virtual money, free, and you can see it right now. Mobile: a single
 * stacked column (hero → live Top Movers → how it works). Desktop (≥lg): a
 * two-column hero with the live market block as the demo on the right. The Top
 * Movers block is live anonymous data, hydrated server-side then polled.
 */
export default async function LandingPage() {
  const supabase = await getSupabaseServerClient()
  const players = await getMarketSummary(supabase)

  const t = await getTranslations('landing')
  const tCommon = await getTranslations('common')
  const tAuth = await getTranslations('auth')
  const tCurrency = await getTranslations('currency')

  const steps = [
    { title: t('step1Title', { currencyName: tCurrency('name') }), body: t('step1Body') },
    { title: t('step2Title'), body: t('step2Body') },
    { title: t('step3Title'), body: t('step3Body') },
  ]

  return (
    <div className="relative min-h-screen bg-bg">
      {/* Brand backdrop: warm light wash + soft primary glow (light mode, DESIGN §2).
          Glows live in their own clipped layer so they never widen the page or break
          the sticky demo column. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-primary/[0.10] via-primary/[0.03] to-transparent" />
        <div className="absolute -top-48 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {/* Header */}
        <header className="flex h-16 items-center justify-between">
          <span className="flex items-center gap-2 font-display text-[18px] font-extrabold text-text">
            <span aria-hidden="true">⚽</span>
            {tCommon('appName')}
          </span>
          <Link
            href="/login"
            className="inline-flex h-10 items-center rounded-xl px-4 text-[15px] font-semibold text-text-muted transition hover:text-text"
          >
            {tAuth('signIn')}
          </Link>
        </header>

        {/* Hero — stacks on mobile (hero → movers → how it works), 2-col on desktop */}
        <main className="grid grid-cols-1 items-start gap-8 pt-8 pb-16 lg:grid-cols-2 lg:gap-x-14 lg:pt-16 lg:pb-24">
          {/* Left: pitch */}
          <section className="lg:pt-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
              <span aria-hidden="true">🏆</span>
              {t('eyebrow')}
            </span>
            <h1 className="mt-5 font-display text-[34px] leading-[1.08] font-extrabold tracking-tight text-balance text-text sm:text-[44px] lg:text-[52px]">
              {t('headline')}
            </h1>
            <p className="mt-4 max-w-md text-[17px] leading-7 text-pretty text-text-muted">
              {t('tagline')}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-7 text-[16px] font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-pressed active:scale-[0.99] sm:flex-initial"
              >
                {t('startFree')}
              </Link>
              <Link
                href="/market"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-surface px-7 text-[16px] font-semibold text-text transition hover:border-text-muted active:bg-bg sm:flex-initial"
              >
                {t('seeMarket')}
              </Link>
            </div>

            {/* How it works */}
            <section className="mt-12">
              <h2 className="text-[13px] leading-4 font-semibold tracking-wide text-text-muted uppercase">
                {t('howItWorks')}
              </h2>
              <ol className="mt-4 flex flex-col gap-4">
                {steps.map((step, i) => (
                  <li key={step.title} className="flex items-start gap-3.5">
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-bold text-primary tabular-nums"
                    >
                      {i + 1}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[15px] leading-5 font-semibold text-text">
                        {step.title}
                      </span>
                      <span className="text-[14px] leading-5 text-text-muted">{step.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </section>

          {/* Right: live market demo */}
          <div className="lg:sticky lg:top-24">
            <TopMovers initialPlayers={players} />
          </div>
        </main>
      </div>
    </div>
  )
}
