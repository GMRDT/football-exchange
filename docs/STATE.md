# Golcap — State Audit

> **Status:** snapshot from Jun 12 ~22:00. F3.5 (live engine test) has since completed —
> see `docs/F3_5_REPORT.md`. The local DB figures below (matches/price_history/profiles = 0)
> were captured before that test inserted fixture 1489370; they are point-in-time, not regenerated.

**Generated:** 2026-06-12 · branch `main` · pre-launch (F4 in progress)
**DB figures below are the LOCAL stack** (`.env.local` → `http://127.0.0.1:54321`),
which diverges from production — see *Database state* and *Known bugs / debt*.

---

## Routes built

Everything physically present under `src/app/`. "Screenshot status" reflects the
**local stack as currently seeded** (no matches, no price history, no profiles).

| Path | Shows | Auth required | Screenshot status |
|---|---|---|---|
| `/` (`page.tsx`) | Landing: header, hero + two CTAs (Start free / See market), live Top Movers block, 3-step "how it works" | No | **Works** — but Top Movers is flat (all 0%), so it ranks by price, not movement |
| `/market` (`(app)/market/page.tsx`) | Market screener: title, search box, Top Gainers / Top Losers carousels, sort chips (% / price), full player list (213 rows) | No | **Works but flat** — list renders; Gainers/Losers carousels render **empty** because every daily change is 0% locally |
| `/market/[id]` (`(app)/market/[id]/page.tsx`) | Player detail: kit avatar, name/team/pos, animated price + % + fair value, sparkline, 4 stat boxes, next match, your position, trade form OR signup CTA | No (trade form gated to signed-in; `trade()` RPC re-checks server-side) | **Works but sparse** — sparkline is a flat dashed line (price_history empty), stats all 0, "next match" never appears (matches=0) |
| `/login` (`(auth)/login/page.tsx`) | Email+password sign-in, Google OAuth button, link to signup | No | **Works** |
| `/signup` (`(auth)/signup/page.tsx`) | Username/email/password form, then a "check your email" confirmation stage | No | **Works** (local mail lands in Mailpit) |
| `/auth/callback` (`(auth)/auth/callback/route.ts`) | Route handler — exchanges OAuth/email code for a session, redirects to `/market` (or `/login` on failure) | No | Not a screen (works) |
| `/api/market` (`api/market/route.ts`) | JSON market snapshot (`{ players }`) polled by SWR every 30s; anon RLS-public read | No | Not a screen — returns valid JSON |
| `/icon`, `/apple-icon` (`icon.tsx`, `apple-icon.tsx`) | Generated PWA icons — blue square, white "GC" | No | Works (image responses) |

Loading skeletons exist for `/market` (`market/loading.tsx`) and `/market/[id]`
(`market/[id]/loading.tsx`).

**Routes referenced but NOT built (404):** `/portfolio`, `/leaderboard` (both linked
from BottomNav), and `/activity` (protected by middleware, linked nowhere).

---

## Components built

All 14 files under `src/components/`:

| File | Purpose |
|---|---|
| `landing/TopMovers.tsx` | Landing "top movers" block — SWR-polled top 3 by abs daily change, price-desc tiebreak |
| `layout/BottomNav.tsx` | Fixed mobile tab bar (Market / Portfolio / Leaderboard) with a sliding 2px primary indicator |
| `market/HeroPrice.tsx` | Animated count-up of the player-detail hero price (rAF, respects reduced-motion) |
| `market/MarketScreen.tsx` | Client market screen: search, sort chips, Gainers/Losers carousels, staggered-entrance list |
| `market/PlayerRow.tsx` | One market list row — kit avatar, name/team/pos, price with up/down flash animation |
| `trade/TradeForm.tsx` | Buy/Sell form; the only client financial write path, calls `trade()` RPC; client math is display-only |
| `trade/TradeSection.tsx` | Client wrapper that supplies the post-trade SWR/router invalidation callback to TradeForm |
| `ui/EmptyState.tsx` | Icon + sentence + optional CTA empty state |
| `ui/KitAvatar.tsx` | Jersey-style initials avatar from team colors — the legal stand-in for player photos |
| `ui/LocalDate.tsx` | Renders a UTC timestamp in the user's timezone (client, suppresses hydration warning) |
| `ui/PriceChange.tsx` | Arrow + signed % pill with semantic green/red — the only component allowed to paint green/red |
| `ui/SkeletonPlayerDetail.tsx` | Shimmer skeleton mirroring the player-detail layout |
| `ui/SkeletonRow.tsx` | Shimmer skeleton mirroring a PlayerRow (zero layout shift) |
| `ui/Sparkline.tsx` | Minimal SVG price line + gradient fill; flat dashed line when <2 points |

---

## Design tokens in use

Read from `src/app/globals.css` (`@theme` block). **There is no `tailwind.config`
file** — this is Tailwind v4, configured entirely via the `@theme` directive in CSS
and `@tailwindcss/postcss` in `postcss.config.mjs`.

**Color tokens (all defined in `@theme`):**

| Token | Hex | Referenced by components? |
|---|---|---|
| `--color-primary` | `#2D5BFF` | Yes (buttons, active nav, focus ring) |
| `--color-primary-pressed` | `#1E44D9` | Yes (hover/active) |
| `--color-up` | `#16A34A` | Yes (PriceChange, Sparkline) |
| `--color-up-soft` | `#F0FDF4` | Yes (flash-up, success) |
| `--color-down` | `#DC2626` | Yes (PriceChange, errors) |
| `--color-down-soft` | `#FEF2F2` | Yes (flash-down, error bg) |
| `--color-gold` | `#F59E0B` | **No — defined but unused** |
| `--color-warning` | `#D97706` | **No — defined but unused** |
| `--color-bg` | `#FAFAF9` | Yes (page bg, inputs) |
| `--color-surface` | `#FFFFFF` | Yes (cards, rows) |
| `--color-border` | `#E7E5E4` | Yes (borders, dividers, skeletons) |
| `--color-text` | `#1C1917` | Yes |
| `--color-text-muted` | `#78716C` | Yes |

**Font families:** `--font-sans` = Inter, `--font-display` = Manrope. Both loaded via
`next/font/google` in `src/app/layout.tsx` and exposed as `--font-inter` / `--font-manrope`
CSS variables on `<body>`. Body defaults to sans; `font-display` used for headings/prices.

**Spacing scale:** **no custom spacing scale** — uses stock Tailwind spacing throughout.
Most sizing is via explicit arbitrary values (`text-[15px]`, `h-11`, `min-h-[44px]`,
`max-w-lg`), not a bespoke scale.

**Motion tokens (defined and used via `animate-*` utilities):**
`--duration-fast` 150ms, `--duration-base` 200ms, `--duration-slow` 250ms,
`--ease-standard` `cubic-bezier(0.2,0,0,1)`. Animations: `row-entrance`,
`price-flash-up`, `price-flash-down`, `scale-in`, `slide-down-in`, `shimmer`.
A `prefers-reduced-motion` block neutralizes all of it.

---

## i18n coverage

- **`messages/en.json`: 106 leaf keys.** **`messages/es.json`: 106 leaf keys.**
- **10 namespaces, identical in both files:** `common`, `nav`, `auth`, `market`,
  `landing`, `positions`, `portfolio`, `leaderboard`, `feed`, `errors`.
- **Full parity — zero missing keys in either direction.** The parity unit test
  (`tests/i18n.test.ts`) passes.
- No hardcoded UI strings found in `src/app` / `src/components` (grep scan clean).

Gaps worth flagging (not parity breaks):
- Namespaces `portfolio`, `leaderboard`, `feed` are fully translated but their screens
  don't exist yet — translations written ahead of the routes.
- **Team names are not in the dictionaries** — they come from `teams.name` in the DB.
  ROADMAP F4.9 ("48 team names translated in ES dictionary") is not satisfied by the
  current data-driven approach.

---

## Database state

**These are LOCAL counts** (`.env.local` points at the local stack — per memory,
pnpm/psql silently follow it). Production is documented separately in ROADMAP F1.5/F3.6
and **does not match** local.

| Table | Local rows |
|---|---|
| `players` | **213** |
| `teams` | **48** |
| `matches` | **0** |
| `profiles` | **0** |
| `market_params` | **1** |

**`api_player_id` mapping (local):** **185 mapped / 28 unmapped** (of 213).
The 28 unmapped are mid-tier names (e.g. Moisés Caicedo, Kenan Yıldız, Dean Huijsen,
Pape Matar Sarr, Ronald Araújo, Jonathan David, Jhon Durán…).
`teams.api_team_id`: **48 / 48 mapped.**

**Other tables empty locally:** `price_history` 0, `match_events` 0, `trades` 0,
`holdings` 0, `wallet_ledger` 0. Every player has `current_price = fair_value =
base_value` (flat, never ticked).

**Divergence from production (per ROADMAP, 2026-06-12):** prod reports **213/213**
players mapped, **72 group fixtures synced**, and ingest/tick live. Local is an
earlier seed snapshot: 185/213 mapped, no fixtures, no price engine output. Anyone
running locally sees a flat, match-less market.

---

## What's missing for launch

Cross-referenced against ROADMAP F4 and F5. Unchecked / partial items:

**F4 — Frontend PWA**
- **F4.1 Supabase client / auth** — *partial.* Browser + server clients, email/password,
  Google OAuth, and middleware guards are done. **Turnstile integration is missing** (no
  Turnstile anywhere in the codebase).
- **F4.2 Market** — *partial.* Screener, Gainers/Losers, search, sort, 30s SWR all done.
  **Team/position filters not built** (only free-text search + 2 sort modes).
- **F4.3 Player Detail** — *done.* Price, stats, next match, position, buy/sell, typed
  error handling all present.
- **F4.4 Portfolio** — *not built.* No `/portfolio` route at all.
- **F4.5 Leaderboard + private leagues** — *not built.* No `/leaderboard` route.
- **F4.6 Activity feed** — *not built.* No `/activity` route.
- **F4.7 Onboarding** — *partial.* Signup flow done; login lands on `/market`. The "2
  explainer cards" exist only as the landing "how it works" section, not in-app onboarding.
- **F4.8 PWA** — *partial.* `manifest.json`, Serwist service worker, and BottomNav done.
  **iOS/Android install prompts not built** (no `beforeinstallprompt` handler, no iOS
  install sheet).
- **F4.9 i18n** — *partial.* Key parity green, no hardcoded strings, Intl number/date
  formatting, kickoff in user TZ. **Missing:** team-name translation, in-app language
  toggle, and `profiles.locale` read/write wiring (the `NEXT_LOCALE` cookie is read but
  never written by any UI).

**F5 — Hardening & Launch** — *essentially unstarted.*
- **F5.1 Security audit** — CSP headers (✓ in `next.config.ts`) and Zod validation (✓)
  are in place. **Missing:** RLS manual audit sign-off, Turnstile, npm audit, and
  email-verification-before-first-trade gating.
- **F5.2 Observability** — *not started.* No Sentry, no React error boundaries, invariant
  cron not deployed (ROADMAP F2.3 also still open).
- **F5.3 Soft launch** — not started.
- **F5.4 Public launch** — not started.

> Launch-critical gate still open upstream: **F3.5 live test** is unchecked (motor
> verified against a real match end-to-end). It's an F3 item but blocks launch.

---

## Known bugs / debt

Brutally honest, in rough priority order:

1. **Two of three bottom-nav tabs 404.** `BottomNav` links to `/portfolio` and
   `/leaderboard`; neither route exists. The nav is fully wired to screens that aren't
   built — tapping them dead-ends.
2. **Middleware ↔ nav mismatch.** `src/middleware.ts` protects `/portfolio` and
   **`/activity`**. BottomNav exposes `/leaderboard` (not `/activity`). Net result:
   `/activity` is protected but unreachable (no link, no route); `/leaderboard` is exposed
   but unprotected and 404s. The `(app)/layout.tsx` comment describes the `/portfolio` +
   `/activity` gating, which no longer matches what the nav actually shows.
3. **Local DB is a misleading demo.** 185/213 mapped (vs 213/213 prod), `matches`,
   `price_history`, `profiles` all empty. Locally the market is flat: Top Gainers/Losers
   render empty, every sparkline is a flat dashed line, "next match" never shows, all stats
   are 0. Not a code bug, but anyone judging the UI locally sees a dead market.
4. **No language switcher.** The `NEXT_LOCALE` cookie is read in `src/i18n/request.ts` but
   never written anywhere in the UI, and `profiles.locale` is never read or written. Locale
   is effectively accept-language-header only — no in-app way to change it.
5. **Generated artifacts committed and churning.** `public/sw.js` (43 KB Serwist build
   output) and `tsconfig.tsbuildinfo` are tracked in git and currently show as modified.
   They'll dirty the tree on every build/typecheck.
6. **No error boundaries.** No `error.tsx`, `global-error.tsx`, or `not-found.tsx`. If a
   server page's RPC throws (e.g. `get_market_summary` failure), the user gets Next's
   default error page. `EmptyState` covers empty, not error.
7. **CSP keeps `'unsafe-inline'` on `script-src` in production.** Only `'unsafe-eval'` is
   dev-gated; `'unsafe-inline'` ships in prod too (nonces deferred to F5). Weakens the CSP
   meaningfully.
8. **Dead design tokens.** `--color-gold` (#F59E0B) and `--color-warning` (#D97706) are
   defined in `@theme` but referenced by zero components.
9. **`liquidityTier` is a dead prop on TradeForm.** It's declared in `TradeFormProps` and
   passed by `TradeSection`/the player page, but the component body never destructures or
   uses it (spread estimate uses a hardcoded `SPREAD_BASE`).
10. **Float math on monetary display values.** Player detail computes unrealized P&L as
    `(current_price - avg_cost) * shares` in JS floats, and TradeForm/HeroPrice/formatCoins
    `parseFloat` NUMERIC strings. All are acknowledged in comments as display-only (server
    is authoritative), but it runs against the spirit of invariant #2.
11. **ROADMAP checkboxes are stale.** F0 is entirely unchecked and F1.3/F1.4 are unchecked
    despite the repo, generated `types.ts`, and seed clearly existing. The status board
    under-reports actual progress.
12. **Cosmetic i18n nit.** `landing.topMovers` ES value is already uppercase
    ("LO MÁS MOVIDO AHORA") while EN is sentence case; both then get CSS `uppercase`. The
    ES string bakes styling into the copy.
