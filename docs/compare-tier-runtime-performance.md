# Compare · Pre Revenue / Tier runtime performance

## Purpose

The Compare read path must not turn a normal table load into an uncached batch recalculation of the whole mining universe. This change is performance-only: canonical project economics, Tier policy, Investment Score policy and project_json reconciliation rules are unchanged.

## Runtime caching

Tier and Compare Corporate snapshots use a small Turso-backed JSON cache. Cache rows are keyed by namespace + company identity and guarded by an input fingerprint. A cache hit is therefore allowed only when the fingerprint matches.

The runtime fingerprint includes the current deployment revision, active project ids/json versions/update timestamps, and a 10-minute market/FX freshness bucket. Corporate additionally hashes the complete canonical snapshot request (market, balance sheet, financing, scenario, manual prices, etc.). Tier additionally includes the current UTC date for the historical cycle window.

The 10-minute freshness window matches the existing short-lived spot-resolution semantics; it is not a new long-lived price assumption. Project updates and code deployments invalidate immediately through the fingerprint. `refresh=1` bypasses the Tier response cache. Corporate uses caching only when the caller explicitly sends `cache=1`; Compare does so, while normal explicit refresh/debug workflows keep their existing behavior.

Response diagnostics expose `x-tier-runtime-cache` and `x-corporate-snapshot-runtime-cache` as HIT/MISS/BYPASS where applicable. Verified Tier GET responses also receive a short Vercel CDN cache header so repeated UI loads can avoid invoking a Function at all.

## Cycle stress deck

The historical 7-year / 6-month rolling / 3-separated-low-point stress-price calculation is persisted per price key and policy fingerprint. The in-process cache remains as a first layer. This prevents each company row from repeatedly reading and re-analysing the same Au/Ag/Cu/etc. history across serverless instances.

The 5-year classification and 7-year survival evaluations also reuse one base Corporate aggregation/NPV calculation. The two stress engine runs remain separate because they intentionally stress different production-window lengths.

## Browser fan-out

Tier and Investment Score continue to share one in-flight request per symbol. The browser no longer automatically reruns a full Tier calculation when the first result is `NOT_VERIFIED`; a later consumer may retry because `NOT_VERIFIED` remains non-sticky. Cross-symbol Tier requests are bounded to four concurrent requests instead of launching the entire universe at once.

Compare also reuses `corporateFinancingPreferences` already returned by `/api/company/profile`; it no longer calls the same profile endpoint a second time through `loadLiveCorporateFinancingState` for every company.

## Cold-miss boundary

A cold cache miss still runs Corporate and Tier as independent canonical pipelines. This PR deliberately does not refactor `runCorporateSnapshotPipeline` and the Tier engine into a single shared mutable prepared-project object, because doing that safely requires a deeper canonical-pipeline change and parity testing across Corporate pages, Compare, project views and stress/sensitivity paths. The materialized response caches remove that duplicate work on subsequent identical reads, while the next deeper refactor can be measured against the new HIT/MISS headers instead of being mixed into this change.
