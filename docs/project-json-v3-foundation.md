# project_json_v3 foundation

## Goal

`project_json_v3` makes the data consumed by the Project engine the single economic source of truth. Corporate aggregates Project outputs, and Compare Stocks / Pre revenue consume the same canonical project calculation rather than a parallel report-cost or report-FCFF ledger.

The canonical economic timeline is **relative project time**, not fixed calendar time. Company guidance can move construction/production in the calendar without rewriting or shifting the mine-plan economic arrays.

## Time model: relative economics + movable runtime placement

- `time.masterN` defines relative periods `t=0..masterN`.
- `time.productionStartPeriod` identifies the relative period where production/ramp-up starts.
- `time.phaseByPeriod[]` maps construction, ramp-up, operations and closure/post-production on that same relative axis.
- `time.reportPeriodLabels[]` is optional report evidence (for example `-3,-2,-1,1,2...`). It is not a calendar and must not be invented when the report does not disclose labels.
- `time.runtimePlacement.productionStartYear` is the current company-guided calendar anchor used by Project, Corporate and Compare Stocks. It is source-mapped separately from the technical-report economics.
- V3 explicitly forbids `time.periodEndDatesUtc` and root-level `time.productionStartYear` because those would bind the economic source of truth to one calendar placement.

If the company later moves expected production start from, for example, 2031 to 2033, update only `runtimePlacement.productionStartYear` (and its source/as-of metadata). Do **not** shift production, CAPEX, OPEX, sustaining, WC or closure arrays unless the underlying mine plan/economic study changes.

Report reconciliation is calendar-independent. It runs on relative period order and the report discount convention; `runtimePlacement` is deliberately not required for reconciliation.

## Hard rules

- The relative period count/order, `productionStartPeriod`, `phaseByPeriod[]` and report labels when disclosed must match the technical report economic model exactly.
- Each economic category is XOR: aggregate or components; royalty rules or locked series; flat-rate tax or locked tax series.
- `UNKNOWN` is a draft placeholder only. A document with any UNKNOWN economic mode is deliberately not runtime-valid.
- V3 forbids legacy parallel roots such as `series`, `economicsBreakdown`, `takeItems` and `priceOverrides`.
- By-product revenue is represented once through metal revenue. V3 has no separate `byproductCreditsUSD` project-income input.
- Selling/off-site costs are first-class Project-engine costs, separate from site OPEX.
- `verification.report` stores report checkpoints and assumptions, not a second cash-flow ledger. Full `reportPreTaxFCF_USD` / `reportPostTaxFCF_USD` arrays are explicitly forbidden.
- `verification.reportedCostCheckpoints` is an oracle/evidence layer only. It never overrides Project/Corporate/Tier economics.

## Filling contract

The blank V3 template is intentionally a non-runnable draft. It contains detailed `_how_to_fill`, `_single_source_rules`, `_calendar_placement_rule`, `_null_vs_zero`, `_report_reconciliation_hard_checks` and `_mapping_examples` instructions inside the JSON itself so copied templates carry the contract with them.

The most important rules are:

1. Build the relative technical-report axis first. Do not invent calendar years as part of the mine-plan economics.
2. Keep every economic/physical array fixed on relative index `t=0..masterN`. A later schedule change is not a reason to shift arrays.
3. Map the current company schedule only through `runtimePlacement`, with source provenance. Normal Project/Corporate/Compare Stocks runtime requires this placement.
4. `null` means unknown/unverified. `0` means explicitly zero or verified not applicable. Missing data must never be converted to zero merely to make the engine run.
5. The blank template assumes no metal and no API price key. Price keys are runtime API-series identifiers and must be verified rather than guessed.
6. Site OPEX, selling/off-site, royalty and tax each have exactly one source. If report detail is insufficient for decomposition, use the truthful aggregate representation; do not fabricate components.
7. By-product revenue is represented once as metal revenue. Net-by-product C1/AISC treatment is derived from that revenue, not stored as a second project income stream.
8. CAPEX, sustaining, closure, WC and terminal proceeds must remain in their report-relative periods. Do not move terminal items to force NPV agreement.
9. A LOM average is not an annual schedule. Do not repeat/interpolate it across periods unless the report explicitly defines that treatment.
10. Runnable/schema-valid does not mean report-verified. `VERIFIED` requires the same Project engine to reproduce report NPV/IRR at the report deck within tolerance and every required hard check to pass.

## Report reconciliation

`reconcileProjectJsonV3ToReport()` parses the same V3 economics used by runtime but allows the calendar placement to be absent. It hard-checks relative period structure, report price keys, supplied CAPEX/closure/WC/terminal checkpoints, resolves the exact report deck, runs `computeProjectEngineFullProductionV1`, and computes NPV/IRR from that engine FCFF.

`VERIFIED` requires every hard check plus NPV/IRR tolerance to pass. No report-FCFF array and no runtime calendar date can make a project appear reconciled without the Project engine itself reproducing the report economics.

## Project / Corporate / Compare Stocks Pre revenue

- V2 and V3 both compile to the existing `ParsedProjectJsonV1` / `ProjectEngineFullProductionV1Input` boundary; there is no second V3 economics engine.
- V3 normal runtime requires `time.runtimePlacement.productionStartYear` and derives calendar years from the relative `productionStartPeriod`.
- Inline Project snapshot requests use the same V3 parser and therefore the same placement rule.
- Corporate symbol mode loads stored projects and uses the same version-dispatching project parser.
- Tier / Compare Stocks Pre revenue uses the same project parser and engine for spot and cycle runs.
- Changing only `runtimePlacement.productionStartYear` must change calendar display/valuation timing but must not mutate the relative project FCFF series.
- Reported C1/AISC is exposed as checkpoint evidence only. It cannot replace the canonical engine-derived cost gate.

## Editor and migration

The Company Projects route preserves the complete Legacy v2 editor and adds an explicit `Canonical v3` editor mode. The V3 editor can create/copy the deliberately unresolved blank template. `UNKNOWN` economic modes must be resolved from the technical report and a sourced `runtimePlacement` supplied before the normal Project/Corporate/Compare Stocks runtime accepts the project.

There is deliberately no automatic v2->v3 semantic converter: report economics and current company schedule must be mapped project by project. A schedule update later should normally update only `runtimePlacement`, not rebuild the economic JSON.

Saving a V3 project means runtime/schema-valid only. No live project should be labelled `VERIFIED` until the calendar-independent report-deck reconciliation runner reproduces the technical report NPV/IRR and all mandatory hard checks pass.
