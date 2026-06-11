-- Financial tables. Append-only ledger is the source of truth (ADR-001);
-- profiles.cash_balance is a denormalized cache reconciled inside every RPC.
-- ALL writes to these tables happen server-side (trade() RPC / triggers) —
-- the RLS migration leaves them with zero client write policies.

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta numeric(20, 6) not null,
  balance_after numeric(20, 6) not null,
  entry_type text not null,
  -- Polymorphic reference (trade id, contest id in Phase 2, ...). No FK on
  -- purpose: the ledger must never block or cascade from other tables.
  ref_id uuid,
  created_at timestamptz not null default now()
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- RESTRICT: players with trade history cannot be deleted — financial records
  -- must not silently lose their reference.
  player_id uuid not null references public.players (id) on delete restrict,
  side text not null check (side in ('buy', 'sell')),
  shares numeric(20, 6) not null check (shares > 0),
  price_per_share numeric(20, 6) not null check (price_per_share > 0),
  gross numeric(20, 6) not null,
  fee numeric(20, 6) not null,
  net numeric(20, 6) not null,
  created_at timestamptz not null default now()
);

create table public.holdings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  shares numeric(20, 6) not null default 0 check (shares >= 0),
  avg_cost numeric(20, 6) not null default 0,
  primary key (user_id, player_id)
);
