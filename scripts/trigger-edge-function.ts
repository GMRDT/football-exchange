#!/usr/bin/env tsx
/**
 * Manually invokes a deployed Edge Function against whatever environment
 * .env.local points at, printing its JSON summary. Used for the human-gated
 * first runs (sync-fixtures backfill, F3.5 live test) — the same POST that
 * pg_cron issues via invoke_edge_function(), but on demand.
 *
 *   pnpm trigger-fn sync-fixtures
 *   pnpm trigger-fn ingest
 *   pnpm trigger-fn tick
 */
import path from 'node:path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const FUNCTIONS = ['ingest', 'tick', 'sync-fixtures'] as const

const name = process.argv[2]
if (!name || !(FUNCTIONS as readonly string[]).includes(name)) {
  console.error(`Usage: pnpm trigger-fn <${FUNCTIONS.join('|')}>`)
  process.exit(1)
}

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}

async function main() {
  const url = `${supabaseUrl}/functions/v1/${name}`
  console.log(`POST ${url}\n`)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: '{}',
  })

  const text = await res.text()
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2))
  } catch {
    console.log(text)
  }

  if (!res.ok) {
    console.error(`\nHTTP ${res.status}`)
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
