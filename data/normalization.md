# Player Value Normalization

Maps real-world market values (Transfermarkt-style, public estimates) to FX coin scale.

## Formula

```
base_value = max(1_000, min(500_000, round(real_value_EUR_millions × 2_500)))
```

- **Floor:** 1,000 FX coins (very low-profile players)
- **Ceiling:** 500,000 FX coins (~€200M+ elite stars)
- **Source data:** public football market value estimates (late 2025)
- **Important:** real values are NOT republished in the UI — `base_value` is an
  internal calibration seed only. The source data citation is for auditability.

## Worked examples

| Player | Real value (approx €M) | Formula | base_value |
|---|---|---|---|
| Kylian Mbappé | €180M | 180 × 2,500 | 450,000 |
| Vinícius Jr | €180M | 180 × 2,500 | 450,000 |
| Pedri | ~€112M | 112 × 2,500 | 280,000 |
| Bukayo Saka | ~€88M | 88 × 2,500 | 220,000 |
| Alejandro Garnacho | ~€48M | 48 × 2,500 | 120,000 → 28,000* |

*Garnacho is seeded at 28,000 (prospect tier illustrative) in `data/players.csv`.
For the production ~200-player seed, use the formula directly. Example values in
the CSV demonstrate the pipeline, not final production values.

## Tier assignment guide

| tier | typical real value | typical FX range | count (~) |
|---|---|---|---|
| `star` | ≥ €100M | ≥ 250,000 | 30 |
| `starter` | €20M–€100M | 50,000–250,000 | 120 |
| `prospect` | €2M–€30M | 5,000–75,000 | 50 |

Tier controls **liquidity** (slippage per trade), not absolute value ranking.
A €40M player seeded as `prospect` is more volatile than a €40M `starter`.
Use `prospect` for young unproven players (<23) regardless of current market value.

## Production seed checklist

- [ ] Export ~200 players from `data/players.csv` (6 per team × 32 seeded teams)
- [ ] Cross-reference real values from public sources (do NOT scrape Transfermarkt ToS)
- [ ] Apply formula; manual review for stars/prospects boundary cases
- [ ] Run `pnpm map-api-ids` and fill in `api_player_id` / `api_team_id`
- [ ] `pnpm seed` → verify count report matches expected
