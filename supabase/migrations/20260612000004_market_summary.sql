-- get_market_summary(): read-only market snapshot for the Market screen and
-- /api/market — one row per player with team/position labels and the
-- engine-canonical 24h price baseline.
--
-- Baseline semantics mirror the trade() daily breaker (20260611000001, step 11):
-- most recent price_history row captured_at <= now() - 24h, falling back to
-- base_value when the player has no day-old history yet. Computed here (not in
-- JS over raw price_history) so the result is one round trip, immune to the
-- PostgREST row cap, and never diverges from the engine.
--
-- security invoker: the caller's RLS applies — every source table is already
-- anon-readable (20260610000007). NUMERIC values are cast to text per the
-- NUMERIC-as-string convention (CLAUDE.md invariant #2).

create or replace function public.get_market_summary()
returns table (
  id uuid,
  full_name text,
  team_id uuid,
  team_name text,
  position_code text,
  liquidity_tier text,
  avatar_colors jsonb,
  current_price text,
  fair_value text,
  price_24h_ago text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.team_id,
    t.name as team_name,
    pos.code as position_code,
    p.liquidity_tier,
    p.avatar_colors,
    p.current_price::text,
    p.fair_value::text,
    coalesce(ph.price, p.base_value)::text as price_24h_ago
  from public.players p
  join public.teams t on t.id = p.team_id
  join public.positions pos on pos.id = p.position_id
  left join lateral (
    select h.price
    from public.price_history h
    where h.player_id = p.id
      and h.captured_at <= now() - interval '24 hours'
    order by h.captured_at desc
    limit 1
  ) ph on true
  order by p.full_name;
$$;

grant execute on function public.get_market_summary() to anon, authenticated;
