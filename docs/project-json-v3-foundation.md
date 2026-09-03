# project_json_v3 foundation

## Goal

`project_json_v3` makes the data consumed by the Project engine the single economic source of truth. Corporate aggregates Project outputs, and Compare Stocks / Pre revenue consume the same canonical project calculation rather than a parallel report-cost or report-FCFF ledger.

The canonical economic timeline is **relative project time**, not fixed calendar time. Company guidance can move construction and production in the calendar without rewriting or shifting the mine-plan economic arrays.

## Time model: relative economics + sourced movable placement

- `time.masterN` defines relative periods `t=0..masterN`.
- `time.productionStartPeriod` identifies the relative period where production/ramp-up starts.
- `time.phaseByPeriod[]` maps construction, ramp-up, operations and closure/post-production on that same relative axis.
- `time.reportPeriodLabels[]` is optional report evidence (for example `-3,-2,-1,1,2...`). It is not a calendar and must not be invented when the report does not disclose labels.
- `time.runtimePlacement.constructionStart` can anchor relative `t=0` to a sourced company-guided construction-start year.
- `time.runtimePlacement.productionStart` can anchor `productionStartPeriod` to a sourced company-guided production-start year.
- Normal Project/Corporate/Compare Stocks runtime requires at least one sourced anchor.
- If both anchors exist, they must be internally consistent: `productionStart.year = constructionStart.year + productionStartPeriod` for the current annual-period V3 model.
- If the two company-guidance anchors disagree with the report-relative construction duration, runtime fails closed with `PLACEMENT_CONFLICT`. The economic arrays must not be stretched, interpolated or shifted to make the guidance fit.
- V3 explicitly forbids `time.periodEndDatesUtc`, root `time.productionStartYear` / `constructionStartYear`, and the old flat `runtimePlacement.productionStartYear` shape.

If the company later moves the expected schedule, update only the sourced runtime anchors. Do **not** shift production, CAPEX, OPEX, sustaining, WC or closure arrays unless source evidence shows the underlying mine plan/economic study itself changed.

Report reconciliation is calendar-independent. It runs on relative period order and the report discount convention; `runtimePlacement` is deliberately not required for reconciliation.

## Hard rules

- The relative period count/order, `productionStartPeriod`, `phaseByPeriod[]` and report labels when disclosed must match the technical report economic model exactly.
- Each economic category is XOR: aggregate or components; royalty rules or locked series; flat-rate tax or locked tax series.
- `UNKNOWN` is a draft placeholder only. A document with any UNKNOWN economic mode is deliberately not runtime-valid.
- V3 forbids legacy parallel roots such as `series`, `economicsBreakdown`, `takeItems` and `priceOverrides`.
- By-product revenue is represented once through metal revenue. V3 has no separate `byproductCreditsUSD` project-income input.
- Selling/off-site costs are first-class Project-engine costs, separate from site OPEX.
- `verification.report` stores report checkpoints and assumptions, not a second cash-flow ledger. Full report-FCFF arrays are explicitly forbidden.
- `verification.reportedCostCheckpoints` is an oracle/evidence layer only. It never overrides Project/Corporate/Tier economics.

## Filling contract

The blank V3 template is intentionally a non-runnable draft. It carries `_how_to_fill`, `_single_source_rules`, `_calendar_placement_rule`, `_null_vs_zero`, `_report_reconciliation_hard_checks` and `_mapping_examples` inside the JSON so copied templates retain the contract.

The most important rules are:

1. Build the relative technical-report axis first. Do not invent calendar years as part of the mine-plan economics.
2. Keep every economic/physical array fixed on relative index `t=0..masterN`.
3. Map the current company schedule only through sourced runtime anchors. Use construction and/or production guidance exactly as disclosed.
4. If both construction and production anchors are supplied, their spacing must agree with the relative technical schedule. A conflict is evidence of an unresolved schedule change, not permission to rewrite the economic arrays.
5. `null` means unknown/unverified. `0` means explicitly zero or verified not applicable.
6. The blank template assumes no metal and no API price key. Price keys must be verified, never guessed.
7. Site OPEX, selling/off-site, royalty and tax each have exactly one source. If report detail is insufficient for decomposition, use the truthful aggregate representation rather than fabricated components.
8. By-product revenue is represented once as metal revenue. Net-by-product C1/AISC treatment is derived from that revenue.
9. CAPEX, sustaining, closure, WC and terminal proceeds remain in their report-relative periods. Do not move terminal items to force NPV agreement.
10. A LOM average is not an annual schedule. Do not repeat/interpolate it across periods unless the report explicitly defines that treatment.
11. `verification.report` records report price deck, discount convention, NPV/IRR and hard-check evidence. It is not a parallel FCFF ledger.
12. Runnable/schema-valid does not mean report-verified. `VERIFIED` requires the same Project engine to reproduce report NPV/IRR at the report deck within tolerance and every required hard check to pass.

## Report reconciliation

`reconcileProjectJsonV3ToReport()` parses the same V3 economics used by runtime but allows the calendar placement to be absent. It hard-checks relative period structure, report price keys, supplied CAPEX/closure/WC/terminal checkpoints, resolves the exact report deck, runs `computeProjectEngineFullProductionV1`, and computes NPV/IRR from that engine FCFF.

`VERIFIED` requires every hard check plus NPV tolerance and, when the report publishes it, IRR tolerance to pass. IRR may be omitted only when the report explicitly states that it is not applicable and `irrApplicability` preserves the reason, source and page/table. No report-FCFF array and no runtime calendar date can make a project appear reconciled without the Project engine itself reproducing the report economics.

## Project / Corporate / Compare Stocks Pre revenue

- V2 and V3 both compile to the existing `ParsedProjectJsonV1` / `ProjectEngineFullProductionV1Input` boundary; there is no second V3 economics engine.
- V3 normal runtime derives calendar years from one or two sourced schedule anchors.
- Inline Project snapshot requests use the same V3 parser and therefore the same placement/consistency rules.
- Corporate symbol mode loads stored projects and uses the same version-dispatching project parser.
- Tier / Compare Stocks Pre revenue uses the same project parser and engine for spot and cycle runs.
- Changing only consistent runtime anchors changes calendar display/valuation timing but must not mutate the relative project FCFF series.
- Reported C1/AISC is checkpoint evidence only. It cannot replace the canonical engine-derived cost gate.

## Current period granularity

V3 is currently calendar-independent but annual-periodized: adjacent relative indices are treated as one-year steps in runtime placement and discounting. This is suitable for the annualized PEA/PFS/FS economic tables currently targeted. If a technical report materially uses quarterly or half-year economic periods, period duration must be added explicitly before that report can be represented without approximation. Do not silently coerce such a report into annual periods.

## Editor and migration

The Company Projects route preserves the Legacy v2 editor and adds an explicit `Canonical v3` editor mode. The V3 editor can create/copy the deliberately unresolved blank template. `UNKNOWN` economic modes must be resolved from the technical report and at least one sourced runtime schedule anchor supplied before normal Project/Corporate/Compare Stocks runtime accepts the project.

There is deliberately no automatic v2->v3 semantic converter: report economics and current company schedule must be mapped project by project. A schedule update later should normally update only `runtimePlacement`, not rebuild the economic JSON.

Saving a V3 project means runtime/schema-valid only. No live project should be labelled `VERIFIED` until the calendar-independent report-deck reconciliation runner reproduces the technical report NPV/IRR and all mandatory hard checks pass.
