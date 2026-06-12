/**
 * Integration tests for the sync_fixture() RPC against the local stack.
 * Requires `supabase start` and .env.local keys.
 *
 * Core proof: the upsert keyed on api_fixture_id is idempotent — a second
 * identical call changes nothing, a changed kickoff/status updates in place,
 * and no duplicate row can ever appear. Unresolved team/round mappings are
 * 'skipped' (normal for TBD knockout fixtures), and processed (finalized)
 * matches are immutable to the sync.
 */
import { afterAll, expect, test } from 'vitest'
import { adminClient, anonClient, createTestTeam } from './helpers'

const teamIds: string[] = []
const fixtureIds: number[] = []

function randomApiId(): number {
  return Math.floor(Math.random() * 1_000_000_000)
}

/** Team with a unique api_team_id, tracked for cleanup. */
async function newMappedTeam(): Promise<{ id: string; apiTeamId: number }> {
  const id = await createTestTeam()
  teamIds.push(id)
  const apiTeamId = randomApiId()
  const { error } = await adminClient.from('teams').update({ api_team_id: apiTeamId }).eq('id', id)
  if (error) throw new Error(`newMappedTeam failed: ${error.message}`)
  return { id, apiTeamId }
}

type SyncArgs = {
  p_api_fixture_id: number
  p_home_api_team_id: number
  p_away_api_team_id: number
  p_kickoff: string
  p_status: string
  p_round_sort_order: number
}

function syncFixture(client: ReturnType<typeof anonClient>, args: SyncArgs) {
  fixtureIds.push(args.p_api_fixture_id)
  return client.rpc('sync_fixture', args)
}

async function getMatch(apiFixtureId: number) {
  const { data, error } = await adminClient
    .from('matches')
    .select('id, round_id, home_team_id, away_team_id, kickoff_utc, status, processed')
    .eq('api_fixture_id', apiFixtureId)
  if (error) throw new Error(`getMatch failed: ${error.message}`)
  return data
}

afterAll(async () => {
  if (fixtureIds.length > 0) {
    await adminClient.from('matches').delete().in('api_fixture_id', fixtureIds)
  }
  if (teamIds.length > 0) await adminClient.from('teams').delete().in('id', teamIds)
}, 60_000)

// ── 1. Idempotent upsert ──────────────────────────────────────────────────────

test('insert → unchanged → updated, always exactly one row', async () => {
  const home = await newMappedTeam()
  const away = await newMappedTeam()
  const apiFixtureId = randomApiId()
  const kickoff = '2026-06-28T18:00:00+00:00'
  const args: SyncArgs = {
    p_api_fixture_id: apiFixtureId,
    p_home_api_team_id: home.apiTeamId,
    p_away_api_team_id: away.apiTeamId,
    p_kickoff: kickoff,
    p_status: 'NS',
    p_round_sort_order: 1,
  }

  const first = await syncFixture(adminClient, args)
  expect(first.error).toBeNull()
  expect(first.data).toMatchObject({ action: 'inserted' })

  let rows = await getMatch(apiFixtureId)
  expect(rows).toHaveLength(1)
  expect(rows[0].home_team_id).toBe(home.id)
  expect(rows[0].away_team_id).toBe(away.id)
  expect(rows[0].status).toBe('NS')
  expect(new Date(rows[0].kickoff_utc).getTime()).toBe(new Date(kickoff).getTime())

  // The sync re-sends the full fixture list every run: identical → no write.
  const second = await syncFixture(adminClient, args)
  expect(second.error).toBeNull()
  expect(second.data).toMatchObject({ action: 'unchanged' })
  expect(await getMatch(apiFixtureId)).toHaveLength(1)

  // Kickoff rescheduled + status changed by the API → updated in place.
  const newKickoff = '2026-06-29T15:00:00+00:00'
  const third = await syncFixture(adminClient, { ...args, p_kickoff: newKickoff, p_status: 'PST' })
  expect(third.error).toBeNull()
  expect(third.data).toMatchObject({ action: 'updated' })

  rows = await getMatch(apiFixtureId)
  expect(rows).toHaveLength(1)
  expect(rows[0].status).toBe('PST')
  expect(new Date(rows[0].kickoff_utc).getTime()).toBe(new Date(newKickoff).getTime())
})

// ── 2. Unresolved mappings are skipped, never inserted ────────────────────────

test('unknown api_team_id → skipped, no row', async () => {
  const home = await newMappedTeam()
  const apiFixtureId = randomApiId()

  const { data, error } = await syncFixture(adminClient, {
    p_api_fixture_id: apiFixtureId,
    p_home_api_team_id: home.apiTeamId,
    p_away_api_team_id: randomApiId(), // mapped to no team
    p_kickoff: '2026-07-04T18:00:00+00:00',
    p_status: 'NS',
    p_round_sort_order: 2,
  })
  expect(error).toBeNull()
  expect(data).toMatchObject({ action: 'skipped', reason: 'unmapped_team' })
  expect(await getMatch(apiFixtureId)).toHaveLength(0)
})

test('unknown round sort_order → skipped, no row', async () => {
  const home = await newMappedTeam()
  const away = await newMappedTeam()
  const apiFixtureId = randomApiId()

  const { data, error } = await syncFixture(adminClient, {
    p_api_fixture_id: apiFixtureId,
    p_home_api_team_id: home.apiTeamId,
    p_away_api_team_id: away.apiTeamId,
    p_kickoff: '2026-07-04T18:00:00+00:00',
    p_status: 'NS',
    p_round_sort_order: 99,
  })
  expect(error).toBeNull()
  expect(data).toMatchObject({ action: 'skipped', reason: 'unmapped_round' })
  expect(await getMatch(apiFixtureId)).toHaveLength(0)
})

// ── 3. Finalized matches are immutable to the sync ────────────────────────────

test('processed match: sync never touches it', async () => {
  const home = await newMappedTeam()
  const away = await newMappedTeam()
  const apiFixtureId = randomApiId()
  const args: SyncArgs = {
    p_api_fixture_id: apiFixtureId,
    p_home_api_team_id: home.apiTeamId,
    p_away_api_team_id: away.apiTeamId,
    p_kickoff: '2026-06-30T18:00:00+00:00',
    p_status: 'FT',
    p_round_sort_order: 1,
  }
  const insert = await syncFixture(adminClient, args)
  expect(insert.data).toMatchObject({ action: 'inserted' })

  const { error: procError } = await adminClient
    .from('matches')
    .update({ processed: true })
    .eq('api_fixture_id', apiFixtureId)
  expect(procError).toBeNull()

  // A racing poll with stale data must not regress a finalized match.
  const stale = await syncFixture(adminClient, { ...args, p_status: '2H' })
  expect(stale.error).toBeNull()
  expect(stale.data).toMatchObject({ action: 'unchanged', reason: 'processed' })

  const rows = await getMatch(apiFixtureId)
  expect(rows[0].status).toBe('FT')
  expect(rows[0].processed).toBe(true)
})

// ── 4. Privileges: service-role only ──────────────────────────────────────────

test('anon role cannot execute sync_fixture', async () => {
  const { error } = await syncFixture(anonClient(), {
    p_api_fixture_id: randomApiId(),
    p_home_api_team_id: 1,
    p_away_api_team_id: 2,
    p_kickoff: '2026-07-01T00:00:00+00:00',
    p_status: 'NS',
    p_round_sort_order: 1,
  })
  expect(error).not.toBeNull()
  expect(error?.code).toBe('42501') // insufficient_privilege
})
