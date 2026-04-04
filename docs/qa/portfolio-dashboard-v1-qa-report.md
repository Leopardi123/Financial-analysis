# Portfolio Dashboard V1 — QA / Verification Pass

## 1) PASS / FAIL Summary
- **Overall:** PASS with narrow fixes applied.
- **Build/Typecheck:** PASS (`npm run build`).
- **Key risks:** No blocking schema or API wiring defects found after fixes.

## 2) Schema issues
- Verified schema coverage for V1 portfolio tables and snapshot enrichment fields through phased migrations.
- Verified required enum-carrying fields and status fields are present in the current migration flow.
- **Fix applied:** none required for table presence in this QA pass.

## 3) Validation issues
- Verified admin enum and band validation logic exists and blocks invalid create/update.
- Verified global target-weight validation severity bands align with spec and are advisory.
- Verified debug includes per-portfolio validation breakdown and global sum diagnostics.
- **Fix applied:** none in validation logic.

## 4) Calculation issues
- Snapshot/allocation, trend, risk, hedge, and dry powder code paths reviewed for deterministic threshold use.
- Verified included+active filters are used in total-level weight/risk/hedge aggregations.
- **Fix applied:** cleaned duplicate hedge union type member (no runtime change, improves consistency/readability).

## 5) Payload issues
- Overview endpoint shape verified to include `total`, `performance`, and `portfolios`.
- Sort order is respected from admin config in overview query.
- Missing signals are emitted as `null` (not dropped) for UI stability.
- **Fixes applied:**
  - `total.market_value` now returns `null` when no included market values are available (instead of misleading `0`).
  - `data_unavailable` warning now appears when no portfolio snapshot rows exist.

## 6) Debug issues
- Verified debug block is built from persisted production debug artifacts (`debug_payload_json`, `risk_debug_json`, `hedge_debug_json`) rather than an alternate model path.
- Verified global validation debug appears in overview debug mode.
- **Fix applied:** none required.

## 7) Graceful degradation issues
- Verified null-safe behavior in overview and component payloads.
- Verified missing macro/sector overlays do not block hedge computation and remain explainable via debug fields.
- Verified missing opportunistic portfolio yields `dry_powder_status = unavailable`.
- **Fix applied:** improved explicit `data_unavailable` signaling in overview with zero portfolios.

## 8) Fixes applied
1. Removed duplicate union member in hedge signal type.
2. Changed overview total market value to `null` when no valid included market values are available.
3. Added overview `data_unavailable` warning when snapshot set is empty.

## 9) Remaining TODOs (outside V1 scope)
- End-to-end fixture-based integration tests with deterministic sample datasets across phases.
- Optional lightweight dev inspector UI for overview/debug payload browsing.
- Performance optimization pass (reduce repeated cross-module reads) if runtime throughput demands it.
