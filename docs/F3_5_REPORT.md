# F3.5 — Live Engine Test Report

**Date:** 2026-06-13 (run on the LOCAL stack)
**Tester:** F3.5 gate, manual end-to-end against real API-Football data
**Verdict:** ✅ PASS — engine survived real data end-to-end with zero errors, exact
spec-compliant magnitudes, perfect idempotency, and clean invariants. **No bugs found,
no code changed.**

> Environment note: this run targeted the **LOCAL** Supabase stack (`.env.local` →
> `http://127.0.0.1:54321`), with the `ingest`/`tick` functions served locally via
> `supabase functions serve`. Production already ran a narrower version of this test on
> 2026-06-12 (see `docs/F3.5-live-test.md`); this is the full, gated local reproduction
> against a fresh, high-event fixture.

---

## Fixture used

| Field | Value |
|---|---|
| Fixture ID | **1489370** |
| Match | **USA 4 – 1 Paraguay** |
| Round | Group Stage - 1 (`rounds.sort_order = 1`, non-knockout) |
| Status | FT |
| Raw events | 21 (4 normal goals, 1 own goal, 6 yellows, 1 Var-disallowed, 9 substitutions) |
| Priceable sub-events | 15 (after mapping API events → engine codes) |

Chosen as the highest-event finished group match in the last 48h, and the runbook's
designated primary test. It exercises goals, assists, yellows, an own goal, a brace, a
VAR-disallowed goal, and extra-time minute keying — a genuinely rich payload.

---

## Player mapping (Step 2)

`pnpm map-api-players --top 50` ran against the live API (17 squad calls, one per team
of the 28 unmapped top-value players).

- **Auto-mapped: 0 of 28.** All 28 went to `data/api-player-mapping-review.csv`.
- **Root cause (not a bug):** the `/players/squads` endpoint now returns **abbreviated
  first names** (`A. Robinson`, `M. Sarr`, `R. Araújo`). The matcher caps an
  abbreviated-vs-full match at score 60 (shared surname), below the 80 auto-apply
  threshold. Worse, many surnames are shared by two squad members (`M. Sarr`/`P. Sarr`,
  `R. Araújo`/`M. Araújo`, `E. Martínez`/`Lisandro Martínez`), so auto-mapping would risk
  selecting the wrong player. The script correctly refused all 28.
- **Applied to DB: none** (zero unambiguous matches qualified). This matches the runbook's
  note that the 28 required manual identity verification via `/players/profiles`.

### Blind spots in this fixture (unmapped → skipped)

Of the **14 distinct priceable participants**, only **5 are mapped** in the local DB:

| Mapped (priced) | api_id | event(s) |
|---|---|---|
| Folarin Balogun | 138835 | goal 31', goal 45'+5 (brace) |
| Christian Pulisic | 17 | assist 31' |
| Miguel Almirón | 2507 | yellow 53' |
| Tyler Adams | 1150 | yellow 59' |
| Julio Enciso | 70747 | assist 73' |

**9 unmapped priceable participants** (skipped + logged): Bobadilla (own goal 7'),
J. Caceres (yel 10'), Tillman (assist 45'), Mauricio (goal 73'), D. Gomez (yel 79'),
A. Arce (yel 88'), J. Alonso (yel 90'), G. Reyna (goal 90'), A. Freeman (assist 90').

This is a **data-coverage gap, not an engine fault**: local is 185/213 mapped vs prod's
213/213. The unmapped events were correctly skipped, never guessed, never orphaned.

---

## Counts at each step

### Step 3 — fixture insert
1 row into `matches` (USA home, Paraguay away, kickoff 2026-06-13 01:00 UTC, status FT,
processed=false). Verified.

### Step 4 — ingest (single run)
`{ matches_polled: 1, events_inserted: 6, events_skipped_unmapped: 9, matches_finalized: 1, group_exits_applied: 0, errors: [] }`

| Metric | Result |
|---|---|
| `match_events` inserted | **6** (mapped players only) |
| Events skipped (unmapped) | **9** (all logged `skip event: unmapped api_player_id=…`) |
| `pending_price_deltas` enqueued | **6** (`applied_pct = 0`) |
| `matches.processed` → true | **1** (score 4–1 persisted to home/away_goals) |
| Errors / crashes | **0** |

**fair_value before → after (exact to MARKET_ENGINE.md §1.2/§1.4):**

| Player | Before | After | Δ | Expected |
|---|---|---|---|---|
| Pulisic | 137500 | 144375 | +5.00% | assist +5% ✓ |
| Adams | 45000 | 43650 | −3.00% | yellow −3% ✓ |
| Almirón | 20000 | 19400 | −3.00% | yellow −3% ✓ |
| Enciso | 55000 | 57750 | +5.00% | assist +5% ✓ |
| Balogun | 62500 | 72900 | +16.64% | goal ×2 → ×1.08² ✓ |

Notable: Balogun's brace produced two distinct `api_event_key`s
(`…:138835:goal:normal_goal:31:0` and `…:138835:goal:normal_goal:45:5`) — disambiguated
by minute+extra-time, no collision. Enciso's assist priced even though the goal's scorer
(Mauricio) is unmapped, confirming per-sub-event independence.

### Step 5 — tick ×3 (60s apart)

| Tick | Response | deltas remaining | price_history total |
|---|---|---|---|
| #1 | `{deltas_deleted:6, players_updated:5, players_skipped:0}` | 0 | 5 |
| #2 | `{players_updated:0, players_skipped:0, deltas_deleted:0}` | 0 | 5 |
| #3 | `{players_updated:0, players_skipped:0, deltas_deleted:0}` | 0 | 5 |

After tick #1, every `current_price` landed **exactly** on its new `fair_value`
(144375 / 43650 / 19400 / 57750 / 72900) and all 6 deltas were deleted. The 5
`price_history` rows share one `captured_at` (reason `tick`) — one combined snapshot per
tick, as specified. Ticks #2–#3 were clean no-ops: consumed drip was **not replayed**.

**Timing caveat (expected, not a bug):** ~3.5 min of wall-clock elapsed between ingest
and the first tick (the manual Step-4 review gate). Because the drip is wall-clock-based
(§2.2, "robust to missed/uneven ticks"), `progress` had already reached 1, so tick #1
applied the **full** drip in one shot rather than showing gradual per-tick `applied_pct`
progression (0 → partial → 1). The total was applied **exactly** (Balogun telescoped to
×1.1664), and the end state matches the gate's assertion (deltas empty, P → V). The
gradual telescoping across many ticks is covered by the `tick-core` unit tests. To
observe the gradual drip live, run the three ticks within 3 minutes of ingest.

### Step 6 — invariants
- `pnpm check-invariants`: **All invariants hold** (213 players checked;
  ledger-sum, holdings≥0, price-floor, balance_after, shares-drift). 0 violations.
- Duplicate `api_event_key`: **0**.
- Per-event fair_value change within ±25%: **yes** (goal 0.08, assist 0.05, yellow −0.03).
- `current_price` below 100 floor: **0** (system min = 1000).
- `price_history` represents the fixture's affected players: **yes** (5 rows, reason `tick`).

### Step 7 — idempotency
- **Naive re-ingest** (match still `processed=true`): `matches_polled: 0` — match-level
  guard, no work.
- **Forced re-ingest** (reset `processed=false`, re-fetched events):
  `{ matches_polled: 1, events_inserted: 0, events_skipped_unmapped: 9, matches_finalized: 1, errors: [] }`
  — all 6 events conflicted on `api_event_key` (`ON CONFLICT DO NOTHING`, RPC returns
  `inserted:false` **before** any fair_value/delta write).
- **Result:** `match_events` 6 → 6, `pending_price_deltas` 0 → 0, fair_value fingerprint
  **byte-identical** (`59701a0c…` == `59701a0c…`). Zero new rows, zero price movement.

---

## API-Football edge cases observed

1. **Own goal attribution.** The own goal (7') is attributed by the API to the
   *benefiting* team (USA) while `player.id` is the *scorer* (Paraguay's Bobadilla).
   `mapApiEvent` correctly prices `own_goal` against `player.id`. (Bobadilla is unmapped
   here, so it was skipped — but the mapping logic is correct.)
2. **Null `assist.id`.** Several normal goals and the own goal carry `assist: {id:null}`.
   Handled — no spurious assist sub-event emitted.
3. **VAR-disallowed goal.** A `type:"Var"`, `detail:"Goal Disallowed - offside"` event
   (Balogun, 28') correctly produced **no** priced sub-event.
4. **Extra-time minute keying.** The 45'+5 goal carried `time.extra = 5`, keyed as
   `…:45:5` — distinct from a hypothetical `45:0`. Extra-time disambiguation works on real
   data.
5. **`comments` field.** Yellow cards carried tactical comments (`"Tripping"`), not
   `"Penalty Shootout"` — so the shootout guard correctly did **not** fire.
6. **Substitutions / 9-event noise.** 9 of 21 events (substitutions) mapped to nothing and
   were ignored without error.

### Tooling edge case (local only — NOT an engine bug)
The local edge runtime injects the **legacy JWT** `SUPABASE_SERVICE_ROLE_KEY` (`eyJ…`),
whereas `.env.local` uses the new `sb_secret_…` format. As a result `pnpm trigger-fn
ingest` returns **401** locally; the function had to be POSTed with the container's
injected legacy JWT as the bearer. In production the cron's service key matches the
function env, so this does not occur. Worth a note so the next operator isn't misled —
the function's auth check is correct; only the local key formats differ.

---

## Paths NOT exercised by this real fixture (still synthetic-test-only)

- **Same-minute brace `#N` suffix** (`createEventKeyBuilder`): Balogun's two goals were at
  different minutes, so the positional suffix path wasn't hit. Two goals in the *same*
  minute+extra would exercise it.
- **Penalty shootout kicks** (`shootout_kick`, unpriced): no shootout in a group match.
- **Knockout survival multiplier** (×1.15 / ×0.50) and **group-exit completion** (needs a
  full 6-match group): only one match present, so `group_exits_applied: 0` (correct).
- **Lineup-based FT events** (`clean_sheet_*`, `motm`, `injury_out`): deferred F3.6 item.

---

## Recommendation

**The pricing engine is READY for production launch.** The full real-data path —
`ingest → fair_value → pending_price_deltas → tick → price_history` — survived a 21-event
real fixture with zero errors, magnitudes exact to the spec, drip telescoping exact,
idempotency byte-perfect on re-ingest, and all invariants clean. The skip path for
unmapped players is safe (skip + log, never guess, never orphan).

**Pre-launch caveats (data/coverage, not engine):**
1. **Player mapping in the target environment must be 213/213.** This local run was
   185/213, so 9 of 14 fixture participants were skipped. Prod is reportedly 213/213
   (runbook) — re-verify it covers every squad of competing teams, since the abbreviated
   squad names defeat auto-mapping and require `/players/profiles` identity checks.
2. **Re-run this gate against a knockout fixture** once the bracket settles, to exercise
   the survival multiplier, penalty-shootout kicks, and the same-minute brace `#N` path
   against real data (all currently synthetic-test-only).
3. **F3.6 group-exit completion and lineup FT events** remain open and are required before
   the group stage concludes.
