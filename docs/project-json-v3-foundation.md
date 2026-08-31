# project_json_v3 foundation

## Goal

`project_json_v3` makes the data consumed by the Project engine the single economic source of truth. Corporate aggregates Project outputs, and Compare Stocks / Pre revenue consume the same canonical project calculation rather than a parallel report-cost or report-FCFF ledger.

## Hard rules

- `time.periodEndDatesUtc[]` is the explicit report timeline and must have exactly `masterN+1` annual periods.
- `time.phaseByPeriod[]` explicitly maps construction, ramp-up, operations and closure. `productionStartPeriod` must be the first non-construction period.
- Each economic category is XOR: aggregate or components; royalty rules or locked series; flat-rate tax or locked tax series.
- V3 forbids legacy parallel roots such as `series`, `economicsBreakdown`, `takeItems` and `priceOverrides`.
- By-product revenue is represented once through metal revenue. V3 has no separate `byproductCreditsUSD` project-income input.
- Selling/off-site costs are first-class Project-engine costs, separate from site OPEX.
- `verification.report` stores report checkpoints and assumptions, not a second cash-flow ledger. Full `reportPreTaxFCF_USD` / `reportPostTaxFCF_USD` arrays are explicitly forbidden.
- `verification.reportedCostCheckpoints` is an oracle/evidence layer only. It never overrides Project/Corporate/Tier economics.

## Report reconciliation

`reconcileProjectJsonV3ToReport()` parses the same V3 project used by runtime, hard-checks report prices and supplied period/CAPEX/closure/WC/terminal checkpoints, resolves the exact report deck, runs `computeProjectEngineFullProductionV1`, and computes NPV/IRR from that engine FCFF. `VERIFIED` requires every hard check plus NPV/IRR tolerance to pass.

No report-FCFF array can make a project appear reconciled without the Project engine itself reproducing the report economics.

## Project / Corporate / Pre revenue

- V2 and V3 both compile to the existing `ParsedProjectJsonV1` / `ProjectEngineFullProductionV1Input` boundary; there is no second V3 economics engine.
- Inline Project snapshot requests accept V3 through a V3-aware request wrapper. The original V3 document is restored before runtime.
- Corporate symbol mode loads stored projects and uses the same version-dispatching project parser.
- Tier / Compare Stocks Pre revenue uses the same project parser and engine for spot and cycle runs.
- Reported C1/AISC is exposed as checkpoint evidence only. The API-level reported-cost override is removed; a report metric can no longer replace the canonical engine-derived cost gate.

## Editor and migration

The Company Projects route preserves the complete Legacy v2 editor and adds an explicit `Canonical v3` editor mode. The V3 editor validates through the same canonical parser and can create/save V3 documents, while V2 projects remain untouched. There is deliberately no automatic v2->v3 converter: report semantics must be mapped project by project.

Saving a V3 project means schema-valid only. No live project should be labelled `VERIFIED` until the report-deck reconciliation runner reproduces the technical report NPV/IRR and all mandatory hard checks pass.
