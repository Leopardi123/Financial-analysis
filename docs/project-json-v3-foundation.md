# project_json_v3 foundation

## Goal

`project_json_v3` makes the data consumed by the Project engine the single economic source of truth. Corporate aggregates Project outputs, and Compare Stocks / Pre revenue consume the same canonical project calculation rather than a parallel report-cost or report-FCFF ledger.

## Hard rules

- `time.periodEndDatesUtc[]` is the explicit report timeline and must have exactly `masterN+1` annual periods.
- `time.phaseByPeriod[]` explicitly maps construction, ramp-up, operations and closure. `productionStartPeriod` must be the first non-construction period.
- Each economic category is XOR: aggregate or components; royalty rules or locked series; flat-rate tax or locked tax series.
- `UNKNOWN` is a draft placeholder only. A document with any UNKNOWN economic mode is deliberately not runtime-valid.
- V3 forbids legacy parallel roots such as `series`, `economicsBreakdown`, `takeItems` and `priceOverrides`.
- By-product revenue is represented once through metal revenue. V3 has no separate `byproductCreditsUSD` project-income input.
- Selling/off-site costs are first-class Project-engine costs, separate from site OPEX.
- `verification.report` stores report checkpoints and assumptions, not a second cash-flow ledger. Full `reportPreTaxFCF_USD` / `reportPostTaxFCF_USD` arrays are explicitly forbidden.
- `verification.reportedCostCheckpoints` is an oracle/evidence layer only. It never overrides Project/Corporate/Tier economics.

## Filling contract

The blank V3 template is intentionally a non-runnable draft. It contains detailed `_how_to_fill`, `_single_source_rules`, `_null_vs_zero`, `_report_reconciliation_hard_checks` and `_mapping_examples` instructions inside the JSON itself so copied templates carry the contract with them.

The most important rules are:

1. Build the time axis from the technical report first. Replace the generated placeholder years; never treat the scaffold timeline as evidence.
2. `null` means unknown/unverified. `0` means explicitly zero or verified not applicable. Missing data must never be converted to zero merely to make the engine run.
3. The blank template assumes no metal and no API price key. Price keys are runtime API-series identifiers and must be verified rather than guessed.
4. Site OPEX, selling/off-site, royalty and tax each have exactly one source. If report detail is insufficient for decomposition, use the truthful aggregate representation; do not fabricate components.
5. By-product revenue is represented once as metal revenue. Net-by-product C1/AISC treatment is derived from that revenue, not stored as a second project income stream.
6. CAPEX, sustaining, closure, WC and terminal proceeds must remain in the report periods. Do not move terminal items to force NPV agreement.
7. A LOM average is not an annual schedule. Do not repeat/interpolate it across years unless the report explicitly defines that treatment.
8. `verification.report` records the report price deck, discount convention, NPV/IRR and hard-check evidence. It is not a parallel FCFF ledger.
9. Major assumptions used by the report economic case—payability, TC/RC, royalties, tax, FX where applicable—must be source-mapped and match the canonical V3 model. No implicit substitute assumptions are allowed.
10. Runnable/schema-valid does not mean report-verified. `VERIFIED` requires the same Project engine to reproduce report NPV/IRR at the report deck within tolerance and every required hard check to pass.

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

The Company Projects route preserves the complete Legacy v2 editor and adds an explicit `Canonical v3` editor mode. The V3 editor can create/copy the deliberately unresolved blank template. `UNKNOWN` economic modes must be resolved from the technical report before the canonical runtime parser accepts the project for saving/running.

There is deliberately no automatic v2->v3 converter: report semantics must be mapped project by project.

Saving a V3 project means runtime/schema-valid only. No live project should be labelled `VERIFIED` until the report-deck reconciliation runner reproduces the technical report NPV/IRR and all mandatory hard checks pass.