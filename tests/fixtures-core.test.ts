/**
 * Unit tests for the pure fixture-sync logic: round mapping, defensive
 * parsing of the API-Football fixture list, and verbatim status passthrough.
 */
import { describe, expect, test } from 'vitest'
import {
  mapRoundToSortOrder,
  parseFixtureItem,
} from '../supabase/functions/_shared/fixtures-core'

function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fixture: {
      id: 1145509,
      date: '2026-06-28T18:00:00+00:00',
      status: { short: 'NS' },
    },
    league: { round: 'Group Stage - 1' },
    teams: { home: { id: 10 }, away: { id: 26 } },
    ...overrides,
  }
}

describe('mapRoundToSortOrder', () => {
  test('all tournament rounds map to their seeded sort_order', () => {
    expect(mapRoundToSortOrder('Group Stage - 1')).toBe(1)
    expect(mapRoundToSortOrder('Group Stage - 2')).toBe(1)
    expect(mapRoundToSortOrder('Group Stage - 3')).toBe(1)
    expect(mapRoundToSortOrder('Round of 32')).toBe(2)
    expect(mapRoundToSortOrder('Round of 16')).toBe(3)
    expect(mapRoundToSortOrder('Quarter-finals')).toBe(4)
    expect(mapRoundToSortOrder('Semi-finals')).toBe(5)
    expect(mapRoundToSortOrder('3rd Place Final')).toBe(6)
    expect(mapRoundToSortOrder('Third Place')).toBe(6)
    expect(mapRoundToSortOrder('Final')).toBe(7)
  })

  test('case- and whitespace-insensitive', () => {
    expect(mapRoundToSortOrder('  round of 16 ')).toBe(3)
    expect(mapRoundToSortOrder('FINAL')).toBe(7)
    expect(mapRoundToSortOrder('group stage - 2')).toBe(1)
  })

  test("'Final' is exact: it never swallows other rounds containing the word", () => {
    expect(mapRoundToSortOrder('Quarter-finals')).not.toBe(7)
    expect(mapRoundToSortOrder('Semi-finals')).not.toBe(7)
    expect(mapRoundToSortOrder('3rd Place Final')).not.toBe(7)
  })

  test('unknown round strings map to null (caller skips, never guesses)', () => {
    expect(mapRoundToSortOrder('Preliminary Round')).toBeNull()
    expect(mapRoundToSortOrder('Regular Season - 12')).toBeNull()
    expect(mapRoundToSortOrder('')).toBeNull()
  })
})

describe('parseFixtureItem', () => {
  test('valid item normalizes into sync_fixture arguments', () => {
    expect(parseFixtureItem(item())).toEqual({
      ok: true,
      row: {
        apiFixtureId: 1145509,
        homeApiTeamId: 10,
        awayApiTeamId: 26,
        kickoffUtc: '2026-06-28T18:00:00+00:00',
        status: 'NS',
        roundSortOrder: 1,
      },
    })
  })

  test('status passes through verbatim (API short codes, no translation)', () => {
    for (const short of ['NS', '1H', 'HT', 'FT', 'AET', 'PEN', 'PST', 'CANC']) {
      const parsed = parseFixtureItem(
        item({ fixture: { id: 1, date: '2026-07-01T00:00:00+00:00', status: { short } } })
      )
      expect(parsed.ok && parsed.row.status).toBe(short)
    }
  })

  test('TBD knockout slots: null team ids pass through for the caller to skip', () => {
    const parsed = parseFixtureItem(
      item({ league: { round: 'Round of 32' }, teams: { home: { id: null }, away: { id: 26 } } })
    )
    expect(parsed).toEqual({
      ok: true,
      row: expect.objectContaining({
        homeApiTeamId: null,
        awayApiTeamId: 26,
        roundSortOrder: 2,
      }),
    })
  })

  test('unknown round normalizes with roundSortOrder null', () => {
    const parsed = parseFixtureItem(item({ league: { round: 'Preliminary Round' } }))
    expect(parsed.ok && parsed.row.roundSortOrder).toBeNull()
  })

  test('malformed items are rejected, never thrown', () => {
    expect(parseFixtureItem(null)).toEqual({ ok: false })
    expect(parseFixtureItem({})).toEqual({ ok: false })
    expect(parseFixtureItem(item({ fixture: { id: '123' } }))).toEqual({ ok: false })
    expect(parseFixtureItem(item({ league: {} }))).toEqual({ ok: false })
    expect(parseFixtureItem(item({ teams: { home: { id: 10 } } }))).toEqual({ ok: false })
  })
})
