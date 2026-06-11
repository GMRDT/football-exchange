-- Catalogs + runtime configuration.
-- DB stores language-neutral codes only (ADR-008): the UI renders labels from
-- next-intl dictionaries. The `name` columns here are for admin/debugging, never
-- shown to end users.

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int unique not null
);

-- default_perf_points: per-event fair-value impact (MARKET_ENGINE.md §1.4).
-- Stored in DB so weights are tunable at runtime without a deploy.
create table public.event_types (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  default_perf_points numeric(6, 4) not null
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  group_name text,
  api_team_id int unique,
  is_eliminated boolean not null default false,
  eliminated_round_id uuid references public.rounds (id),
  colors jsonb
);

-- Single row by convention (MARKET_ENGINE.md §6). All market engine parameters
-- live here so they can be tuned at runtime without a deploy.
create table public.market_params (
  id uuid primary key default gen_random_uuid(),
  params jsonb not null
);

-- ── Seeds ────────────────────────────────────────────────────────────────────

insert into public.positions (code, name) values
  ('GK', 'Goalkeeper'),
  ('DEF', 'Defender'),
  ('MID', 'Midfielder'),
  ('FWD', 'Forward');

insert into public.rounds (name, sort_order) values
  ('Group Stage', 1),
  ('Round of 32', 2),
  ('Round of 16', 3),
  ('Quarter-finals', 4),
  ('Semi-finals', 5),
  ('Third Place', 6),
  ('Final', 7);

-- MARKET_ENGINE.md §1.4 — default event points, tunable per row.
insert into public.event_types (code, name, default_perf_points) values
  ('goal', 'Goal scored', 0.08),
  ('assist', 'Assist', 0.05),
  ('yellow_card', 'Yellow card', -0.03),
  ('red_card', 'Red card', -0.12),
  ('penalty_scored', 'Penalty scored', 0.06),
  ('penalty_missed', 'Penalty missed', -0.08),
  ('own_goal', 'Own goal', -0.10),
  ('clean_sheet_gk', 'Goalkeeper clean sheet (90 min)', 0.06),
  ('clean_sheet_def', 'Defender clean sheet (90 min)', 0.04),
  ('motm', 'Man of the match', 0.07),
  ('injury_out', 'Subbed off injured', -0.05);

-- MARKET_ENGINE.md §6 — verbatim.
insert into public.market_params (params) values (
  '{
    "tier_params": {
      "star":     { "L": 10000, "k_d": 2.0 },
      "starter":  { "L": 4000,  "k_d": 2.5 },
      "prospect": { "L": 1000,  "k_d": 3.0 }
    },
    "lambda": 0.05,
    "spread_base": 0.01,
    "spread_live": 0.025,
    "drip_minutes": 3,
    "circuit_breakers": {
      "max_event_pct": 0.25,
      "max_daily_pct": 0.50,
      "min_price": 100,
      "max_price_multiplier": 10
    },
    "position_limits": {
      "max_position_cost": 20000,
      "max_daily_volume": 50000,
      "max_order_size": 500
    }
  }'::jsonb
);
