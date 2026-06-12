/**
 * ingest Edge Function — polls API-Football for unprocessed matches, inserts
 * events idempotently (api_event_key, ADR-002), updates fair value, enqueues
 * price drips, and runs FT reconciliation (survival multiplier).
 *
 * Invoked every minute by pg_cron via pg_net with the service-role key.
 * All formulas come from ../_shared/market.ts; all writes go through the
 * service-role-only RPCs (ingest_event / finalize_match) so each logical
 * operation is atomic.
 */
import { createClient } from '@supabase/supabase-js'
import {
  applyEventToFairValue,
  applySurvival,
  eventDeltaPct,
} from '../_shared/market.ts'
import {
  ApiEventSchema,
  ApiFixtureResultSchema,
  ApiResponseSchema,
  createEventKeyBuilder,
  deriveOutcome,
  isFinalStatus,
  mapApiEvent,
} from '../_shared/ingest-core.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY') ?? ''
const API_BASE = 'https://v3.football.api-sports.io'

/** MVP recency coefficient (MARKET_ENGINE.md §1.2): flat 1.0. */
const RECENCY_C = '1'

type IngestState = {
  now_ms: number
  params: Record<string, unknown> | null
  event_types: { id: string; code: string; perf_points: string }[]
  players: { id: string; api_player_id: number | null; team_id: string; fair_value: string }[]
  matches: {
    id: string
    api_fixture_id: number
    status: string
    home_team_id: string
    away_team_id: string
    home_api_team_id: number | null
    away_api_team_id: number | null
    round_id: string
    round_sort_order: number
  }[]
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('Authorization') !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ error: 'unauthorized' }, 401)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: stateData, error: stateError } = await supabase.rpc('get_ingest_state')
  if (stateError) return json({ error: `get_ingest_state: ${stateError.message}` }, 500)
  const state = stateData as IngestState

  const summary = {
    matches_polled: state.matches.length,
    events_inserted: 0,
    events_skipped_unmapped: 0,
    matches_finalized: 0,
    errors: [] as string[],
  }

  if (state.matches.length === 0) return json(summary)
  if (!API_FOOTBALL_KEY) {
    // Misconfiguration must be visible in the function logs once there is
    // real work to do; idle periods stay quiet via the early return above.
    return json({ ...summary, error: 'API_FOOTBALL_KEY not configured' }, 500)
  }

  // In-memory lookups; fair values are chained here as events apply so a
  // multi-event player computes each update from the latest value.
  const playerByApiId = new Map<number, { id: string; team_id: string }>()
  const playersByTeam = new Map<string, string[]>()
  const fairValueById = new Map<string, string>()
  for (const p of state.players) {
    if (p.api_player_id != null) {
      playerByApiId.set(p.api_player_id, { id: p.id, team_id: p.team_id })
    }
    fairValueById.set(p.id, p.fair_value)
    const roster = playersByTeam.get(p.team_id)
    if (roster) roster.push(p.id)
    else playersByTeam.set(p.team_id, [p.id])
  }
  const eventTypeByCode = new Map(state.event_types.map((et) => [et.code, et]))

  for (const match of state.matches) {
    // ── Fetch fixture (status + score + events in one call) ──────────────────
    let fx
    try {
      const res = await fetch(`${API_BASE}/fixtures?id=${match.api_fixture_id}`, {
        headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      })
      if (!res.ok) {
        summary.errors.push(`fixture ${match.api_fixture_id}: HTTP ${res.status}`)
        continue
      }
      const body = ApiResponseSchema.safeParse(await res.json())
      if (!body.success) {
        summary.errors.push(`fixture ${match.api_fixture_id}: unexpected response shape`)
        continue
      }
      // Missing coverage = empty array with HTTP 200. Not an error.
      if (body.data.response.length === 0) {
        console.log(`fixture ${match.api_fixture_id}: no coverage yet, skipping`)
        continue
      }
      const parsed = ApiFixtureResultSchema.safeParse(body.data.response[0])
      if (!parsed.success) {
        summary.errors.push(`fixture ${match.api_fixture_id}: fixture parse failed`)
        continue
      }
      fx = parsed.data
    } catch (err) {
      summary.errors.push(`fixture ${match.api_fixture_id}: ${String(err)}`)
      continue
    }

    const status = fx.fixture.status.short
    if (status !== match.status) {
      const { error } = await supabase.from('matches').update({ status }).eq('id', match.id)
      if (error) summary.errors.push(`match ${match.id} status update: ${error.message}`)
    }

    // ── Events: idempotent insert → FV update → drip enqueue, per sub-event ──
    // One key builder per fixture response: identical composites (brace in
    // the same minute) get positional #N suffixes (ADR-002).
    const keyFor = createEventKeyBuilder(match.api_fixture_id)
    for (const raw of fx.events ?? []) {
      const ev = ApiEventSchema.safeParse(raw)
      if (!ev.success) {
        console.log(`fixture ${match.api_fixture_id}: skipping malformed event`)
        continue
      }
      for (const mapped of mapApiEvent(ev.data)) {
        const player = playerByApiId.get(mapped.apiPlayerId)
        if (!player) {
          // Mapping missing (api_player_id null in DB): skip and log — never
          // crash, never guess (player seeding/mapping is a separate task).
          console.log(`skip event: unmapped api_player_id=${mapped.apiPlayerId}`)
          summary.events_skipped_unmapped++
          continue
        }
        const eventType = eventTypeByCode.get(mapped.code)
        if (!eventType) {
          summary.errors.push(`event_types missing code '${mapped.code}'`)
          continue
        }
        const key = keyFor(ev.data, mapped)

        // Optimistic retry: ingest_event rejects (and rolls back) when our
        // fair-value read went stale; refetch as text and retry.
        for (let attempt = 0; attempt < 3; attempt++) {
          const expectedFv = fairValueById.get(player.id)
          if (!expectedFv) break
          const totalPct = eventDeltaPct(eventType.perf_points, RECENCY_C)
          const newFv = applyEventToFairValue(expectedFv, eventType.perf_points, RECENCY_C)

          const { data, error } = await supabase.rpc('ingest_event', {
            p_match_id: match.id,
            p_player_id: player.id,
            p_event_type_id: eventType.id,
            p_minute: ev.data.time.elapsed,
            p_api_event_key: key,
            p_expected_fair_value: expectedFv,
            p_new_fair_value: newFv.toFixed(6),
            p_total_pct: totalPct.toFixed(6),
          })

          if (error) {
            if (error.message.includes('fv_conflict') && attempt < 2) {
              const { data: fresh } = await supabase
                .from('players')
                .select('fair_value::text')
                .eq('id', player.id)
                .single()
              const freshFv = (fresh as { fair_value: string } | null)?.fair_value
              if (freshFv) fairValueById.set(player.id, freshFv)
              continue
            }
            summary.errors.push(`ingest_event ${key}: ${error.message}`)
            break
          }

          const result = data as { inserted: boolean }
          if (result.inserted) {
            summary.events_inserted++
            fairValueById.set(player.id, newFv.toFixed(6))
          }
          break
        }
      }
    }

    // ── FT reconciliation (exactly once via finalize_match's processed guard)
    if (!isFinalStatus(status)) continue

    const isKnockout = match.round_sort_order >= 2
    if (!isKnockout) {
      // A single group match never decides advancement; group-exit detection
      // (cross-group best-third standings) is a separate F3 sub-task. Mark
      // processed with no survival change.
      const { error } = await supabase.rpc('finalize_match', { p_match_id: match.id })
      if (error) summary.errors.push(`finalize_match ${match.id}: ${error.message}`)
      else summary.matches_finalized++
      continue
    }

    const outcome = deriveOutcome(fx)
    if (!outcome) {
      // Knockout matches always end with a winner (AET/PEN included); leave
      // unprocessed so the next poll retries once the API settles.
      summary.errors.push(`fixture ${match.api_fixture_id}: final but no winner flags yet`)
      continue
    }

    const teamByApiId = new Map<number, string>()
    if (match.home_api_team_id != null) teamByApiId.set(match.home_api_team_id, match.home_team_id)
    if (match.away_api_team_id != null) teamByApiId.set(match.away_api_team_id, match.away_team_id)
    const winnerTeamId = teamByApiId.get(outcome.winnerApiTeamId)
    const loserTeamId = teamByApiId.get(outcome.loserApiTeamId)
    if (!winnerTeamId || !loserTeamId) {
      summary.errors.push(`fixture ${match.api_fixture_id}: api_team_id mapping missing`)
      continue
    }

    const fairValues: { player_id: string; fair_value: string }[] = []
    for (const [teamId, advanced] of [
      [winnerTeamId, true],
      [loserTeamId, false],
    ] as const) {
      for (const playerId of playersByTeam.get(teamId) ?? []) {
        const fv = fairValueById.get(playerId)
        if (!fv) continue
        fairValues.push({
          player_id: playerId,
          fair_value: applySurvival(fv, advanced).toFixed(6),
        })
      }
    }

    const { data: finalized, error: finalizeError } = await supabase.rpc('finalize_match', {
      p_match_id: match.id,
      p_fair_values: fairValues,
      p_eliminated: { team_id: loserTeamId, round_id: match.round_id },
    })
    if (finalizeError) {
      summary.errors.push(`finalize_match ${match.id}: ${finalizeError.message}`)
    } else if ((finalized as { processed: boolean }).processed) {
      summary.matches_finalized++
    }
  }

  return json(summary)
})
