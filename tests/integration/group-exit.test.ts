/**
 * Integration tests for F3.6 group-exit elimination against the local stack.
 * Requires `supabase start` and .env.local keys.
 *
 * Drives the SAME evaluateGroupExits() the ingest Edge Function uses, against
 * synthetic groups whose teams carry unique group_name values — seeded groups
 * (A–L, no matches) and other suites' teams (group_name null) are invisible
 * to the completion rule, so parallel test files never interfere.
 *
 * Acceptance proofs:
 *  - per-group: on completion 1st/2nd advance ×1.15, 4th eliminated ×0.50,
 *    3rd stays UNTOUCHED until all groups complete;
 *  - cross-group: with 12 complete groups the 8 best thirds (points/GD/GF)
 *    advance and the 4 worst are eliminated — 32 advanced / 16 eliminated;
 *  - idempotency: re-running the evaluation applies nothing and changes no
 *    fair value; a direct second finalize_group_exit returns applied:false.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { adminClient, anonClient, createTestPlayer } from './helpers'
import {
  evaluateGroupExits,
  type RpcClient,
} from '../../supabase/functions/_shared/group-exit-core'
import { applySurvival } from '../../supabase/functions/_shared/market'

const RUN = crypto.randomUUID().slice(0, 8)
const rpcClient = adminClient as unknown as RpcClient

const ADVANCED_FV = applySurvival('1000', true).toFixed(6) // 1150.000000
const ELIMINATED_FV = applySurvival('1000', false).toFixed(6) // 500.000000

let groupRoundId: string

beforeAll(async () => {
  const { data, error } = await adminClient
    .from('rounds')
    .select('id')
    .eq('sort_order', 1)
    .single()
  if (error || !data) throw new Error(`group round lookup failed: ${error?.message}`)
  groupRoundId = data.id
})

async function newGroupTeam(groupName: string, label: string): Promise<string> {
  const { data, error } = await adminClient
    .from('teams')
    .insert({
      name: `GX ${label} ${crypto.randomUUID().slice(0, 8)}`,
      country: 'TST',
      group_name: groupName,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`newGroupTeam failed: ${error?.message}`)
  return data.id
}

async function newFinishedMatch(
  homeTeamId: string,
  awayTeamId: string,
  homeGoals: number,
  awayGoals: number
): Promise<string> {
  const { data, error } = await adminClient
    .from('matches')
    .insert({
      api_fixture_id: Math.floor(Math.random() * 1_000_000_000),
      round_id: groupRoundId,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      kickoff_utc: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
      status: 'FT',
      processed: true,
      home_goals: homeGoals,
      away_goals: awayGoals,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`newFinishedMatch failed: ${error?.message}`)
  return data.id
}

/**
 * Builds one group with a deterministic table — points 9/6/3/0, no ties:
 *   T1 beats everyone 1-0 · T2 beats T3, T4 1-0 · T3 beats T4 thirdGf-0.
 * `thirdGf` controls the third's GF/GD for cross-group ranking. The last
 * match (T3 vs T4) is returned unplayed when `holdLastMatch` so a test can
 * complete the group on demand.
 */
async function makeGroup(
  groupName: string,
  thirdGf: number,
  holdLastMatch = false
): Promise<{ teams: [string, string, string, string]; play: () => Promise<string> }> {
  const t1 = await newGroupTeam(groupName, 'rank1')
  const t2 = await newGroupTeam(groupName, 'rank2')
  const t3 = await newGroupTeam(groupName, 'rank3')
  const t4 = await newGroupTeam(groupName, 'rank4')
  await newFinishedMatch(t1, t2, 1, 0)
  await newFinishedMatch(t1, t3, 1, 0)
  await newFinishedMatch(t1, t4, 1, 0)
  await newFinishedMatch(t2, t3, 1, 0)
  await newFinishedMatch(t2, t4, 1, 0)
  const play = () => newFinishedMatch(t3, t4, thirdGf, 0)
  if (!holdLastMatch) await play()
  return { teams: [t1, t2, t3, t4], play }
}

async function fairValue(playerId: string): Promise<string> {
  const { data, error } = await adminClient
    .from('players')
    .select('fair_value')
    .eq('id', playerId)
    .single()
  if (error || !data) throw new Error(`fairValue failed: ${error?.message}`)
  // PostgREST serializes NUMERIC as a JSON number in generated types; read it
  // back as a 6-dp string for exact comparison (values here are small ints).
  return Number(data.fair_value).toFixed(6)
}

async function exitsFor(teamIds: string[]) {
  const { data, error } = await adminClient
    .from('group_exits')
    .select('team_id, outcome, reason')
    .in('team_id', teamIds)
  if (error || !data) throw new Error(`exitsFor failed: ${error?.message}`)
  return data
}

async function cleanup(teamIds: string[]) {
  if (teamIds.length === 0) return
  await adminClient.from('group_exits').delete().in('team_id', teamIds)
  await adminClient.from('matches').delete().in('home_team_id', teamIds)
  const { data: players } = await adminClient
    .from('players')
    .select('id')
    .in('team_id', teamIds)
  const playerIds = (players ?? []).map((p) => p.id)
  if (playerIds.length > 0) {
    await adminClient.from('price_history').delete().in('player_id', playerIds)
    await adminClient.from('players').delete().in('id', playerIds)
  }
  await adminClient.from('teams').delete().in('id', teamIds)
}

// ── 1. Single group: immediate ranks, pending third ──────────────────────────

describe('single completed group', () => {
  const groupName = `GX1-${RUN}`
  let teams: [string, string, string, string]
  let playLast: () => Promise<string>
  const players: string[] = []

  afterAll(async () => {
    // must run before the 12-group suite: a leftover complete group would
    // change its all_complete arithmetic.
    await cleanup(teams ?? [])
  })

  test('incomplete group produces no decisions', async () => {
    const made = await makeGroup(groupName, 1, true)
    teams = made.teams
    playLast = made.play
    for (const teamId of teams) players.push(await createTestPlayer(teamId))

    const summary = await evaluateGroupExits(rpcClient)
    expect(summary.errors).toEqual([])
    const rows = await exitsFor(teams)
    expect(rows).toEqual([])
    for (const playerId of players) {
      expect(await fairValue(playerId)).toBe('1000.000000')
    }
  })

  test('completion applies 1st/2nd ×1.15 and 4th ×0.50; 3rd stays pending', async () => {
    await playLast()
    const summary = await evaluateGroupExits(rpcClient)
    expect(summary.errors).toEqual([])
    expect(summary.applied).toBe(3)

    expect(await fairValue(players[0])).toBe(ADVANCED_FV)
    expect(await fairValue(players[1])).toBe(ADVANCED_FV)
    expect(await fairValue(players[2])).toBe('1000.000000') // third: pending
    expect(await fairValue(players[3])).toBe(ELIMINATED_FV)

    const rows = await exitsFor(teams)
    expect(rows).toHaveLength(3)
    const byTeam = new Map(rows.map((r) => [r.team_id, r]))
    expect(byTeam.get(teams[0])).toMatchObject({ outcome: 'advanced', reason: 'group_rank_1' })
    expect(byTeam.get(teams[1])).toMatchObject({ outcome: 'advanced', reason: 'group_rank_2' })
    expect(byTeam.get(teams[3])).toMatchObject({ outcome: 'eliminated', reason: 'group_rank_4' })
    expect(byTeam.has(teams[2])).toBe(false)

    const { data: fourth } = await adminClient
      .from('teams')
      .select('is_eliminated, eliminated_round_id')
      .eq('id', teams[3])
      .single()
    expect(fourth).toMatchObject({ is_eliminated: true, eliminated_round_id: groupRoundId })
    const { data: first } = await adminClient
      .from('teams')
      .select('is_eliminated')
      .eq('id', teams[0])
      .single()
    expect(first).toMatchObject({ is_eliminated: false })
  })

  test('re-evaluation is a no-op and direct re-finalize is rejected', async () => {
    const again = await evaluateGroupExits(rpcClient)
    expect(again.errors).toEqual([])
    expect(again.applied).toBe(0)
    expect(again.skipped).toBe(0)
    expect(await fairValue(players[0])).toBe(ADVANCED_FV)
    expect(await fairValue(players[3])).toBe(ELIMINATED_FV)

    const { data, error } = await adminClient.rpc('finalize_group_exit', {
      p_team_id: teams[0],
      p_outcome: 'advanced',
      p_reason: 'group_rank_1',
      p_round_id: groupRoundId,
      p_fair_values: [],
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({ applied: false, reason: 'already_decided' })
  })
})

// ── 2. Full tournament: 12 groups, cross-group best thirds ───────────────────

describe('full tournament thirds resolution', () => {
  const allTeams: string[] = []
  const groups: { teams: [string, string, string, string]; play: () => Promise<string> }[] = []
  // sampled players: [best-third candidate (g12), worst-third (g1), g6 first, g6 fourth]
  let bestThirdPlayer: string
  let worstThirdPlayer: string
  let firstPlayer: string
  let fourthPlayer: string

  afterAll(async () => {
    await cleanup(allTeams)
  })

  test('11 complete groups decide ranks but never thirds', async () => {
    // group i third wins its match i-0 → third's GD = i − 2, strictly
    // increasing: thirds of groups 9..12 are the top... (8 best = 5..12).
    for (let i = 1; i <= 12; i++) {
      const made = await makeGroup(`GZ${i}-${RUN}`, i, i === 12)
      groups.push(made)
      allTeams.push(...made.teams)
    }
    worstThirdPlayer = await createTestPlayer(groups[0].teams[2])
    firstPlayer = await createTestPlayer(groups[5].teams[0])
    fourthPlayer = await createTestPlayer(groups[5].teams[3])
    bestThirdPlayer = await createTestPlayer(groups[11].teams[2])

    const summary = await evaluateGroupExits(rpcClient)
    expect(summary.errors).toEqual([])
    expect(summary.applied).toBe(33) // 11 groups × ranks 1/2/4

    expect(await fairValue(firstPlayer)).toBe(ADVANCED_FV)
    expect(await fairValue(fourthPlayer)).toBe(ELIMINATED_FV)
    // thirds untouched while any group is incomplete
    expect(await fairValue(worstThirdPlayer)).toBe('1000.000000')
    expect(await fairValue(bestThirdPlayer)).toBe('1000.000000')
  })

  test('12th completion resolves thirds: 8 best advance, 4 worst eliminated', async () => {
    await groups[11].play()
    const summary = await evaluateGroupExits(rpcClient)
    expect(summary.errors).toEqual([])
    expect(summary.applied).toBe(15) // group 12 ranks (3) + all 12 thirds

    const rows = await exitsFor(allTeams)
    expect(rows).toHaveLength(48)
    expect(rows.filter((r) => r.outcome === 'advanced')).toHaveLength(32)
    expect(rows.filter((r) => r.outcome === 'eliminated')).toHaveLength(16)
    expect(rows.filter((r) => r.reason === 'best_third')).toHaveLength(8)
    expect(rows.filter((r) => r.reason === 'worst_third')).toHaveLength(4)

    // thirds of groups 1–4 (lowest GD) are the worst; 5–12 the best
    const byTeam = new Map(rows.map((r) => [r.team_id, r]))
    for (let i = 0; i < 12; i++) {
      const third = byTeam.get(groups[i].teams[2])
      expect(third, `third of group ${i + 1}`).toMatchObject(
        i < 4
          ? { outcome: 'eliminated', reason: 'worst_third' }
          : { outcome: 'advanced', reason: 'best_third' }
      )
    }

    expect(await fairValue(bestThirdPlayer)).toBe(ADVANCED_FV)
    expect(await fairValue(worstThirdPlayer)).toBe(ELIMINATED_FV)
  })

  test('full re-evaluation after the tournament is a complete no-op', async () => {
    const again = await evaluateGroupExits(rpcClient)
    expect(again.errors).toEqual([])
    expect(again.applied).toBe(0)
    expect(await fairValue(bestThirdPlayer)).toBe(ADVANCED_FV)
    expect(await fairValue(worstThirdPlayer)).toBe(ELIMINATED_FV)
    expect(await exitsFor(allTeams)).toHaveLength(48)
  })

  test('compute_group_standings is publicly readable (F4-ready)', async () => {
    const { data, error } = await anonClient().rpc('compute_group_standings', {
      p_group_name: `GZ6-${RUN}`,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(4)
    const [first, second, third, fourth] = data!
    expect([first.points, second.points, third.points, fourth.points]).toEqual([9, 6, 3, 0])
    expect([first.rank, second.rank, third.rank, fourth.rank]).toEqual([1, 2, 3, 4])
    expect(first.team_id).toBe(groups[5].teams[0])
  })
})
