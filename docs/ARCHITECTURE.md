# Football Exchange — Architecture

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
  code: 'insufficient_funds' | 'insufficient_shares' | 'position_cap' |
        'volume_cap' | 'rate_limited' | 'invalid_input' | 'player_not_found',
  message: string
}
```

**Execution sequence (must be in this order):**
1. `auth.uid()` required
2. Validate inputs (side, shares > 0, shares ≤ max_order_size from market_params)
3. `SELECT ... FOR UPDATE` on player row AND profile row (prevents race conditions)
4. Rate-limit check: count trades in last 60s from `trades` table
5. Compute execution price (spread logic, see MARKET_ENGINE.md §3)
6. Validate: sufficient funds (buy) or sufficient shares (sell)
7. Validate: position cap (buy only) — accumulated cost ≤ position_cap_pct × 100_000
8. Validate: daily volume cap for this user × this player
9. Write `trades` (INSERT)
10. Write `holdings` (UPSERT, compute new avg_cost on buy)
11. Write `wallet_ledger` (INSERT, with running balance_after)
12. Write `profiles.cash_balance` (UPDATE)
13. Write `players` (UPDATE current_price, shares_outstanding)
14. Write `price_history` (INSERT, reason = 'trade')
15. Return success jsonb

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

**ADR-003: pending_price_deltas for gradual drip**
Events update `fair_value` immediately (fundamental anchor). Price `P` moves gradually.
The delta is stored as a percentage (`remaining_pct NUMERIC`) and consumed in fractions
by each `tick` call. This implements the 2–5 min drip from the spec without any
scheduled job per-event.

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
- Rate limit: ~100 req/day (free tier). MVP needs paid tier from ~Jun 16.
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
        ├─ Edge Functions (ingest, tick)
        └─ pg_cron (scheduled jobs → Edge Functions via pg_net)
```
