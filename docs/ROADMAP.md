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
  - [ ] API-Football paid plan activated (needed by ~Jun 16 for group stage polling)
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

- [ ] **F1.1** Complete schema migrations (Prompt 1 → Claude Code, plan mode)
  - [ ] Catalog tables: `teams`, `rounds`, `event_types`, `positions`
  - [ ] Core tables: `profiles` (with registration trigger + `locale` column en|es), `players`, `matches`
  - [ ] Event tables: `match_events` (with `api_event_key` UNIQUE), `player_match_appearances`, `player_injuries`
  - [ ] Price tables: `price_history`, `pending_price_deltas`
  - [ ] Trading tables: `wallet_ledger` (append-only), `trades`, `holdings`
  - [ ] Social tables: `leagues`, `league_members`
  - [ ] Config table: `market_params` (single row, jsonb params per MARKET_ENGINE.md §6)
  - [ ] Views: `v_player_stats`, `v_portfolio_value`, `v_leaderboard` (materialized)
  - [ ] Registration trigger: creates profile + inserts 100_000 signup entry in ledger

- [ ] **F1.2** RLS policies
  - [ ] All tables have RLS enabled
  - [ ] Public read: `players`, `teams`, `matches`, `match_events`, `price_history`, leaderboard
  - [ ] Owner read: `profiles`, `holdings`, `trades`, `wallet_ledger`
  - [ ] Zero direct client writes on financial/pricing tables
  - [ ] Test: `anon` role can SELECT players but cannot INSERT to any financial table

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
  - [ ] `supabase db reset` clean
  - [ ] `supabase link` + `supabase db push` to remote project
  - [ ] `pnpm seed` populates ~200 players
  - [ ] Seed count report: 48 teams, ~200 players, 1 market_params row

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

- [ ] **F2.1** `trade()` Postgres RPC (Prompt 3 → Claude Code, plan mode, read plan before approving)
  - [ ] Full sequence per ARCHITECTURE.md §RPC contracts
  - [ ] Spread logic: reads from `market_params`, higher spread when player in live match
  - [ ] Position cap: 20% of 100_000
  - [ ] Daily volume cap
  - [ ] Rate limit: N trades per 60s (in-DB check)
  - [ ] All typed error codes returned as jsonb
  - [ ] Migration file created and tested locally

- [ ] **F2.2** Integration tests (Vitest + Supabase local)
  - [ ] Happy path: buy
  - [ ] Happy path: sell
  - [ ] Insufficient funds
  - [ ] Insufficient shares
  - [ ] Position cap hit
  - [ ] Volume cap hit
  - [ ] Rate limit hit
  - [ ] **Concurrent trades:** `Promise.all([trade, trade])` on same player — verify no double-spend
  - [ ] All tests pass: `pnpm test:integration`

- [ ] **F2.3** Invariant checker
  - [ ] `scripts/check-invariants.ts` implemented:
    - `SUM(wallet_ledger.delta) == profiles.cash_balance` for every user
    - `holdings.shares >= 0` for all rows
    - `players.current_price > 0` for all players
  - [ ] Script runs clean on seeded data
  - [ ] Daily cron job in prod (pg_cron calling Edge Function or a simple SELECT check)

---

## F3 — Pricing Engine
**Dates:** Jun 16–20 | **Model:** Fable 5 (design) + Sonnet 4.6 (implementation) | **Sessions:** 9–12

Goal: events from API-Football → prices moving in the game, verified against real matches.
Overlap with F2 end: F3 starts once F1 schema is stable.

- [ ] **F3.1** Pure math module (Prompt 4 → Claude Code)
  - [ ] `supabase/functions/_shared/market.ts`
  - [ ] `computeEventDeltaPct(event, params)` — returns perf delta from event
  - [ ] `updateFairValue(V, perf_delta, c)` — applies to V
  - [ ] `applySurvivalMultiplier(V, advanced: boolean)` — 1.15 or 0.50
  - [ ] `applyMeanReversion(P, V, lambda)` — returns new P
  - [ ] `computeDripStep(remaining_pct, steps_left)` — fraction to apply this tick
  - [ ] `clampCircuitBreakers(P_new, P_old, V, params)` — enforces all limits
  - [ ] `getSpread(hasLiveMatch: boolean, params)` — returns spread value
  - [ ] Unit tests covering edge cases (min price, circuit breaker hits, lambda range)

- [ ] **F3.2** Ingest Edge Function
  - [ ] Fetches today's World Cup fixtures
  - [ ] For live fixtures: fetches events, upserts with `api_event_key` (idempotent)
  - [ ] Updates `players.fair_value` immediately per new events
  - [ ] Queues `pending_price_deltas` for new events
  - [ ] On fixture `FT`: reconciliation pass, applies survival multiplier, marks `matches.processed`
  - [ ] Defensive null handling (empty arrays, null player IDs)
  - [ ] Test with recorded fixture JSON from `tests/fixtures/`

- [ ] **F3.3** Tick Edge Function
  - [ ] Reads `pending_price_deltas` (unprocessed)
  - [ ] Applies drip fraction to `P`, decrements `remaining_pct`
  - [ ] Applies mean reversion to all players with recent activity
  - [ ] Writes `price_history` (reason: 'event_drip' | 'reversion')
  - [ ] Refreshes materialized `v_leaderboard`
  - [ ] Idempotent: running tick twice = same result as running once (no double-application)

- [ ] **F3.4** Scheduling (pg_cron jobs — migration)
  - [ ] `tick` every 60s: `SELECT pg_net.http_post(...)` → tick Edge Function
  - [ ] `ingest` every 45s (match days: Jun 11–Jul 14, round-of-16 onwards always)
  - [ ] Cron jobs only fire ingest when there are fixtures today (query check inside function)
  - [ ] Jobs documented in migration file

- [ ] **F3.5** Live test (critical gate)
  - [ ] Motor running against at least ONE real group-stage match
  - [ ] 3–5 test accounts trading during the match
  - [ ] Verify: events cause fair_value to update, P drips over ~3 min, no double-deltas
  - [ ] Verify: invariants pass after live match
  - [ ] Simulate calibration targets from MARKET_ENGINE.md §7

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
