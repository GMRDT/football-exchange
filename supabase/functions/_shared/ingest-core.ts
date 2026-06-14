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
  // 'Penalty Shootout' marks shootout kicks (type=Goal) that must never be
  // priced as in-game penalties.
  comments: z.string().nullish(),
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
  // Final score — persisted to matches so compute_group_standings() can rank
  // groups (match_events only covers tradable players, never full scores).
  goals: z
    .object({
      home: z.number().int().nullable(),
      away: z.number().int().nullable(),
    })
    .nullish(),
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
 * shootout_kick is UNPRICED (default_perf_points = 0): recorded for
 * reconciliation/activity only, never moves fair value or enqueues a drip.
 * clean_sheet_* / motm are synthetic FT events derived from lineup stats.
 * injury_out is derived from subst events with injury comments. */
export type EventCode =
  | 'goal'
  | 'assist'
  | 'yellow_card'
  | 'red_card'
  | 'penalty_scored'
  | 'penalty_missed'
  | 'own_goal'
  | 'shootout_kick'
  | 'injury_out'
  | 'clean_sheet_gk'
  | 'clean_sheet_def'
  | 'motm'

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

  // Penalty shootout kicks arrive as type=Goal, detail=Penalty/Missed Penalty
  // with comments='Penalty Shootout'. They are not in-game events: a 5-round
  // shootout would otherwise compound up to 10 spurious ±6/8% fair-value
  // moves on top of the AET survival multiplier. Map to the unpriced
  // shootout_kick code (perf points 0) — never to penalty_scored/missed.
  if ((ev.comments ?? '').toLowerCase().includes('penalty shootout')) {
    if (ev.player.id != null) out.push({ code: 'shootout_kick', apiPlayerId: ev.player.id })
    return out
  }

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
  } else if (type === 'subst') {
    // Injury substitution: the player who came OFF (assist field) gets injury_out.
    if ((ev.comments ?? '').toLowerCase().includes('injury') && ev.assist?.id != null) {
      out.push({ code: 'injury_out', apiPlayerId: ev.assist.id })
    }
  }
  // Var / anything else: no direct price impact in MVP.

  return out
}

/**
 * ADR-002 idempotency key: deterministic composite of
 * (fixture, team, player, mapped code, detail, minute, extra). The mapped
 * code (not the raw type) keeps a goal and its assist distinct; extra time
 * keeps 90' and 90+3' distinct. Stable across polls by construction.
 *
 * Recorded real payloads (tests/fixtures/events-*.json) confirm API-Football
 * events carry NO unique id, so duplicates (a brace in the same minute) can
 * only be disambiguated positionally — see createEventKeyBuilder.
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

/**
 * Per-fixture-poll key builder that fixes the brace collision: two goals by
 * the same player in the same minute produce identical composites, and the
 * second one used to die on ON CONFLICT DO NOTHING — silently.
 *
 * The Nth occurrence of an identical composite within one poll response gets
 * the suffix `#N` (N ≥ 2). Idempotent across polls because the API returns
 * the full event list in stable chronological order every cycle, so the Nth
 * identical event is always the Nth — and identical events are interchangeable
 * by definition, so even a reorder among them yields the same key set. The
 * first occurrence keeps the bare composite: every key ingested before this
 * change stays valid (no re-keying on deploy).
 *
 * Scope one builder to one fixture response; counts must reset per poll.
 */
export function createEventKeyBuilder(
  apiFixtureId: number
): (ev: ApiEvent, mapped: MappedEvent) => string {
  const seen = new Map<string, number>()
  return (ev, mapped) => {
    const base = buildApiEventKey(apiFixtureId, ev, mapped)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}#${n}`
  }
}

// ── Lineup stats (/fixtures/players) ─────────────────────────────────────────

export const ApiPlayerStatsSchema = z.object({
  player: z.object({ id: z.number() }),
  statistics: z
    .array(
      z.object({
        games: z.object({
          minutes: z.number().nullable(),
          position: z.string().nullable(),
          rating: z.string().nullable(),
          substitute: z.boolean(),
        }),
      })
    )
    .min(1),
})

export const ApiTeamPlayersSchema = z.object({
  team: z.object({ id: z.number() }),
  players: z.array(z.unknown()),
})

export type ApiTeamPlayers = z.infer<typeof ApiTeamPlayersSchema>

export type FtLineupEvent = {
  code: 'clean_sheet_gk' | 'clean_sheet_def' | 'motm'
  apiPlayerId: number
}

export type AppearanceData = {
  apiPlayerId: number
  minutesPlayed: number
  started: boolean
}

/**
 * Derives clean_sheet_gk, clean_sheet_def, and motm from /fixtures/players
 * stats. Returns synthetic FT events and appearance records for DB storage.
 *
 * Clean sheet: position G or D, played 90+ minutes, team conceded 0 goals.
 * MOTM: highest-rated player across both teams (first if tied).
 */
export function computeFtLineupEvents(
  teamPlayers: ApiTeamPlayers[],
  homeGoals: number | null,
  awayGoals: number | null,
  homeApiTeamId: number | null,
  awayApiTeamId: number | null
): { ftEvents: FtLineupEvent[]; appearances: AppearanceData[] } {
  const ftEvents: FtLineupEvent[] = []
  const appearances: AppearanceData[] = []
  let bestRating = -1
  let motmPlayerId: number | null = null

  for (const teamData of teamPlayers) {
    const isHome = teamData.team.id === homeApiTeamId
    const isAway = teamData.team.id === awayApiTeamId
    if (!isHome && !isAway) continue

    const goalsAgainst = isHome ? (awayGoals ?? null) : (homeGoals ?? null)
    const cleanSheet = goalsAgainst === 0

    for (const rawPlayer of teamData.players) {
      const parsed = ApiPlayerStatsSchema.safeParse(rawPlayer)
      if (!parsed.success) continue
      const { player, statistics } = parsed.data
      const stats = statistics[0].games
      const minutes = stats.minutes ?? 0
      const position = stats.position ?? ''
      const started = !stats.substitute

      if (minutes > 0) {
        appearances.push({ apiPlayerId: player.id, minutesPlayed: minutes, started })
      }

      if (stats.rating) {
        const rating = parseFloat(stats.rating)
        if (!isNaN(rating) && rating > bestRating) {
          bestRating = rating
          motmPlayerId = player.id
        }
      }

      if (cleanSheet && minutes >= 90) {
        if (position === 'G') ftEvents.push({ code: 'clean_sheet_gk', apiPlayerId: player.id })
        else if (position === 'D')
          ftEvents.push({ code: 'clean_sheet_def', apiPlayerId: player.id })
      }
    }
  }

  if (motmPlayerId !== null) {
    ftEvents.push({ code: 'motm', apiPlayerId: motmPlayerId })
  }

  return { ftEvents, appearances }
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
