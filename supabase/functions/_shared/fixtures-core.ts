/**
 * Pure fixture-sync logic: API-Football fixture-list validation (Zod —
 * CLAUDE.md convention for all external inputs), round-string → rounds.sort_order
 * mapping, and normalization into sync_fixture() arguments. No I/O.
 *
 * Status is passed through verbatim: matches.status stores API-Football short
 * codes (default 'NS'; trade() reads '1H'/'2H'/'ET'/'P') — there is no
 * translation layer, by design (ADR-009).
 */
import { z } from 'zod'

// ── API-Football schema (one item of the /fixtures?league&season list) ────────
// Team ids are nullable: knockout fixtures carry TBD slots until the bracket
// settles. The caller skips those; the next sync run picks them up.

export const ApiFixtureListItemSchema = z.object({
  fixture: z.object({
    id: z.number(),
    date: z.string(),
    status: z.object({ short: z.string() }),
  }),
  league: z.object({ round: z.string() }),
  teams: z.object({
    home: z.object({ id: z.number().nullable() }),
    away: z.object({ id: z.number().nullable() }),
  }),
})

export type ApiFixtureListItem = z.infer<typeof ApiFixtureListItemSchema>

// ── Round mapping ─────────────────────────────────────────────────────────────
// rounds.sort_order values seeded in migration #1. Group-stage rounds arrive
// with a matchday suffix ('Group Stage - 1'); 'Final' must match exactly so it
// never swallows 'Quarter-finals'/'Semi-finals'/'3rd Place Final'.

const ROUND_EXACT: Record<string, number> = {
  'round of 32': 2,
  'round of 16': 3,
  'quarter-finals': 4,
  'semi-finals': 5,
  '3rd place final': 6,
  'third place': 6,
  final: 7,
}

export function mapRoundToSortOrder(round: string): number | null {
  const normalized = round.trim().toLowerCase()
  if (normalized.startsWith('group stage')) return 1
  return ROUND_EXACT[normalized] ?? null
}

// ── Normalization ─────────────────────────────────────────────────────────────

export type NormalizedFixture = {
  apiFixtureId: number
  homeApiTeamId: number | null
  awayApiTeamId: number | null
  /** ISO timestamp as delivered by the API; cast to timestamptz by the RPC. */
  kickoffUtc: string
  /** API short status code, verbatim. */
  status: string
  roundSortOrder: number | null
}

/**
 * Validates and normalizes one raw list item. {ok:false} for malformed items —
 * the caller logs and moves on, one bad row never kills the run.
 */
export function parseFixtureItem(
  item: unknown
): { ok: true; row: NormalizedFixture } | { ok: false } {
  const parsed = ApiFixtureListItemSchema.safeParse(item)
  if (!parsed.success) return { ok: false }
  const fx = parsed.data
  return {
    ok: true,
    row: {
      apiFixtureId: fx.fixture.id,
      homeApiTeamId: fx.teams.home.id,
      awayApiTeamId: fx.teams.away.id,
      kickoffUtc: fx.fixture.date,
      status: fx.fixture.status.short,
      roundSortOrder: mapRoundToSortOrder(fx.league.round),
    },
  }
}
