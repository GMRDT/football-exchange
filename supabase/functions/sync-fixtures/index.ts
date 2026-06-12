/**
 * sync-fixtures Edge Function — fetches the full World Cup fixture list from
 * API-Football (one request) and upserts every row through the sync_fixture()
 * RPC: new fixtures inserted, kickoff/status changes applied, unresolved
 * teams/rounds skipped until a later run. Replaces manual matches seeding
 * (ADR-009).
 *
 * Invoked every 6 hours by pg_cron via pg_net with the service-role key.
 * All parsing lives in ../_shared/fixtures-core.ts; all writes go through the
 * service-role-only RPC.
 */
import { createClient } from '@supabase/supabase-js'
import { ApiResponseSchema } from '../_shared/ingest-core.ts'
import { parseFixtureItem } from '../_shared/fixtures-core.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY') ?? ''
const LEAGUE_ID = Deno.env.get('API_FOOTBALL_LEAGUE_ID') ?? '1'
const SEASON = Deno.env.get('API_FOOTBALL_SEASON') ?? '2026'
const API_BASE = 'https://v3.football.api-sports.io'

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

  const summary = {
    fixtures_fetched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    errors: [] as string[],
  }

  if (!API_FOOTBALL_KEY) {
    // Unlike ingest, this function always has work to do — a missing key must
    // be loud in the function logs.
    return json({ ...summary, error: 'API_FOOTBALL_KEY not configured' }, 500)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // ── One request for the whole tournament; failures (incl. 429) are
  //    non-fatal: log, return 200, let the next 6h run retry ─────────────────
  let items: unknown[]
  try {
    const res = await fetch(`${API_BASE}/fixtures?league=${LEAGUE_ID}&season=${SEASON}`, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
    })
    if (!res.ok) {
      summary.errors.push(`fixtures list: HTTP ${res.status}`)
      console.error(`sync-fixtures: API returned HTTP ${res.status}, retrying next run`)
      return json(summary)
    }
    const body = ApiResponseSchema.safeParse(await res.json())
    if (!body.success) {
      summary.errors.push('fixtures list: unexpected response shape')
      return json(summary)
    }
    items = body.data.response
  } catch (err) {
    summary.errors.push(`fixtures list: ${String(err)}`)
    return json(summary)
  }
  summary.fixtures_fetched = items.length

  for (const item of items) {
    const parsed = parseFixtureItem(item)
    if (!parsed.ok) {
      summary.errors.push('malformed fixture item')
      continue
    }
    const row = parsed.row

    if (row.roundSortOrder === null) {
      console.log(`fixture ${row.apiFixtureId}: unmapped round, skipping`)
      summary.skipped++
      continue
    }
    if (row.homeApiTeamId === null || row.awayApiTeamId === null) {
      // TBD knockout slot — picked up once the bracket settles.
      summary.skipped++
      continue
    }

    const { data, error } = await supabase.rpc('sync_fixture', {
      p_api_fixture_id: row.apiFixtureId,
      p_home_api_team_id: row.homeApiTeamId,
      p_away_api_team_id: row.awayApiTeamId,
      p_kickoff: row.kickoffUtc,
      p_status: row.status,
      p_round_sort_order: row.roundSortOrder,
    })
    if (error) {
      summary.errors.push(`sync_fixture ${row.apiFixtureId}: ${error.message}`)
      continue
    }

    const action = (data as { action: string }).action
    if (action === 'inserted') summary.inserted++
    else if (action === 'updated') summary.updated++
    else if (action === 'skipped') summary.skipped++
    else summary.unchanged++
  }

  return json(summary)
})
