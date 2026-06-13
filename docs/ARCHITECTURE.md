# Golcap — Architecture

## What we're building (honest description)
Four systems, not one app:
1. **Financial ledger** — double-entry accounting with strict invariants
2. **Simplified AMM** — automated market maker with fundamental anchor (fair value) and mean reversion
3. **Near-real-time ingestion pipeline** — idempotent, defensive, over an unreliable external API
4. **5-screen PWA** — mobile-first, installable, polling-based (no websockets in MVP)

The 70% of risk lives in systems 1–3. The frontend is commodity.

---

## Data flow

```
API-Football
  │  full fixture list, 1 request every 6h
  ▼
Edge Function: sync-fixtures  ◄── pg_cron (every 6h)
  └─ upserts matches via sync_fixture() (new fixtures, kickoff/status changes)

API-Football
  │  poll every 30–60s (match days only)
  ▼
Edge Function: ingest
  ├─ upserts match_events (idempotent via api_event_key)
  ├─ updates players.fair_value immediately (fundamental)
  └─ inserts pending_price_deltas (queues gradual P movement)
        │
        ▼ (consumed by tick)
Edge Function: tick  ◄── pg_cron (30–60s match days / 10–15min otherwise)
  ├─ drips pending_price_deltas in fractions over drip_minutes
  ├─ applies mean reversion: P += -λ(P - V)
  ├─ writes price_history
  └─ refreshes v_leaderboard (materialized)

PWA (Next.js)
  ├─ reads: players, holdings, leaderboard via Supabase RLS + SWR polling ~30s
  └─ writes: ONLY via supabase.rpc('trade', {...})
                    │
                    ▼
         Postgres function trade()  ← SECURITY DEFINER
           ├─ SELECT ... FOR UPDATE (player + profile)
           ├─ validates all business rules
           ├─ applies price impact (demand curve)
           ├─ writes: trades, holdings, wallet_ledger, profiles, price_history
           └─ returns typed result or typed error
```

---

## Component responsibilities

| Component | Owns | Does NOT own |
|---|---|---|
| `trade()` RPC | Price impact from trades, ledger writes, balance updates | Fair value computation, mean reversion |
| `ingest` Edge Fn | Event ingestion, idempotency, fair_value updates, delta queuing | Price drip, leaderboard |
| `tick` Edge Fn | Price drip, mean reversion, leaderboard refresh | Event ingestion, trade execution |
| `sync-fixtures` Edge Fn | Keeping `matches` in sync with the API fixture list | Events, prices, anything financial |
| `_shared/market.ts` | Pure math: all formulas | Any I/O, DB access |
| Next.js client | Display, user input | Any financial writes |

**Key principle:** each formula lives in exactly one place. If `_shared/market.ts` and
the SQL diverge, `docs/MARKET_ENGINE.md` is the authority.

---

## RPC contracts

### `trade(p_player_id, p_side, p_shares) → jsonb`
Atomic Postgres function, `SECURITY DEFINER`, fixed `search_path`.

**Input:**
```typescript
{ p_player_id: string, p_side: 'buy' | 'sell', p_shares: number }
```

**Success response:**
```typescript
{
  ok: true,
  trade_id: string,
  execution_price: string,    // NUMERIC as string
  shares: string,
  gross: string,
  fee: string,
  net: string,
  new_balance: string,
  new_price: string
}
```

**Error response:**
```typescript
{
  ok: false,
  code: 'unauthorized' | 'invalid_input' | 'trading_paused' | 'player_not_found' |
        'rate_limited' | 'insufficient_funds' | 'insufficient_shares' |
        'position_cap' | 'volume_cap',
  message: string
}
```

Errors are returned as jsonb (not raised): by the time any error can be
returned, the function has written NOTHING, so committing is harmless.
`EXECUTE` is revoked from `anon` — unauthenticated callers get a PostgREST
permission error (42501) without reaching the function body.

**Execution sequence (must be in this order — zero writes before step 12):**
1. `auth.uid()` required → `unauthorized`
2. `p_shares := round(p_shares, 6)` — normalize BEFORE any arithmetic
3. Validate inputs (side ∈ buy|sell, shares > 0, shares ≤ max_order_size) → `invalid_input`
4. Read `market_params` once; fail-closed gate on `trading_enabled` → `trading_paused`
5. `SELECT ... FOR UPDATE` on profile row — ALWAYS profile first (fixed lock
   order profile → player prevents deadlocks) → `unauthorized` if missing
6. `SELECT ... FOR UPDATE` on player row → `player_not_found`
7. Rate-limit check under the lock: count trades in last 60s → `rate_limited`
8. Spread: live-match detection (MARKET_ENGINE.md §3.3) → spread_live | spread_base
9. Compute exec_price / gross / fee / net (MARKET_ENGINE.md §3.4, all 6 dp)
10. Business validations (ALL before any write):
    sufficient funds (buy) → `insufficient_funds`; sufficient shares (sell) →
    `insufficient_shares`; cost-basis cap (buy) → `position_cap`; daily UTC
    volume per user × player → `volume_cap`
11. Price impact `delta = (shares / L_tier) × k_d_tier`, then clamps in order:
    daily breaker (±max_daily_pct vs price 24h ago, fallback base_value) →
    min_price floor → base_value × max_price_multiplier cap
12. Writes (single transaction): `trades` INSERT → `holdings` UPSERT (new
    avg_cost on buy; avg_cost intact on sell) → `wallet_ledger` INSERT with
    `balance_after` → `profiles.cash_balance` UPDATE → `players` UPDATE
    (current_price, shares_outstanding) → `price_history` INSERT (reason='trade')
13. Return success jsonb — all NUMERIC values serialized as strings

### `sync_fixture(p_api_fixture_id, p_home_api_team_id, p_away_api_team_id, p_kickoff, p_status, p_round_sort_order) → jsonb`
Service-role only (`EXECUTE` revoked from anon/authenticated). Idempotent upsert
keyed on `matches.api_fixture_id`; called once per fixture by the `sync-fixtures`
Edge Function. Returns `{action: 'inserted' | 'updated' | 'unchanged' | 'skipped',
reason?}` — unresolved `api_team_id`/`sort_order` mappings are `'skipped'`, not
errors, and `processed = true` matches are never modified (ADR-009).

### `compute_group_standings(p_group_name) → table(team_id, group_name, rank, points, gd, gf, played)`
Public (callable by `anon` — F4 group tables). Ranks a group from `processed`
group-stage matches with known scores (`matches.home_goals/away_goals`).
Tie-break: points, GD, GF, then `api_team_id` (deterministic; FIFA's full
criteria are not implemented — see MARKET_ENGINE.md §1.3).

### `get_group_exit_state() → jsonb`
Service-role only. Returns the group-exit decisions executable *right now*
(teams without a `group_exits` row whose fate is already determined): ranks
1/2/4 of complete groups, plus all thirds once every group with matches is
complete (≥ 12). Each decision carries the team's full roster with current
fair values as text (ADR-004) so the caller prices the survival in
`market.ts`.

### `finalize_group_exit(p_team_id, p_outcome, p_reason, p_round_id, p_fair_values) → jsonb`
Service-role only. Applies one team's pre-computed group fate exactly once:
inserts the `group_exits` ledger row (idempotency gate — re-calls return
`{applied: false, reason: 'already_decided'}`), writes the supplied fair
values under an optimistic guard (`fv_conflict` on stale reads, same retry
contract as `ingest_event`), and marks `teams.is_eliminated` on elimination.
Contains NO formulas (MARKET_ENGINE.md §8).

---

## Database design decisions (ADRs)

**ADR-001: Append-only wallet_ledger**
`wallet_ledger` is the source of truth. `profiles.cash_balance` is a denormalized
cache for fast reads, reconciled inside every RPC call. Invariant: `SUM(delta) WHERE
user_id = X` must equal `cash_balance`. Checked daily by `check-invariants.ts`.

**ADR-002: Idempotency key for match_events**
`api_event_key TEXT UNIQUE` = composite of `(fixture_id, team_id, player_id, event_type,
detail, minute)`. The ingest function polls every 30–60s and re-reads the same events.
Without this constraint, every poll would create duplicate deltas. On conflict: do nothing.

**ADR-003: pending_price_deltas for gradual drip** *(updated in F3)*
Events update `fair_value` immediately (fundamental anchor). Price `P` moves gradually:
the event enqueues `total_pct NUMERIC` (the same clamped fraction applied to V) and each
`tick` advances `applied_pct` toward it on **wall-clock progress** over `drip_minutes`,
deleting the row on completion (exact telescoping formula in MARKET_ENGINE.md §2.2).
Robust to missed/uneven ticks and idempotent under re-polling. `remaining_pct` is
deprecated and no longer written. This implements the 2–5 min drip from the spec without
any scheduled job per-event.

**ADR-004: NUMERIC everywhere for money**
IEEE 754 floating point cannot represent 0.1 exactly. At scale, rounding errors in
financial balances compound into real discrepancies. All monetary and price columns
use `NUMERIC(20, 6)`. JavaScript reads them as strings and uses integer arithmetic
or a decimal library when computation is needed.

**ADR-005: Liquidity tiers (3 levels, not 200 values)**
`liquidity_tier CHECK IN ('star', 'starter', 'prospect')`. The market parameters for
each tier (`k_d`, `L`) live in `market_params` as jsonb, not in each player row.
Changing tier behavior requires one row update, not 200.

**ADR-006: Initial balance as ledger entry**
The registration trigger creates the profile AND inserts a `+100_000` entry in
`wallet_ledger` (entry_type = 'signup'). This means `SUM(ledger) == balance` holds
from account creation, with no special-case logic.

**ADR-007: Leaderboard ranks by % return, not absolute value**
Natural inflation (all holders gain when players perform) rewards early arrivals
with absolute value. Ranking by `(portfolio_value - 100_000) / 100_000 * 100`
levels the field and rewards skill over timing.

**ADR-008: Internationalization — EN + ES from day 1, i18n-ready architecture**

*Context:* The soft-launch waitlist is Spanish-speaking (Colombia/LatAm), and WC 2026
is co-hosted by Mexico. An English-only UI adds language friction exactly where we
measure the retention hypothesis. Retrofitting i18n later means touching every
component (the classic expensive rewrite).

*Decision:*
- **next-intl WITHOUT locale URL routing** (PWA is auth-gated; no SEO need per locale
  in MVP). Locale resolution order: cookie `NEXT_LOCALE` → `profiles.locale` →
  `Accept-Language` / device language → `'en'`.
- `profiles.locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','es'))` — stored
  server-side so future push notifications/emails (🟡) know the user's language
  without a browser cookie.
- All UI strings in `messages/en.json` + `messages/es.json`. `en.json` is canonical;
  a unit test asserts key parity between both files.
- **DB is language-neutral:** tables store codes (`event_types.code`), never display
  strings. UI maps code → label via dictionary.
- **48 team names translated in the ES dictionary** ("Germany" → "Alemania"); market
  search matches against both EN and ES names. Player names are NOT translated.
- Numbers/dates via `Intl.NumberFormat` / `Intl.DateTimeFormat` with active locale.
- Scope: exactly EN + ES. Additional locales are 🟡 post-launch (cheap once strings
  are externalized).

*Core terminology glossary (keep consistent in es.json):*

| EN | ES |
|---|---|
| Market | Mercado |
| Portfolio | Portafolio |
| Leaderboard | Clasificación |
| Buy / Sell | Comprar / Vender |
| Shares | Acciones |
| Holdings / Positions | Posiciones |
| Cash | Efectivo |
| Price / Fair value | Precio / Valor justo |
| Daily change | Cambio del día |
| Top Gainers / Top Losers | Mayores subidas / Mayores caídas |
| Return (%) | Retorno (%) |
| Private league | Liga privada |
| Invite code | Código de invitación |
| Activity | Actividad |

**ADR-009: Automatic fixture sync**
`matches` rows must exist before `ingest` can poll them, and manual seeding does not
survive kickoff changes or bracket progression. The `sync-fixtures` Edge Function
(pg_cron, every 6h) fetches the full tournament fixture list — one API request — and
upserts each row through the service-role-only `sync_fixture()` RPC, keyed on
`matches.api_fixture_id`. API-Football short status codes are the canonical
`matches.status` values (no translation layer). Teams resolve via `teams.api_team_id`
and rounds via `rounds.sort_order`; unresolved mappings are skipped, not errors —
knockout fixtures carry TBD teams until the bracket settles, and the next run picks
them up. `processed = true` matches are immutable to the sync, so a stale poll can
never regress a finalized match.

---

## External API: API-Football

Base URL: `https://v3.football.api-sports.io`

Endpoints used:
- `GET /fixtures?league=1&season=2026` — fetch World Cup fixtures
- `GET /fixtures/events?fixture={id}` — fetch events for a live fixture
- `GET /players/squads?team={id}` — fetch squad for player ID mapping

**Known gotchas:**
- Missing coverage → empty array with HTTP 200 (not a 404). Always check array length.
- `player.id` can be null for unnamed players in events.
- Rate limit: 7,500 req/day (Pro plan). Budget: 1 req per sync-fixtures run (6h)
  + 1 req per started unprocessed fixture per ingest poll (1 min on match days).
- Poll result: same events re-returned every poll → idempotency is mandatory.

---

## Environment variables

```bash
# Server-only (Edge Functions + Next.js API routes)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=       # Never expose to client
API_FOOTBALL_KEY=                 # Never expose to client
TURNSTILE_SECRET_KEY=            # Never expose to client

# Client-safe (Next.js public)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

---

## Deployment topology

```
GitHub main
  │
  ├─► Vercel (auto-deploy on push)
  │     └─ Next.js PWA (static + server components + API routes)
  │
  └─► Supabase (manual: supabase db push before merging schema changes)
        ├─ Postgres (all tables, RLS, RPCs)
        ├─ Auth (email + Google OAuth + Turnstile)
        ├─ Edge Functions (ingest, tick, sync-fixtures)
        └─ pg_cron (scheduled jobs → Edge Functions via pg_net)
```
