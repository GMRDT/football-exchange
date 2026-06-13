import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getLeaderboard } from '@/lib/leaderboard/summary'

/**
 * GET /api/leaderboard — public global leaderboard polled by the Leaderboard
 * screen (SWR, 30s). RLS-public (anon SELECT on v_leaderboard), so the anon
 * server client suffices — no service key (least privilege). The session cookie,
 * when present, lets getLeaderboard flag the current user's row.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient()
    const data = await getLeaderboard(supabase)
    return NextResponse.json(data)
  } catch (err) {
    // Zod/DB failures: surface a 500 without leaking internals to the client.
    console.error('[api/leaderboard]', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
