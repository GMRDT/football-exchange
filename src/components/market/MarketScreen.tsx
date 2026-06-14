'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useLocale, useTranslations } from 'next-intl'
import { KitAvatar } from '@/components/ui/KitAvatar'
import { PriceChange } from '@/components/ui/PriceChange'
import { PlayerRow } from '@/components/market/PlayerRow'
import { EmptyState } from '@/components/ui/EmptyState'
import { marketKey } from '@/lib/swr/keys'
import { fetchMarket, type MarketPlayer, type MarketTeam } from '@/lib/market/summary'
import { formatCoins } from '@/lib/format'
import { Reveal } from '@/components/ui/Reveal'

/**
 * MarketScreen — "browse by football" (DESIGN.md §8). Position + World Cup group
 * filters, a live movers strip, and a ranked list sorted by value or % change.
 * Football heart (groups, kits) with Robinhood clarity — never a casino. Mobile:
 * a single stacked column. Desktop: a two-pane layout (ranked list + sticky
 * movers sidebar) so the width is used. SWR polls /api/market every 30s for live
 * prices; the team reference (groups) is static, passed from the server.
 */

type SortMode = 'value' | 'change'
const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const
type Position = (typeof POSITIONS)[number]

/** ISO-3166 alpha-2 country code → flag emoji. Returns '' for non-2-letter codes
 *  (UK nations use FIFA codes like SCT/ENG that have no derivable emoji). */
function flag(country: string | null): string {
  if (!country || country.length !== 2 || !/^[A-Za-z]{2}$/.test(country)) return ''
  const BASE = 0x1f1e6 // regional indicator 'A'
  return String.fromCodePoint(
    ...[...country.toUpperCase()].map((ch) => BASE + ch.charCodeAt(0) - 65)
  )
}

export function MarketScreen({
  initialPlayers,
  teams,
}: {
  initialPlayers: MarketPlayer[]
  teams: MarketTeam[]
}) {
  const t = useTranslations('market')
  const tPositions = useTranslations('positions')

  const { data } = useSWR(marketKey(), fetchMarket, {
    refreshInterval: 30_000,
    fallbackData: { players: initialPlayers },
    keepPreviousData: true,
  })
  const players = useMemo(() => data?.players ?? [], [data])

  // National teams, alphabetical — the "browse by country" rail.
  const teamsSorted = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  )

  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<'all' | Position>('all')
  const [team, setTeam] = useState<string>('all')
  const [sort, setSort] = useState<SortMode>('value')

  // Entrance stagger on first mount only (DESIGN.md §4c); index undefined on polls.
  const [entranceDone, setEntranceDone] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setEntranceDone(true), 700)
    return () => clearTimeout(id)
  }, [])

  const q = query.trim().toLocaleLowerCase()
  const filtering = position !== 'all' || team !== 'all' || q.length > 0

  const gainers = useMemo(
    () =>
      players
        .filter((p) => p.daily_change_pct > 0)
        .sort((a, b) => b.daily_change_pct - a.daily_change_pct)
        .slice(0, 6),
    [players]
  )
  const losers = useMemo(
    () =>
      players
        .filter((p) => p.daily_change_pct < 0)
        .sort((a, b) => a.daily_change_pct - b.daily_change_pct)
        .slice(0, 6),
    [players]
  )

  const list = useMemo(() => {
    let arr = players
    if (position !== 'all') arr = arr.filter((p) => p.position_code === position)
    if (team !== 'all') arr = arr.filter((p) => p.team_id === team)
    if (q) {
      arr = arr.filter(
        (p) =>
          p.full_name.toLocaleLowerCase().includes(q) ||
          p.team_name.toLocaleLowerCase().includes(q)
      )
    }
    return [...arr].sort((a, b) =>
      sort === 'value'
        ? parseFloat(b.current_price) - parseFloat(a.current_price)
        : b.daily_change_pct - a.daily_change_pct
    )
  }, [players, position, team, q, sort])

  if (players.length === 0) {
    return (
      <main className="mx-auto max-w-lg">
        <header className="px-4 pt-6 pb-3">
          <h1 className="font-display text-[28px] leading-8 font-bold text-text">{t('title')}</h1>
        </header>
        <EmptyState icon="⚽" message={t('empty')} />
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-lg pb-10 lg:max-w-5xl lg:px-6">
      <header className="px-4 pt-6 pb-3 lg:px-0 lg:pt-8">
        <Reveal>
          <h1 className="font-display text-[28px] leading-8 font-bold text-text lg:text-[34px] lg:leading-10">
            {t('title')}
          </h1>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            className="mt-3 h-11 w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-text placeholder:text-text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 lg:max-w-xl"
          />
        </Reveal>
      </header>

      {/* Browse filters: position + World Cup group */}
      <div className="flex flex-col gap-1.5 px-4 pb-1 lg:px-0">
        <FilterRow label={t('position')}>
          <FilterChip active={position === 'all'} onClick={() => setPosition('all')}>
            {t('all')}
          </FilterChip>
          {POSITIONS.map((pos) => (
            <FilterChip key={pos} active={position === pos} onClick={() => setPosition(pos)}>
              {tPositions(pos)}
            </FilterChip>
          ))}
        </FilterRow>
        <div className="flex items-center gap-2">
          <span className="w-[56px] shrink-0 text-[11px] leading-4 font-semibold tracking-wide text-text-muted uppercase">
            {t('country')}
          </span>
          <CountryFilter
            teams={teamsSorted}
            value={team}
            onChange={setTeam}
            allLabel={t('all')}
            searchPlaceholder={t('searchCountry')}
          />
        </div>
      </div>

      {/* Desktop: list (left) + sticky movers sidebar (right). Mobile: stacked. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8 lg:pt-2">
        {/* Movers — above the list on mobile (default view only); right sidebar on desktop */}
        <aside
          className={`lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24 ${filtering ? 'hidden lg:block' : ''}`}
        >
          <Reveal delay={80}>
            <MoverSection emoji="🔥" label={t('topGainers')} movers={gainers} />
            <MoverSection emoji="🧊" label={t('topLosers')} movers={losers} />
          </Reveal>
        </aside>

        <section className="lg:col-start-1 lg:row-start-1">
          {/* Sort + result count */}
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2 lg:px-0 lg:pt-2">
            <div className="flex items-center gap-2">
              <SortChip active={sort === 'value'} onClick={() => setSort('value')}>
                {t('sortValue')}
              </SortChip>
              <SortChip active={sort === 'change'} onClick={() => setSort('change')}>
                {t('sortChange')}
              </SortChip>
            </div>
            <span className="text-[13px] text-text-muted tabular-nums">
              {t('results', { count: list.length })}
            </span>
          </div>

          {list.length === 0 ? (
            <EmptyState icon="🔍" message={t('noResults')} />
          ) : (
            <div className="border-t border-border lg:rounded-xl lg:border lg:border-border lg:bg-surface lg:overflow-hidden">
              {list.map((player, i) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  rank={i + 1}
                  index={entranceDone ? undefined : i}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[56px] shrink-0 text-[11px] leading-4 font-semibold tracking-wide text-text-muted uppercase">
        {label}
      </span>
      <div className="flex gap-1.5 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[40px] shrink-0 select-none rounded-full px-3.5 text-[13px] font-semibold transition active:scale-[0.97] ${
        active
          ? 'bg-primary text-white'
          : 'border border-border bg-surface text-text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

/** Searchable country picker — scales to all 48 national teams (a horizontal
 *  rail does not). Click-outside closes; the search box finds any country fast. */
function CountryFilter({
  teams,
  value,
  onChange,
  allLabel,
  searchPlaceholder,
}: {
  teams: MarketTeam[]
  value: string
  onChange: (v: string) => void
  allLabel: string
  searchPlaceholder: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selected = value === 'all' ? null : (teams.find((t) => t.id === value) ?? null)
  const needle = q.trim().toLocaleLowerCase()
  const filtered = needle ? teams.filter((t) => t.name.toLocaleLowerCase().includes(needle)) : teams

  function pick(v: string) {
    onChange(v)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition active:scale-[0.97] ${
          selected
            ? 'bg-primary text-white'
            : 'border border-border bg-surface text-text-muted hover:text-text'
        }`}
      >
        <span className="max-w-[200px] truncate">
          {selected ? [flag(selected.country), selected.name].filter(Boolean).join(' ') : allLabel}
        </span>
        <span aria-hidden="true" className="text-[10px] opacity-70">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-lg border border-border bg-bg px-3 text-[14px] text-text placeholder:text-text-muted outline-none focus:border-primary"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <CountryOption active={value === 'all'} onClick={() => pick('all')}>
              {allLabel}
            </CountryOption>
            {filtered.map((tm) => (
              <CountryOption key={tm.id} active={value === tm.id} onClick={() => pick(tm.id)}>
                {[flag(tm.country), tm.name].filter(Boolean).join(' ')}
              </CountryOption>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CountryOption({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center px-3 py-2 text-left text-[14px] transition hover:bg-bg ${
        active ? 'font-semibold text-primary' : 'text-text'
      }`}
    >
      {children}
    </button>
  )
}

function MoverSection({
  emoji,
  label,
  movers,
}: {
  emoji: string
  label: string
  movers: MarketPlayer[]
}) {
  const locale = useLocale()
  if (movers.length === 0) return null
  return (
    <section className="pt-3 lg:pt-0 lg:[&+&]:pt-4">
      <h2 className="flex items-center gap-1.5 px-4 text-[13px] leading-4 font-semibold tracking-wide text-text-muted uppercase lg:px-0">
        <span aria-hidden="true">{emoji}</span>
        {label}
      </h2>
      {/* Horizontal carousel on mobile; vertical stack in the desktop sidebar */}
      <div className="flex gap-2.5 overflow-x-auto px-4 py-2 lg:flex-col lg:gap-2 lg:overflow-visible lg:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {movers.map((p) => (
          <Link
            key={p.id}
            href={`/market/${p.id}`}
            className="flex w-[150px] shrink-0 flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3 transition hover:-translate-y-0.5 hover:border-text-muted hover:shadow-sm hover:shadow-black/[0.04] active:translate-y-0 active:bg-bg lg:w-auto lg:shrink lg:flex-row lg:items-center lg:gap-2.5"
          >
            <div className="flex min-w-0 items-center gap-2 lg:flex-1">
              <KitAvatar colors={p.avatar_colors} fullName={p.full_name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">
                {p.full_name}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 lg:shrink-0 lg:flex-col lg:items-end lg:gap-0.5">
              <span className="text-[13px] font-semibold text-text tabular-nums">
                {formatCoins(p.current_price, locale)}
              </span>
              <PriceChange pct={p.daily_change_pct} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function SortChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[44px] select-none rounded-xl px-4 text-[13px] font-semibold transition active:scale-[0.98] ${
        active ? 'bg-primary text-white' : 'border border-border bg-surface text-text-muted active:bg-bg'
      }`}
    >
      {children}
    </button>
  )
}
