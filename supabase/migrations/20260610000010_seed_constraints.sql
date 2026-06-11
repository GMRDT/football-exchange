-- Unique constraints required for idempotent seed upserts (ON CONFLICT).
-- Both are natural constraints: no two WC national teams share a name;
-- no player appears twice on the same squad.

alter table public.teams
  add constraint teams_name_unique unique (name);

alter table public.players
  add constraint players_full_name_team_id_unique unique (full_name, team_id);
