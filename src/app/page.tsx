import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getMarketSummary } from '@/lib/market/summary'
import { TopMovers } from '@/components/landing/TopMovers'
import { FeatureCard } from '@/components/landing/FeatureCard'
import { Reveal } from '@/components/ui/Reveal'

/**
 * Landing (DESIGN.md §10, spec §5) — public. In 5 seconds: a World Cup player
 * market, virtual money, free, and you can see it right now. Robinhood-inspired
 * motion & rhythm (ROBINHOOD_ANALYSIS.md): a sticky blurred header, a hero that
 * staggers in on load, then scroll-revealed sections — feature cards, a trust
 * strip, and a closing CTA. Light mode and blue brand accent stay per DESIGN.md
 * §2 (green/red belong to price movement only). The Top Movers block is live
 * anonymous data, hydrated server-side then polled — our best possible demo.
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

  const features = [
    { icon: <LiveIcon />, title: t('feature1Title'), body: t('feature1Body') },
    { icon: <GiftIcon />, title: t('feature2Title'), body: t('feature2Body') },
    { icon: <TrophyIcon />, title: t('feature3Title'), body: t('feature3Body') },
  ]

  const trust = [t('trustVirtual'), t('trustFree'), t('trustLive')]

  return (
    <div className="relative min-h-screen bg-bg">
      {/* Brand backdrop: warm light wash + soft primary glow (light mode, DESIGN §2).
          Glows live in their own clipped layer so they never widen the page or break
          the sticky demo column. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-primary/[0.10] via-primary/[0.03] to-transparent" />
        <div className="absolute -top-48 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      </div>

      {/* Sticky header — translucent + blur so content scrolls under it (Robinhood) */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 font-display text-[18px] font-extrabold text-text">
            <span aria-hidden="true">⚽</span>
            {tCommon('appName')}
          </span>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-xl px-3 text-[15px] font-semibold text-text-muted transition hover:text-text"
            >
              {tAuth('signIn')}
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-[15px] font-semibold text-white shadow-sm shadow-primary/25 transition hover:bg-primary-pressed active:scale-[0.98]"
            >
              {t('startFree')}
            </Link>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero — stacks on mobile (hero → movers → how it works), 2-col on desktop.
            Each block reveals on load with a staggered delay for a lively entrance. */}
        <main className="grid grid-cols-1 items-start gap-8 pt-10 pb-16 lg:grid-cols-2 lg:gap-x-14 lg:pt-16 lg:pb-24">
          {/* Left: pitch */}
          <section className="lg:pt-6">
            <Reveal>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
                <span aria-hidden="true">🏆</span>
                {t('eyebrow')}
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-5 font-display text-[36px] leading-[1.05] font-extrabold tracking-tight text-balance text-text sm:text-[46px] lg:text-[60px]">
                {t('headline')}
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-4 max-w-md text-[17px] leading-7 text-pretty text-text-muted">
                {t('tagline')}
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-7 text-[16px] font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-pressed active:scale-[0.99] sm:flex-initial"
                >
                  {t('startFree')}
                </Link>
                <Link
                  href="/market"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-surface px-7 text-[16px] font-semibold text-text transition hover:border-text-muted hover:-translate-y-0.5 active:translate-y-0 active:bg-bg sm:flex-initial"
                >
                  {t('seeMarket')}
                </Link>
              </div>
            </Reveal>

            {/* How it works */}
            <Reveal delay={320}>
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
            </Reveal>
          </section>

          {/* Right: live market demo */}
          <div className="lg:sticky lg:top-24">
            <Reveal delay={160}>
              <TopMovers initialPlayers={players} />
            </Reveal>
          </div>
        </main>
      </div>

      {/* Features — "why it's fun" (ROBINHOOD_ANALYSIS §6). Soft surface band to
          separate it from the hero and give the page rhythm. */}
      <section className="relative border-t border-border/60 bg-surface/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="max-w-xl">
            <span className="text-[13px] font-semibold tracking-wide text-primary uppercase">
              {t('featuresEyebrow')}
            </span>
            <h2 className="mt-2 font-display text-[28px] leading-[1.1] font-extrabold tracking-tight text-balance text-text sm:text-[36px]">
              {t('featuresHeadline')}
            </h2>
          </Reveal>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 100}>
                <FeatureCard icon={f.icon} title={f.title} body={f.body} />
              </Reveal>
            ))}
          </div>

          {/* Trust strip — defends risk #1 "is this betting?" (DESIGN.md §1.1) */}
          <Reveal delay={120}>
            <ul className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
              {trust.map((item) => (
                <li key={item} className="flex items-center gap-2 text-[14px] font-medium text-text-muted">
                  <span
                    aria-hidden="true"
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <CheckIcon />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Closing CTA — Robinhood always closes on conversion (ROBINHOOD_ANALYSIS §6) */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center shadow-xl shadow-primary/25 sm:px-12 sm:py-16">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 left-1/2 h-80 w-[700px] -translate-x-1/2 rounded-full bg-white/15 blur-3xl"
              />
              <div className="relative">
                <h2 className="mx-auto max-w-lg font-display text-[28px] leading-[1.1] font-extrabold tracking-tight text-balance text-white sm:text-[36px]">
                  {t('closingTitle')}
                </h2>
                <p className="mx-auto mt-3 max-w-md text-[16px] leading-6 text-pretty text-white/85">
                  {t('closingBody', { currencyName: tCurrency('name') })}
                </p>
                <Link
                  href="/signup"
                  className="mt-7 inline-flex h-12 items-center justify-center rounded-xl bg-white px-8 text-[16px] font-semibold text-primary shadow-lg shadow-black/10 transition hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]"
                >
                  {t('startFree')}
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}

/* ── Feature icons (line style, inherit the badge's primary via currentColor) ── */

function LiveIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 12h3l2-6 4 13 2-7h7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GiftIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="8" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h18M12 8v13" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M12 8C12 8 10.5 3.5 8 4.2 6.2 4.7 7 8 12 8zM12 8c0 0 1.5-4.5 4-3.8C17.8 4.7 17 8 12 8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 6H4v1.5A3.5 3.5 0 0 0 7 11M17 6h3v1.5A3.5 3.5 0 0 1 17 11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
