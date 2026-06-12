# F3 Completion Report

**Date:** 2026-06-12 ~11:35 COT (16:35 UTC) · all production checks below were
re-run live against `bmdhdrphrqweeqaqolvp` (read-only) at that time.

## 1. Production checklist — what is verifiably green

| Check | State |
|---|---|
| Edge Functions | ✅ `ingest` v1, `tick` v1, `sync-fixtures` v2 — ACTIVE since 15:32 UTC |
| Cron jobs | ✅ invoke-ingest / invoke-tick / refresh-leaderboard (1 min) + invoke-sync-fixtures (6 h), all `succeeded` |
| Vault secrets | ✅ `project_url`, `service_role_key` present (`check-prod-secrets` green) |
| Edge secret | ✅ `API_FOOTBALL_KEY` set (`supabase secrets list`) |
| API-Football | ✅ Pro plan active until 2026-07-12 (7,500 req/day) |
| Player mapping | ✅ **213/213** with `api_player_id` (identity-verified via `/players/profiles`) |
| Teams | ✅ 48/48 with `api_team_id`, official group letters |
| Fixtures | ✅ 72/72 group matches synced; knockout slots pending API publication |
| First real ingest | ✅ 2 FT matches backfilled (Mexico–South Africa, South Korea–Czech Republic): 3 priced events, FV moves formula-exact (+8% goal / +5% assist), drip completed, 180 price_history rows and counting, 0 pending deltas |
| Invariants | ✅ `check-invariants` clean on prod (213 players; 0 users yet) |

Engine economics observed in prod: Raúl Jiménez 12,500 → FV 13,500 (goal),
price dripped over 3 ticks then mean-reverted toward V. Exactly per
MARKET_ENGINE.md — no manual intervention since deploy.

## 2. The 14 teams with zero players in `players.csv`

Cape Verde Islands, Congo DR, Curacao, Haiti, Iran, Iraq, Jordan, New Zealand,
Panama, Qatar, Saudi Arabia, South Africa, Tunisia, Uzbekistan.

Their match events are skipped with a log line (`skip event: unmapped
api_player_id`) — engine-safe, but those squads are untradable and invisible
in the F4 market screen. **Qatar plays Jun 13 (vs Switzerland).** This is a
data-curation task (CSV rows + `pnpm seed` + `pnpm map-api-players`), ~1–2 h
human work; recommended before soft launch (Jun 26), not blocking anything.

## 3. F3.6 — remaining items and whether they block F4

| Item | State | Blocks F4? |
|---|---|---|
| Group-exit elimination | ✅ **Done this session** (migration `20260612000003`, `group_exits` ledger, standings RPCs, ingest wiring, integration-tested). Pending post-merge deploy steps below | No |
| Knockout round strings | ⏳ Unverifiable until the API publishes the bracket (fixture list still has only the 72 group matches). When it appears: `pnpm record-fixtures` → the fixtures-shape suite fails loudly on any unhandled round string | No — F4 reads `matches` rows, not round strings |
| Lineup-based FT events (`clean_sheet_*`, `motm`, `injury_out`) | ⏳ Not built (needs `player_match_appearances` ingestion) | No — additive event types; prices simply don't react to those events yet. Can ship post-launch |
| FIFA tie-breakers beyond points/GD/GF | ⚠ Not implemented (head-to-head, fair play, lots). Deterministic `api_team_id` placeholder | No — but **human verification against official standings required before the last group matchday (Jun 24–27)**; `tests/fixtures/standings.json` re-recording makes it a 5-minute check |

**Post-merge deploy steps for group-exit (in order):**
1. `supabase db push` (migration 20260612000003)
2. `supabase functions deploy ingest`
3. Backfill scores of the 2 already-processed fixtures (they predate the score
   columns and ingest never re-polls processed matches) — SQL editor:
   ```sql
   update matches set home_goals = 2, away_goals = 0 where api_fixture_id = 1489369; -- MEX–RSA
   update matches set home_goals = 2, away_goals = 1 where api_fixture_id = 1538999; -- KOR–CZE
   ```
   (Re-verify scores against the API before running; group A standings stay
   frozen — fail-safe — until these are non-null.)
4. `pnpm trigger-fn ingest` smoke (with prod env override) + confirm summary.

## 4. Decision: can F3.5 (live test) run now?

**Yes — today.** The engine is live, autonomous, and has already priced real
events correctly. Next windows (COT): **Canada–Bosnia 14:00**, **USA–Paraguay
20:00** (both fully mapped; runbook with paste-ready queries:
`docs/F3.5-live-test.md`).

What F3.5 still needs that does NOT exist yet:
- **3–5 test accounts trading during the match** — no UI yet (F4), so this
  needs a small script driving `trade()` via authenticated supabase-js clients
  (the integration helpers in `tests/integration/helpers.ts` already do
  exactly this against local; pointing them at prod with the env override is
  ~30 min of work).
- **Calibration targets (MARKET_ENGINE.md §7)** — `scripts/simulate-market.ts`
  is referenced by the doc but **does not exist**. Gap carried into F5.3
  (economy calibration during soft launch); not required to start F3.5.

## 5. Environment doctrine (recorded after the local/prod incident)

`.env.local` stays **local-only**, permanently. Production access is always an
ephemeral per-command override (key fetched via `supabase projects api-keys`,
never stored in a file) — pattern documented in `docs/F3.5-live-test.md` §
"Environment targeting". Rationale: a file that sometimes points at prod makes
every dev script a loaded gun; the override makes prod access explicit,
visible in the command, and impossible to leave on by accident.
