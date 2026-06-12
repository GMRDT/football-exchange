#!/usr/bin/env tsx
/**
 * Release-checklist gate: verifies the price-engine scheduling prerequisites
 * on whatever environment .env.local points at (run against PRODUCTION before
 * relying on the cron jobs — see CLAUDE.md).
 *
 * Checks via the service-role-only check_cron_health() RPC:
 *   1. Vault secrets 'project_url' and 'service_role_key' exist
 *      (presence booleans only — values never leave the database)
 *   2. cron jobs invoke-ingest / invoke-tick / refresh-leaderboard scheduled
 *      and active, with their last run status (informational)
 *
 * Exit 0 when everything is in place; exit 1 with a per-item report otherwise.
 * Without this, a missing Vault secret fails SILENTLY (the cron job logs a
 * NOTICE and skips) and no price ever moves in production.
 */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import type { Database } from '../src/lib/supabase/types'

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

type CronHealth = {
  vault_secrets: { project_url: boolean; service_role_key: boolean }
  cron_jobs: {
    jobname: string
    schedule: string
    active: boolean
    last_run_status: string | null
    last_run_at: string | null
  }[]
}

const EXPECTED_JOBS = ['invoke-ingest', 'invoke-tick', 'refresh-leaderboard'] as const

async function main() {
  const { data, error } = await supabase.rpc('check_cron_health')
  if (error) {
    console.error(`check_cron_health() failed: ${error.message}`)
    console.error('Is migration 20260611000003_price_engine.sql applied to this environment?')
    process.exit(1)
  }
  const health = data as unknown as CronHealth
  const problems: string[] = []

  console.log(`Checking ${supabaseUrl}\n`)

  console.log('Vault secrets:')
  for (const name of ['project_url', 'service_role_key'] as const) {
    const present = health.vault_secrets[name]
    console.log(`  ${present ? '✓' : '✗'} ${name}`)
    if (!present) {
      problems.push(
        `Vault secret '${name}' missing — run in the SQL editor: ` +
          `select vault.create_secret('<value>', '${name}');`
      )
    }
  }

  console.log('Cron jobs:')
  for (const name of EXPECTED_JOBS) {
    const job = health.cron_jobs.find((j) => j.jobname === name)
    if (!job) {
      console.log(`  ✗ ${name} (not scheduled)`)
      problems.push(
        `cron job '${name}' not scheduled — migration 20260611000003_price_engine.sql ` +
          'has not been applied here'
      )
      continue
    }
    console.log(
      `  ${job.active ? '✓' : '✗'} ${name}  schedule='${job.schedule}'  ` +
        `last_run=${job.last_run_status ?? 'never'}` +
        (job.last_run_at ? ` at ${job.last_run_at}` : '')
    )
    if (!job.active) problems.push(`cron job '${name}' exists but is INACTIVE`)
    if (job.last_run_status === 'failed') {
      problems.push(`cron job '${name}' FAILED on its last run — check cron.job_run_details`)
    }
  }

  if (problems.length > 0) {
    console.error(`\nNOT READY — ${problems.length} problem(s):`)
    for (const p of problems) console.error(`  ✗ ${p}`)
    console.error(
      '\nReminder: the ingest function also needs `supabase secrets set API_FOOTBALL_KEY=…`' +
        ' (edge function env — not checkable from SQL).'
    )
    process.exit(1)
  }

  console.log('\nAll scheduling prerequisites in place.')
  console.log('Note: API_FOOTBALL_KEY (edge function secret) is not checkable from SQL —')
  console.log('confirm with `supabase secrets list`.')
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
