-- F4 fixture sync: sync_fixture() RPC + invoke-sync-fixtures cron job.
--
-- The sync-fixtures Edge Function fetches the full World Cup fixture list
-- (GET /fixtures?league=1&season=2026 — one API request) every 6 hours and
-- upserts each row through sync_fixture(), replacing manual matches seeding.
-- ADR-009 in docs/ARCHITECTURE.md.
--
-- matches.api_fixture_id (int UNIQUE NOT NULL since migration #2) is the
-- upsert key. matches.status stores API-Football short codes verbatim —
-- the established convention (default 'NS'; trade() checks '1H'/'2H'/'ET'/'P').

-- ── 1. sync_fixture(): idempotent per-fixture upsert ──────────────────────────
-- Returns {action: 'inserted'|'updated'|'unchanged'|'skipped', reason?}.
-- Unresolved team/round mappings are 'skipped', not errors: knockout fixtures
-- legitimately carry TBD teams until the bracket settles, and the next run
-- picks them up. Processed (finalized) matches are never touched, so a poll
-- raced by ingest's FT reconciliation cannot regress status or reopen a match.

create or replace function public.sync_fixture(
  p_api_fixture_id int,
  p_home_api_team_id int,
  p_away_api_team_id int,
  p_kickoff timestamptz,
  p_status text,
  p_round_sort_order int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_home_id uuid;
  v_away_id uuid;
  v_round_id uuid;
  v_match public.matches%rowtype;
begin
  if p_api_fixture_id is null or p_kickoff is null
     or p_status is null or p_status = '' then
    raise exception 'sync_fixture: api_fixture_id, kickoff, status required'
      using errcode = '22023';
  end if;

  select id into v_round_id from public.rounds where sort_order = p_round_sort_order;
  if v_round_id is null then
    return jsonb_build_object('action', 'skipped', 'reason', 'unmapped_round');
  end if;

  select id into v_home_id from public.teams where api_team_id = p_home_api_team_id;
  select id into v_away_id from public.teams where api_team_id = p_away_api_team_id;
  if v_home_id is null or v_away_id is null then
    return jsonb_build_object('action', 'skipped', 'reason', 'unmapped_team');
  end if;

  select * into v_match from public.matches where api_fixture_id = p_api_fixture_id;

  if v_match.id is null then
    insert into public.matches
      (api_fixture_id, round_id, home_team_id, away_team_id, kickoff_utc, status)
    values
      (p_api_fixture_id, v_round_id, v_home_id, v_away_id, p_kickoff, p_status);
    return jsonb_build_object('action', 'inserted');
  end if;

  if v_match.processed then
    return jsonb_build_object('action', 'unchanged', 'reason', 'processed');
  end if;

  update public.matches
  set kickoff_utc  = p_kickoff,
      status       = p_status,
      round_id     = v_round_id,
      home_team_id = v_home_id,
      away_team_id = v_away_id
  where id = v_match.id
    and (kickoff_utc  is distinct from p_kickoff
      or status       is distinct from p_status
      or round_id     is distinct from v_round_id
      or home_team_id is distinct from v_home_id
      or away_team_id is distinct from v_away_id);

  if found then
    return jsonb_build_object('action', 'updated');
  end if;
  return jsonb_build_object('action', 'unchanged');
end;
$$;

revoke all on function public.sync_fixture(int, int, int, timestamptz, text, int)
  from public, anon, authenticated;
grant execute on function public.sync_fixture(int, int, int, timestamptz, text, int)
  to service_role;

-- ── 2. invoke_edge_function(): whitelist sync-fixtures ────────────────────────
-- Verbatim from migration #12 except the name whitelist (CREATE OR REPLACE
-- keeps the existing privileges; applied migrations stay untouched).

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
  if p_name not in ('ingest', 'tick', 'sync-fixtures') then
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

-- ── 3. check_cron_health(): report the new job too ────────────────────────────
-- Verbatim from migration #12 except invoke-sync-fixtures in the job filter.

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
  where j.jobname in ('invoke-ingest', 'invoke-tick', 'refresh-leaderboard',
                      'invoke-sync-fixtures');

  return jsonb_build_object('vault_secrets', v_secrets, 'cron_jobs', v_jobs);
end;
$$;

-- ── 4. Scheduling ──────────────────────────────────────────────────────────────
-- Every 6 hours: the full fixture list rarely changes faster, and one run
-- costs one API request. Kickoff-day status flow is owned by ingest (1 min).

select cron.schedule('invoke-sync-fixtures', '0 */6 * * *',
  $$select public.invoke_edge_function('sync-fixtures')$$);
