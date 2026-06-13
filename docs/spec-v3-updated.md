# Golcap — MVP Build Spec v3.2 · UPDATED (World Cup 2026)

**Platform:** PWA mobile-first (installable, web push) · **Stack:** TypeScript everywhere
· Next.js + Vercel · Supabase
**Window:** Jun 10 (start) → Jun 28 (launch) → Jul 19 (live iteration)
**Model:** virtual money, global (UI in **English + Spanish**), no license required
**Goal:** validate ONE behavior, not build the final company.

> **v3.1 changes from v3:** Added missing `api_player_id`/`api_team_id` fields (required
> for event ingestion — v3 omitted these). Added `pending_price_deltas` table (drip
> implementation). Added `market_params` table (runtime-tunable parameters). Clarified
> that API-Football paid plan is needed from ~Jun 16 (not Jun 28). Corrected scheduling:
> pg_cron + pg_net → Edge Functions (not Vercel crons). Added simulation calibration
> targets. Architecture, MARKET_ENGINE, SECURITY, ROADMAP are the operative documents —
> this spec is the product source of truth.
>
> **v3.2 changes:** UI ships **bilingual (EN default + ES)** with i18n-ready
> architecture — all strings externalized via next-intl from day 1 (see ARCHITECTURE.md
> ADR-008). Rationale: the soft-launch waitlist is Spanish-speaking and Mexico co-hosts
> WC 2026; an English-only UI adds language friction exactly where the retention
> hypothesis is measured. DB stays language-neutral (codes, not display strings).
> Scope: exactly EN + ES; additional locales are post-launch.

---

## 1. Guiding Principles

1. **Radical simplicity (don't overwhelm).** Dead-simple for the user and operator.
   Few screens, obvious actions, nothing cluttered. Complexity is backend-only (invisible
   to users); the visible face is always simple.
2. **Users before revenue (Polymarket lesson).** Market, users, liquidity, and community
   first. Fees come later. The obsessive question is not "how do I make money?" but
   **"how do I get enough people to want to trade here?"** (This is *sequence*, not
   absence — the model exists for Phase 2.)
3. **"Good" ≠ "complex".** Good = the core loop feels real and polished.
   When in doubt about adding something: *does it help me know if people build a portfolio
   and return multiple times per day?* If not a resounding yes, it goes later.

---

## 2. The Hypothesis & Metrics

> *People build a portfolio of players and return multiple times per day because they feel
> they "know something the market doesn't know."*

**Success metrics (NOT revenue, NOT registrations):**
D1/D3/D7 retention · sessions/user/day (target >2 on match days) ·
% who trade after registering · trades/user.
200 obsessed people > 2,000 who register and never return.

---

## 3. Honest Engagement (FB/IG/TikTok style, no tricks)

Legitimate loops already built-in:
- **Real variable reward:** every time you open, something genuinely changed (football provides the variability)
- **Social loops:** leaderboard, private leagues, "someone passed you," bragging about correct calls
- **Relevance:** a feed of what happened to YOUR players
- **Identity/status:** ranking, track record, badges for real correct calls
- **Natural cadence:** real match calendar

**Red line:** social engagement and real-event hooks yes; fake scarcity/urgency,
hidden fees, or exploiting compulsion with real money, no.

---

## 4. Platform: PWA Mobile-First

Phone-first PWA: **installable** (icon + fullscreen), **web push** (iOS 16.4+/Android),
**instant updates**, single codebase, **bottom navigation**, thumb-friendly buttons.
No native app (kills the Jun 28 timing); native is a post-validation decision.

---

## 5. Screens & Flow

**UX:** default view always dead-simple (price, % change, buy/sell).
Advanced features (fair value chart, detailed stats) behind a tap — *progressive
disclosure*, to avoid overwhelming.
Bottom bar: Market / Portfolio / Leaderboard.

1. **Onboarding.** Email/Google auth. Starting virtual balance of 100,000 GC coins. 2 how-it-works cards.
2. **Market.** Screener: avatar, team, price, % daily change; search + filters; **Top Gainers / Top Losers**; sortable.
3. **Player Detail.** Price + (optional) fair value, tournament stats, next match, **Buy / Sell** with your position visible.
4. **Portfolio.** Positions, total value, P&L (abs and %), cash, evolution, **Share** button.
5. **Leaderboard + private leagues** (invite code).
6. **Activity feed.** Real events for YOUR players ("⚽ +8%", "🟥 eliminated −50%").

---

## 6. Player Universe & Initial Values

- **~200 players** at launch (≈6 per national team): stars + starters + 1–2 prospects
  (scouting layer). Covers every team and includes global blue-chips.
- **Initial value anchored to real market value.** Each player's base price is anchored
  to their **real market value** (Transfermarkt-style), normalized to the game's scale.
  Not flat levels. Seeded once for all ~200 players, stored in `players.base_value`
  (fair value anchor).
- **No real player photos in MVP (image rights).** Names + statistics have solid
  precedent in fantasy; photos and likeness do NOT. Use **generated avatars**
  (initials + team colors) and no club crests. `base_value` is calibrated internally
  using public market data, **without republishing that data in the UI** or citing
  the commercial source.
- **Seeding:** ~6 players per each of the 48 national teams. Soft-launch ~100–120 → ~200
  at launch.

---

## 7. Pricing Formula (see MARKET_ENGINE.md for full specification)

Three separate forces: infinite liquidity, real fundamentals, and scouting rewards.

**A. Fair value `V`** — starts at `base_value` (real market data), evolves:
```
V(t+1) = V(t) × (1 + clamp(perf_recency × c, −0.15, +0.25)) × survival
```
- `perf_recency`: performance with recency weighting (exponential decay). Per-event
  weights in `event_types.default_perf_points` (DB config, tunable without deploy).
- `survival`: ×1.15 if round advances; ×0.50 if eliminated.

**B. Market price `P`** — what trades execute at:
```
P(t+1) = P(t) + demand − reversion
```
- **Demand (bond curve with per-player depth):** buying `n` moves `+ (n/L) × k_d`;
  selling lowers. `L` = `liquidity_depth` (higher for stars → less slippage; lower
  for unknowns → more volatile). Implemented as **3 tiers** (star/starter/prospect),
  not 200 hand-tuned values. User always trades against the curve → kills liquidity
  chicken-and-egg problem.
- **Mean reversion:** `reversion = λ × (P − V)`, λ small (~0.05–0.1). If the crowd
  overbids `P` above `V`, it corrects — and whoever bought when `P < V` wins when
  the market corrects. **This makes "I know something the market doesn't" real.**

**C. Events & limits:** goals/red cards apply deltas to `V`; circuit breakers cap %
change per event and per day.

**D. Spread:** MVP = **transparent spread** (~1%, visible) — beyond realism, it's the
economy's **sink** (drains virtual currency). Phase 2 = **dynamic spread** (widens on
volatility, protects against arbitrage, is revenue).

**E. Market guardrails (day 1, non-negotiable):**
- **Delta drip:** event-driven price movements apply gradually over **2–3 min**, not
  in an instant jump. Kills the "saw it on TV before the engine" arbitrage (30–60s
  polling lag) without killing the excitement: price visibly rises during those minutes.
- **Live match spread:** while a player has a live match, spread rises from ~1% to ~2.5%.
- **Position cap:** max **~20% of starting bankroll** invested per player per user
  (limits whales and sybils simultaneously) + daily volume cap per user per player.
- **Leaderboard ranked by % return** (not absolute value): natural inflation (all holders
  gain when a player performs) means absolute value only rewards early arrival.

> **Implementation order:**
> **Day 1 (launch):** `base_value` real + demand (curve, 3 levels of `L`) +
> **live event deltas** (polling) + **mean reversion** (`λ` 0.05) + caps.
> Functional and live market.
> **Improvement (during tournament):** recency weighting + weight calibration with
> real data.

---

## 8. Monetization — Deliberately Last

Applying principle #2: **MVP bills $0 intentionally.** The 1% spread is behavior
testing only. Market, users, and community first; money later. The model (Phase 2)
is already designed:

1. **Paid contests with prizes (workhorse):** ~10–15% rake on entry fees.
   DraftKings model (~$12B market) and the friendliest legal framing (skill game).
2. **Premium subscription ("Golcap Pro"):** advanced stats, reduced fees, exclusive leagues.
   Recurring, high margin.
3. **Trading spread:** >1% and dynamic on volatility. Secondary, always transparent.
4. *(Scale)* sponsorships, data licensing.

With a flat 1% fee alone, you'd need massive volume; contests generate far more per
active user. But none of this is built or optimized in the MVP.

---

## 9. Technical Architecture (TypeScript everywhere)

See `docs/ARCHITECTURE.md` for full system design, data flow, and RPC contracts.

| Layer | Decision |
|---|---|
| App + web | Next.js 15 + React + TypeScript (PWA mobile-first) → **Vercel** |
| DB + Auth + Storage | **Supabase** (Postgres) |
| Operations (buy/sell) | **Postgres function (RPC)**, atomic transaction, server-side |
| Pricing engine | **Edge Function (TS) + `pg_cron` + `pg_net`** |
| Sports data | **API-Football** (paid plan from ~Jun 16) → premium feed in Phase 2 |
| UI languages | **EN + ES** via next-intl (cookie-based locale, no URL routing in MVP) |
| Language | **TypeScript** (+ SQL in data layer) |

**Key corrections vs. v3:**
- Players and teams need `api_player_id` / `api_team_id` (UNIQUE, nullable) — required
  so ingest functions know which player to update when an event occurs.
- `pending_price_deltas` table required for the drip mechanism (not implicit).
- `market_params` table required for runtime parameter tuning without deploys.
- Scheduling: **pg_cron + pg_net → Edge Functions**, NOT Vercel crons. The pricing
  engine must live adjacent to the DB; Vercel hobby crons don't guarantee minute-level
  cadence.
- API-Football paid plan needed from ~Jun 16 (group stage), not just from Jun 28.
  Free tier (~100 req/day) cannot support 30–60s polling on match days.

---

## 10. Security (from day one)

See `docs/SECURITY.md` for complete checklist.

**MVP (now):** Row Level Security on all tables · all balance movements server-side ·
secrets (service key, API key) **server-only, never client** · rate-limiting +
**Turnstile** on signup · Zod input validation · HTTPS+HSTS, secure cookies, strict
CORS, CSP (anti-XSS) · email verification · audit log · `npm audit`/Dependabot + backups.

**Phase 2 (real money):** **Stripe** payments (PCI handled by Stripe; we never touch
card data) · **KYC/AML** · **+18 verification** · responsible gambling (limits,
self-exclusion) · **pen test** before opening.

---

## 11. Database Schema (see ARCHITECTURE.md for ADRs)

**Catalogs:** `teams` (id · name · country · group · api_team_id · is_eliminated ·
eliminated_round_id) · `rounds` (id · name · sort_order) · `event_types` (id · code ·
name · default_perf_points) · `positions` (id · code · name)

**Config:** `market_params` (id · params jsonb) — single row, all tunable parameters

**Core:** `profiles` (id=auth.users.id · username · created_at · cash_balance*)
· `players` (id · full_name · team_id · position_id · dob · avatar_colors · base_value ·
fair_value* · current_price* · liquidity_tier · shares_outstanding · api_player_id)
· `matches` (id · api_fixture_id · round_id · home_team_id · away_team_id ·
kickoff_utc · status · processed)

**Events:** `match_events` (id · match_id · player_id · event_type_id · minute ·
api_event_key UNIQUE) · `player_match_appearances` · `player_injuries`

**Prices:** `price_history` (id · player_id · price · fair_value · reason · captured_at)
· `pending_price_deltas` (id · player_id · remaining_pct · source_event_id · created_at)

**Portfolio/trading:** `wallet_ledger` (id · user_id · delta · balance_after ·
entry_type · ref_id · created_at) — append-only, source of truth ·
`trades` (id · user_id · player_id · side · shares · price_per_share · gross · fee · net)
· `holdings` (user_id · player_id · shares · avg_cost) [UNIQUE]

**Social:** `leagues` (id · name · type · invite_code UNIQUE · created_by) ·
`league_members` (league_id · user_id) [UNIQUE]

**Views:** `v_player_stats` (aggregates match_events) · `v_portfolio_value`
(SUM(shares×current_price)+balance) · `v_leaderboard` (materialized, ranked by % return)

**Phase 2 (NOT built in MVP, reserved in design):** `contests` · `contest_entries`

**Integrity:** PKs/FKs, UNIQUE constraints, CHECK (shares≥0, price>0), indexes on FKs +
time series + date columns. Caches (`current_price`, `fair_value`, `cash_balance`,
`holdings`) are deliberate denormalizations for a read-heavy app, reconciled in
server-side functions and cron.

---

## 12. Cost Estimates

Vercel $0 (Hobby, check commercial use ToS) or $20/mo (Pro) · Supabase $0 → $25/mo (Pro,
for PITR and cron) · API-Football $0 (dev) → $19/mo (live) · domain ~$12/yr.
**Total ~$0 in dev, ~$45–65/mo live.** Capital goes to growth, not infrastructure.

---

## 13. Build Plan

See `docs/ROADMAP.md` for the complete technical roadmap with phases, tasks, and checkboxes.

### Summary

| Phase | Dates | Goal |
|---|---|---|
| F0 Setup | Jun 10–11 | Repo + tooling + docs + PWA skeleton |
| F1 Data | Jun 11–13 | Schema + RLS + types + seed ~200 players |
| F2 Financial core | Jun 13–17 | `trade()` RPC + ledger + invariant tests |
| F3 Pricing engine | Jun 16–20 | Ingest + tick + drip + reversion, tested live |
| F4 Frontend PWA | Jun 19–24 | 5 screens + leaderboard + leagues + installable |
| F5 Hardening | Jun 24–27 | Security + QA + Sentry + soft launch (Jun 26–27) |
| 🚀 Launch | **Jun 28** | Round of 16 Day 1 |

### Sprint (Day 1 blocker tasks only)
- DB + Auth + RLS + seed with real values + API-Football tested against group stage
- 3 core screens + operations (RPC + ledger) + pricing cron
- Leaderboard + private leagues + feed + UI polish + PWA
- Security + QA + soft launch to waitlist

---

*Operative document. All numbers are starting points to adjust with real data.
Full technical specifications: docs/ARCHITECTURE.md · docs/MARKET_ENGINE.md ·
docs/ROADMAP.md · docs/SECURITY.md*
