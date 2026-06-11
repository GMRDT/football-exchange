-- Match events + appearances + injuries.

-- api_event_key (ADR-002): composite idempotency key built by the ingest
-- function from (fixture_id, team_id, player_id, event_type, detail, minute).
-- The poller re-reads the same events every 30-60s; ON CONFLICT DO NOTHING on
-- this key is what prevents duplicate price deltas.
create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  -- Nullable: API-Football can report events with a null player id (unnamed
  -- players); we still store the event for match-level reconciliation.
  player_id uuid references public.players (id) on delete cascade,
  event_type_id uuid not null references public.event_types (id),
  minute int,
  api_event_key text unique not null
);

create table public.player_match_appearances (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  minutes_played int,
  started boolean,
  primary key (match_id, player_id)
);

-- UNIQUE on player_id: at most one active injury record per player; the ingest
-- function upserts it.
create table public.player_injuries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid unique not null references public.players (id) on delete cascade,
  status text not null,
  started_at timestamptz not null default now(),
  expected_return date
);
