#!/usr/bin/env tsx
/**
 * Records REAL API-Football payloads as test fixtures (audit fix 3):
 *
 *   1. GET /fixtures?league=1&season=2026  → tests/fixtures/fixtures-list.json
 *   2. GET /fixtures/events?fixture={id}   → tests/fixtures/events-{id}.json
 *      (first finished fixture by kickoff; skipped if none has finished yet)
 *
 * Prints a drift summary: total fixtures, round strings (flagging any that
 * mapRoundToSortOrder cannot handle), status codes, and event type/detail
 * combos. tests/fixtures-shape.test.ts then asserts our parsers handle every
 * recorded shape — catching API drift the moment these files are refreshed.
 *
 *   pnpm record-fixtures
 *
 * Requires API_FOOTBALL_KEY in .env.local. Costs 2 API requests.
 */
import fs from 'node:fs'
import path from 'node:path'
import * as dotenv from 'dotenv'
import { ApiResponseSchema } from '../supabase/functions/_shared/ingest-core'
import { mapRoundToSortOrder, parseFixtureItem } from '../supabase/functions/_shared/fixtures-core'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const API_BASE = 'https://v3.football.api-sports.io'
const LEAGUE_ID = process.env.API_FOOTBALL_LEAGUE_ID ?? '1'
const SEASON = process.env.API_FOOTBALL_SEASON ?? '2026'
const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures')
const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN'])

const apiKey = process.env.API_FOOTBALL_KEY
if (!apiKey) {
  console.error('Error: API_FOOTBALL_KEY must be set in .env.local')
  process.exit(1)
}

async function fetchApi(pathAndQuery: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${pathAndQuery}`, {
    headers: { 'x-apisports-key': apiKey! },
  })
  if (!res.ok) {
    console.error(`API error: HTTP ${res.status} for ${pathAndQuery}`)
    process.exit(1)
  }
  return res.json()
}

function saveJson(filename: string, body: unknown): string {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true })
  const filepath = path.join(FIXTURES_DIR, filename)
  fs.writeFileSync(filepath, JSON.stringify(body, null, 2) + '\n')
  return filepath
}

async function main() {
  // ── 1. Full fixture list ────────────────────────────────────────────────────
  const listBody = await fetchApi(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`)
  const list = ApiResponseSchema.safeParse(listBody)
  if (!list.success || list.data.response.length === 0) {
    console.error('Unexpected fixtures-list response shape (or empty list) — not saving.')
    process.exit(1)
  }
  console.log(`Saved: ${saveJson('fixtures-list.json', listBody)}`)

  // ── 2. Summary + first finished fixture ────────────────────────────────────
  const rounds = new Map<string, number>() // round string → count
  const statuses = new Map<string, number>()
  const unknownRounds = new Set<string>()
  let malformed = 0
  let firstFinished: { id: number; date: string } | null = null

  for (const item of list.data.response) {
    const parsed = parseFixtureItem(item)
    if (!parsed.ok) {
      malformed++
      continue
    }
    const round = (item as { league: { round: string } }).league.round
    rounds.set(round, (rounds.get(round) ?? 0) + 1)
    statuses.set(parsed.row.status, (statuses.get(parsed.row.status) ?? 0) + 1)
    if (mapRoundToSortOrder(round) === null) unknownRounds.add(round)

    if (FINAL_STATUSES.has(parsed.row.status)) {
      if (!firstFinished || parsed.row.kickoffUtc < firstFinished.date) {
        firstFinished = { id: parsed.row.apiFixtureId, date: parsed.row.kickoffUtc }
      }
    }
  }

  console.log(`\nFixtures: ${list.data.response.length} total, ${malformed} malformed`)
  console.log('Rounds:')
  for (const [round, count] of [...rounds].sort()) {
    const flag = mapRoundToSortOrder(round) === null ? '  ✗ UNKNOWN' : ''
    console.log(`  ${count.toString().padStart(3)} × ${round}${flag}`)
  }
  console.log(`Statuses: ${[...statuses].map(([s, c]) => `${s}×${c}`).join(', ')}`)
  if (unknownRounds.size > 0) {
    console.error(
      `\n✗ ${unknownRounds.size} round string(s) NOT handled by mapRoundToSortOrder — ` +
        'sync-fixtures would silently skip these fixtures!'
    )
  }

  // ── 3. Events of the first finished fixture ────────────────────────────────
  if (!firstFinished) {
    console.log('\nNo finished fixture yet — skipping events recording.')
  } else {
    const eventsBody = await fetchApi(`/fixtures/events?fixture=${firstFinished.id}`)
    const events = ApiResponseSchema.safeParse(eventsBody)
    if (!events.success) {
      console.error('Unexpected events response shape — not saving.')
      process.exit(1)
    }
    console.log(
      `\nSaved: ${saveJson(`events-${firstFinished.id}.json`, eventsBody)} ` +
        `(fixture ${firstFinished.id}, ${events.data.response.length} events)`
    )
    const combos = new Map<string, number>()
    for (const raw of events.data.response) {
      const ev = raw as { type?: string; detail?: string | null }
      const combo = `${ev.type ?? '?'} / ${ev.detail ?? 'null'}`
      combos.set(combo, (combos.get(combo) ?? 0) + 1)
    }
    console.log('Event type/detail combos:')
    for (const [combo, count] of [...combos].sort()) {
      console.log(`  ${count.toString().padStart(3)} × ${combo}`)
    }
  }

  process.exit(unknownRounds.size > 0 ? 1 : 0)
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
