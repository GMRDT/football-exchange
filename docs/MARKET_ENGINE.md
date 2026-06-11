# Football Exchange — Market Engine Specification

This document is the single source of truth for all pricing logic.
If the SQL implementation and the TypeScript implementation ever diverge, this doc wins.

---

## Overview: three forces

```
Fair Value V  ──────────────────────────────────────────────────┐
(fundamental anchor, driven by events + tournament survival)     │
                                                                  │ mean reversion
Market Price P ──────────────────────────────────────────────────┘
(what trades execute at, driven by supply/demand + reversion)
```

A player has two prices:
- **`fair_value` (V):** what the player is fundamentally "worth" based on performance
- **`current_price` (P):** what you actually pay/receive when trading

Mean reversion makes the market self-correcting: if P > V, price drifts down;
if P < V, price drifts up. This creates the "I know something the market doesn't"
dynamic — buying when P < V is rewarded when the market corrects.

---

## 1. Fair Value (V)

### 1.1 Initial seeding
`fair_value = base_value` (set once during seed, anchored to real market values)

`base_value` is normalized from public football market value data using:
```
base_value = round(raw_market_value_EUR / normalization_divisor)
```
Where `normalization_divisor` maps real values to the game's price scale (~1_000–500_000 FX coins).
The normalization table lives in `data/normalization.md` (created during seed phase).

### 1.2 Event-driven updates
When a match event occurs, `fair_value` updates immediately (not dripped):

```
perf_delta = event_types.default_perf_points  (from DB, tunable without deploy)
V(t+1) = V(t) × (1 + clamp(perf_delta × c, -0.15, +0.25))
```

Where:
- `c` = recency coefficient (MVP = 1.0 flat; improved post-launch with exponential decay)
- `clamp(-0.15, +0.25)` = per-event cap (prevents single event from destroying a value)

### 1.3 Tournament survival multiplier
Applied when a team advances or is eliminated (at match `FT` reconciliation):

```
survival_multiplier = 1.15  (team advances to next round)
survival_multiplier = 0.50  (team is eliminated)
V_new = V_current × survival_multiplier
```

Applied to ALL players of the affected team simultaneously.

### 1.4 Event points table (default values, all tunable in `event_types` table)

| event_code | description | default_perf_points |
|---|---|---|
| `goal` | Goal scored | +0.08 |
| `assist` | Assist | +0.05 |
| `yellow_card` | Yellow card | -0.03 |
| `red_card` | Red card | -0.12 |
| `penalty_scored` | Penalty scored | +0.06 |
| `penalty_missed` | Penalty missed | -0.08 |
| `own_goal` | Own goal | -0.10 |
| `clean_sheet_gk` | Goalkeeper clean sheet (90 min) | +0.06 |
| `clean_sheet_def` | Defender clean sheet (90 min) | +0.04 |
| `motm` | Man of the match | +0.07 |
| `injury_out` | Subbed off injured | -0.05 |

---

## 2. Market Price (P)

### 2.1 Trade-driven price impact (demand curve)
Executes inside `trade()` RPC, within the row lock.

**Buy of `n` shares:**
```
P(new) = P(current) + (n / L_tier) × k_d_tier
```

**Sell of `n` shares:**
```
P(new) = P(current) - (n / L_tier) × k_d_tier
```

Where `L_tier` and `k_d_tier` depend on `players.liquidity_tier`:

| tier | description | L | k_d |
|---|---|---|---|
| `star` | Top global players (~30) | 10_000 | 2.0 |
| `starter` | Regular starters (~120) | 4_000 | 2.5 |
| `prospect` | Young/unknown (~50) | 1_000 | 3.0 |

These live in `market_params.tier_params` (jsonb). Change without deploying.

**Minimum price:** `max(P_new, 100)` — prices cannot go below 100 FX coins.

### 2.2 Event-driven price drip (gradual P movement)
Events do NOT move P instantly (prevents TV arbitrage: polling lag is 30–60s).
Instead, the event queues a delta in `pending_price_deltas`:

```sql
INSERT INTO pending_price_deltas (player_id, remaining_pct, source_event_id)
VALUES (player_id, perf_delta × drip_pct_factor, event_id)
ON CONFLICT DO NOTHING
```

Each `tick()` call consumes a fraction:
```
fraction = remaining_pct / drip_steps_remaining
P(new) = P(current) + P(current) × fraction
remaining_pct = remaining_pct - fraction
```

Where `drip_minutes` = 3 (default, in `market_params`).
At tick interval of 60s, this means ~3 steps to fully apply the delta.

### 2.3 Mean reversion
Applied every `tick()` call:
```
P(new) = P(current) + (-λ × (P(current) - V(current)))
       = P(current) × (1 - λ) + V(current) × λ
```

Where `λ` (lambda) = **0.05** (default in `market_params`).

At λ=0.05 and tick every 60s:
- 50% reversion in ~14 ticks (~14 minutes)
- This is intentionally slow — preserves volatility and trading opportunity

**Do not raise λ above 0.15 without simulation.** Too-fast reversion kills the market.

---

## 3. Spread (execution cost)

### 3.1 Spread values
| condition | spread |
|---|---|
| Normal trading | `spread_base` = **1.0%** (0.01) |
| Player has match in progress | `spread_live` = **2.5%** (0.025) |

### 3.2 Execution prices
```
buy_price  = current_price × (1 + spread/2)
sell_price = current_price × (1 - spread/2)
```

The spread is NOT credited to any account. It's the economic sink (drains virtual currency).
This is intentional: it slows hyperinflation and rewards buy-and-hold over hyperactive trading.

### 3.3 How to determine "in-progress"
A player is "in live match" if there exists a row in `matches` where:
- `home_team_id = player.team_id OR away_team_id = player.team_id`
- `status IN ('1H', '2H', 'ET', 'P')` (API-Football status codes for live match)
- `kickoff_utc <= now() AND kickoff_utc >= now() - interval '3 hours'`

### 3.4 Exact accounting (as implemented in `trade()`)
All amounts are computed at 6 decimal places (`NUMERIC(20,6)`); `p_shares` is
normalized with `round(p_shares, 6)` BEFORE any arithmetic. Every intermediate
amount is rounded to 6 dp before use:

```
P_mid      = players.current_price                     (the mid price)
exec_price = round(P_mid × (1 + spread/2), 6)   (buy)
           = round(P_mid × (1 - spread/2), 6)   (sell)
gross      = round(shares × P_mid, 6)
fee        = round(shares × P_mid × spread/2, 6)
net        = gross + fee    (buy  → debited from cash_balance)
           = gross - fee    (sell → credited to cash_balance)
```

- `trades.price_per_share` stores `exec_price`; `gross`, `fee`, `net` are stored
  per trade.
- `wallet_ledger.delta` is `-net` (buy) / `+net` (sell), with `balance_after`
  maintained inside the same transaction.
- **The fee is a sink**: it is debited from the buyer (or withheld from the
  seller) and credited to NO account. This is the economy's only drain.
- Buy cost basis includes the fee: `new_avg = (old_shares × old_avg + net) /
  (old_shares + shares)`. Sells leave `avg_cost` untouched.

---

## 4. Circuit breakers (hard limits)

All checked in both `trade()` RPC and `tick()` function.

| limit | value | scope |
|---|---|---|
| Max price change per single event | **±25%** | per event delta |
| Max price change per day (all causes) | **±50%** | rolling 24h from price_history |
| Min price | **100 FX coins** | absolute |
| Max price | **10× base_value** | absolute |

These values live in `market_params.circuit_breakers` (jsonb).

---

## 5. Position limits (per-user, per-player)

| limit | value | note |
|---|---|---|
| Max position (cost basis) | **20% of 100_000 = 20_000** | checked at buy time |
| Max daily volume (cost basis) | **50_000** | per user per player per calendar day |
| Max order size | **500 shares** | single trade |

Live in `market_params.position_limits` (jsonb).

---

## 6. market_params table (single row)

```json
{
  "tier_params": {
    "star":     { "L": 10000, "k_d": 2.0 },
    "starter":  { "L": 4000,  "k_d": 2.5 },
    "prospect": { "L": 1000,  "k_d": 3.0 }
  },
  "lambda": 0.05,
  "spread_base": 0.01,
  "spread_live": 0.025,
  "drip_minutes": 3,
  "trading_enabled": true,
  "rate_limit_trades_per_min": 10,
  "circuit_breakers": {
    "max_event_pct": 0.25,
    "max_daily_pct": 0.50,
    "min_price": 100,
    "max_price_multiplier": 10
  },
  "position_limits": {
    "max_position_cost": 20000,
    "max_daily_volume": 50000,
    "max_order_size": 500
  }
}
```

---

## 7. Simulation targets (calibration before Jun 28)

Run `scripts/simulate-market.ts` against real fixture data to verify:

1. **Price stability:** after 7 days with no activity, `|P - V| / V < 5%`
2. **Star volatility:** star player goal → P moves ≤ 8% over 3 minutes (drip in action)
3. **Prospect volatility:** same event → P moves ≤ 18% (lower liquidity, expected)
4. **Arbitrage resistance:** buying right after seeing a goal on TV (30–60s delay)
   yields < 2% edge after spread — not profitable enough to automate
5. **Economy not deflationary:** after 100 simulated trades, total FX coins in system
   decreases by ≤ 2% (spread is the only sink; should be mild)

---

## 8. Implementation locations

| Logic | File | Notes |
|---|---|---|
| Pure formulas | `supabase/functions/_shared/market.ts` | No I/O, fully testable |
| Trade price impact | `supabase/migrations/XXXX_trade_function.sql` | Inside row lock, must be SQL |
| Event ingestion + V update | `supabase/functions/ingest/index.ts` | Calls market.ts |
| Price drip + reversion | `supabase/functions/tick/index.ts` | Calls market.ts |
| Parameters | `market_params` table (single row) | Runtime-tunable |
| Event points | `event_types` table | Runtime-tunable |
