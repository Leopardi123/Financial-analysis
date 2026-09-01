# Compare · Pre Revenue — SSOT hardening after PR #513

Status: **ACTIVE / NOT READY TO MERGE**

This document is the handoff/source-of-truth for the follow-up work after PR #513. It exists so the work can be resumed safely in a new chat without reconstructing the audit from memory.

## Why this follow-up exists

PR #513 successfully moved most Compare · Pre Revenue calculations out of the React table and into Corporate-domain derivation. A post-merge audit against the live Viscaria view exposed that **"uses the Corporate engine" is not yet the same as "uses the same canonical Corporate metric/output"**.

The clearest example is Payback:

- Compare showed **3.2 years**.
- Corporate showed **5.2 years**.
- The Viscaria FCFF table itself implies about **3.6 years real payback from production start** when the full pre-production project deficit is repaid.

The discrepancy is not caused by Viscaria being `project_json_v2`. V2 and V3 compile into the same canonical engine-input shape. V3 adds stronger single-source/timeline/reconciliation validation, but a V3 project with the same 2025→2027 timeline can hit the same Corporate payback axis bug.

## Frozen decisions

### 1. Corporate Payback must be fixed before Compare consumes it

Canonical `Payback_real` must use one coherent calendar axis and one coherent FCFF series.

For a pre-revenue project, the intended definition is:

> Undiscounted elapsed time from production start until cumulative full-project FCFF has recovered the entire pre-production project deficit, using linear interpolation in the payback year.

For the currently displayed Viscaria table:

- pre-production FCFF through 2026: about `-353.874m USD`
- 2027 FCFF: about `-131.157m`
- 2028: `+113.101m`
- 2029: `+223.626m`
- 2030: `+257.973m`

This crosses zero during 2030 and gives about **3.6 years from production start 2027**.

The current Corporate 5.2-year result is produced by an axis mismatch: a `tp_main` derived on a valuation-year-rebased axis is applied to the full internal FCFF array. That must be eliminated.

### 2. Compare Payback must have exactly one Corporate source

Compare must not read root `snapshot.Payback_real_years` / `Payback_approx_years` when those fields belong to another metric family (`lista3aProjectEfficiency`).

After the Corporate fix, Compare must consume only the canonical Corporate Payback output. No Project fallback, JSON fallback, Lista3a fallback or local recomputation.

### 3. Duplicate/twin Payback semantics must be made impossible to confuse

Root project-efficiency payback and canonical Corporate payback currently coexist with near-identical names. The contract must make their scope/provenance explicit enough that a consumer cannot accidentally select the wrong one while still receiving a plausible number.

Acceptance requirement: source-path/provenance tests, not only numeric parity tests.

### 4. Compare and Corporate must share the same canonical snapshot-input resolver

Today both consumers call the Corporate snapshot endpoint, but they can assemble different inputs. This breaks strict SSOT even if both use the same engine.

The shared resolver must cover at least:

- current shares
- current cash
- current debt
- financing plan and project-specific financing plans
- manual extra shares
- manual/canonical metal-price context
- target currency / FX context
- discount rate / valuation year policy

Same company + same scenario + same persisted settings must produce the same Corporate snapshot inputs regardless of whether the consumer is Corporate or Compare.

### 5. Shares resolver must be single-source

Current Compare and Corporate share-resolution priority differs. Remove the Compare-specific priority and use one canonical resolver.

### 6. Cash/debt resolver must be single-source

Current Compare has its own cash/debt fallback logic. Replace it with the same canonical balance-sheet resolver used by Corporate.

### 7. Multi-project financing must be single-source

Compare and Corporate must not derive different global financing mixes from the same per-project settings. Financing construction belongs to the Corporate input layer, not the Compare UI.

The canonical default remains **100% equity / 0% debt** when no explicit financing plan exists. Provenance must continue to distinguish `DEFAULT`, `USER`, `COMPANY`, and `REPORT` where available.

### 8. Manual metal-price context must be shared

If Corporate uses a manual/canonical metal-price override, Compare must use the same price context. Compare must never silently run a different spot/fallback deck.

### 9. Peak 6x / price must come from the canonical Corporate valuation source

Compare currently derives Peak 6x from `corporateValuationTimeSeries`, while the system also has `canonicalValuationTimeline`.

The follow-up must determine and lock one authoritative Corporate valuation source. Compare must consume a precomputed Corporate output; it must not select from a parallel valuation implementation.

Sorting on this column must use **the multiple `peak6xOverCurrentPrice`**, not the absolute per-share value shown in the same cell.

### 10. Target / price must come from the canonical Corporate valuation source

Compare currently selects target from `modeledValuationTimeline.markers`. This must be reconciled with the canonical Corporate valuation timeline and reduced to one source.

Sorting on this column must use **the multiple `targetOverCurrentPrice`**, not the target-price amount shown in the same cell.

`Annualized return → production` inherits the same target node and must therefore use the same canonical source.

### 11. EV / LOM Eq is quarantined

**Decision: the Compare `EV / LOM Eq` column must display exactly `n/a` until a separate EV-definition audit is completed.**

Reason: the current Corporate EV basis mixes current market capitalization with post-financing cash/debt. The same enterprise/equity-basis ambiguity previously forced Corporate EV/NAV into quarantine. We are not reopening that rabbit hole in this PR.

Requirements:

- keep the column visible so the intended metric is not forgotten;
- display `n/a` for every company/reference metal;
- do not rank/sort companies economically on this quarantined metric;
- do not silently substitute MCap, current EV, post-financing EV, or any other proxy;
- do not mark the metric verified until the separate EV audit explicitly approves a definition.

### 12. Eq / share changes to 10-year Eq / share

Current implementation uses `LOM Eq / post-financing shares`.

New canonical Compare definition:

> `10y Eq / canonical post-financing fully-adjusted shares`

This applies to every reference metal: AuEq/share, CuEq/share, AgEq/share, ZnEq/share, etc.

The Corporate-derived output should be renamed to make the basis unambiguous, e.g. `tenYearEqPerShare`. Do not retain a misleading `lomEqPerShare` alias as an active competing input.

### 13. Every Compare metric header must be discretely clickable for sorting

All column headers in Compare · Pre Revenue must be clickable without an underline or visually loud link treatment.

Clicking a numeric metric header must rank the **most investable value first by default**.

Default investment direction:

| Column | Most investable first |
| --- | --- |
| P/NAV PF | lower |
| Peak 6x / price | higher **multiple** |
| Target / price | higher **multiple** |
| Annualized return → production | higher |
| IRR | higher |
| Payback | lower |
| LOM | higher |
| Initial CAPEX | lower |
| CAPEX / annual Eq | lower |
| Annual Eq | higher |
| 10y Eq | higher |
| LOM Eq | higher |
| 10y Eq / share | higher |
| MCap / 10y Eq | lower |
| MCap / LOM Eq | lower |
| EV / LOM Eq | **no economic sorting while quarantined** |

For non-economic identity/navigation columns such as Company/Ticker/Project, alphabetical sorting is acceptable; there is no valid "most investable" direction.

Missing / `n/a` values must sort below finite verified values by default.

### 14. LOM wording must match the locked definition

Canonical Compare LOM is the chronological annual span from the first period with positive physical payable production in any metal through the last such period, inclusive. Explicit zero-production gaps inside the span remain part of LOM; closure after the final payable-production period does not.

Tooltips/help text must not describe this merely as a count of positive production years.

### 15. Cross-view regression replaces old Compare-to-Compare parity as the key guard

PR #513 parity tests proved that new Compare reproduced old Compare. That was useful for migration, but it did not prove that Compare matched the Corporate UI/source path.

New regression requirements:

- Compare Payback == canonical Corporate Payback for the same snapshot/input;
- Compare IRR == canonical Corporate IRR;
- Compare P/NAV PF == canonical Corporate P/NAV PF under the same share/price inputs;
- Compare valuation metrics select the same canonical valuation nodes as Corporate;
- source/provenance path is asserted so a numerically similar fallback cannot pass unnoticed;
- Viscaria becomes the first regression case for the payback axis issue.

## Column-by-column status at start of this PR

Tier and Investment Score are intentionally excluded from this PR's semantic audit; they have their own workstream.

| Compare column | Start status | Follow-up |
| --- | --- | --- |
| P/NAV PF | Corporate-derived, definition acceptable | enforce shared snapshot inputs and cross-view test |
| Peak 6x / price | Corporate-generated but parallel valuation source | canonicalize source |
| Target / price | Corporate-generated but parallel valuation source | canonicalize source |
| Annualized return → production | inherits Target source | canonicalize with Target |
| IRR | correct Corporate source path | enforce same snapshot inputs/cross-view test |
| Payback | **wrong Corporate metric family + canonical Corporate axis bug** | fix both P0 issues |
| LOM | Corporate-derived physical production span | fix wording/tests only |
| Initial CAPEX | Corporate-derived next-production-milestone incremental CAPEX | keep definition; cross-view provenance test |
| CAPEX / annual Eq | Corporate-derived | inherits canonical CAPEX/Eq |
| Annual Eq | Corporate-derived | keep |
| 10y Eq | Corporate-derived | keep |
| LOM Eq | Corporate-derived | keep |
| Eq / share | currently LOM Eq/share | **change to 10y Eq/share** |
| MCap / 10y Eq | Corporate-derived | enforce shared market inputs |
| MCap / LOM Eq | Corporate-derived | enforce shared market inputs |
| EV / LOM Eq | unresolved EV basis | **quarantine as `n/a`** |

## Implementation order

1. Add failing regression coverage for Viscaria payback and Corporate/Compare source paths.
2. Fix Corporate payback calendar-axis semantics first.
3. Point Compare Payback to only that canonical Corporate output.
4. Introduce one shared Corporate snapshot-input resolver and remove Compare-specific shares/cash/debt/financing/price assembly.
5. Canonicalize Peak 6x / Target / annualized-return valuation source.
6. Change Eq/share to 10y Eq/share.
7. Quarantine EV/LOM Eq as literal `n/a`.
8. Add discreet clickable metric-header sorting with investment-direction defaults.
9. Correct help/tooltips (especially LOM, Eq/share, EV quarantine).
10. Run real-project cross-view regression and full build before merge.

## Non-goals

- Do not redesign Tier or Investment Score in this PR.
- Do not solve the EV definition in this PR.
- Do not migrate Viscaria from V2 to V3 as a substitute for fixing the payback bug.
- Do not invent prices, financing, FX, project periods or fallback values.
- Do not weaken V3 reconciliation gates.

## Merge gate

This PR is **not mergeable by policy** until:

1. Viscaria real payback is reproduced from one coherent Corporate FCFF/timeline and the displayed Corporate/Compare value agrees.
2. Compare uses the same canonical Corporate input resolver as Corporate.
3. No Compare-local shares/cash/debt/financing/metal-price economic fallback remains.
4. Peak 6x and Target are reconciled to one authoritative Corporate valuation source.
5. Eq/share is 10y Eq/share.
6. EV/LOM Eq is `n/a` everywhere.
7. Header sorting obeys the investment-direction table above.
8. Cross-view source-path tests and full regression/build pass.
