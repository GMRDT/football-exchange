#!/usr/bin/env tsx
/**
 * Suggests API-Football IDs for teams and players with missing/zero api_id.
 * READS ONLY — no DB writes. Output is CSV for human review.
 *
 * Usage: pnpm tsx scripts/map-api-ids.ts
 * Requires: API_FOOTBALL_KEY in .env.local
 * Rate limit: ~100 req/day → enforce 1100ms delay between requests.
 */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import ws from 'ws'
import type { Database } from '../src/lib/supabase/types'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof globalThis.WebSocket === 'undefined') (globalThis as any).WebSocket = ws

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const apiKey = process.env.API_FOOTBALL_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}
if (!apiKey) {
  console.error('Error: API_FOOTBALL_KEY must be set in .env.local')
  process.exit(1)
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

const API_BASE = 'https://v3.football.api-sports.io'
const RATE_DELAY_MS = 1100

// ── API-Football response schemas ─────────────────────────────────────────────

const TeamSuggestionSchema = z.object({
  team: z.object({
    id: z.number(),
    name: z.string(),
  }),
})

const PlayerSuggestionSchema = z.object({
  player: z.object({
    id: z.number(),
    name: z.string(),
  }),
})

const ApiResponseSchema = z.object({
  response: z.array(z.unknown()),
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchApi(endpoint: string): Promise<unknown[]> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'x-apisports-key': apiKey!,
    },
  })
  if (!res.ok) {
    throw new Error(`API error ${res.status} for ${endpoint}`)
  }
  const json = await res.json()
  const parsed = ApiResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error(`Unexpected API response shape for ${endpoint}`)
  }
  return parsed.data.response
}

function scoreSuggestion(canonical: string, apiName: string): number {
  const a = canonical.toLowerCase()
  const b = apiName.toLowerCase()
  if (a === b) return 100
  if (b.includes(a) || a.includes(b)) return 80
  return 60
}

// ── Teams ─────────────────────────────────────────────────────────────────────

async function mapTeams() {
  // Fetch all teams and filter in JS to avoid Supabase's .or() type issues.
  const { data: rawTeams, error } = await supabase
    .from('teams')
    .select('id,name,api_team_id')

  if (error || !rawTeams) {
    console.error('Failed to fetch teams:', error?.message)
    process.exit(1)
  }

  // Cast after null guard — SelectQueryError can surface in element union.
  const teams = (rawTeams as Array<{ id: string; name: string; api_team_id: number | null }>)
    .filter((t) => !t.api_team_id || t.api_team_id === 0)

  if (teams.length === 0) {
    console.log('# No teams with missing api_team_id')
    return
  }

  console.log('# TEAMS')
  console.log('team_name,suggested_api_id,confidence,api_name')

  for (const team of teams) {
    await delay(RATE_DELAY_MS)
    try {
      const results = await fetchApi(`/teams?name=${encodeURIComponent(team.name)}`)
      if (results.length === 0) {
        console.log(`${team.name},,0,no_match`)
        continue
      }
      const first = TeamSuggestionSchema.safeParse(results[0])
      if (!first.success) {
        console.log(`${team.name},,0,parse_error`)
        continue
      }
      const confidence = scoreSuggestion(team.name, first.data.team.name)
      console.log(`${team.name},${first.data.team.id},${confidence},${first.data.team.name}`)
    } catch (err) {
      console.error(`# Error fetching team "${team.name}":`, err)
      console.log(`${team.name},,0,fetch_error`)
    }
  }
}

// ── Players ───────────────────────────────────────────────────────────────────

async function mapPlayers() {
  const { data: rawPlayers, error } = await supabase
    .from('players')
    .select('id,full_name,api_player_id')

  if (error || !rawPlayers) {
    console.error('Failed to fetch players:', error?.message)
    process.exit(1)
  }

  const players = (
    rawPlayers as Array<{ id: string; full_name: string; api_player_id: number | null }>
  ).filter((p) => !p.api_player_id || p.api_player_id === 0)

  if (players.length === 0) {
    console.log('# No players with missing api_player_id')
    return
  }

  console.log('')
  console.log('# PLAYERS')
  console.log('full_name,suggested_api_id,confidence,api_name')

  for (const player of players) {
    await delay(RATE_DELAY_MS)
    try {
      const results = await fetchApi(
        `/players/profiles?search=${encodeURIComponent(player.full_name)}`
      )
      if (results.length === 0) {
        console.log(`${player.full_name},,0,no_match`)
        continue
      }
      const first = PlayerSuggestionSchema.safeParse(results[0])
      if (!first.success) {
        console.log(`${player.full_name},,0,parse_error`)
        continue
      }
      const confidence = scoreSuggestion(player.full_name, first.data.player.name)
      console.log(
        `${player.full_name},${first.data.player.id},${confidence},${first.data.player.name}`
      )
    } catch (err) {
      console.error(`# Error fetching player "${player.full_name}":`, err)
      console.log(`${player.full_name},,0,fetch_error`)
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('# map-api-ids output — review and apply manually to CSVs')
  console.log(`# Generated: ${new Date().toISOString()}`)
  await mapTeams()
  await mapPlayers()
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
