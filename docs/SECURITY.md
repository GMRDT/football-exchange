# Golcap — Security Checklist (MVP)

This is the exit gate for F5. Every item must be checked before Jun 28 launch.
Items marked 🔵 are Phase 2 (real money) — do NOT build for MVP.

---

## Authentication & Access

- [ ] Email verification required before first trade (Supabase Auth setting)
- [ ] Google OAuth configured correctly (no unverified email bypass)
- [ ] Cloudflare Turnstile on signup form
- [ ] Turnstile on trade endpoint (activate if bot/abuse detected — not required day 1)
- [ ] Password reset flow works end-to-end
- [ ] Session tokens are httpOnly cookies (Supabase Auth default — verify)
- [ ] JWT secret is set in Supabase (not using insecure default)

## Row Level Security

- [ ] RLS enabled on ALL tables (verify with: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false` → should return 0 rows)
- [ ] `anon` role: can SELECT players, teams, matches, price_history, v_leaderboard
- [ ] `anon` role: CANNOT SELECT profiles, holdings, trades, wallet_ledger
- [ ] `authenticated` role: can SELECT own profile, holdings, trades, ledger
- [ ] `authenticated` role: CANNOT INSERT/UPDATE/DELETE financial tables directly
- [ ] All financial writes go through SECURITY DEFINER functions only
- [ ] `service_role` key is NEVER used in client-side code

## Secrets Management

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is in Vercel env (production) and `.env.local` (never committed)
- [ ] `API_FOOTBALL_KEY` same as above
- [ ] `TURNSTILE_SECRET_KEY` same as above
- [ ] `.env.local` is in `.gitignore`
- [ ] `git log --all -S "sbp_"` (service key prefix) returns nothing
- [ ] Vercel: production env vars are set, preview uses different test keys

## Input Validation

- [ ] All API routes validate with Zod before touching the DB
- [ ] RPC inputs validated inside the Postgres function (not just client-side)
- [ ] `p_shares` must be > 0 and ≤ max_order_size
- [ ] `p_side` must be exactly 'buy' or 'sell'
- [ ] Player ID validated as valid UUID format
- [ ] Username: alphanumeric + underscore, 3–20 chars, validated on profile creation

## Rate Limiting

- [ ] In-DB rate limit inside `trade()` RPC: max 10 trades per user per 60s (adjust with data)
- [ ] Supabase Auth has built-in rate limiting on signin/signup (enabled by default)
- [ ] Consider: Vercel Edge middleware rate limiting on `/api/*` routes if abuse seen

## Transport & Headers

- [ ] HTTPS enforced (Vercel: automatic, verify no HTTP endpoints exist)
- [ ] HSTS header configured in `next.config.ts`
- [ ] Content Security Policy header (disallow inline scripts, restrict sources)
- [ ] X-Frame-Options: DENY (clickjacking protection)
- [ ] X-Content-Type-Options: nosniff
- [ ] CORS: Supabase project allows only `https://your-domain.com` (not wildcard)

## Supabase Project Settings

- [ ] Database password: strong, stored in password manager
- [ ] `auth.users` email confirmations enabled
- [ ] Disable email enumeration (Supabase setting)
- [ ] Allowed OAuth redirect URLs: only production domain
- [ ] Point-in-Time Recovery enabled (Supabase Pro plan)
- [ ] Daily backups confirmed working

## Dependency & Code Audit

- [ ] `pnpm audit` — no critical or high vulnerabilities
- [ ] No `eval()` or `new Function()` in codebase
- [ ] No dynamic SQL string concatenation in Postgres functions
- [ ] All queries use parameterized statements (Supabase client enforces this)
- [ ] Dependencies: remove unused packages

## Observability & Incident Response

- [ ] Sentry configured for Next.js (client + server)
- [ ] Sentry configured for Edge Functions (supabase/functions)
- [ ] Error boundary in React app (graceful degradation, no stack traces to users)
- [ ] Supabase logs accessible (for incident investigation)
- [ ] Know how to: pause trading (set `market_params.trading_enabled = false`, check in RPC)
- [ ] Know how to: roll back a bad migration (`supabase db remote commit` history)

## Economic Integrity

- [ ] `check-invariants.ts` runs clean on production data before launch
- [ ] `check-invariants.ts` scheduled as daily cron
- [ ] Manual check: 5 test accounts, verify `SUM(ledger) == balance` for each
- [ ] Manual check: all `holdings.shares >= 0`
- [ ] Manual check: no `current_price` below minimum (100)

---

## Phase 2 items (🔵 — NOT for MVP, here as reminders)

- [ ] 🔵 Stripe payment integration (PCI compliance via Stripe — never touch card data)
- [ ] 🔵 KYC/AML provider integration
- [ ] 🔵 Age verification (+18)
- [ ] 🔵 Responsible gambling features (deposit limits, self-exclusion)
- [ ] 🔵 Penetration test before opening real-money features
- [ ] 🔵 Privacy policy + terms of service (for real money jurisdiction compliance)
- [ ] 🔵 GDPR/data deletion flow

---

## How to test RLS manually

```sql
-- Test as anonymous user
SET ROLE anon;
SELECT * FROM players LIMIT 5;           -- should work
SELECT * FROM wallet_ledger LIMIT 5;     -- should return 0 rows or error
INSERT INTO players (full_name) VALUES ('test'); -- should fail
RESET ROLE;

-- Test as authenticated user (replace UUID)
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"USER_UUID","role":"authenticated"}';
SELECT * FROM wallet_ledger WHERE user_id = 'USER_UUID';  -- should work
SELECT * FROM wallet_ledger WHERE user_id = 'OTHER_UUID'; -- should return 0 rows
RESET ROLE;
```
