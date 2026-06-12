#!/usr/bin/env tsx
/**
 * Populates players.api_player_id by matching squad lists from API-Football
 * against our seeded players — the minimal F3 wiring without which no real
 * match event can ever move a price.
 *
 *   pnpm map-api-players              # top 20 unmapped players by base_value
 *   pnpm map-api-players --top 50     # top N instead
 *   pnpm map-api-players --all        # every unmapped player
 *
 * Behavior:
 *  - one squads request per team (teams.api_team_id; 1100ms delay — free tier
 *    is ~100 req/day), Zod-validated;
 *  - names matched normalized (lowercase, diacritics stripped): an exact or
 *    clearly-dominant fuzzy match is written to the DB (idempotent — already
 *    mapped players are never touched, used api ids are never reused);
 *  - anything ambiguous goes to data/api-player-mapping-review.csv for human
 *    review, mirroring the philosophy of scripts/map-api-ids.ts.
 */
import fs from 'node:fs'
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
const REVIEW_CSV = path.resolve(process.cwd(), 'data/api-player-mapping-review.csv')

// ── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const all = argv.includes('--all')
const topIndex = argv.indexOf('--top')
const topN = topIndex >= 0 ? Number(argv[topIndex + 1]) : 20
if (!all && (!Number.isInteger(topN) || topN <= 0)) {
  console.error('Usage: pnpm map-api-players [--top N | --all]')
  process.exit(1)
}

// ── API schema ────────────────────────────────────────────────────────────────

const SquadResponseSchema = z.object({
  response: z.array(
    z.object({
      players: z.array(
        z.object({
          id: z.number().nullable(),
          name: z.string().nullable(),
        })
      ),
    })
  ),
})

// ── Name matching ─────────────────────────────────────────────────────────────

/** lowercase + diacritics stripped + collapsed whitespace. */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 100 exact · 85 containment · 80 token subset · 60 shared last token · 0. */
function scoreNames(canonical: string, candidate: string): number {
  const a = normalizeName(canonical)
  const b = normalizeName(candidate)
  if (a.length === 0 || b.length === 0) return 0
  if (a === b) return 100
  if (a.includes(b) || b.includes(a)) return 85
  const aTokens = a.split(' ')
  const bTokens = b.split(' ')
  const [short, long] = aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens]
  if (short.every((t) => long.includes(t))) return 80
  if (aTokens[aTokens.length - 1] === bTokens[bTokens.length - 1]) return 60
  return 0
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Main ──────────────────────────────────────────────────────────────────────

type DbPlayer = {
  id: string
  full_name: string
  team_id: string
  base_value: number
  api_player_id: number | null
}

async function main() {
  const [{ data: rawPlayers, error: playersError }, { data: rawTeams, error: teamsError }] =
    await Promise.all([
      supabase.from('players').select('id, full_name, team_id, base_value, api_player_id'),
      supabase.from('teams').select('id, name, api_team_id'),
    ])
  if (playersError || !rawPlayers) {
    console.error('Failed to fetch players:', playersError?.message)
    process.exit(1)
  }
  if (teamsError || !rawTeams) {
    console.error('Failed to fetch teams:', teamsError?.message)
    process.exit(1)
  }

  const usedApiIds = new Set(
    (rawPlayers as DbPlayer[]).map((p) => p.api_player_id).filter((id) => id != null)
  )

  // Idempotent: only unmapped players are candidates; top N by base_value.
  const targets = (rawPlayers as DbPlayer[])
    .filter((p) => p.api_player_id == null)
    .sort((a, b) => b.base_value - a.base_value)
    .slice(0, all ? undefined : topN)

  if (targets.length === 0) {
    console.log('Nothing to do: every targeted player already has an api_player_id.')
    process.exit(0)
  }

  const teamById = new Map(rawTeams.map((t) => [t.id, t]))
  const teamIds = [...new Set(targets.map((p) => p.team_id))]
  console.log(
    `Mapping ${targets.length} player(s) across ${teamIds.length} team(s) ` +
      `(${all ? 'all unmapped' : `top ${topN} by base_value`})\n`
  )

  // One squads call per involved team.
  const squadByTeam = new Map<string, { id: number; name: string }[]>()
  for (const teamId of teamIds) {
    const team = teamById.get(teamId)
    if (!team) continue
    if (team.api_team_id == null) {
      console.log(`⚠ team '${team.name}' has no api_team_id — skipping its players`)
      continue
    }
    await delay(RATE_DELAY_MS)
    try {
      const res = await fetch(`${API_BASE}/players/squads?team=${team.api_team_id}`, {
        headers: { 'x-apisports-key': apiKey! },
      })
      if (!res.ok) {
        console.log(`⚠ squads HTTP ${res.status} for team '${team.name}' — skipping`)
        continue
      }
      const parsed = SquadResponseSchema.safeParse(await res.json())
      if (!parsed.success) {
        console.log(`⚠ unexpected squads shape for team '${team.name}' — skipping`)
        continue
      }
      // Missing coverage = empty response with HTTP 200.
      const squad = parsed.data.response[0]?.players ?? []
      squadByTeam.set(
        teamId,
        squad.filter((p): p is { id: number; name: string } => p.id != null && p.name != null)
      )
      console.log(`✓ squad loaded for '${team.name}' (${squad.length} players)`)
    } catch (err) {
      console.log(`⚠ squads fetch failed for team '${team.name}': ${String(err)}`)
    }
  }

  let applied = 0
  const reviewRows: string[] = [
    'full_name,team_name,best_api_id,best_api_name,best_score,second_api_name,second_score,reason',
  ]

  for (const player of targets) {
    const team = teamById.get(player.team_id)
    const squad = squadByTeam.get(player.team_id)
    if (!team || !squad || squad.length === 0) continue

    const scored = squad
      .filter((c) => !usedApiIds.has(c.id))
      .map((c) => ({ ...c, score: scoreNames(player.full_name, c.name) }))
      .sort((a, b) => b.score - a.score)

    const best = scored[0]
    const second = scored[1]
    if (!best || best.score === 0) {
      reviewRows.push(`"${player.full_name}","${team.name}",,,0,,,no_match`)
      continue
    }

    // Auto-apply only when the best match is strong AND clearly dominant.
    const confident = best.score >= 80 && (!second || second.score < 60)
    if (!confident) {
      reviewRows.push(
        `"${player.full_name}","${team.name}",${best.id},"${best.name}",${best.score},` +
          `"${second?.name ?? ''}",${second?.score ?? ''},ambiguous`
      )
      continue
    }

    const { error } = await supabase
      .from('players')
      .update({ api_player_id: best.id })
      .eq('id', player.id)
      .is('api_player_id', null) // idempotent: never overwrite
    if (error) {
      console.log(`⚠ update failed for '${player.full_name}': ${error.message}`)
      continue
    }
    usedApiIds.add(best.id)
    applied++
    console.log(`✓ ${player.full_name} → ${best.id} (${best.name}, score ${best.score})`)
  }

  if (reviewRows.length > 1) {
    fs.writeFileSync(REVIEW_CSV, reviewRows.join('\n') + '\n')
    console.log(`\n${reviewRows.length - 1} player(s) need human review → ${REVIEW_CSV}`)
  }
  console.log(`\nDone: ${applied}/${targets.length} api_player_id(s) written.`)
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
