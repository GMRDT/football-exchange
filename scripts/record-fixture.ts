#!/usr/bin/env tsx
/**
 * Downloads fixture metadata and events from API-Football and saves them as
 * JSON fixtures for use in integration tests.
 *
 * Usage: pnpm record-fixture <fixture_id>
 * Output: tests/fixtures/fixture_{id}.json, tests/fixtures/events_{id}.json
 * Requires: API_FOOTBALL_KEY in .env.local
 */
import fs from 'node:fs'
import path from 'node:path'
import * as dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const fixtureId = process.argv[2]
if (!fixtureId || !/^\d+$/.test(fixtureId)) {
  console.error('Usage: pnpm record-fixture <fixture_id>')
  console.error('Example: pnpm record-fixture 1034567')
  process.exit(1)
}

const apiKey = process.env.API_FOOTBALL_KEY
if (!apiKey) {
  console.error('Error: API_FOOTBALL_KEY must be set in .env.local')
  process.exit(1)
}

const API_BASE = 'https://v3.football.api-sports.io'

const ApiResponseSchema = z.object({
  response: z.array(z.unknown()),
})

async function fetchApi(endpoint: string): Promise<unknown[]> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'x-apisports-key': apiKey! },
  })
  if (!res.ok) {
    throw new Error(`API-Football returned ${res.status} for ${endpoint}`)
  }
  const json = await res.json()
  const parsed = ApiResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error(`Unexpected API response shape for ${endpoint}`)
  }
  return parsed.data.response
}

async function main() {
  const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures')
  fs.mkdirSync(fixturesDir, { recursive: true })

  const [fixtureData, eventsData] = await Promise.all([
    fetchApi(`/fixtures?id=${fixtureId}`),
    fetchApi(`/fixtures/events?fixture=${fixtureId}`),
  ])

  const fixturePath = path.join(fixturesDir, `fixture_${fixtureId}.json`)
  const eventsPath = path.join(fixturesDir, `events_${fixtureId}.json`)

  fs.writeFileSync(fixturePath, JSON.stringify(fixtureData, null, 2))
  fs.writeFileSync(eventsPath, JSON.stringify(eventsData, null, 2))

  console.log(`fixture saved: ${fixtureData.length} entry → ${fixturePath}`)
  console.log(`events saved:  ${eventsData.length} events → ${eventsPath}`)
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
