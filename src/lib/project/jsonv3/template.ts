import type { ProjectJsonV3 } from './schema.ts';

export function buildProjectJsonV3Template(): ProjectJsonV3 & Record<string, unknown> {
  const unknownSeries = () => new Array<number | null>(11).fill(null);

  return {
    version: 'project_json_v3',
    _description: 'Canonical single-source project economics. Economic arrays are relative to project period index, not fixed calendar years. Derived totals, NPV/IRR and C1/AISC must not be stored as parallel calculation inputs.',
    _template_status: 'DRAFT_PLACEHOLDER_ONLY. This blank template is intentionally NOT runtime-valid until UNKNOWN modes, placeholder relative timeline, runtime placement and report data are replaced from source evidence.',
    _how_to_fill: [
      '1. Start from the technical report economic model (PEA/PFS/FS). Do not start by inventing calendar years or copying assumptions from another project.',
      '2. Rebuild the RELATIVE report timeline first. masterN, reportPeriodLabels[] when disclosed, phaseByPeriod[] and productionStartPeriod must match the report period-for-period, including construction, ramp-up, operations and closure/post-production.',
      '3. Economic arrays are permanently indexed by relative period t=0..masterN. Do not shift production, CAPEX, OPEX, closure or WC arrays merely because company guidance moves the expected calendar start.',
      '4. time.runtimePlacement contains separately sourced calendar anchors. Normal runtime requires at least constructionStart or productionStart. Each supplied anchor must carry its own sourceId; page/table and as-of date should be recorded when available.',
      '5. If both constructionStart and productionStart are supplied, their year spacing must exactly match productionStartPeriod on the relative economic axis. A mismatch is PLACEMENT_CONFLICT; do not shift arrays or interpolate the schedule to make the anchors agree.',
      '6. A later schedule delay/acceleration normally changes runtimePlacement only. Shift relative economic arrays only when source evidence shows that the underlying technical mine plan/economic schedule itself changed.',
      '7. reportPeriodLabels are report evidence such as -3,-2,-1,1,2... or Year 1, Year 2. They are not calendar years and may be null if the report does not disclose labels. Do not invent labels.',
      '8. Use null for unknown/unverified report data. Use 0 only when the report explicitly shows zero or the item is verified not applicable. Never replace missing information with zero just to make the model run.',
      '9. Add only metals that participate in the report economic model. Do not add a metal merely because it is common for the project type.',
      '10. payableQtyByMetal must represent payable quantities. Do not silently substitute mined, contained or recovered metal when the report distinguishes those concepts.',
      '11. priceKeyByMetal values are runtime API-series identifiers. Never guess a price key. Verify the exact supported key before entering it.',
      '12. costModel has exactly one active source. Use AGGREGATE when the report only supports aggregate site operating cost. Use COMPONENTS when mining/processing/site G&A or other site OPEX can be mapped without overlap. Never provide both.',
      '13. sellingModel has exactly one active source. Put TC, RC, freight, insurance, marketing and other off-site deductions here when separately disclosed. Do not also hide the same amount inside site OPEX.',
      '14. royaltyModel has exactly one active source. Use RULES when the royalty/stream formula can be represented faithfully; use LOCKED_SERIES only when the report supplies a period cash-flow series that cannot be reconstructed; use NONE only when no project royalty/take applies.',
      '15. taxModel has exactly one active source. FLAT_RATE is allowed only when that is a faithful model of the report/runtime tax assumption. LOCKED_SERIES is report-deck locked and is not automatically suitable for spot sensitivity. UNKNOWN must be resolved before runtime.',
      '16. By-product revenue belongs in metal revenue once. Do not add a parallel by-product-credit project income series. Net-by-product treatment is a derived C1/AISC recipe, not a second revenue source.',
      '17. capexUSD, sustainingCapexUSD, closureUSD, workingCapitalDeltaUSD and terminalProceedsUSD must be placed in the same RELATIVE periods as the report. Do not move terminal/closure/WC items to make NPV match.',
      '18. If the report provides only a LOM average and no defensible annual schedule, do not fabricate an annual series by interpolation. Use the supported aggregate representation only if it truthfully preserves the disclosed economics; otherwise leave the item unverified.',
      '19. operations is evidence/physical detail used by Project and Tier. Populate only what the report supports. Units must be explicit and consistent with the source.',
      '20. verification.report is a report checkpoint contract, not a second cash-flow model. Store report price deck, discount rate/convention, report NPV/IRR and hard-check totals/source pages. Do not store parallel report FCFF arrays.',
      '21. The report price deck in verification.report.priceDeckByKey must use the same verified runtime price keys as metals.priceKeyByMetal. No implicit FX or substitute prices are allowed in reconciliation.',
      '22. Record the source/table/page for NPV/IRR, prices, report periods and major assumptions. Payability, TC/RC, royalties, tax and other material assumptions must match the technical report economic case used for report NPV/IRR.',
      '23. reportedCostCheckpoints contains report C1/AISC checkpoints only. These values must never override Project/Corporate economics; they are used to test reconstructed cost metrics and benchmark compatibility.',
      '24. Schema-valid/runnable is not the same as VERIFIED. A project is VERIFIED only after the SAME Project engine, run with the report deck on the same relative period series, reproduces report NPV and IRR within tolerance and all mandatory period/CAPEX/closure/WC/assumption hard checks pass.'
    ],
    _single_source_rules: {
      timeline: 'Relative economic period index t=0..masterN is canonical. runtimePlacement only maps that axis into the current expected calendar; it must not create a second economic timeline.',
      site_opex: 'costModel = AGGREGATE XOR COMPONENTS. UNKNOWN is draft-only.',
      selling_offsite: 'sellingModel = NONE XOR AGGREGATE XOR COMPONENTS. UNKNOWN is draft-only.',
      royalty: 'royaltyModel = NONE XOR RULES XOR LOCKED_SERIES. UNKNOWN is draft-only.',
      tax: 'taxModel = FLAT_RATE XOR LOCKED_SERIES. UNKNOWN is draft-only.',
      byproducts: 'Secondary-metal revenue is represented through metals once; by-product credit is derived only for a cost metric recipe.',
      verification: 'Report NPV/IRR/C1/AISC are checkpoints/oracles, never alternative economic inputs.'
    },
    _calendar_placement_rule: {
      economic_axis: 'All project series stay on relative period indexes. They do not contain calendar dates.',
      construction_anchor: 'time.runtimePlacement.constructionStart.year maps relative t=0 to a sourced company-guided construction-start year.',
      production_anchor: 'time.runtimePlacement.productionStart.year maps productionStartPeriod to a sourced company-guided production-start year.',
      minimum_requirement: 'Normal Project/Corporate/Compare Stocks runtime requires at least one of constructionStart or productionStart.',
      consistency_rule: 'If both anchors exist, productionStart.year must equal constructionStart.year + productionStartPeriod. Otherwise status is PLACEMENT_CONFLICT and economic arrays must remain unchanged.',
      update_rule: 'A schedule delay/acceleration changes runtimePlacement only unless source evidence shows the underlying technical economic schedule changed.',
      reconciliation_rule: 'Report reconciliation ignores runtime calendar placement and uses relative period order plus the report discount convention.'
    },
    _null_vs_zero: {
      null: 'Unknown, unavailable or not yet verified. This must not be treated as zero.',
      zero: 'Explicitly zero in the report or verified not applicable.',
      warning: 'A template zero can silently create a false economic result, so the blank V3 template intentionally uses null/UNKNOWN rather than economic zeros.'
    },
    _report_reconciliation_hard_checks: [
      'Period mapping: masterN, relative period order, reportPeriodLabels when disclosed, productionStartPeriod and phaseByPeriod match the technical report exactly. Runtime calendar placement is NOT part of the report economics.',
      'Capital mapping: initial CAPEX, sustaining CAPEX, closure/reclamation, working-capital unwind and terminal proceeds are in the same relative report periods.',
      'Assumption lock: use the report economic-case metal prices and verified price keys; match payable, TC/RC, royalties, tax and other material assumptions; no invented FX.',
      'Same-engine calculation: run the normal Project engine with the report price deck and report discount convention on the unchanged relative economic series.',
      'NPV/IRR control: compare report NPV/IRR with engine NPV/IRR and require the stated tolerance (normally 1-2% relative unless explicitly justified otherwise).',
      'If any hard check cannot be verified, status is Ej verifierad and the missing evidence must be stated explicitly.'
    ],
    _mapping_examples: {
      schedule_change: 'PFS economics have productionStartPeriod=3. If guidance moves the whole schedule from construction 2028 / production 2031 to construction 2030 / production 2033, update the two runtime anchors only. Do not shift any economic array.',
      production_only_anchor: 'If company guidance only verifies production start 2033, set runtimePlacement.productionStart.year=2033. The runtime calendar derives t=0 as 2033-productionStartPeriod.',
      construction_only_anchor: 'If company guidance only verifies construction start 2030, set runtimePlacement.constructionStart.year=2030. The runtime calendar derives production start as 2030+productionStartPeriod.',
      placement_conflict: 'If productionStartPeriod=3 but guidance says construction 2030 and production 2035, do not stretch or shift the PFS arrays. Treat this as PLACEMENT_CONFLICT until source evidence establishes a changed project schedule.',
      report_periods: 'A report with periods -3,-2,-1,1,2,... should store those labels in reportPeriodLabels in the same index order. They are labels, not UTC dates.',
      aggregate_opex: 'Report has one operating-cost series and no reliable decomposition -> costModel.mode=AGGREGATE. Do not invent mining/processing splits.',
      component_opex: 'Report has non-overlapping mining + processing + site G&A series -> costModel.mode=COMPONENTS. operatingCostsUSD must not also be supplied.',
      included_ga: 'If report operating cost already includes site G&A, do not enter the same G&A again as a separate component. Preserve the report definition in notes/source evidence.',
      selling: 'If TC/RC/freight are separately disclosed, map them to sellingModel. If the only disclosed number is an all-in net-revenue deduction, use AGGREGATE rather than fabricating component splits.',
      royalty: 'If a formula is disclosed and reproducible, use RULES. If only an annual royalty cash-flow series is disclosed and no faithful rule can be built, use LOCKED_SERIES and mark its scenario limitation.',
      lom_average: 'A LOM average is not an annual schedule. Do not repeat it across years unless the report itself defines that treatment.'
    },
    meta: {
      projectId: 'p1',
      projectName: '',
      currency: 'USD',
      notes: 'Fill strictly from source documents. Never infer missing report semantics. Relative economics and runtime calendar placement are separate concepts; do not shift arrays for schedule guidance changes.',
    },
    time: {
      masterN: 10,
      productionStartPeriod: 2,
      reportPeriodLabels: null,
      phaseByPeriod: ['construction', 'construction', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'closure'],
      runtimePlacement: null,
    },
    metals: {
      payableQtyByMetal: {},
      payableQtyUnitByMetal: {},
      priceKeyByMetal: {},
      auPriceKey: null,
    },
    streamsByMetal: null,
    economics: {
      costModel: { mode: 'UNKNOWN' },
      sellingModel: { mode: 'UNKNOWN' },
      royaltyModel: { mode: 'UNKNOWN' },
      taxModel: { mode: 'UNKNOWN' },
      depreciationUSD: null,
    },
    capital: {
      capexUSD: unknownSeries(),
      sustainingCapexUSD: unknownSeries(),
      closureUSD: unknownSeries(),
      workingCapitalDeltaUSD: unknownSeries(),
      terminalProceedsUSD: unknownSeries(),
    },
    operations: null,
    verification: {
      report: null,
      reportedCostCheckpoints: [],
    },
  } as ProjectJsonV3 & Record<string, unknown>;
}
