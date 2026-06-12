# Football Exchange — Technical Roadmap

**Launch:** Jun 28, 2026 (World Cup Round of 16, Day 1)
**Hard deadline:** 18 days from Jun 10
**Operator:** solo founder

> Update checkboxes as tasks complete. This file is the daily status board.

---

## F0 — Setup & Foundation
**Dates:** Jun 10–11 | **Model:** Sonnet 4.6 | **Sessions:** 1–2

Goal: working repo, tooling, CI, and 6 docs. Nothing else.

- [ ] **F0.1** Accounts & access
  - [ ] GitHub repo created (`football-exchange`, private)
  - [ ] Supabase project created (region: closest to Colombia → us-east-1 or us-west-2)
  - [ ] Vercel project linked to GitHub repo
  - [x] API-Football paid plan activated (Pro, active until Jul 12 — verified 2026-06-12)
  - [ ] Cloudflare Turnstile site registered
  - [ ] All secrets saved to password manager + Vercel env vars + Supabase secrets

- [ ] **F0.2** Local environment
  - [ ] Node LTS (v22+) installed
  - [ ] pnpm installed globally
  - [ ] Docker Desktop running
  - [ ] Supabase CLI installed and authenticated
  - [ ] Claude Code installed and authenticated

- [ ] **F0.3** Bootstrap repo (Prompt 0 → Claude Code)
  - [ ] Next.js 15 + TypeScript strict + Tailwind v4 + pnpm initialized
  - [ ] PWA base: `public/manifest.json` + service worker (Serwist)
  - [ ] Directory structure created (see ARCHITECTURE.md)
  - [ ] ESLint + Prettier configured
  - [ ] Vitest configured (unit + integration modes)
  - [ ] next-intl configured: `messages/en.json` + `messages/es.json` skeletons,
        cookie-based locale (NO URL routing), key-parity unit test
  - [ ] GitHub Action `ci.yml`: typecheck + lint + unit tests
  - [ ] `pnpm typecheck` passes
  - [ ] `pnpm lint` passes
  - [ ] `pnpm test` passes (no tests yet = green)
  - [ ] All 6 docs committed to `docs/`
  - [ ] Initial commit pushed to `main`

---

## F1 — Database Schema & Seed Data
**Dates:** Jun 11–13 | **Model:** Fable 5 (schema) + Sonnet (seed scripts) | **Sessions:** 3–5

Goal: complete normalized schema, RLS on everything, 200 players seeded with real values.

- [x] **F1.1** Complete schema migrations (Prompt 1 → Claude Code, plan mode)
  - [x] Catalog tables: `teams`, `rounds`, `event_types`, `positions`
  - [x] Core tables: `profiles` (with registration trigger + `locale` column en|es), `players`, `matches`
  - [x] Event tables: `match_events` (with `api_event_key` UNIQUE), `player_match_appearances`, `player_injuries`
  - [x] Price tables: `price_history`, `pending_price_deltas`
  - [x] Trading tables: `wallet_ledger` (append-only), `trades`, `holdings`
  - [x] Social tables: `leagues`, `league_members`
  - [x] Config table: `market_params` (single row, jsonb params per MARKET_ENGINE.md §6)
  - [x] Views: `v_player_stats`, `v_portfolio_value`, `v_leaderboard` (materialized)
  - [x] Registration trigger: creates profile + inserts 100_000 signup entry in ledger

- [x] **F1.2** RLS policies
  - [x] All tables have RLS enabled
  - [x] Public read: `players`, `teams`, `matches`, `match_events`, `price_history`, leaderboard
  - [x] Owner read: `profiles`, `holdings`, `trades`, `wallet_ledger`
  - [x] Zero direct client writes on financial/pricing tables
  - [x] Test: `anon` role can SELECT players but cannot INSERT to any financial table

- [ ] **F1.3** TypeScript types generated
  - [ ] `supabase gen types typescript` → `src/lib/supabase/types.ts`
  - [ ] Types committed and CI passes

- [ ] **F1.4** Seed pipeline (Prompt 2 → Claude Code)
  - [ ] `data/teams.csv` — 48 World Cup teams (name, country_code, group, api_team_id, colors)
  - [ ] `data/players.csv` — ~200 players (name, team, position, dob, base_value, tier, api_player_id?)
  - [ ] `scripts/seed.ts` — idempotent upsert, Zod validation, normalization documented
  - [ ] `scripts/map-api-ids.ts` — fuzzy name match, outputs review CSV (no DB writes)
  - [ ] `scripts/record-fixtures.ts` — saves raw API responses to `tests/fixtures/`
  - [ ] `pnpm seed` runs twice with identical result (no duplicates)

- [ ] **F1.5** Local validation
  - [x] `supabase db reset` clean
  - [x] `supabase link` + `supabase db push` to remote project (all 15 migrations applied)
  - [x] `pnpm seed` populates ~200 players
  - [x] Seed count report: 48 teams, 213 players, 1 market_params row (prod, 2026-06-12)

> ⚠️ **Human task (parallel, ~4h):** curate `data/players.csv` with real values.
> Do NOT scrape Transfermarkt (ToS violation). Use your own approximations.
> Normalization will be documented in `data/normalization.md` post-seed.

> ⚠️ **Start recording fixtures:** run `pnpm record-fixture [id]` for first group stage
> matches. These JSON files are test inputs for F3. Jun 11 is day 1 of the tournament.

---

## F2 — Financial Core (Trade RPC)
**Dates:** Jun 13–17 | **Model:** Fable 5 (required) | **Sessions:** 6–8

Goal: atomic trade function with full invariant guarantees.
**Nothing in F3/F4 starts until F2 tests are green.**

- [x] **F2.1** `trade()` Postgres RPC (Prompt 3 → Claude Code, plan mode, read plan before approving)
  - [x] Full sequence per ARCHITECTURE.md §RPC contracts
  - [x] Spread logic: reads from `market_params`, higher spread when player in live match
  - [x] Position cap: 20% of 100_000
  - [x] Daily volume cap
  - [x] Rate limit: N trades per 60s (in-DB check)
  - [x] All typed error codes returned as jsonb
  - [x] Migration file created and tested locally

- [x] **F2.2** Integration tests (Vitest + Supabase local)
  - [x] Happy path: buy
  - [x] Happy path: sell
  - [x] Insufficient funds
  - [x] Insufficient shares
  - [x] Position cap hit
  - [x] Volume cap hit
  - [x] Rate limit hit
  - [x] **Concurrent trades:** `Promise.all([trade, trade])` on same player — verify no double-spend
  - [x] All tests pass: `pnpm test:integration`

- [ ] **F2.3** Invariant checker
  - [x] `scripts/check-invariants.ts` implemented:
    - `SUM(wallet_ledger.delta) == profiles.cash_balance` for every user
    - `holdings.shares >= 0` for all rows
    - `players.current_price >= min_price` for all players
    - Latest ledger entry per user: `balance_after == cash_balance`
    - `SUM(holdings.shares)` per player `== players.shares_outstanding` (drift)
  - [x] Script runs clean on seeded data
  - [ ] Daily cron job in prod (pg_cron calling Edge Function or a simple SELECT check)

---

## F3 — Pricing Engine
**Dates:** Jun 16–20 | **Model:** Fable 5 (design) + Sonnet 4.6 (implementation) | **Sessions:** 9–12

Goal: events from API-Football → prices moving in the game, verified against real matches.
Overlap with F2 end: F3 starts once F1 schema is stable.

- [x] **F3.1** Pure math module (Prompt 4 → Claude Code)
  - [x] `supabase/functions/_shared/market.ts`
  - [x] `eventDeltaPct(perfPoints, c)` — clamped perf delta from event (was computeEventDeltaPct)
  - [x] `applyEventToFairValue(V, perfPoints, c)` — applies to V (was updateFairValue)
  - [x] `applySurvival(V, advanced: boolean)` — 1.15 or 0.50
  - [x] `meanReversion(P, V, lambda)` — returns new P
  - [x] `computeDrip(total_pct, applied_pct, created_at, now, drip_minutes)` — wall-clock
        drip with exact telescoping (supersedes the steps-based computeDripStep; §2.2)
  - [x] `applyCircuitBreakers(P_new, base_value, ref_price, params)` — enforces all limits
  - [ ] `getSpread(hasLiveMatch: boolean, params)` — not needed by ingest/tick; spread
        selection lives in `trade()` SQL where it is used (deferred until a TS caller exists)
  - [x] Unit tests covering edge cases (clamp caps, min price, breaker hits, drip exactness,
        decimal precision)

- [x] **F3.2** Ingest Edge Function
  - [x] Polls unprocessed fixtures by `api_fixture_id` (status + score + events in one call)
  - [x] For live fixtures: fetches events, upserts with `api_event_key` (idempotent,
        atomic via `ingest_event()` RPC)
  - [x] Updates `players.fair_value` immediately per new events (optimistic-retry guard)
  - [x] Queues `pending_price_deltas` for new events (same atomic RPC)
  - [x] On fixture `FT`: knockout survival multiplier + elimination flags, marks
        `matches.processed` exactly once (`finalize_match()` guard). Group-stage FT marks
        processed only — group-exit detection is F3.6
  - [x] Defensive null handling (empty arrays, null player IDs, unmapped api_player_id →
        skip + log)
  - [x] Tested with synthetic API-shaped fixtures (`tests/fixtures/` had no recordings yet;
        recording real fixtures remains a parallel human task)

- [x] **F3.3** Tick Edge Function
  - [x] Reads pending deltas + player state in one RPC (`get_tick_state()`)
  - [x] Applies wall-clock drip to `P`, advances `applied_pct`, deletes completed deltas
  - [x] Applies mean reversion to every player (settled players no-op at 6 dp)
  - [x] Writes `price_history` (reason: 'tick' — one combined snapshot per tick; drip and
        reversion are inseparable in a single price move)
  - [x] `v_leaderboard` refresh scheduled directly in pg_cron (CONCURRENTLY cannot run
        inside a function transaction)
  - [x] Idempotent: wall-clock drip + optimistic per-player guard in `apply_tick()` —
        double-running a tick applies zero

- [x] **F3.4** Scheduling (pg_cron jobs — migration `20260611000003_price_engine.sql`)
  - [x] `tick` every 60s: pg_cron → `invoke_edge_function()` → pg_net → Edge Function
  - [x] `ingest` every 60s (cron's finest granularity; 45s/30s polling is a post-launch
        optimization — the drip smooths the lag)
  - [x] Ingest no-ops cheaply when there are no started unprocessed fixtures (query check
        inside `get_ingest_state()`)
  - [x] Jobs documented in migration file; secrets via Vault (`pnpm check-prod-secrets`
        validates before launch)

- [ ] **F3.5** Live test (critical gate)
  > Runbook: `docs/F3.5-live-test.md` — smoke: Canada–Bosnia Jun 12 14:00 COT;
  > primary: USA–Paraguay Jun 12 20:00 COT (engine already live, backfill verified)
  - [ ] Motor running against at least ONE real group-stage match
  - [ ] 3–5 test accounts trading during the match
  - [ ] Verify: events cause fair_value to update, P drips over ~3 min, no double-deltas
  - [ ] Verify: invariants pass after live match
  - [ ] Simulate calibration targets from MARKET_ENGINE.md §7

- [ ] **F3.6** Live wiring (engine is built and synthetic-tested; these connect it to reality)
  - [x] `pnpm map-api-players` tool: squads-based name match, top-N by base_value,
        idempotent DB write for unambiguous matches, review CSV for the rest
  - [x] Run `pnpm map-api-players` against the live API + review CSV — **213/213 mapped**
        (2026-06-12; squads endpoint now abbreviates names, so the 28 ambiguous/missing
        were identity-verified via `/players/profiles` full name + nationality)
  - [x] Map `teams.api_team_id` (54/54 mapped via squad fetch)
  - [x] `matches` seeding automated: `sync-fixtures` Edge Function + `invoke-sync-fixtures`
        pg_cron job (every 6h) upsert the full fixture list by `api_fixture_id` — new
        fixtures, kickoff changes, status updates, TBD knockout slots picked up once the
        bracket settles (ADR-009). Deployed + live: cron run 2026-06-12 12:00 UTC synced
        all 72 group fixtures; ingest/tick deployed 15:32 UTC and backfilled the 2 FT
        matches (see `docs/F3.5-live-test.md`)
  - [x] Group-exit elimination detection (cross-group best-third standings; knockout
        advancement/elimination is already automatic). Standings from
        `matches.home_goals/away_goals` (persisted by ingest);
        `compute_group_standings()` + `get_group_exit_state()` +
        `finalize_group_exit()` (migration 20260612000003), survival priced in
        `market.ts`, `group_exits` idempotency ledger, integration-tested
        (single group + 12-group thirds + idempotency). ⚠ post-merge: backfill
        goals of the 2 already-processed fixtures (see F3-completion-report.md)
  - [ ] Lineup-based FT events (`clean_sheet_gk/def`, `motm`, `injury_out`) — needs
        `player_match_appearances` ingestion

---

## F4 — Frontend PWA
**Dates:** Jun 19–24 | **Model:** Sonnet 4.6 | **Sessions:** 13–18

Goal: 5 screens + PWA installation. Starts only after F2 green; F3 running in background.

- [ ] **F4.1** Supabase client setup
  - [ ] `src/lib/supabase/client.ts` — browser client
  - [ ] `src/lib/supabase/server.ts` — server component client
  - [ ] Auth: email/password + Google OAuth + Turnstile integration
  - [ ] Auth guards (middleware for protected routes)

- [ ] **F4.2** Screen 1: Market
  - [ ] Screener: avatar (initials + team colors), player name, price, % change
  - [ ] Top Gainers / Top Losers sections
  - [ ] Search + basic filters (team, position)
  - [ ] Sortable table
  - [ ] SWR polling every 30s

- [ ] **F4.3** Screen 2: Player Detail
  - [ ] Price display + % change
  - [ ] Tournament stats (goals, assists, cards from `v_player_stats`)
  - [ ] Next match info
  - [ ] Current position (shares held, P&L)
  - [ ] Buy / Sell form (calls `supabase.rpc('trade')`)
  - [ ] Error handling for all typed error codes

- [ ] **F4.4** Screen 3: Portfolio
  - [ ] Positions list (avatar, name, shares, current value, P&L)
  - [ ] Total portfolio value + cash balance
  - [ ] % return (basis for leaderboard)
  - [ ] Share button (screenshot/copy text of portfolio P&L)

- [ ] **F4.5** Screen 4: Leaderboard + Private Leagues
  - [ ] Global leaderboard (% return, rank, username, portfolio value)
  - [ ] Create private league (generates invite code)
  - [ ] Join private league (enter invite code)
  - [ ] League leaderboard

- [ ] **F4.6** Screen 5: Activity Feed
  - [ ] Events affecting YOUR players: ⚽ goal, 🟨 yellow, 🟥 red, 📈 price move
  - [ ] Realtime-ish: SWR polling or manual refresh
  - [ ] Empty state: "No players yet — go to Market"

- [ ] **F4.7** Onboarding
  - [ ] Sign up flow (email or Google)
  - [ ] 2 explainer cards ("how it works")
  - [ ] First-time user lands on Market screen

- [ ] **F4.8** PWA completion
  - [ ] `manifest.json` with correct icons (generated, not real player photos)
  - [ ] Service worker: cache shell, offline fallback
  - [ ] iOS Safari install prompt (bottom sheet with instructions)
  - [ ] Android Chrome install prompt (beforeinstallprompt)
  - [ ] Bottom navigation bar (Market / Portfolio / Leaderboard)

- [ ] **F4.9** i18n completion
  - [ ] Zero hardcoded UI strings (grep audit: no literal text in JSX outside dictionaries)
  - [ ] `messages/es.json` complete and reviewed by founder (native speaker QA)
  - [ ] Key-parity test green (en.json and es.json have identical keys)
  - [ ] 48 team names translated in ES dictionary; market search matches EN and ES names
  - [ ] Number/date formatting via Intl with active locale; kickoffs in user timezone
  - [ ] Language toggle in onboarding/settings; preference saved to `profiles.locale`

---

## F5 — Hardening & Launch
**Dates:** Jun 24–27 | **Model:** Fable 5 (security review) | **Sessions:** 19–21

Goal: security checklist done, soft-launch to waitlist Jun 26, public launch Jun 28.

- [ ] **F5.1** Security audit (SECURITY.md checklist)
  - [ ] RLS audit: manual test as `anon` and `authenticated` roles, check all tables
  - [ ] Service keys confirmed: NOT in any client bundle, NOT in git history
  - [ ] Turnstile active on signup and (optional) on trade if bot activity detected
  - [ ] Input validation: Zod on all API routes and RPC inputs
  - [ ] CORS: Supabase project allows only production domain
  - [ ] CSP headers in Next.js config
  - [ ] HTTPS enforced (Vercel default)
  - [ ] `npm audit` — no critical vulnerabilities
  - [ ] Email verification required before first trade

- [ ] **F5.2** Observability
  - [ ] Sentry installed (Next.js + Edge Functions)
  - [ ] Error boundaries in React for graceful degradation
  - [ ] `check-invariants.ts` as daily cron (Supabase pg_cron → Edge Function)
  - [ ] Basic logging in ingest/tick (successes, skips, errors)

- [ ] **F5.3** Soft launch (Jun 26–27)
  - [ ] Deploy to production
  - [ ] 10–20 people from waitlist
  - [ ] Confirm: signup works, Turnstile active, trade executes, invariants pass
  - [ ] QA in both locales (ES primary — the waitlist is Spanish-speaking)
  - [ ] Economy calibration: watch prices, adjust `market_params` if needed

- [ ] **F5.4** Public launch (Jun 28)
  - [ ] Tag `v0.1.0`
  - [ ] Announce

---

## Post-launch (🟡 — during tournament, Jul 1–19)
Do NOT build before launch. Add to backlog only.

- [ ] Supabase Realtime (replace SWR polling → sub-second updates)
- [ ] Web Push notifications (match events for YOUR players)
- [ ] Recency weighting in fair value formula (`c` coefficient)
- [ ] Admin invariant dashboard (Supabase dashboard is fine for MVP)

---

## Phase 2 (🔵 — after validation, post Jul 19)
- Real money (Stripe, KYC, +18 verification)
- Paid contests (rake model)
- FX Pro subscription
- Dynamic spread
- Premium data feed
- Club football season (bridge: Jul 19 → Aug 22)

---

## Scope protection rules
1. If it's not checked in F0–F5 above, it does not exist yet.
2. Every new task gets a phase and a justification before work starts.
3. F5 is the last chance to add. After Jun 24, only bugs and security.

---

## Daily routine
1. Open this file
2. Pick ONE unchecked task from the current phase
3. `claude` → `/clear` → load relevant docs → Prompt → plan → approve → execute → commit
4. Check the box
5. If it's a schema or money task: PR → review diff → merge → `supabase db push`
