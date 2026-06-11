-- Row Level Security on EVERY table (CLAUDE.md invariant #6).
--
-- Policy model for MVP:
--   - SELECT-only policies. There are ZERO insert/update/delete policies for
--     any client role: all writes go through server-side RPCs / Edge Functions
--     running as service_role (bypasses RLS) or through SECURITY DEFINER
--     functions owned by postgres (table owner bypasses RLS).
--   - pending_price_deltas and player_injuries get NO policies at all:
--     RLS enabled + no policies = deny everything to anon/authenticated;
--     only service_role can touch them.

alter table public.positions enable row level security;
alter table public.rounds enable row level security;
alter table public.event_types enable row level security;
alter table public.teams enable row level security;
alter table public.market_params enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.profiles enable row level security;
alter table public.match_events enable row level security;
alter table public.player_match_appearances enable row level security;
alter table public.player_injuries enable row level security;
alter table public.price_history enable row level security;
alter table public.pending_price_deltas enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.trades enable row level security;
alter table public.holdings enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;

-- ── Public market data: readable by anon + authenticated ────────────────────

create policy "positions_select_public" on public.positions
  for select to anon, authenticated using (true);

create policy "rounds_select_public" on public.rounds
  for select to anon, authenticated using (true);

create policy "event_types_select_public" on public.event_types
  for select to anon, authenticated using (true);

create policy "teams_select_public" on public.teams
  for select to anon, authenticated using (true);

create policy "players_select_public" on public.players
  for select to anon, authenticated using (true);

create policy "matches_select_public" on public.matches
  for select to anon, authenticated using (true);

create policy "match_events_select_public" on public.match_events
  for select to anon, authenticated using (true);

create policy "player_match_appearances_select_public" on public.player_match_appearances
  for select to anon, authenticated using (true);

create policy "price_history_select_public" on public.price_history
  for select to anon, authenticated using (true);

create policy "leagues_select_public" on public.leagues
  for select to anon, authenticated using (true);

create policy "league_members_select_public" on public.league_members
  for select to anon, authenticated using (true);

-- Params are not secret (spread/limits are shown in the UI); writes are
-- server-only — no write policy exists for any role.
create policy "market_params_select_public" on public.market_params
  for select to anon, authenticated using (true);

-- ── Owner-only financial data: authenticated, own rows only ─────────────────

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy "holdings_select_own" on public.holdings
  for select to authenticated using (auth.uid() = user_id);

create policy "trades_select_own" on public.trades
  for select to authenticated using (auth.uid() = user_id);

create policy "wallet_ledger_select_own" on public.wallet_ledger
  for select to authenticated using (auth.uid() = user_id);

-- ── Defense in depth ─────────────────────────────────────────────────────────
-- RLS already blocks client writes (no policies), but Supabase's default
-- privileges GRANT all table privileges to anon/authenticated. Revoking the
-- write privileges on financial/pricing tables means a future accidental
-- write policy alone is not enough to open a write path (invariant #1).

revoke insert, update, delete on
  public.profiles,
  public.wallet_ledger,
  public.trades,
  public.holdings,
  public.players,
  public.price_history,
  public.pending_price_deltas,
  public.market_params
from anon, authenticated;
