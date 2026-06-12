/**
 * API-drift detection against REAL recorded payloads (audit fix 3).
 *
 * `pnpm record-fixtures` saves live API-Football responses into
 * tests/fixtures/. These tests assert that every shape in those recordings is
 * handled by our parsers/classifiers — they FAIL when the API introduces a
 * round string, event type/detail or status we do not handle, instead of the
 * pipeline silently skipping data in production.
 *
 * CI-safe: each suite skips when its recording is absent.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  mapRoundToSortOrder,
  parseFixtureItem,
} from '../supabase/functions/_shared/fixtures-core'
import { ApiEventSchema, mapApiEvent } from '../supabase/functions/_shared/ingest-core'

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
const LIST_PATH = path.join(FIXTURES_DIR, 'fixtures-list.json')

function loadResponse(filepath: string): unknown[] {
  const body = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as { response?: unknown[] }
  return body.response ?? []
}

const eventFiles = fs.existsSync(FIXTURES_DIR)
  ? fs.readdirSync(FIXTURES_DIR).filter((f) => /^events-\d+\.json$/.test(f))
  : []

// Type/detail combos the classifier deliberately maps to nothing (no price
// impact in MVP). Anything outside this list AND outside mapApiEvent's priced
// codes is API drift and must fail the suite.
const KNOWN_UNPRICED_TYPES = new Set(['subst', 'var'])
const KNOWN_GOAL_DETAILS = new Set(['normal goal', 'penalty', 'missed penalty', 'own goal'])
const KNOWN_CARD_DETAILS = new Set(['yellow card', 'red card', 'second yellow card'])

describe.skipIf(!fs.existsSync(LIST_PATH))('recorded fixtures list (real API payload)', () => {
  const items = fs.existsSync(LIST_PATH) ? loadResponse(LIST_PATH) : []

  test('recording is non-empty', () => {
    expect(items.length).toBeGreaterThan(0)
  })

  test('every fixture item parses with parseFixtureItem', () => {
    const failures = items.filter((item) => !parseFixtureItem(item).ok)
    expect(failures).toEqual([])
  })

  test('every round string is handled by mapRoundToSortOrder', () => {
    const unknownRounds = new Set<string>()
    for (const item of items) {
      const round = (item as { league?: { round?: string } }).league?.round ?? ''
      if (mapRoundToSortOrder(round) === null) unknownRounds.add(round)
    }
    // A round string here means sync-fixtures would silently skip those
    // fixtures in production — extend ROUND_EXACT in fixtures-core.ts.
    expect([...unknownRounds]).toEqual([])
  })

  test('every status code is a passthrough-safe non-empty string', () => {
    for (const item of items) {
      const parsed = parseFixtureItem(item)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) {
        expect(typeof parsed.row.status).toBe('string')
        expect(parsed.row.status.length).toBeGreaterThan(0)
      }
    }
  })
})

describe.skipIf(eventFiles.length === 0)('recorded match events (real API payload)', () => {
  test.each(eventFiles)('%s: every event parses and is classified', (filename) => {
    const events = loadResponse(path.join(FIXTURES_DIR, filename))
    expect(events.length).toBeGreaterThan(0)

    const unknownCombos = new Set<string>()
    for (const raw of events) {
      const parsed = ApiEventSchema.safeParse(raw)
      expect(parsed.success, `event failed schema parse: ${JSON.stringify(raw)}`).toBe(true)
      if (!parsed.success) continue

      const ev = parsed.data
      const type = ev.type.toLowerCase()
      const detail = (ev.detail ?? '').toLowerCase()
      const isShootout = (ev.comments ?? '').toLowerCase().includes('penalty shootout')

      const recognized =
        isShootout ||
        KNOWN_UNPRICED_TYPES.has(type) ||
        (type === 'goal' && KNOWN_GOAL_DETAILS.has(detail)) ||
        (type === 'card' && KNOWN_CARD_DETAILS.has(detail))

      if (!recognized) unknownCombos.add(`${ev.type} / ${ev.detail ?? 'null'}`)

      // Sanity: classifier output is consistent with the recognized sets —
      // priced sub-events only ever come from known combos.
      const mapped = mapApiEvent(ev)
      if (mapped.length > 0) {
        expect(recognized, `classifier priced an unrecognized combo: ${type}/${detail}`).toBe(
          true
        )
      }
    }
    // New type/detail combo from the API → decide explicitly: price it
    // (mapApiEvent) or whitelist it here as unpriced. Never silent.
    expect([...unknownCombos]).toEqual([])
  })
})
