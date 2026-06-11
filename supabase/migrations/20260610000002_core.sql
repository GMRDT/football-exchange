-- Core entities: players, matches, profiles + signup trigger.
-- All monetary/price columns are NUMERIC (ADR-004) — never float.

create table public.players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  team_id uuid not null references public.teams (id),
  position_id uuid not null references public.positions (id),
  dob date,
  avatar_colors jsonb,
  base_value numeric(20, 6) not null,
  fair_value numeric(20, 6) not null,
  current_price numeric(20, 6) not null,
  liquidity_tier text not null check (liquidity_tier in ('star', 'starter', 'prospect')),
  shares_outstanding numeric(20, 6) not null default 0,
  api_player_id int unique
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  api_fixture_id int unique not null,
  round_id uuid not null references public.rounds (id),
  home_team_id uuid not null references public.teams (id),
  away_team_id uuid not null references public.teams (id),
  kickoff_utc timestamptz not null,
  status text not null default 'NS',
  processed boolean not null default false
);

-- Rows are created ONLY by the on_auth_user_created trigger below; the client
-- never inserts profiles directly.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  cash_balance numeric(20, 6) not null default 0,
  locale text not null default 'en' check (locale in ('en', 'es')),
  created_at timestamptz not null default now()
);

-- Signup trigger (ADR-006): creates the profile AND the +100000 signup ledger
-- entry, so SUM(wallet_ledger.delta) == cash_balance holds from account creation.
--
-- RLS note: this function is SECURITY DEFINER and its owner is `postgres` (the
-- migration runner), which also owns profiles/wallet_ledger. Table owners bypass
-- RLS unless FORCE ROW LEVEL SECURITY is set (it is not), and Supabase's postgres
-- role additionally has BYPASSRLS — so these inserts succeed even though both
-- tables have RLS enabled with zero INSERT policies. The REVOKEs in the RLS
-- migration only affect anon/authenticated, not the owner.
--
-- Forward reference note: wallet_ledger is created in migration 5. This is safe
-- because plpgsql resolves table references at execution time, not at CREATE
-- FUNCTION time — and no signup can occur mid-migration-batch.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_username text;
  v_n int := 0;
begin
  -- Username: explicit metadata > email prefix > uuid.
  v_base := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    replace(new.id::text, '-', '')
  );

  -- Collision handling must be robust: a failed INSERT here aborts the
  -- auth.users insert and breaks signup entirely. Try incremental suffixes,
  -- then fall back to the uuid (unique by construction).
  v_username := v_base;
  while exists (select 1 from public.profiles where username = v_username) loop
    v_n := v_n + 1;
    if v_n > 50 then
      v_username := v_base || '_' || replace(new.id::text, '-', '');
      exit;
    end if;
    v_username := v_base || '_' || v_n::text;
  end loop;

  begin
    insert into public.profiles (id, username, cash_balance)
    values (new.id, v_username, 100000);
  exception when unique_violation then
    -- Concurrent signup raced us to the same username between the existence
    -- check and the insert. The uuid-suffixed name cannot collide.
    v_username := v_base || '_' || replace(new.id::text, '-', '');
    insert into public.profiles (id, username, cash_balance)
    values (new.id, v_username, 100000);
  end;

  insert into public.wallet_ledger (user_id, delta, balance_after, entry_type)
  values (new.id, 100000, 100000, 'signup');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
