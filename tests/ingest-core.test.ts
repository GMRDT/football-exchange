/**
 * Unit tests for the pure ingest logic: API event mapping, the ADR-002
 * idempotency key, defensive parsing, and FT outcome derivation.
 */
import { describe, expect, test } from 'vitest'
import {
  ApiEventSchema,
  ApiFixtureResultSchema,
  ApiResponseSchema,
  buildApiEventKey,
  deriveOutcome,
  isFinalStatus,
  mapApiEvent,
  type ApiEvent,
} from '../supabase/functions/_shared/ingest-core'

function event(overrides: Partial<ApiEvent> = {}): ApiEvent {
  return {
    time: { elapsed: 23, extra: null },
    team: { id: 33 },
    player: { id: 152982 },
    assist: { id: null },
    type: 'Goal',
    detail: 'Normal Goal',
    ...overrides,
  }
}

describe('mapApiEvent', () => {
  test('normal goal with assist yields goal + assist sub-events', () => {
    const mapped = mapApiEvent(event({ assist: { id: 999 } }))
    expect(mapped).toEqual([
      { code: 'goal', apiPlayerId: 152982 },
      { code: 'assist', apiPlayerId: 999 },
    ])
  })

  test('normal goal without assist yields only the goal', () => {
    expect(mapApiEvent(event())).toEqual([{ code: 'goal', apiPlayerId: 152982 }])
  })

  test('penalty / missed penalty / own goal map to their codes', () => {
    expect(mapApiEvent(event({ detail: 'Penalty' }))[0]?.code).toBe('penalty_scored')
    expect(mapApiEvent(event({ detail: 'Missed Penalty' }))[0]?.code).toBe('penalty_missed')
    expect(mapApiEvent(event({ detail: 'Own Goal' }))[0]?.code).toBe('own_goal')
  })

  test('own goal never emits an assist', () => {
    const mapped = mapApiEvent(event({ detail: 'Own Goal', assist: { id: 999 } }))
    expect(mapped).toEqual([{ code: 'own_goal', apiPlayerId: 152982 }])
  })

  test('cards: yellow, red, and second yellow → red', () => {
    expect(mapApiEvent(event({ type: 'Card', detail: 'Yellow Card' }))[0]?.code).toBe(
      'yellow_card'
    )
    expect(mapApiEvent(event({ type: 'Card', detail: 'Red Card' }))[0]?.code).toBe('red_card')
    expect(mapApiEvent(event({ type: 'Card', detail: 'Second Yellow card' }))[0]?.code).toBe(
      'red_card'
    )
  })

  test('subst / Var / unknown types map to nothing', () => {
    expect(mapApiEvent(event({ type: 'subst', detail: 'Substitution 1' }))).toEqual([])
    expect(mapApiEvent(event({ type: 'Var', detail: 'Goal cancelled' }))).toEqual([])
    expect(mapApiEvent(event({ type: 'Something New' }))).toEqual([])
  })

  test('shootout kicks map to unpriced shootout_kick, never penalty_scored', () => {
    const scored = mapApiEvent(
      event({ detail: 'Penalty', comments: 'Penalty Shootout' })
    )
    expect(scored).toEqual([{ code: 'shootout_kick', apiPlayerId: 152982 }])

    const missed = mapApiEvent(
      event({ detail: 'Missed Penalty', comments: 'Penalty Shootout' })
    )
    expect(missed).toEqual([{ code: 'shootout_kick', apiPlayerId: 152982 }])
  })

  test('shootout comment match is case-insensitive', () => {
    expect(
      mapApiEvent(event({ detail: 'Penalty', comments: 'PENALTY SHOOTOUT' }))[0]?.code
    ).toBe('shootout_kick')
  })

  test('shootout kick with null player id maps to nothing', () => {
    expect(
      mapApiEvent(event({ detail: 'Penalty', comments: 'Penalty Shootout', player: { id: null } }))
    ).toEqual([])
  })

  test('in-game penalties still price normally (comments null or unrelated)', () => {
    expect(mapApiEvent(event({ detail: 'Penalty', comments: null }))[0]?.code).toBe(
      'penalty_scored'
    )
    expect(
      mapApiEvent(event({ detail: 'Penalty', comments: 'Confirmed after VAR review' }))[0]?.code
    ).toBe('penalty_scored')
    // comments omitted entirely (the common in-game case)
    expect(mapApiEvent(event({ detail: 'Missed Penalty' }))[0]?.code).toBe('penalty_missed')
  })

  test('null player id yields nothing (assist can still map)', () => {
    expect(mapApiEvent(event({ player: { id: null } }))).toEqual([])
    expect(mapApiEvent(event({ player: { id: null }, assist: { id: 999 } }))).toEqual([
      { code: 'assist', apiPlayerId: 999 },
    ])
  })
})

describe('buildApiEventKey (ADR-002)', () => {
  const fixtureId = 1234

  test('deterministic: same input → same key', () => {
    const ev = event()
    const [mapped] = mapApiEvent(ev)
    expect(buildApiEventKey(fixtureId, ev, mapped)).toBe(
      buildApiEventKey(fixtureId, ev, mapped)
    )
    expect(buildApiEventKey(fixtureId, ev, mapped)).toBe(
      '1234:33:152982:goal:normal_goal:23:0'
    )
  })

  test('goal and its assist get distinct keys', () => {
    const ev = event({ assist: { id: 999 } })
    const [goal, assist] = mapApiEvent(ev)
    expect(buildApiEventKey(fixtureId, ev, goal)).not.toBe(
      buildApiEventKey(fixtureId, ev, assist)
    )
  })

  test("90' and 90+3' are distinct via extra", () => {
    const at90 = event({ time: { elapsed: 90, extra: null } })
    const at903 = event({ time: { elapsed: 90, extra: 3 } })
    expect(buildApiEventKey(fixtureId, at90, mapApiEvent(at90)[0])).not.toBe(
      buildApiEventKey(fixtureId, at903, mapApiEvent(at903)[0])
    )
  })

  test('null team/minute/detail are stable placeholders, not crashes', () => {
    const ev = event({ team: { id: null }, time: { elapsed: null, extra: null }, detail: null })
    // detail null → no mapping for goal, so craft a card with null team/minute
    const card = event({
      type: 'Card',
      detail: 'Yellow Card',
      team: { id: null },
      time: { elapsed: null, extra: null },
    })
    expect(mapApiEvent(ev)).toEqual([])
    const [mapped] = mapApiEvent(card)
    expect(buildApiEventKey(fixtureId, card, mapped)).toBe(
      '1234:x:152982:yellow_card:yellow_card:x:0'
    )
  })
})

describe('deriveOutcome / isFinalStatus', () => {
  const fixture = (home: boolean | null, away: boolean | null) =>
    ApiFixtureResultSchema.parse({
      fixture: { id: 1, status: { short: 'FT', elapsed: 90 } },
      teams: {
        home: { id: 10, winner: home },
        away: { id: 20, winner: away },
      },
      events: [],
    })

  test('home / away winner / undecided', () => {
    expect(deriveOutcome(fixture(true, false))).toEqual({
      winnerApiTeamId: 10,
      loserApiTeamId: 20,
    })
    expect(deriveOutcome(fixture(false, true))).toEqual({
      winnerApiTeamId: 20,
      loserApiTeamId: 10,
    })
    expect(deriveOutcome(fixture(null, null))).toBeNull()
  })

  test('FT, AET, PEN are final; live statuses are not', () => {
    expect(isFinalStatus('FT')).toBe(true)
    expect(isFinalStatus('AET')).toBe(true)
    expect(isFinalStatus('PEN')).toBe(true)
    expect(isFinalStatus('1H')).toBe(false)
    expect(isFinalStatus('NS')).toBe(false)
  })
})

describe('defensive parsing (API-Football gotchas)', () => {
  test('missing coverage: empty response array parses fine', () => {
    expect(ApiResponseSchema.parse({ response: [] }).response).toEqual([])
  })

  test('fixture without events (nullish) parses fine', () => {
    const parsed = ApiFixtureResultSchema.parse({
      fixture: { id: 1, status: { short: 'NS', elapsed: null } },
      teams: { home: { id: 1, winner: null }, away: { id: 2, winner: null } },
    })
    expect(parsed.events ?? []).toEqual([])
  })

  test('a malformed event fails its own parse without throwing', () => {
    expect(ApiEventSchema.safeParse({ nonsense: true }).success).toBe(false)
  })
})
