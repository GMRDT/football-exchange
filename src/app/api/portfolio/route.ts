import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPortfolioSummary } from '@/lib/portfolio/summary'

/**
 * GET /api/portfolio — the signed-in user's portfolio snapshot, polled by the
 * Portfolio screen (SWR, 30s). Unlike /api/market this IS auth-scoped: the
 * server client carries the session cookies and RLS (security_invoker on
 * v_portfolio_value, owner-only on holdings/profiles) returns only this user.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient()
    const portfolio = await getPortfolioSummary(supabase)
    if (!portfolio) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    return NextResponse.json(portfolio)
  } catch (err) {
    console.error('[api/portfolio]', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
