-- Views. Regular views use security_invoker so the caller's RLS applies;
-- the leaderboard is a materialized view (matviews cannot have RLS) refreshed
-- server-side and intentionally public.

-- Tournament stats per player, derived from match_events by event_type code.
create view public.v_player_stats
with (security_invoker = true) as
select
  me.player_id,
  count(*) filter (where et.code = 'goal') as goals,
  count(*) filter (where et.code = 'assist') as assists,
  count(*) filter (where et.code = 'yellow_card') as yellow_cards,
  count(*) filter (where et.code = 'red_card') as red_cards
from public.match_events me
join public.event_types et on et.id = me.event_type_id
where me.player_id is not null
group by me.player_id;

-- Portfolio value per user. security_invoker: profiles/holdings RLS is
-- owner-only, so an authenticated user sees exactly their own row here.
-- 100000 = starting bankroll (ADR-006/ADR-007); ranking uses % return so
-- early arrivals get no advantage from natural inflation.
create view public.v_portfolio_value
with (security_invoker = true) as
select
  pr.id as user_id,
  pr.username,
  coalesce(sum(h.shares * p.current_price), 0) + pr.cash_balance as total_value,
  (coalesce(sum(h.shares * p.current_price), 0) + pr.cash_balance - 100000)
    / 100000 * 100 as return_pct
from public.profiles pr
left join public.holdings h on h.user_id = pr.id
left join public.players p on p.id = h.player_id
group by pr.id, pr.username, pr.cash_balance;

-- Materialized leaderboard (ADR-007), refreshed by tick(). The refresh runs as
-- postgres/service_role, which bypasses RLS on the underlying tables — that is
-- what makes a global ranking possible while profiles stay owner-only.
create materialized view public.v_leaderboard as
select
  user_id,
  username,
  total_value,
  return_pct,
  rank() over (order by return_pct desc) as rank
from public.v_portfolio_value;

-- Required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
create unique index idx_v_leaderboard_user_id on public.v_leaderboard (user_id);

-- The leaderboard is public by design (usernames + % return only — no absolute
-- cash positions beyond total_value, no holdings detail).
grant select on public.v_leaderboard to anon, authenticated;
