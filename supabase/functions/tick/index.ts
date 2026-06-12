/**
 * tick Edge Function — applies the wall-clock price drip, mean reversion and
 * circuit breakers, then snapshots changed prices (reason 'tick').
 *
 * Invoked every minute by pg_cron via pg_net with the service-role key.
 * Exactly two DB round-trips: get_tick_state() → runTick() (pure TS, all
 * formulas in ../_shared) → apply_tick() (atomic, per-player optimistic
 * guard against concurrent trade()).
 */
import { createClient } from '@supabase/supabase-js'
import { runTick, type TickState } from '../_shared/tick-core.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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

  const { data: state, error: stateError } = await supabase.rpc('get_tick_state')
  if (stateError) return json({ error: `get_tick_state: ${stateError.message}` }, 500)

  const result = runTick(state as TickState)
  if (result.players.length === 0) {
    return json({ players_updated: 0, players_skipped: 0, deltas_deleted: 0 })
  }

  const { data: applied, error: applyError } = await supabase.rpc('apply_tick', { p: result })
  if (applyError) return json({ error: `apply_tick: ${applyError.message}` }, 500)

  return json(applied)
})
