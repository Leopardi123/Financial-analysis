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
      '4. time.runtimePlacement contains separately sourced calendar anchors. Normal runtime requires at least constructionStart, productionStart, or nameplateCapacity when nameplateCapacityPeriod is report-supported. Each anchor carries its own sourceId.',
      '5. All supplied calendar anchors must imply the same t=0. A mismatch is PLACEMENT_CONFLICT; never stretch/interpolate or shift economic arrays to force guidance to fit the technical schedule.',
      '6. nameplateCapacityPeriod is optional and must be populated only when the technical/source schedule supports the relative nameplate milestone. A calendar nameplate anchor cannot be used without it.',
      '7. A later schedule delay/acceleration normally changes runtimePlacement only. Shift relative economic arrays only when source evidence shows that the underlying technical mine plan/economic schedule itself changed.',
      '8. reportPeriodLabels are report evidence such as -3,-2,-1,1,2... or Year 1, Year 2. They are not calendar years and may be null if the report does not disclose labels. Do not invent labels.',
      '9. Use null for unknown/unverified report data. Use 0 only when the report explicitly shows zero or the item is verified not applicable. Never replace missing information with zero just to make the model run.',
      '10. Add only metals that participate in the report economic model. priceKeyByMetal values are runtime API-series identifiers; never guess a key.',
      '11. Preserve directly reported payable quantities whenever disclosed. Do not rebuild payable from mined × grade × recovery unless the report itself requires that derivation; rounding can be economically material.',
      '12. Set revenueBasisByMetal explicitly. PAYABLE_DIRECT means payable quantity × price is the revenue base and payability must not be deducted again. METAL_IN_PRODUCT_WITH_PAYABILITY_DEDUCTION means directly reported metal-in-product × price is gross value and the directly reported payable/gross ratio creates a dynamic payability deduction.',
      '13. metalInProductQtyByMetal is evidence, not a second active revenue driver. It is required only for metals whose revenueBasis is METAL_IN_PRODUCT_WITH_PAYABILITY_DEDUCTION. Both commercial quantity series may coexist because revenueBasis selects exactly one active revenue source.',
      '14. Do not silently substitute mined, contained or recovered metal for either payable or metal-in-product when the report distinguishes those concepts.',
      '15. costModel has exactly one active source. Use AGGREGATE when only aggregate site operating cost is supported; use COMPONENTS when mining/processing/site G&A/other site OPEX can be mapped without overlap.',
      '16. sellingModel has exactly one active source. Put TC, RC, freight, insurance, marketing and other off-site deductions here when separately disclosed. Payability is not repeated here when it is derived by the selected revenue basis.',
      '17. developmentModel resolves source-defined pre-commercial metal sales and costs that the report capitalizes into initial/development cash flow rather than normal operating EBITDA. Do not infer this from construction/operations phases: a report period can contain both pre-commercial and commercial activity.',
      '18. developmentModel.LOCKED_SERIES is report-only. REPORT_LOCKED_WITH_RUNTIME_PROXY keeps exact report-dollar preproduction revenue/costs for reconciliation and requires a separately sourced revenue-share/cost proxy for changed-price runtime. If a defensible runtime proxy is unavailable, runtime must fail closed; never freeze report-dollar preproduction revenue under Spot/Bear.',
      '19. fiscalTakeModel replaces the old generic royalty bucket. In RULES mode, source-faithful dynamic items may coexist with individually reportLockedItems when one specific royalty/mining take has a published report cash series but cannot be faithfully reconstructed. Each economic take must appear exactly once by id.',
      '20. Fiscal placement is source-defined, not name-defined: REVENUE_DEDUCTION, OPERATING_EXPENSE, PRE_TAX_CHARGE or POST_TAX_CHARGE. A royalty may therefore sit at a different point than another royalty, and profit/margin-based mining takes need not be treated as revenue royalties.',
      '21. Fiscal rules may reference only canonical upstream ledger lines (gross metal value, payability, streams, TC/RC/off-site deductions, site costs, EBITDA/EBIT, depreciation/capital lines). Do not create circular definitions or arbitrary JSON expressions.',
      '22. A RULES.reportLockedItem is exact only for report reconciliation. For normal Spot/Bear/runtime it must have a source-backed runtimeProxyRule or runtime fails closed; never reuse a report-locked cash series under changed prices. Use fiscalTakeModel.LOCKED_SERIES only when the entire fiscal model is report/scenario locked.',
      '23. Tax must be resolved before a project is runtime-ready. Do not leave tax UNKNOWN merely because the report tax model is complex. FLAT_RATE is allowed only when it is a faithful simplification; REPORT_LOCKED_WITH_RUNTIME_PROXY is preferred when the report publishes exact annual cash tax but reproducing every statutory tax pool would amount to building a tax-planning model.',
      '24. In REPORT_LOCKED_WITH_RUNTIME_PROXY, the report leg must use the exact report tax cash-flow series for reconciliation. The runtime leg must use the simplest defensible dynamic proxy. A runtime proxy is an economic approximation, not a claim about the statutory tax rate, and must never reuse frozen report-dollar tax under Spot/Bear or other changed-price scenarios.',
      '25. For a complex tax regime where a detailed statutory model is not warranted, calibrate a conservative effective cash-tax proxy against the report-deck economics. Prefer a proxy that produces total runtime cash tax at least as high as the report tax and normally only modestly higher (rough target 5–15%) unless source evidence supports another buffer. Do not invent depletion, credits, tax holidays, opening losses or other shields merely to lower tax. Record the proxy basis, rate, report-tax benchmark and calibration result in notes.',
      '26. The runtime tax proxy is intentionally not a tax-planning model. Preserve only simple mechanics already supported by the engine, such as a tax rate and loss carryforward, and calibrate the chosen rate using the same Project engine. If those mechanics would materially understate report tax, raise the conservative proxy rate or use a more source-faithful simple representation; do not leave runtime tax unresolved.',
      '27. By-product revenue belongs in metal revenue once. Net-by-product treatment is a derived C1/AISC recipe, not a second project-income source.',
      '28. capexUSD is report-defined initial/development project CAPEX and may extend into an early production period. Do not classify initial CAPEX mechanically as t < productionStartPeriod.',
      '29. sustainingCapexUSD, closureUSD, workingCapitalDeltaUSD and terminalProceedsUSD must be placed in the same RELATIVE periods as the report. Do not move terminal/closure/WC items to make NPV match.',
      '30. If the report provides only a LOM average and no defensible annual schedule, do not fabricate an annual series by interpolation. Use a truthful supported representation or leave the item unverified.',
      '31. operations is physical evidence used by Project and Tier. Populate only what the report supports; units must be explicit. Physical chains are controls, not automatic replacements for directly reported commercial quantities.',
      '32. verification.report is a checkpoint contract, not a second cash-flow model. Store exact report price deck, discount rate/convention, report NPV/IRR and hard-check totals/source pages. Never store parallel report FCFF arrays.',
      '33. Report reconciliation selects the SAME Project engine and same relative economic arrays. In hybrid development/tax/fiscal mode it selects report-locked cash-flow legs; normal Project/Corporate/Compare Stocks runtime selects the explicitly identified simplified dynamic proxies.',
      '34. reportedCostCheckpoints contains report C1/AISC checkpoints only. These values never override Project/Corporate economics; they test reconstructed metrics and benchmark compatibility.',
      '35. Schema-valid/runnable is not VERIFIED. VERIFIED requires exact relative period mapping, report assumptions/prices, CAPEX/preproduction/closure/WC/terminal checks and same-engine NPV/IRR within the stated tolerance (normally 1-2% relative). If any hard check is missing, status is Ej verifierad.'
    ],
    _single_source_rules: {
      timeline: 'Relative t=0..masterN is canonical. Calendar anchors only place that axis and never move economic arrays.',
      revenue: 'Both payable and metal-in-product may be stored as direct report evidence, but revenueBasisByMetal selects exactly one active commercial revenue basis per metal.',
      site_opex: 'costModel = AGGREGATE XOR COMPONENTS. UNKNOWN is draft-only.',
      selling_offsite: 'sellingModel = NONE XOR AGGREGATE XOR COMPONENTS. UNKNOWN is draft-only.',
      development: 'developmentModel = NONE XOR LOCKED_SERIES XOR REPORT_LOCKED_WITH_RUNTIME_PROXY. Capitalized revenue is a reclassification of priced metal revenue, never a second revenue source. Report-locked values require an explicit dynamic runtime proxy or runtime fails closed.',
      fiscal_take: 'fiscalTakeModel = NONE XOR RULES XOR LOCKED_SERIES. RULES owns the fiscal category and may contain multiple distinct take definitions; each take id has one active source per scenario: dynamic rule, or report-locked report leg plus explicit runtime proxy. UNKNOWN is draft-only.',
      tax: 'taxModel = FLAT_RATE XOR LOCKED_SERIES XOR REPORT_LOCKED_WITH_RUNTIME_PROXY. Tax must not remain UNKNOWN in runtime-ready JSON. Hybrid mode has one source per scenario: exact report cash tax for reconciliation and an explicitly documented simple dynamic runtime proxy. Complex statutory tax planning is out of scope; conservative effective-cash calibration is preferred to an optimistic unresolved or frozen-tax shortcut.',
      byproducts: 'Secondary-metal revenue is represented through metals once; by-product credit is derived only for a cost metric recipe.',
      verification: 'Report NPV/IRR/C1/AISC are checkpoints/oracles, never alternative project-economic ledgers.'
    },
    _calendar_placement_rule: {
      economic_axis: 'All project series stay on relative period indexes; they contain no calendar dates.',
      construction_anchor: 'runtimePlacement.constructionStart.year maps t=0.',
      production_anchor: 'runtimePlacement.productionStart.year maps productionStartPeriod.',
      nameplate_anchor: 'runtimePlacement.nameplateCapacity.year maps nameplateCapacityPeriod when that relative milestone is source-supported.',
      consistency_rule: 'Every supplied anchor must imply the same t=0; otherwise PLACEMENT_CONFLICT.',
      update_rule: 'Schedule guidance changes anchors only unless the underlying technical economic schedule changed.',
      reconciliation_rule: 'Report reconciliation ignores runtime calendar placement.'
    },
    _null_vs_zero: {
      null: 'Unknown, unavailable or not yet verified. Must not be treated as zero.',
      zero: 'Explicitly zero in the source or verified not applicable.',
      warning: 'Blank V3 intentionally uses null/UNKNOWN instead of plausible economic zeros.'
    },
    _report_reconciliation_hard_checks: [
      'Period mapping: masterN, relative period order, reportPeriodLabels when disclosed, productionStartPeriod/phaseByPeriod and any source-supported nameplateCapacityPeriod match the technical report.',
      'Capital/development mapping: report-defined initial CAPEX, preproduction revenue/costs, sustaining CAPEX, closure/reclamation, WC unwind and terminal proceeds match totals and relative periods; initial CAPEX or precommercial classification is not inferred from productionStartPeriod.',
      'Commercial/revenue mapping: each metal uses the report-supported revenue basis and directly reported commercial quantities; payability is deducted exactly once and capitalized preproduction revenue is reclassified exactly once.',
      'Assumption lock: exact report price keys/deck, payable/payability, TC/RC, fiscal takes, tax and other material assumptions; no invented FX.',
      'Development runtime readiness: report preproduction cash flows are reconciled exactly when published, and any changed-price runtime uses an explicit source-backed proxy. If the report does not support a defensible proxy, runtime fails closed.',
      'Tax runtime readiness: report tax is reconciled exactly when published, and a simple documented dynamic runtime tax proxy is present. Complex tax is not a reason to leave runtime tax UNKNOWN.',
      'Same-engine calculation: run normal Project engine on unchanged relative series with report deck/discount convention and report-locked development/tax/fiscal legs where hybrid models are used.',
      'NPV/IRR control: report vs model within stated tolerance, normally 1-2% relative.',
      'If any hard check cannot be verified, status is Ej verifierad and missing evidence must be stated.'
    ],
    _mapping_examples: {
      payable_direct: 'Gold/silver report publishes payable ounces and its revenue is payable ounces × metal price -> PAYABLE_DIRECT. Do not subtract payability again.',
      metal_in_product: 'Concentrate report publishes metal-in-product value before payability and separately publishes payable metal -> METAL_IN_PRODUCT_WITH_PAYABILITY_DEDUCTION. Use directly reported gross and payable series; do not rebuild them from grade/recovery.',
      capitalized_preproduction: 'If the report sells metal before commercial production and classifies that revenue plus its related costs in Initial/Development Costs, use developmentModel. Keep the total priced metal revenue single-source; reclassify the report-supported precommercial share out of operating EBITDA and into FCFF development cash flow. A mixed annual period must use explicit report evidence, not a phase mask.',
      nsr_deductions: 'A source-defined NSR may use gross/revenue base less specified off-site or stream deductions. Encode those exact canonical deduction lines in the fiscal rule; do not assume all NSRs have the same base.',
      profit_royalty: 'A profit/margin mining take uses the source-defined ledger base. If the report publishes exact annual take but its statutory taxable-profit adjustments cannot be reconstructed, use a reportLockedItem for reconciliation plus an explicitly labelled simplified runtimeProxyRule when a defensible proxy exists; otherwise runtime fails closed.',
      complex_tax_proxy: 'If the report publishes exact annual cash tax from a specialist tax model but reproducing depreciation/depletion/credits/holidays would require a tax-planning engine, use REPORT_LOCKED_WITH_RUNTIME_PROXY. Keep the report tax series for reconciliation; calibrate the simplest dynamic rate proxy so report-deck runtime cash tax is not lower than the report and is only modestly conservative. State clearly that the proxy rate is an effective valuation assumption, not a statutory tax rate.',
      schedule_change: 'If guidance moves construction/production/nameplate together, update anchors only. PLACEMENT_CONFLICT means verify schedule evidence; never stretch arrays.',
      initial_capex_after_production: 'If the report classifies part of Year 1 production-period spend as Initial Capital, keep it in capital.capexUSD at that relative period. Reconciliation sums report-defined capexUSD regardless of productionStartPeriod.',
      lom_average: 'A LOM average is not an annual schedule. Do not repeat it across years unless the report itself defines that treatment.'
    },
    meta: {
      projectId: 'p1', projectName: '', currency: 'USD',
      notes: 'Fill strictly from source documents. Never infer missing report semantics. Relative economics, commercial revenue basis, development classification and runtime calendar placement are separate concepts.'
    },
    time: {
      masterN: 10,
      productionStartPeriod: 2,
      nameplateCapacityPeriod: null,
      reportPeriodLabels: null,
      phaseByPeriod: ['construction', 'construction', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'closure'],
      runtimePlacement: null,
    },
    metals: {
      payableQtyByMetal: {},
      metalInProductQtyByMetal: {},
      revenueBasisByMetal: {},
      payableQtyUnitByMetal: {},
      priceKeyByMetal: {},
      auPriceKey: null,
    },
    streamsByMetal: null,
    economics: {
      costModel: { mode: 'UNKNOWN' },
      sellingModel: { mode: 'UNKNOWN' },
      developmentModel: { mode: 'UNKNOWN' },
      fiscalTakeModel: { mode: 'UNKNOWN' },
      taxModel: { mode: 'UNKNOWN' },
      depreciationUSD: null,
    },
    capital: {
      capexUSD: unknownSeries(), sustainingCapexUSD: unknownSeries(), closureUSD: unknownSeries(),
      workingCapitalDeltaUSD: unknownSeries(), terminalProceedsUSD: unknownSeries(),
    },
    operations: null,
    verification: { report: null, reportedCostCheckpoints: [] },
  } as ProjectJsonV3 & Record<string, unknown>;
}