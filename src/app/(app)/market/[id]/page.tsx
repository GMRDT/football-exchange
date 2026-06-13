import { notFound } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { getLocale, getTranslations } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { dailyChangePct } from '@/lib/market/summary'
import { formatCoins } from '@/lib/format'
import { KitAvatar } from '@/components/ui/KitAvatar'
import { PriceChange } from '@/components/ui/PriceChange'
import { Sparkline } from '@/components/ui/Sparkline'
import { LocalDate } from '@/components/ui/LocalDate'
import { TradeSection } from '@/components/trade/TradeSection'

/**
 * /market/[id] — public player detail (DESIGN.md §8). Anonymous visitors see
 * everything except the trade form, which is replaced by a signup CTA; the
 * trade() RPC enforces auth server-side regardless.
 *
 * NUMERIC columns arrive as JSON numbers from PostgREST; values here are
 * display-only (the engine never trusts the client), and FX magnitudes
 * (≤ ~1e7 with 6 dp) are exactly representable in a double.
 */
export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()

  const supabase = await getSupabaseServerClient()
  const t = await getTranslations('market')
  const tPositions = await getTranslations('positions')
  const locale = await getLocale()

  const { data: player } = await supabase
    .from('players')
    .select('*, teams!players_team_id_fkey(name), positions(code)')
    .eq('id', id)
    .maybeSingle()

  if (!player) notFound()

  const now = new Date()
  const nowIso = now.toISOString()
  const dayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: history },
    { data: baselineRow },
    { data: nextMatch },
    { data: stats },
    { data: auth },
  ] = await Promise.all([
    supabase
      .from('price_history')
      .select('price, captured_at')
      .eq('player_id', id)
      .order('captured_at', { ascending: false })
      .limit(10),
    supabase
      .from('price_history')
      .select('price')
      .eq('player_id', id)
      .lte('captured_at', dayAgoIso)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('matches')
      .select(
        'kickoff_utc, home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)'
      )
      .or(`home_team_id.eq.${player.team_id},away_team_id.eq.${player.team_id}`)
      .gt('kickoff_utc', nowIso)
      .order('kickoff_utc', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('v_player_stats')
      .select('goals, assists, yellow_cards, red_cards')
      .eq('player_id', id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ])

  // Engine-canonical 24h baseline: most recent row older than 24h, fallback base_value.
  const baseline = baselineRow?.price ?? player.base_value
  const pct = dailyChangePct(String(player.current_price), String(baseline))
  const sparkPrices = (history ?? []).map((row) => row.price).reverse()
  const opponentName =
    nextMatch &&
    (nextMatch.home_team_id === player.team_id ? nextMatch.away?.name : nextMatch.home?.name)

  // Owner data only when signed in (RLS would return nothing anyway).
  const user = auth?.user ?? null
  let holding: { shares: number; avg_cost: number } | null = null
  let cashBalance: string | null = null
  if (user) {
    const [{ data: holdingRow }, { data: profile }] = await Promise.all([
      supabase
        .from('holdings')
        .select('shares, avg_cost')
        .eq('user_id', user.id)
        .eq('player_id', id)
        .maybeSingle(),
      supabase.from('profiles').select('cash_balance').eq('id', user.id).maybeSingle(),
    ])
    holding = holdingRow
    cashBalance = profile ? String(profile.cash_balance) : null
  }

  const unrealizedPnl = holding ? (player.current_price - holding.avg_cost) * holding.shares : 0
  const unrealizedPct =
    holding && holding.avg_cost > 0
      ? ((player.current_price - holding.avg_cost) / holding.avg_cost) * 100
      : 0

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6">
      {/* Header */}
      <header className="flex items-center gap-4">
        <KitAvatar colors={player.avatar_colors} fullName={player.full_name} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[20px] leading-7 font-bold text-text">
            {player.full_name}
          </h1>
          <p className="text-[13px] text-text-muted">
            {player.teams.name} · {tPositions(player.positions.code)}
          </p>
        </div>
      </header>

      {/* Price block */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="font-display text-[40px] leading-[44px] font-extrabold text-text tabular-nums">
          {t('coins', { amount: formatCoins(String(player.current_price), locale) })}
        </p>
        <div className="mt-1 flex items-center gap-3">
          <PriceChange pct={pct} />
          <span className="text-[13px] text-text-muted">
            {t('fairValue')}: {formatCoins(String(player.fair_value), locale)}
          </span>
        </div>
        {sparkPrices.length >= 2 && (
          <div className="mt-3">
            <Sparkline prices={sparkPrices} height={120} />
          </div>
        )}
      </section>

      {/* Stats row */}
      <section className="grid grid-cols-4 gap-2">
        <StatBox icon="⚽" label={t('goals')} value={stats?.goals ?? 0} />
        <StatBox icon="🎯" label={t('assists')} value={stats?.assists ?? 0} />
        <StatBox icon="🟨" label={t('yellowCards')} value={stats?.yellow_cards ?? 0} />
        <StatBox icon="🟥" label={t('redCards')} value={stats?.red_cards ?? 0} />
      </section>

      {/* Next match */}
      {nextMatch && opponentName && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-text-muted uppercase">
            {t('nextMatch')}
          </h2>
          <p className="mt-1 text-[15px] font-semibold text-text">
            {t('vsOpponent', { opponent: opponentName })} ·{' '}
            <LocalDate iso={nextMatch.kickoff_utc} />
          </p>
        </section>
      )}

      {/* Current position */}
      {holding && holding.shares > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-text-muted uppercase">
            {t('yourPosition')}
          </h2>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="text-[15px] font-semibold text-text tabular-nums">
                {holding.shares} × {t('shares')}
              </p>
              <p className="text-[13px] text-text-muted tabular-nums">
                {t('avgCost')}: {formatCoins(String(holding.avg_cost), locale)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[15px] font-semibold text-text tabular-nums">
                {t('coins', { amount: formatCoins(unrealizedPnl, locale) })}
              </span>
              <PriceChange pct={unrealizedPct} />
            </div>
          </div>
        </section>
      )}

      {/* Trade form (authed) or signup CTA (anon) */}
      {user && cashBalance !== null ? (
        <TradeSection
          playerId={player.id}
          currentPrice={String(player.current_price)}
          cashBalance={cashBalance}
          sharesHeld={holding?.shares ?? 0}
          liquidityTier={player.liquidity_tier}
        />
      ) : (
        <section className="rounded-2xl border border-border bg-surface p-5 text-center">
          <h2 className="font-display text-[20px] leading-7 font-bold text-text">
            {t('signupCtaTitle')}
          </h2>
          <p className="mt-1 text-[15px] leading-6 text-text-muted">{t('signupCtaBody')}</p>
          <Link
            href="/signup"
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-white transition hover:bg-primary-pressed active:bg-primary-pressed"
          >
            {t('signupCtaButton')}
          </Link>
        </section>
      )}
    </main>
  )
}

function StatBox({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border border-border bg-surface px-1 py-3">
      <span aria-hidden="true">{icon}</span>
      <span className="text-[16px] font-semibold text-text tabular-nums">{value}</span>
      <span className="text-center text-[11px] leading-3 text-text-muted">{label}</span>
    </div>
  )
}
