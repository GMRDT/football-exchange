/**
 * Pure ingest logic: API-Football response validation (Zod — CLAUDE.md
 * convention for all external inputs), event → event_type mapping, the
 * ADR-002 idempotency key, and FT outcome derivation. No I/O.
 *
 * API-Football gotchas handled here (docs/ARCHITECTURE.md):
 *  - missing coverage returns an EMPTY array with HTTP 200 — never throw;
 *  - event player.id can be null (unnamed players);
 *  - the poller re-returns the full event list every cycle, so the event key
 *    must be deterministic and stable across polls.
 */
import { z } from 'zod'

// ── API-Football schemas (fixture-by-id response) ────────────────────────────

export const ApiResponseSchema = z.object({
  response: z.array(z.unknown()),
})

export const ApiEventSchema = z.object({
  time: z.object({
    elapsed: z.number().nullable(),
    extra: z.number().nullish(),
  }),
  team: z.object({ id: z.number().nullable() }),
  player: z.object({ id: z.number().nullable() }),
  assist: z.object({ id: z.number().nullable() }).nullish(),
  type: z.string(),
  detail: z.string().nullable(),
})

export type ApiEvent = z.infer<typeof ApiEventSchema>

export const ApiFixtureResultSchema = z.object({
  fixture: z.object({
    id: z.number(),
    status: z.object({
      short: z.string(),
      elapsed: z.number().nullable(),
    }),
  }),
  teams: z.object({
    home: z.object({ id: z.number(), winner: z.boolean().nullable() }),
    away: z.object({ id: z.number(), winner: z.boolean().nullable() }),
  }),
  // Validated per-event downstream so one malformed event cannot kill the run.
  events: z.array(z.unknown()).nullish(),
})

export type ApiFixtureResult = z.infer<typeof ApiFixtureResultSchema>

// ── Status sets ───────────────────────────────────────────────────────────────

/** Terminal statuses that trigger FT reconciliation. */
const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN'])

export function isFinalStatus(status: string): boolean {
  return FINAL_STATUSES.has(status)
}

// ── Event mapping ─────────────────────────────────────────────────────────────

/** event_types.code values an API event can map to (MARKET_ENGINE.md §1.4).
 * clean_sheet_* / motm / injury_out need lineup data — deferred FT sub-task. */
export type EventCode =
  | 'goal'
  | 'assist'
  | 'yellow_card'
  | 'red_card'
  | 'penalty_scored'
  | 'penalty_missed'
  | 'own_goal'

export type MappedEvent = {
  code: EventCode
  /** API id of the player this sub-event belongs to (scorer vs assister). */
  apiPlayerId: number
}

/**
 * Maps one raw API event to zero or more priced sub-events. A goal with an
 * assist yields two (goal for the scorer, assist for the assister). Events
 * with no mapped code (subst, Var, unknown details) or no player id yield
 * nothing — the caller logs and moves on, never crashes.
 */
export function mapApiEvent(ev: ApiEvent): MappedEvent[] {
  const out: MappedEvent[] = []
  const type = ev.type.toLowerCase()
  const detail = (ev.detail ?? '').toLowerCase()

  if (type === 'goal') {
    if (detail === 'normal goal') {
      if (ev.player.id != null) out.push({ code: 'goal', apiPlayerId: ev.player.id })
      if (ev.assist?.id != null) out.push({ code: 'assist', apiPlayerId: ev.assist.id })
    } else if (detail === 'penalty') {
      if (ev.player.id != null) out.push({ code: 'penalty_scored', apiPlayerId: ev.player.id })
    } else if (detail === 'missed penalty') {
      if (ev.player.id != null) out.push({ code: 'penalty_missed', apiPlayerId: ev.player.id })
    } else if (detail === 'own goal') {
      if (ev.player.id != null) out.push({ code: 'own_goal', apiPlayerId: ev.player.id })
    }
  } else if (type === 'card') {
    if (detail === 'yellow card') {
      if (ev.player.id != null) out.push({ code: 'yellow_card', apiPlayerId: ev.player.id })
    } else if (detail === 'red card' || detail === 'second yellow card') {
      if (ev.player.id != null) out.push({ code: 'red_card', apiPlayerId: ev.player.id })
    }
  }
  // subst / Var / anything else: no direct price impact in MVP.

  return out
}

/**
 * ADR-002 idempotency key: deterministic composite of
 * (fixture, team, player, mapped code, detail, minute, extra). The mapped
 * code (not the raw type) keeps a goal and its assist distinct; extra time
 * keeps 90' and 90+3' distinct. Stable across polls by construction.
 */
export function buildApiEventKey(
  apiFixtureId: number,
  ev: ApiEvent,
  mapped: MappedEvent
): string {
  const detail = (ev.detail ?? 'x').toLowerCase().replace(/\s+/g, '_')
  return [
    apiFixtureId,
    ev.team.id ?? 'x',
    mapped.apiPlayerId,
    mapped.code,
    detail,
    ev.time.elapsed ?? 'x',
    ev.time.extra ?? 0,
  ].join(':')
}

// ── FT outcome ────────────────────────────────────────────────────────────────

export type MatchOutcome = {
  winnerApiTeamId: number
  loserApiTeamId: number
}

/**
 * Decisive outcome from API-Football's winner flags (they account for extra
 * time and penalty shootouts). Returns null when undecided — normal for a
 * drawn group-stage match, an error worth logging for a knockout one.
 */
export function deriveOutcome(fx: ApiFixtureResult): MatchOutcome | null {
  const { home, away } = fx.teams
  if (home.winner === true) return { winnerApiTeamId: home.id, loserApiTeamId: away.id }
  if (away.winner === true) return { winnerApiTeamId: away.id, loserApiTeamId: home.id }
  return null
}
