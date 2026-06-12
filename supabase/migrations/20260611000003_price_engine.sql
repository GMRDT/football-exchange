-- F3 price engine: wall-clock drip columns, service-role RPCs for ingest/tick,
-- and pg_cron + pg_net scheduling.
--
-- Spec: docs/MARKET_ENGINE.md (formulas) + docs/ARCHITECTURE.md (contracts).
-- Division of labor (invariant #4 in CLAUDE.md): every formula lives in
-- supabase/functions/_shared/market.ts — the RPCs here only apply values that
-- were pre-computed in TypeScript, atomically and with optimistic-concurrency
-- guards. The single SQL-side formula remains the trade() price impact.
--
-- ── One-time manual prerequisites (production AND any env that should run the
--    cron jobs; NEVER commit these values) ────────────────────────────────────
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
--   supabase secrets set API_FOOTBALL_KEY=<key>        -- edge function env
--
-- Until the vault secrets exist, invoke_edge_function() logs a NOTICE and
-- returns — no plaintext secrets in this file, and `db reset` stays clean on
-- machines without secrets. Verify with `pnpm check-prod-secrets`.

-- ── 1. Wall-clock drip columns (MARKET_ENGINE.md §2.2) ───────────────────────
-- total_pct: the full clamped fractional move (the same clamped pct applied to
-- fair value). applied_pct: the portion already reflected in current_price.
-- Progress is derived from elapsed wall time, so missed/uneven ticks self-heal.

alter table public.pending_price_deltas
  add column total_pct numeric(10, 6),
  add column applied_pct numeric(10, 6) not null default 0;

update public.pending_price_deltas set total_pct = remaining_pct;

alter table public.pending_price_deltas alter column total_pct set not null;
alter table public.pending_price_deltas alter column remaining_pct drop not null;

comment on column public.pending_price_deltas.remaining_pct is
  'DEPRECATED (F3): superseded by total_pct/applied_pct wall-clock drip. No longer written.';

-- ── 2. ingest_event(): atomic insert-event → update-FV → enqueue-drip ────────
-- Idempotency rests on the existing UNIQUE api_event_key (ADR-002): a re-seen
-- event conflicts on insert and the function returns {inserted:false} having
-- written NOTHING. The fair-value write is optimistic: it requires the value
-- the caller computed from; on mismatch the whole call (including the event
-- insert) rolls back and the caller retries with a fresh read.

create or replace function public.ingest_event(
  p_match_id uuid,
  p_player_id uuid,
  p_event_type_id uuid,
  p_minute int,
  p_api_event_key text,
  p_expected_fair_value numeric,
  p_new_fair_value numeric,
  p_total_pct numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  if p_match_id is null or p_event_type_id is null
     or p_api_event_key is null or p_api_event_key = '' then
    raise exception 'ingest_event: match_id, event_type_id, api_event_key required'
      using errcode = '22023';
  end if;

  insert into public.match_events (match_id, player_id, event_type_id, minute, api_event_key)
  values (p_match_id, p_player_id, p_event_type_id, p_minute, p_api_event_key)
  on conflict (api_event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    -- Re-seen event (the poller returns the full list every cycle): no-op.
    return jsonb_build_object('inserted', false);
  end if;

  -- Events without a price impact (null player / no delta) are stored for
  -- match-level reconciliation only.
  if p_player_id is null or p_new_fair_value is null or p_total_pct is null then
    return jsonb_build_object('inserted', true, 'event_id', v_event_id, 'fv_applied', false);
  end if;

  update public.players
  set fair_value = round(p_new_fair_value, 6)
  where id = p_player_id
    and fair_value = p_expected_fair_value;

  if not found then
    -- Stale read (concurrent ingest run). Abort so the event insert above
    -- rolls back too; the caller refetches fair_value and retries.
    raise exception 'fv_conflict' using errcode = 'P0001';
  end if;

  -- A zero delta would only linger in the queue doing nothing.
  if p_total_pct <> 0 then
    insert into public.pending_price_deltas (player_id, total_pct, source_event_id)
    values (p_player_id, round(p_total_pct, 6), v_event_id);
  end if;

  return jsonb_build_object('inserted', true, 'event_id', v_event_id, 'fv_applied', true);
end;
$$;

-- ── 3. finalize_match(): FT reconciliation, exactly once ─────────────────────
-- The processed-flag guard makes the survival multiplier impossible to apply
-- twice: only the call that flips processed false→true gets to write anything.
-- p_fair_values: [{player_id, fair_value}] computed in TS via market.ts
-- (×1.15 advance / ×0.50 elimination). p_eliminated: {team_id, round_id} | null.

create or replace function public.finalize_match(
  p_match_id uuid,
  p_fair_values jsonb default '[]'::jsonb,
  p_eliminated jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fv_count int := 0;
begin
  update public.matches set processed = true
  where id = p_match_id and processed = false;

  if not found then
    return jsonb_build_object('processed', false, 'reason', 'already_processed_or_missing');
  end if;

  update public.players p
  set fair_value = round((fv.value ->> 'fair_value')::numeric, 6)
  from jsonb_array_elements(coalesce(p_fair_values, '[]'::jsonb)) as fv(value)
  where p.id = (fv.value ->> 'player_id')::uuid;
  get diagnostics v_fv_count = row_count;

  if p_eliminated is not null then
    update public.teams
    set is_eliminated = true,
        eliminated_round_id = (p_eliminated ->> 'round_id')::uuid
    where id = (p_eliminated ->> 'team_id')::uuid;
  end if;

  return jsonb_build_object('processed', true, 'fair_values_applied', v_fv_count);
end;
$$;

-- ── 4. get_ingest_state(): one round-trip read for the ingest function ───────
-- Every NUMERIC is serialized as text (ADR-004: the JS side must never parse
-- money/prices into float64). Timestamps as epoch milliseconds (integers are
-- exact in JSON; time is not money).

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

-- ── 5. get_tick_state(): one round-trip read for the tick function ───────────
-- ref_price mirrors trade() step 11: most recent price_history row older than
-- 24h, falling back to base_value when no day-old history exists.

create or replace function public.get_tick_state()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'now_ms', (extract(epoch from now()) * 1000)::bigint,
    'params', (select params from public.market_params limit 1),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'current_price', p.current_price::text,
        'fair_value', p.fair_value::text,
        'base_value', p.base_value::text,
        'ref_price', coalesce(ph.price, p.base_value)::text)), '[]'::jsonb)
      from public.players p
      left join lateral (
        select price from public.price_history
        where player_id = p.id and captured_at <= now() - interval '24 hours'
        order by captured_at desc
        limit 1
      ) ph on true
    ),
    'deltas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id,
        'player_id', d.player_id,
        'total_pct', d.total_pct::text,
        'applied_pct', d.applied_pct::text,
        'created_at_ms', (extract(epoch from d.created_at) * 1000)::bigint)
        order by d.player_id, d.created_at), '[]'::jsonb)
      from public.pending_price_deltas d
    )
  );
$$;

-- ── 6. apply_tick(): atomic application of one tick's pre-computed results ───
-- Input: {"players": [{player_id, expected_price, new_price, fair_value,
--                      price_changed, deltas: [{id, new_applied_pct, done}]}]}
--
-- Per-player optimistic guard: the price update requires expected_price. If a
-- concurrent trade() moved the price mid-tick, that player (and its delta
-- progress) is skipped — the next tick recomputes from fresh state, and the
-- wall-clock drip loses nothing. applied_pct always advances with the price in
-- the same transaction, so a drip portion can never be applied twice.
-- price_history rows (reason 'tick') only for players whose price changed.

create or replace function public.apply_tick(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player jsonb;
  v_delta jsonb;
  v_updated int := 0;
  v_skipped int := 0;
  v_deltas_deleted int := 0;
begin
  for v_player in select * from jsonb_array_elements(coalesce(p -> 'players', '[]'::jsonb))
  loop
    -- Also serves as the concurrency check when the price is unchanged
    -- (clamped by a breaker) but delta progress still has to advance.
    update public.players
    set current_price = round((v_player ->> 'new_price')::numeric, 6)
    where id = (v_player ->> 'player_id')::uuid
      and current_price = (v_player ->> 'expected_price')::numeric;

    if not found then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_updated := v_updated + 1;

    for v_delta in select * from jsonb_array_elements(coalesce(v_player -> 'deltas', '[]'::jsonb))
    loop
      if (v_delta ->> 'done')::boolean then
        delete from public.pending_price_deltas where id = (v_delta ->> 'id')::uuid;
        v_deltas_deleted := v_deltas_deleted + 1;
      else
        update public.pending_price_deltas
        set applied_pct = round((v_delta ->> 'new_applied_pct')::numeric, 6)
        where id = (v_delta ->> 'id')::uuid;
      end if;
    end loop;

    if (v_player ->> 'price_changed')::boolean then
      insert into public.price_history (player_id, price, fair_value, reason)
      values (
        (v_player ->> 'player_id')::uuid,
        round((v_player ->> 'new_price')::numeric, 6),
        (v_player ->> 'fair_value')::numeric,
        'tick'
      );
    end if;
  end loop;

  return jsonb_build_object(
    'players_updated', v_updated,
    'players_skipped', v_skipped,
    'deltas_deleted', v_deltas_deleted
  );
end;
$$;

-- ── 7. check_cron_health(): backs `pnpm check-prod-secrets` ──────────────────
-- Presence booleans only — secret VALUES never leave the database.

create or replace function public.check_cron_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secrets jsonb;
  v_jobs jsonb;
begin
  v_secrets := jsonb_build_object(
    'project_url', exists (select 1 from vault.secrets where name = 'project_url'),
    'service_role_key', exists (select 1 from vault.secrets where name = 'service_role_key')
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'jobname', j.jobname,
    'schedule', j.schedule,
    'active', j.active,
    'last_run_status', d.status,
    'last_run_at', d.start_time)), '[]'::jsonb)
  into v_jobs
  from cron.job j
  left join lateral (
    select status, start_time from cron.job_run_details
    where jobid = j.jobid
    order by start_time desc
    limit 1
  ) d on true
  where j.jobname in ('invoke-ingest', 'invoke-tick', 'refresh-leaderboard');

  return jsonb_build_object('vault_secrets', v_secrets, 'cron_jobs', v_jobs);
end;
$$;

-- ── 8. Function privileges ────────────────────────────────────────────────────
-- service_role only. Functions default to EXECUTE for PUBLIC — revoke that
-- first, then grant the single intended caller.

revoke all on function public.ingest_event(uuid, uuid, uuid, int, text, numeric, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.finalize_match(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.get_ingest_state() from public, anon, authenticated;
revoke all on function public.get_tick_state() from public, anon, authenticated;
revoke all on function public.apply_tick(jsonb) from public, anon, authenticated;
revoke all on function public.check_cron_health() from public, anon, authenticated;

grant execute on function public.ingest_event(uuid, uuid, uuid, int, text, numeric, numeric, numeric)
  to service_role;
grant execute on function public.finalize_match(uuid, jsonb, jsonb) to service_role;
grant execute on function public.get_ingest_state() to service_role;
grant execute on function public.get_tick_state() to service_role;
grant execute on function public.apply_tick(jsonb) to service_role;
grant execute on function public.check_cron_health() to service_role;

-- ── 9. Scheduling: pg_cron → pg_net → Edge Functions ─────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reads project_url + service_role_key from Vault at call time. Missing
-- secrets (fresh local stack) → NOTICE and return, so cron logs stay clean and
-- nothing fails at migration time.
create or replace function public.invoke_edge_function(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  if p_name not in ('ingest', 'tick') then
    raise exception 'invoke_edge_function: unknown function %', p_name
      using errcode = '22023';
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_key is null then
    raise notice 'invoke_edge_function(%): vault secrets project_url/service_role_key missing — skipping (see pnpm check-prod-secrets)', p_name;
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.invoke_edge_function(text) from public, anon, authenticated;

-- Single 1-minute cadence for both jobs is intentional (cron's finest
-- granularity; the drip smooths the polling lag — MARKET_ENGINE.md §2.2).
-- Sub-minute polling on match days is a post-launch optimization.
select cron.schedule('invoke-ingest', '* * * * *',
  $$select public.invoke_edge_function('ingest')$$);
select cron.schedule('invoke-tick', '* * * * *',
  $$select public.invoke_edge_function('tick')$$);

-- ROADMAP F3.3 places the leaderboard refresh inside tick, but REFRESH
-- MATERIALIZED VIEW CONCURRENTLY cannot run inside a function transaction —
-- pg_cron runs it directly instead (idx_v_leaderboard_user_id makes
-- CONCURRENTLY possible).
select cron.schedule('refresh-leaderboard', '* * * * *',
  $$refresh materialized view concurrently public.v_leaderboard$$);
