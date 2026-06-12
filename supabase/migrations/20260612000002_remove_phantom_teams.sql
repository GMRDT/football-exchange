-- Remove phantom teams (audit fix 5).
--
-- data/teams.csv accumulated 62 teams, but WC 2026 has exactly 48. The 14
-- below are NOT in the tournament (verified against two independent live API
-- sources recorded on 2026-06-12: the fixture list — every participant
-- appears in exactly 3 group matches — and the standings endpoint;
-- tests/fixtures/fixtures-list.json, tests/fixtures/standings.json).
-- Their players would trade at full price forever and never be eliminated.
--
-- Identified by api_team_id, never by name (names can differ between the API
-- and our seed). Safety: a team is SKIPPED with a NOTICE — never partially
-- deleted — if it has matches, or any of its players has trades/holdings
-- (those FKs are RESTRICT by design; financial history must not lose its
-- reference). Deleting a player cascades its match_events, price_history,
-- pending_price_deltas, appearances and injuries.
--
-- On a fresh local stack this is a no-op (teams is empty at migration time).
--
-- Phantoms: Bolivia 2381, Chile 2383, Costa Rica 29, Honduras 4672,
-- Hungary 769, Italy 768, Kenya 1511, Nigeria 19, Peru 30, Poland 24,
-- Romania 774, Serbia 14, Venezuela 2379, Yemen 1550.

do $$
declare
  v_api_ids int[] := array[2381, 2383, 29, 4672, 769, 768, 1511, 19, 30, 24, 774, 14, 2379, 1550];
  v_team record;
  v_players_deleted int;
begin
  for v_team in
    select id, name, api_team_id from public.teams where api_team_id = any (v_api_ids)
  loop
    if exists (
      select 1 from public.matches m
      where m.home_team_id = v_team.id or m.away_team_id = v_team.id
    ) then
      raise notice 'phantom team "%" (api_team_id=%) has matches — skipping, clean up manually',
        v_team.name, v_team.api_team_id;
      continue;
    end if;

    if exists (
      select 1 from public.players p
      where p.team_id = v_team.id
        and (exists (select 1 from public.trades t where t.player_id = p.id)
          or exists (select 1 from public.holdings h where h.player_id = p.id))
    ) then
      raise notice 'phantom team "%" (api_team_id=%) has players with trades/holdings — skipping, clean up manually',
        v_team.name, v_team.api_team_id;
      continue;
    end if;

    delete from public.players where team_id = v_team.id;
    get diagnostics v_players_deleted = row_count;
    delete from public.teams where id = v_team.id;
    raise notice 'deleted phantom team "%" (api_team_id=%, % player(s))',
      v_team.name, v_team.api_team_id, v_players_deleted;
  end loop;
end $$;
