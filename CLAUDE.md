# Football Exchange — Claude Code Contract

## Project
Virtual-money football trading platform. MVP targeting World Cup 2026 (launch Jun 28).
Solo founder. Deadline is hard. Every decision filters through: **does this help validate
that people build a portfolio and return multiple times per day?**

## Stack (non-negotiable — do not re-debate)
- **Framework:** Next.js 15 App Router + TypeScript strict
- **Styling:** Tailwind CSS v4, mobile-first PWA
- **Backend:** Supabase (Postgres, Auth, RLS, RPC, Edge Functions, pg_cron, pg_net)
- **Hosting:** Vercel (app) + Supabase (all backend)
- **Data:** API-Football (polling 30–60s on match days)
- **i18n:** next-intl — EN (default) + ES, cookie-based locale, NO locale URL routing in MVP
- **Package manager:** pnpm
- **Tests:** Vitest (unit + integration)
- **Language split:** code/commits/identifiers in English; conversation in Spanish

## Commands
```bash
pnpm dev                          # Next.js dev server
pnpm build                        # Production build
pnpm typecheck                    # tsc --noEmit
pnpm lint                         # ESLint
pnpm test                         # Vitest unit tests
pnpm test:integration             # Vitest integration (requires supabase start)
pnpm db:reset                     # supabase db reset (local)
pnpm db:types                     # supabase gen types typescript → src/lib/supabase/types.ts
pnpm seed                         # npx tsx scripts/seed.ts
pnpm check-invariants             # npx tsx scripts/check-invariants.ts
pnpm check-prod-secrets           # npx tsx scripts/check-prod-secrets.ts (Vault + cron health)
pnpm map-api-players [--top N]    # npx tsx scripts/map-api-players.ts (populate api_player_id)
pnpm record-fixture [fixture_id]  # npx tsx scripts/record-fixtures.ts
```

## Conventions
- TypeScript `strict: true` everywhere. No `any` without a comment explaining why.
- All external inputs validated with **Zod** (API responses, form data, RPC inputs).
- **All user-facing strings come from next-intl dictionaries** (`messages/en.json`,
  `messages/es.json`). Never hardcode UI text in components. New string = both files.
  A unit test asserts key parity between the two files.
- **DB stores language-neutral codes** (e.g. `event_types.code`); the UI renders labels
  from dictionaries. Display strings never live in the database.
- Numbers/dates formatted with `Intl.NumberFormat` / `Intl.DateTimeFormat` using the
  active locale. Kickoff times always in the user's timezone.
- Conventional commits: `feat:`, `fix:`, `db:`, `test:`, `docs:`, `chore:`.
- Trunk-based: `main` always deployable. Short-lived `feat/*` branches (hours, max 2 days).
- **PR required** when touching: money logic, DB schema, pricing engine. Self-approve is fine.
- One ROADMAP task per Claude Code session. `/clear` between sessions.
- Secrets in env only. Never committed. Never in client code.

## Non-negotiable invariants
These are hard constraints. Violating any is a critical bug, not a code style issue.

1. **All balance movements** go through `wallet_ledger` inside an atomic server-side RPC.
   The client NEVER writes financial tables directly.
2. **Money and prices = `NUMERIC` in SQL**, never `FLOAT` or `DOUBLE`. JS side: strings
   or integers (cents) when precision matters, never `number` for monetary values.
3. **Applied migrations are immutable.** Never edit a migration file that has been run.
   Always create a new file.
4. **Pricing formula lives in ONE place:**
   - Trade price impact → SQL inside `trade()` RPC (must run inside the row lock)
   - Fair value / mean reversion / drip → TypeScript in `supabase/functions/_shared/market.ts`
   - Both are formally specified in `docs/MARKET_ENGINE.md`. If they diverge, that doc wins.
5. **Secrets (service key, API-Football key, Turnstile secret) only on the server.**
   Never in Next.js client bundles, never in public env vars.
6. **RLS on every table.** Anonymous reads on public market data only.
   Zero direct client writes to financial or pricing tables.

## Release checklist (before merging schema changes to production)
- [ ] `supabase db push` to production BEFORE merging the code that depends on it
- [ ] `pnpm check-invariants` passes on production data
- [ ] `pnpm check-prod-secrets` passes against production (Vault secrets + cron jobs live —
      a missing Vault secret fails SILENTLY and no price ever moves)
- [ ] `pnpm test:integration` green locally
- [ ] RLS audit: tested as `anon` role

## Docs index
| File | Purpose |
|---|---|
| `docs/spec-v3-updated.md` | Product spec (source of truth for scope decisions) |
| `docs/ARCHITECTURE.md` | System design, data flow, RPC contracts |
| `docs/MARKET_ENGINE.md` | Pricing formulas, parameters, simulation rules |
| `docs/ROADMAP.md` | Build phases with checkboxes — update as you go |
| `docs/SECURITY.md` | MVP security checklist (exit gate for F5) |

## Scope filter
- 🟢 MVP (build now): everything in F0–F5 of ROADMAP.md
- 🟡 Post-launch improvements: Realtime, push notifications, recency weighting
- 🔵 Phase 2 (after traction): real money, paid contests, dynamic spread, native app
- Locales: **EN + ES only** in MVP. pt-BR and others are 🟡 (one dictionary file away
  once strings are externalized — do not add before launch).

If a task is 🟡 or 🔵, decline and explain. Do not build it.
