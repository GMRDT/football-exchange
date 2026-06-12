# F4 Kickoff — Frontend PWA

**Prereqs (all met as of 2026-06-12):** F2 trade RPC green, F3 engine live in
prod, 213/213 players mapped, RLS public-read verified by integration tests.
Scope: the 5 screens + PWA install, EN/ES. Nothing else (ROADMAP scope rules).

## 1. File tree to create

```
src/
  middleware.ts                    # auth guard + locale cookie
  lib/
    supabase/
      client.ts                    # browser client (anon key)
      server.ts                    # server-component client (cookies)
      queries.ts                   # typed read helpers shared by screens
    market/
      format.ts                    # price/percent via Intl (extends lib/format.ts)
  i18n/
    request.ts                     # (exists) cookie-based locale resolution
  app/
    layout.tsx                     # (exists) + NextIntlClientProvider + bottom nav
    (auth)/
      login/page.tsx
      signup/page.tsx              # + Turnstile widget
      onboarding/page.tsx          # 2 explainer cards
    (app)/                         # auth-guarded group
      market/page.tsx              # F4.2 — server component + <MarketTable/>
      player/[id]/page.tsx         # F4.3 — detail + <TradeForm/>
      portfolio/page.tsx           # F4.4
      leaderboard/page.tsx         # F4.5 — tabs: global | private leagues
      activity/page.tsx            # F4.6
  components/
    nav/BottomNav.tsx
    market/{MarketTable,PlayerRow,SearchFilters,GainersLosers}.tsx
    player/{PriceHeader,StatsCard,NextMatch}.tsx
    trade/{TradeForm,TradeResult}.tsx   # all error codes → dictionary keys
    portfolio/{PositionsList,PortfolioSummary,ShareButton}.tsx
    leagues/{CreateLeague,JoinLeague,LeagueBoard}.tsx
    pwa/{InstallPrompt,OfflineFallback}.tsx
messages/
  en.json / es.json                # full dictionaries (skeletons exist; key-parity test exists)
```

## 2. Dependency order (what blocks what)

```
F4.1 clients + auth + middleware        ← blocks everything
 ├─ F4.2 Market ──────┐
 │   └─ F4.3 Player Detail + TradeForm  (reuses Market's data patterns)
 │        └─ F4.4 Portfolio             (needs trades to exist to be testable)
 │             └─ F4.5 Leaderboard + Leagues   (needs league RPCs — see §4)
 │                  └─ F4.6 Activity feed      (needs holdings to filter events)
 └─ F4.7 Onboarding (parallel with F4.2; only needs auth)
F4.8 PWA install + offline   — transversal, after F4.2 exists to cache
F4.9 i18n completion          — continuous; final sweep + ES QA at the end
```

Suggested session split: F4.1+F4.7 → F4.2 → F4.3 → F4.4 → F4.5 → F4.6 → F4.8+F4.9.

## 3. Architecture decision: SSR + SWR hybrid

**Server Components render the first paint** (server client, RLS-scoped reads,
zero client JS for static parts); **SWR polls from the client every 30 s** for
live data (prices, portfolio, feed) per ARCHITECTURE.md's polling design.

Why: instant first paint on mobile (the PWA's core UX), no waterfalls, and the
anon-key client + RLS is already integration-tested. Realtime stays 🟡
post-launch — SWR's `refreshInterval` makes the swap trivial later.

**Risks accepted/flagged:**
- Serwist must NOT cache SSR HTML of dynamic routes (stale prices on
  reopen) — cache shell + static assets only; `NetworkFirst` for pages.
- Server components must use the **anon** server client for public data and
  the user-scoped client for portfolio — never the service key (invariant #5).
- 30 s polling × N components: share one SWR key per resource (e.g.
  `market-list`), not per-row fetches.

## 4. Queries/RPCs the frontend needs

**Already exist — reuse, do not rebuild:**
| Need | Source |
|---|---|
| Market list (price, %, team colors) | PostgREST `players` join `teams` (public RLS) + `price_history` for 24 h % |
| Player stats | `v_player_stats` view |
| Price chart | `price_history` by player, range query (indexed) |
| Portfolio | `v_portfolio_value` view + `holdings` (owner RLS) |
| Global leaderboard | `v_leaderboard` materialized view (refreshed by cron) |
| Trade execution | `trade()` RPC — typed error codes already enumerated in `tests/integration/helpers.ts` (`TradeErrorCodeSchema`) |
| Group tables | `compute_group_standings(p_group_name)` — public, added in F3.6 |
| Next match per team | PostgREST `matches` (public RLS) |

**Missing — create in a dedicated F4 migration (new file, never edit applied ones):**
| RPC | Why |
|---|---|
| `set_locale(p_locale)` | No UPDATE path to `profiles.locale` exists (audit finding); F4.9 needs it. SECURITY DEFINER, auth.uid() scoped, CHECK en\|es |
| `create_league(p_name)` / `join_league(p_invite_code)` | Client can't write `leagues`/`league_members`; join-by-code needs a lookup that does NOT expose all codes |
| Column-restricted view or policy fix for `leagues` | Audit finding: `leagues_select_public` exposes `invite_code` to anon — private leagues aren't private. Fix in the same migration |
| `get_activity_feed(p_limit)` | Events for players the user holds (match_events × holdings × event_types), one round trip, owner-scoped |
| (optional) `get_market_list()` | Only if the PostgREST join + 24 h % computation proves slow/chatty; try plain reads first |

**24 h % change note:** computing it per player via `price_history` lateral
join is the one query worth profiling early (180 rows/hour/player during
match windows). If slow, add a `price_24h_ago` snapshot column maintained by
tick — decision deferred until measured.

## 5. Definition of done (gate to F5)
- 5 screens functional on mobile viewport, installable PWA (iOS + Android prompts)
- Zero hardcoded UI strings (grep audit) + key-parity test green + ES reviewed
- `trade()` errors all rendered from dictionaries (9 codes)
- Lighthouse PWA pass; `pnpm build` clean; no service key in client bundle
  (`grep -r SERVICE_ROLE .next/` empty)
