import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getMarketSummary } from '@/lib/market/summary'

/**
 * GET /api/market — public market snapshot polled by the Market screen (SWR,
 * 30s). No auth: the data is RLS-public (anon SELECT on players/teams/
 * price_history), so the anon server client suffices — the service key is
 * deliberately NOT used here (least privilege).
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient()
    const players = await getMarketSummary(supabase)
    return NextResponse.json({ players })
  } catch (err) {
    // Zod/DB failures: surface a 500 without leaking internals to the client.
    console.error('[api/market]', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
