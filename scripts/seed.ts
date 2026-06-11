#!/usr/bin/env tsx
/**
 * Idempotent seed: teams + players from data/teams.csv and data/players.csv.
 * Runs as service_role → bypasses RLS.
 * Safe to run multiple times: uses ON CONFLICT DO UPDATE.
 */
import fs from 'node:fs'
import path from 'node:path'
import * as dotenv from 'dotenv'
import Papa from 'papaparse'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import ws from 'ws'
import type { Database, Json } from '../src/lib/supabase/types'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// Node.js 20 polyfill — @supabase/realtime-js checks globalThis.WebSocket at
// client creation time. Must run before createClient.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof globalThis.WebSocket === 'undefined') (globalThis as any).WebSocket = ws

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

// ── Zod schemas ───────────────────────────────────────────────────────────────

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

const TeamRowSchema = z.object({
  name: z.string().min(1),
  country_code: z.string().min(2).max(3),
  group_name: z.string().min(1),
  api_team_id: z.coerce.number().int().default(0),
  color_primary: z.string().regex(HEX_COLOR, 'Must be a #RRGGBB hex color'),
  color_secondary: z.string().regex(HEX_COLOR, 'Must be a #RRGGBB hex color'),
})

const PlayerRowSchema = z.object({
  full_name: z.string().min(1),
  team_name: z.string().min(1),
  position_code: z.enum(['GK', 'DEF', 'MID', 'FWD']),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  base_value: z.coerce.number().positive('base_value must be positive'),
  liquidity_tier: z.enum(['star', 'starter', 'prospect']),
  api_player_id: z.coerce.number().int().default(0),
})

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCsv<T>(filepath: string, schema: z.ZodType<T>): T[] {
  const abs = path.resolve(process.cwd(), filepath)
  const content = fs.readFileSync(abs, 'utf-8')
  const { data, errors } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  })

  if (errors.length > 0) {
    console.error(`CSV parse errors in ${filepath}:`, errors)
    process.exit(1)
  }

  return data.map((row, idx) => {
    const result = schema.safeParse(row)
    if (!result.success) {
      console.error(
        `Validation error in ${filepath} row ${idx + 2}:`,
        result.error.flatten().fieldErrors
      )
      process.exit(1)
    }
    return result.data
  })
}

// ── Typed DB row helpers ──────────────────────────────────────────────────────

type PositionRow = { id: string; code: string }
type TeamRow = { id: string; name: string; colors: Json | null }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── Seed teams ──────────────────────────────────────────────────────────────
  const teamCsvRows = parseCsv('data/teams.csv', TeamRowSchema)

  const teamInserts = teamCsvRows.map((row) => ({
    name: row.name,
    country: row.country_code,
    group_name: row.group_name,
    api_team_id: (row.api_team_id ?? 0) === 0 ? null : (row.api_team_id as number),
    // Cast needed: { primary, secondary } satisfies Json structurally but the
    // deeply-recursive Json type requires a nudge from TypeScript.
    colors: { primary: row.color_primary, secondary: row.color_secondary } as Json,
  }))

  const { error: teamsUpsertErr } = await supabase
    .from('teams')
    .upsert(teamInserts, { onConflict: 'name' })

  if (teamsUpsertErr) {
    console.error('Teams upsert failed:', teamsUpsertErr.message)
    process.exit(1)
  }

  // ── Load lookup tables ──────────────────────────────────────────────────────
  const [{ data: rawPositions, error: posErr }, { data: rawTeams, error: teamsErr }] =
    await Promise.all([
      supabase.from('positions').select('id,code'),
      supabase.from('teams').select('id,name,colors'),
    ])

  if (posErr || !rawPositions) {
    console.error('Failed to fetch positions:', posErr?.message)
    process.exit(1)
  }
  if (teamsErr || !rawTeams) {
    console.error('Failed to fetch teams:', teamsErr?.message)
    process.exit(1)
  }

  // Supabase's TypeScript types surface SelectQueryError in the element union
  // for certain select strings; cast after null guard is safe.
  const positions = rawPositions as PositionRow[]
  const teams = rawTeams as TeamRow[]

  const positionMap = new Map(positions.map((p) => [p.code, p.id]))
  const teamMap = new Map(teams.map((t) => [t.name, t]))

  // ── Seed players ────────────────────────────────────────────────────────────
  const playerCsvRows = parseCsv('data/players.csv', PlayerRowSchema)

  const playerInserts = playerCsvRows.map((row) => {
    const team = teamMap.get(row.team_name)
    if (!team) {
      console.error(
        `Unknown team "${row.team_name}" for player "${row.full_name}". ` +
          'Ensure the team name matches exactly with data/teams.csv.'
      )
      process.exit(1)
    }

    const positionId = positionMap.get(row.position_code)
    if (!positionId) {
      console.error(`Unknown position code "${row.position_code}" for player "${row.full_name}".`)
      process.exit(1)
    }

    return {
      full_name: row.full_name,
      team_id: team.id,
      position_id: positionId,
      dob: row.dob,
      base_value: row.base_value,
      // fair_value and current_price start at base_value; the pricing engine
      // takes over after the first tick and real events begin.
      fair_value: row.base_value,
      current_price: row.base_value,
      liquidity_tier: row.liquidity_tier,
      // Inherit team colors for avatar background; overridable post-seed.
      avatar_colors: team.colors,
      api_player_id: (row.api_player_id ?? 0) === 0 ? null : (row.api_player_id as number),
    }
  })

  const { error: playersUpsertErr } = await supabase
    .from('players')
    .upsert(playerInserts, { onConflict: 'full_name,team_id' })

  if (playersUpsertErr) {
    console.error('Players upsert failed:', playersUpsertErr.message)
    process.exit(1)
  }

  console.log(`Teams seeded:   ${teamInserts.length}`)
  console.log(`Players seeded: ${playerInserts.length}`)
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
