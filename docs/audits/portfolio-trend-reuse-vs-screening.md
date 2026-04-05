# Audit Portfolio Trend Reuse vs Screening Pipeline

Date: 2026-04-05  
Branch: `audit/portfolio-trend-vs-screening`

## Scope audited

- Screening price pipeline (`daily_price_history`, `price_screen_snapshot`, snapshot engine, refresh route).
- Portfolio trend/history pipeline (`portfolio_history_daily`, `total_portfolio_history_daily`, trend computation).
- Symbol mapping path from `portfolio_positions.symbol` to `daily_price_history.symbol`.

## Executive findings

1. **Portfolio trend already reuses `daily_price_history` as its primary raw history source** (via `positions_price_history`).
2. **Portfolio trend does *not* reuse screening-derived momentum/trend tables (`price_screen_snapshot`) or snapshot helper outputs.**
3. The two systems currently run **parallel history-metric logic**:
   - Screening computes per-symbol return/drawdown/trend/recovery in `price_screen_snapshot`.
   - Portfolio recomputes returns/trend from aggregated portfolio market value series.
4. **Most likely root cause of `unavailable/partial` trend is not missing trend formulas, but missing symbol-to-history coverage at holdings level**, causing fallback to snapshot-only history with too few days.
5. Environment limitation: this container has no `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`, so live holdings-level coverage could not be executed here.

---

## A) Reuse matrix

| Dataset / helper | Used by Screening | Used by Portfolio | Should Portfolio reuse? | Notes |
|---|---:|---:|---:|---|
| `daily_price_history` | Yes | Yes | Yes (already) | Common canonical raw price store. |
| `price_screen_snapshot` (return_5d/20d/60d, drawdown_20d/60d/252d, trend_state, recovery_state) | Yes | No | **Partially** (for per-holding diagnostics only) | Not a direct replacement for portfolio-level aggregate trend, but useful to avoid duplicated per-symbol metric code. |
| `computePriceScreenSnapshot` helper | Yes | No | Maybe (for optional per-position enrichment) | Portfolio trend currently uses portfolio value series logic, not symbol snapshot logic. |
| `portfolio_history_daily` | No | Yes | N/A | Portfolio-specific aggregation output table. |
| `total_portfolio_history_daily` | No | Yes | N/A | Portfolio-of-portfolios aggregate history table. |

---

## B) Evidence by layer

### 1) Screening pipeline evidence

- Schema declares `daily_price_history` and `price_screen_snapshot` with return/drawdown/trend fields.  
- Screening ingest writes `daily_price_history`, then computes and upserts `price_screen_snapshot`.  
- `computePriceScreenSnapshot` calculates return windows, drawdowns, MA-based `trend_state`, and `recovery_state`.

### 2) Portfolio trend pipeline evidence

- Portfolio history builder loads per-position prices from `daily_price_history` (`loadPortfolioHistorySeriesFromPositionsPriceHistory`).
- It aggregates position-level value into a portfolio time series, writes `portfolio_history_daily`, then aggregates totals into `total_portfolio_history_daily`.
- Trend status is recomputed from portfolio-level returns (20/65/200-day) using dedicated portfolio logic.
- No read from `price_screen_snapshot` in portfolio trend build path.

### 3) Symbol/mapping evidence

- Portfolio position creation only uppercases symbol; it does not validate symbol exists in `companies_v2` or in `daily_price_history`.
- Screening refresh target symbols are sourced from `companies_v2.ticker` only.
- Therefore, position symbols can diverge from screening universe and miss history coverage even if “equivalent” instrument exists under different ticker formatting.

---

## C) Coverage check for current holdings

## Status

I attempted to query live holdings + history coverage, but DB credentials are not present in this environment:

- Command attempted: `node -e "import('./api/_db.js').then(async m=>{const r=await m.query('SELECT 1 as x'); console.log(r);})"`
- Result: `TURSO_DATABASE_URL is not set`

Because of this, I could not produce holdings-by-symbol live table for:
- has `daily_price_history`
- has `price_screen_snapshot`
- enough days for 20/65/200
- theoretically computable trend

## Query pack to run in a credentialed environment

Use this exact query set to produce the required holdings coverage matrix:

```sql
-- 1) Active holdings
WITH active_positions AS (
  SELECT DISTINCT
    p.portfolio_id,
    UPPER(TRIM(p.symbol)) AS symbol
  FROM portfolio_positions p
  WHERE COALESCE(p.active_position, 1) = 1
    AND COALESCE(TRIM(p.symbol), '') <> ''
)
SELECT * FROM active_positions ORDER BY portfolio_id, symbol;

-- 2) Per-symbol coverage
WITH active_positions AS (
  SELECT DISTINCT UPPER(TRIM(p.symbol)) AS symbol
  FROM portfolio_positions p
  WHERE COALESCE(p.active_position, 1) = 1
    AND COALESCE(TRIM(p.symbol), '') <> ''
),
price_hist AS (
  SELECT symbol, COUNT(*) AS hist_days
  FROM daily_price_history
  GROUP BY symbol
),
snap AS (
  SELECT symbol, 1 AS has_snapshot
  FROM price_screen_snapshot
)
SELECT
  a.symbol,
  COALESCE(h.hist_days, 0) AS hist_days,
  CASE WHEN COALESCE(h.hist_days, 0) >= 21 THEN 1 ELSE 0 END AS enough_20d,
  CASE WHEN COALESCE(h.hist_days, 0) >= 66 THEN 1 ELSE 0 END AS enough_65d,
  CASE WHEN COALESCE(h.hist_days, 0) >= 201 THEN 1 ELSE 0 END AS enough_200d,
  CASE WHEN s.has_snapshot = 1 THEN 1 ELSE 0 END AS has_screen_snapshot
FROM active_positions a
LEFT JOIN price_hist h ON h.symbol = a.symbol
LEFT JOIN snap s ON s.symbol = a.symbol
ORDER BY a.symbol;
```

---

## D) Root-cause statement (concise)

**Trend is unavailable/partial primarily because portfolio trend depends on portfolio holdings mapping to `daily_price_history`, but holdings symbols are not constrained to the screening universe (`companies_v2`) and are not normalized beyond uppercase; when symbol coverage is missing, portfolio history falls back to snapshot-derived/estimated paths with insufficient day depth, resulting in `unavailable` or `partial` trend.**

(Secondary observation: Screening momentum tables are not reused, so there is avoidable duplication in per-symbol history metrics, but that is not the primary blocker for portfolio trend availability.)

---

## E) Recommended minimal next patch (narrow)

1. **Add a symbol-resolution bridge for portfolio positions** before portfolio history build:
   - Resolve `portfolio_positions.symbol` to canonical ticker used in `daily_price_history` / `companies_v2`.
   - Keep raw input symbol, but store/use resolved symbol for history joins.

2. **Add coverage diagnostics into build output/debug payload**:
   - per position: resolved symbol, history row count, first/last date, missing reason.
   - per portfolio: count of covered vs uncovered positions.

3. **Reuse screening snapshot only where semantics align**:
   - Optional: consume `price_screen_snapshot` for per-position trend badges/diagnostics.
   - Keep portfolio-level aggregate return/trend computation in `portfolio_history_daily`/`total_portfolio_history_daily`.

4. **Guardrail validation on position create/update**:
   - warn/fail when symbol cannot be matched to `companies_v2` and has no `daily_price_history`.

This keeps portfolio aggregation logic intact while eliminating avoidable symbol-coverage failures and reducing duplicated per-symbol metric logic.
