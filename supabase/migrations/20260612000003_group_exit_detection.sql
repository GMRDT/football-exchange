-- Group-exit elimination detection (F3.6).
--
-- WC 2026: 12 groups of 4. 1st and 2nd of each group advance (24), plus the
-- 8 best third-placed teams across all groups (32 to the Round of 32). The
-- 4th of every group and the 4 worst thirds are eliminated.
--
-- Survival pricing (×1.15 advance / ×0.50 elimination) is NOT computed here:
-- per CLAUDE.md invariant #4 and MARKET_ENGINE.md §8, fair-value formulas
-- live in supabase/functions/_shared/market.ts (applySurvival). SQL only
-- ranks teams (tournament logic) and applies pre-computed values under an
-- optimistic guard (same fv_conflict contract as ingest_event).
--
-- Standings need real match scores. match_events CANNOT provide them (it only
-- records events for our tradable players), so this migration adds score
-- columns that ingest persists from the fixture payload on every poll.
--
-- Tie-breaks: points desc, GD desc, GF desc, then api_team_id asc (arbitrary
-- but deterministic). FIFA's full criteria (head-to-head, fair play, drawing
-- of lots) are NOT implemented — docs/F3.5-live-test.md schedules a human
-- verification against official standings before groups close (Jun 24–27).

-- ── 1. Match scores ───────────────────────────────────────────────────────────
-- Nullable: unknown until the API reports them. Counts, not money → int.

alter table public.matches
  add column home_goals int check (home_goals >= 0),
  add column away_goals int check (away_goals >= 0);

-- ── 2. group_exits: idempotency ledger ────────────────────────────────────────
-- One row per team whose group fate has been decided AND priced. The insert
-- and the fair-value writes share finalize_group_exit's transaction, so a
-- team can never be half-applied or double-applied.

create table public.group_exits (
  team_id uuid primary key references public.teams (id),
  group_name text not null,
  outcome text not null check (outcome in ('advanced', 'eliminated')),
  reason text not null check (reason in
    ('group_rank_1', 'group_rank_2', 'group_rank_4', 'best_third', 'worst_third')),
  decided_at timestamptz not null default now()
);

alter table public.group_exits enable row level security;

-- Public tournament data (F4 group tables); zero client writes.
create policy "group_exits_select_public" on public.group_exits
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.group_exits from anon, authenticated;

-- ── 3. compute_group_standings(): points/GD/GF table for one group ───────────
-- SECURITY INVOKER + public EXECUTE: reads only public-read tables, reusable
-- by the F4 UI. Only processed group-stage matches with known scores count.

create or replace function public.compute_group_standings(p_group_name text)
returns table (
  team_id uuid,
  group_name text,
  rank int,
  points int,
  gd int,
  gf int,
  played int
)
language sql
stable
set search_path = public
as $$
  with group_teams as (
    select t.id, t.api_team_id, t.name
    from public.teams t
    where t.group_name = p_group_name
  ),
  finished as (
    select m.home_team_id, m.away_team_id, m.home_goals, m.away_goals
    from public.matches m
    join public.rounds r on r.id = m.round_id
    where r.sort_order = 1
      and m.processed = true
      and m.home_goals is not null
      and m.away_goals is not null
      and m.home_team_id in (select gt.id from group_teams gt)
      and m.away_team_id in (select gt.id from group_teams gt)
  ),
  results as (
    select f.home_team_id as t_id, f.home_goals as goals_for, f.away_goals as goals_against
    from finished f
    union all
    select f.away_team_id, f.away_goals, f.home_goals
    from finished f
  ),
  agg as (
    select
      gt.id as t_id,
      gt.api_team_id,
      gt.name,
      count(res.t_id)::int as t_played,
      coalesce(sum(case
        when res.goals_for > res.goals_against then 3
        when res.goals_for = res.goals_against then 1
        else 0
      end), 0)::int as t_points,
      coalesce(sum(res.goals_for - res.goals_against), 0)::int as t_gd,
      coalesce(sum(res.goals_for), 0)::int as t_gf
    from group_teams gt
    left join results res on res.t_id = gt.id
    group by gt.id, gt.api_team_id, gt.name
  )
  select
    a.t_id,
    p_group_name,
    (row_number() over (
      order by a.t_points desc, a.t_gd desc, a.t_gf desc,
               a.api_team_id asc nulls last, a.name asc
    ))::int,
    a.t_points,
    a.t_gd,
    a.t_gf,
    a.t_played
  from agg a
  order by 3;
$$;

grant execute on function public.compute_group_standings(text)
  to anon, authenticated, service_role;

-- ── 4. get_group_exit_state(): decisions executable right now ─────────────────
-- A group is COMPLETE when exactly its 6 group-stage matches are processed
-- with known scores. On completion, ranks 1/2 advance and rank 4 is
-- eliminated immediately. Thirds stay pending until EVERY group that has
-- matches is complete AND there are at least 12 of them (ignoring matchless
-- groups makes this testable on a seeded local stack; requiring 12 means a
-- partial tournament can never rank thirds). Teams already in group_exits
-- are excluded — the caller only ever sees undone work.

create or replace function public.get_group_exit_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with groups_with_matches as (
    select distinct th.group_name
    from public.matches m
    join public.rounds r on r.id = m.round_id
    join public.teams th on th.id = m.home_team_id
    where r.sort_order = 1 and th.group_name is not null
  ),
  complete_groups as (
    select g.group_name
    from groups_with_matches g
    where (
      select count(*)
      from public.matches m
      join public.rounds r on r.id = m.round_id
      join public.teams th on th.id = m.home_team_id
      join public.teams ta on ta.id = m.away_team_id
      where r.sort_order = 1
        and th.group_name = g.group_name
        and ta.group_name = g.group_name
        and m.processed = true
        and m.home_goals is not null
        and m.away_goals is not null
    ) = 6
  ),
  flags as (
    select
      (select count(*) from groups_with_matches)::int as gwm,
      (select count(*) from complete_groups)::int as cg,
      ((select count(*) from groups_with_matches) = (select count(*) from complete_groups)
        and (select count(*) from complete_groups) >= 12) as all_complete
  ),
  standings as (
    select s.*
    from complete_groups cg,
    lateral public.compute_group_standings(cg.group_name) s
  ),
  base_decisions as (
    -- ranks 1/2/4 are decidable the moment their own group completes
    select
      s.team_id,
      s.group_name,
      case when s.rank in (1, 2) then 'advanced' else 'eliminated' end as outcome,
      case s.rank
        when 1 then 'group_rank_1'
        when 2 then 'group_rank_2'
        else 'group_rank_4'
      end as reason
    from standings s
    where s.rank in (1, 2, 4)
  ),
  thirds as (
    select
      s.team_id,
      s.group_name,
      row_number() over (
        order by s.points desc, s.gd desc, s.gf desc,
                 t.api_team_id asc nulls last, t.name asc
      ) as third_rank
    from standings s
    join public.teams t on t.id = s.team_id
    where s.rank = 3 and (select f.all_complete from flags f)
  ),
  third_decisions as (
    select
      th.team_id,
      th.group_name,
      case when th.third_rank <= 8 then 'advanced' else 'eliminated' end as outcome,
      case when th.third_rank <= 8 then 'best_third' else 'worst_third' end as reason
    from thirds th
  ),
  all_decisions as (
    select * from base_decisions
    union all
    select * from third_decisions
  ),
  undecided as (
    select d.*
    from all_decisions d
    where not exists (select 1 from public.group_exits ge where ge.team_id = d.team_id)
  )
  select jsonb_build_object(
    'groups_with_matches', (select f.gwm from flags f),
    'complete_groups', (select f.cg from flags f),
    'all_complete', (select f.all_complete from flags f),
    'group_round_id', (select r.id from public.rounds r where r.sort_order = 1),
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_id', d.team_id,
        'group_name', d.group_name,
        'outcome', d.outcome,
        'reason', d.reason,
        'players', (
          -- full roster: survival applies to every player of the team (mapped
          -- or not), mirroring the knockout flow. NUMERIC as text (ADR-004).
          select coalesce(jsonb_agg(jsonb_build_object(
            'player_id', p.id,
            'fair_value', p.fair_value::text)), '[]'::jsonb)
          from public.players p
          where p.team_id = d.team_id
        )
      ))
      from undecided d
    ), '[]'::jsonb)
  );
$$;

-- ── 5. finalize_group_exit(): apply one team's pre-computed fate, exactly once
-- p_fair_values: [{player_id, expected_fair_value, new_fair_value}, …]
-- The group_exits insert is the idempotency gate; the optimistic fair-value
-- guard aborts (rolling back the gate too) when any value went stale, and the
-- caller retries with fresh state. NO formulas here — values arrive computed.

create or replace function public.finalize_group_exit(
  p_team_id uuid,
  p_outcome text,
  p_reason text,
  p_round_id uuid,
  p_fair_values jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
  v_gate uuid;
  v_expected int;
  v_updated int;
begin
  if p_team_id is null or p_round_id is null
     or p_outcome not in ('advanced', 'eliminated')
     or p_reason not in
       ('group_rank_1', 'group_rank_2', 'group_rank_4', 'best_third', 'worst_third') then
    raise exception 'finalize_group_exit: invalid arguments'
      using errcode = '22023';
  end if;

  select t.group_name into v_group_name from public.teams t where t.id = p_team_id;
  if not found or v_group_name is null then
    raise exception 'finalize_group_exit: unknown team or team without group'
      using errcode = '22023';
  end if;

  insert into public.group_exits (team_id, group_name, outcome, reason)
  values (p_team_id, v_group_name, p_outcome, p_reason)
  on conflict (team_id) do nothing
  returning team_id into v_gate;

  if v_gate is null then
    return jsonb_build_object('applied', false, 'reason', 'already_decided');
  end if;

  select count(*)::int into v_expected
  from jsonb_array_elements(coalesce(p_fair_values, '[]'::jsonb));

  update public.players p
  set fair_value = round((fv.value ->> 'new_fair_value')::numeric, 6)
  from jsonb_array_elements(coalesce(p_fair_values, '[]'::jsonb)) as fv(value)
  where p.id = (fv.value ->> 'player_id')::uuid
    and p.fair_value = (fv.value ->> 'expected_fair_value')::numeric;
  get diagnostics v_updated = row_count;

  if v_updated <> v_expected then
    -- Stale read (concurrent ingest event moved a fair value). Abort: the
    -- group_exits gate above rolls back too; the caller refetches and retries.
    raise exception 'fv_conflict' using errcode = 'P0001';
  end if;

  if p_outcome = 'eliminated' then
    update public.teams
    set is_eliminated = true, eliminated_round_id = p_round_id
    where id = p_team_id;
  end if;

  return jsonb_build_object('applied', true, 'players_updated', v_updated);
end;
$$;

revoke all on function public.get_group_exit_state() from public, anon, authenticated;
revoke all on function public.finalize_group_exit(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.get_group_exit_state() to service_role;
grant execute on function public.finalize_group_exit(uuid, text, text, uuid, jsonb)
  to service_role;

-- ── 6. get_ingest_state(): now also carries match scores ─────────────────────
-- CREATE OR REPLACE preserves the existing grants (service_role only, from
-- 20260611000003). Body identical to the previous version plus
-- home_goals/away_goals, so ingest can persist scores only when they change.

create or replace function public.get_ingest_state()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'now_ms', (extract(epoch from now()) * 1000)::bigint,
    'params', (select params from public.market_params limit 1),
    'event_types', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', et.id,
        'code', et.code,
        'perf_points', et.default_perf_points::text)), '[]'::jsonb)
      from public.event_types et
    ),
    -- ALL players (api_player_id may be null): events only touch mapped
    -- players, but the FT survival multiplier applies to a team's full roster.
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'api_player_id', p.api_player_id,
        'team_id', p.team_id,
        'fair_value', p.fair_value::text)), '[]'::jsonb)
      from public.players p
    ),
    'matches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'api_fixture_id', m.api_fixture_id,
        'status', m.status,
        'home_goals', m.home_goals,
        'away_goals', m.away_goals,
        'home_team_id', m.home_team_id,
        'away_team_id', m.away_team_id,
        'home_api_team_id', th.api_team_id,
        'away_api_team_id', ta.api_team_id,
        'round_id', m.round_id,
        'round_sort_order', r.sort_order)), '[]'::jsonb)
      from public.matches m
      join public.rounds r on r.id = m.round_id
      join public.teams th on th.id = m.home_team_id
      join public.teams ta on ta.id = m.away_team_id
      where m.processed = false and m.kickoff_utc <= now()
    )
  );
$$;
