-- Indexes: every FK column (Postgres does not index FKs automatically) plus
-- the time-series access paths. Columns already covered by a PK/UNIQUE
-- constraint or by the leading column of a composite index are skipped.

-- teams
create index idx_teams_eliminated_round_id on public.teams (eliminated_round_id);

-- players
create index idx_players_team_id on public.players (team_id);
create index idx_players_position_id on public.players (position_id);

-- matches
create index idx_matches_round_id on public.matches (round_id);
create index idx_matches_home_team_id on public.matches (home_team_id);
create index idx_matches_away_team_id on public.matches (away_team_id);
create index idx_matches_kickoff_utc on public.matches (kickoff_utc);
create index idx_matches_status on public.matches (status);

-- match_events
create index idx_match_events_match_id on public.match_events (match_id);
create index idx_match_events_player_id on public.match_events (player_id);
create index idx_match_events_event_type_id on public.match_events (event_type_id);

-- player_match_appearances (match_id is the PK leading column)
create index idx_pma_player_id on public.player_match_appearances (player_id);

-- price_history: covers the player_id FK and the "latest prices for player"
-- chart query in one index.
create index idx_price_history_player_captured
  on public.price_history (player_id, captured_at desc);

-- pending_price_deltas: tick() consumes deltas per player in FIFO order.
create index idx_pending_deltas_player_created
  on public.pending_price_deltas (player_id, created_at);
create index idx_pending_deltas_source_event_id
  on public.pending_price_deltas (source_event_id);

-- wallet_ledger: covers the user_id FK and the activity-history query.
create index idx_wallet_ledger_user_created
  on public.wallet_ledger (user_id, created_at desc);

-- trades: user history + the 60s rate-limit count inside trade(); player_id
-- for the daily volume cap check.
create index idx_trades_user_created on public.trades (user_id, created_at desc);
create index idx_trades_player_id on public.trades (player_id);

-- holdings (user_id is the PK leading column)
create index idx_holdings_player_id on public.holdings (player_id);

-- leagues / league_members (league_id is the PK leading column; invite_code
-- already has a UNIQUE index)
create index idx_leagues_created_by on public.leagues (created_by);
create index idx_league_members_user_id on public.league_members (user_id);
