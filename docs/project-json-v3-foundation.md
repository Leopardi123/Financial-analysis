# project_json_v3 foundation

## Goal

`project_json_v3` makes the data consumed by the Project engine the single economic source of truth. Corporate aggregates Project outputs, and Compare Stocks / Pre revenue must consume the same canonical project calculation rather than a parallel report-cost or report-FCFF ledger.

## Hard rules

- `time.periodEndDatesUtc[]` is the explicit report timeline and must have exactly `masterN+1` annual periods.
- `time.phaseByPeriod[]` explicitly maps construction, ramp-up, operations and closure. `productionStartPeriod` must be the first non-construction period.
- Each economic category is XOR: aggregate or components; royalty rules or locked series; flat-rate tax or locked tax series.
- V3 forbids legacy parallel roots such as `series`, `economicsBreakdown`, `takeItems` and `priceOverrides`.
- By-product revenue is represented once through metal revenue. V3 has no separate `byproductCreditsUSD` project-income input.
- Selling/off-site costs are first-class Project-engine costs, separate from site OPEX.
- `verification.report` stores report checkpoints and assumptions, not a second cash-flow ledger. Full `reportPreTaxFCF_USD` / `reportPostTaxFCF_USD` arrays are explicitly forbidden.
- `verification.reportedCostCheckpoints` is an oracle/evidence layer only. It must not override Project/Corporate economics.

## Report reconciliation

`reconcileProjectJsonV3ToReport()`:

1. parses the same V3 project used by normal runtime,
2. hard-checks report price-deck keys plus supplied CAPEX/closure/WC/terminal checkpoints,
3. resolves the exact report price deck,
4. runs `computeProjectEngineFullProductionV1`,
5. computes NPV using the report discount rate/convention and IRR from the resulting canonical FCFF,
6. returns `VERIFIED` only if every hard check and NPV/IRR tolerance passes.

No report-FCFF array can make a project appear reconciled without the Project engine itself reproducing the report economics.

## Compatibility

V2 remains readable through the legacy adapter. V2 and V3 both compile to the existing `ParsedProjectJsonV1` / `ProjectEngineFullProductionV1Input` boundary. This avoids a separate V3 economics engine.

## Current foundation boundary

The core parser/compiler, Project engine selling-cost support, company-project server validation and report-reconciliation runner are introduced in this foundation. Remaining UI/request boundaries that hard-code `project_json_v2` must be migrated before V3 is declared end-to-end ready in Project UI. No live project should be migrated or labelled verified until its technical report is reconciled through the same-engine report runner.
