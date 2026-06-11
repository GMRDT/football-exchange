-- Price time series + pending drip deltas.

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  price numeric(20, 6) not null,
  fair_value numeric(20, 6) not null,
  reason text not null,
  captured_at timestamptz not null default now()
);

-- ADR-003: events update fair_value immediately, but market price P moves
-- gradually. The delta is stored as a percentage and consumed in fractions by
-- each tick() call over drip_minutes (MARKET_ENGINE.md §2.2).
create table public.pending_price_deltas (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  remaining_pct numeric(10, 6) not null,
  -- SET NULL: deltas are transient operational data; losing the provenance
  -- link must not block deleting a corrected/duplicate event.
  source_event_id uuid references public.match_events (id) on delete set null,
  created_at timestamptz not null default now()
);
