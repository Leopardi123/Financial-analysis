import type { ProjectJsonV3 } from './schema.ts';

export function buildProjectJsonV3Template(): ProjectJsonV3 & Record<string, unknown> {
  const currentYear = new Date().getUTCFullYear();
  const periodEndDatesUtc = Array.from({ length: 11 }, (_, index) => `${currentYear + index}-12-31`);
  const unknownSeries = () => new Array<number | null>(11).fill(null);

  return {
    version: 'project_json_v3',
    _description: 'Canonical single-source project economics. Every economic category has exactly one active source. Derived totals, NPV/IRR and C1/AISC must not be stored as parallel calculation inputs.',
    _template_status: 'DRAFT_PLACEHOLDER_ONLY. This blank template is intentionally NOT runtime-valid until UNKNOWN modes, placeholder timeline and report data are replaced from the technical report.',
    _how_to_fill: [
      '1. Start from the technical report economic model (PEA/PFS/FS). Do not start by inventing a project timeline or copying assumptions from another project.',
      '2. Rebuild time first. masterN, periodEndDatesUtc[], phaseByPeriod[] and productionStartPeriod must match the report period-for-period, including construction, ramp-up, operations and closure.',
      '3. Replace every placeholder timeline value in this template. The generated years are only an editing scaffold and are not project evidence.',
      '4. Use null for unknown/unverified report data. Use 0 only when the report explicitly shows zero or the item is verified not applicable. Never replace missing information with zero just to make the model run.',
      '5. Add only metals that participate in the report economic model. Do not keep the template empty maps or add a metal merely because it is common for the project type.',
      '6. payableQtyByMetal must represent payable quantities. Do not silently substitute mined, contained or recovered metal when the report distinguishes those concepts.',
      '7. priceKeyByMetal values are runtime API-series identifiers. Never guess a price key. Verify the exact supported key before entering it.',
      '8. costModel has exactly one active source. Use AGGREGATE when the report only supports aggregate site operating cost. Use COMPONENTS when mining/processing/site G&A or other site OPEX can be mapped without overlap. Never provide both.',
      '9. sellingModel has exactly one active source. Put TC, RC, freight, insurance, marketing and other off-site deductions here when separately disclosed. Do not also hide the same amount inside site OPEX.',
      '10. royaltyModel has exactly one active source. Use RULES when the royalty/stream formula can be represented faithfully; use LOCKED_SERIES only when the report supplies a period cash-flow series that cannot be reconstructed; use NONE only when no project royalty/take applies.',
      '11. taxModel has exactly one active source. FLAT_RATE is allowed only when that is a faithful model of the report/runtime tax assumption. LOCKED_SERIES is report-deck locked and is not automatically suitable for spot sensitivity. UNKNOWN must be resolved before runtime.',
      '12. By-product revenue belongs in metal revenue once. Do not add a parallel by-product-credit project income series. Net-by-product treatment is a derived C1/AISC recipe, not a second revenue source.',
      '13. capexUSD, sustainingCapexUSD, closureUSD, workingCapitalDeltaUSD and terminalProceedsUSD must be placed in the same periods as the report. Do not shift terminal/closure/WC items to make NPV match.',
      '14. If the report provides only a LOM average and no defensible annual schedule, do not fabricate an annual series by interpolation. Use the supported aggregate representation only if it truthfully preserves the disclosed economics; otherwise leave the item unverified.',
      '15. operations is evidence/physical detail used by Project and Tier. Populate only what the report supports. Units must be explicit and consistent with the source.',
      '16. verification.report is a report checkpoint contract, not a second cash-flow model. Store report price deck, discount rate/convention, report NPV/IRR and hard-check totals/source pages. Do not store parallel report FCFF arrays.',
      '17. The report price deck in verification.report.priceDeckByKey must use the same verified runtime price keys as metals.priceKeyByMetal. No implicit FX or substitute prices are allowed in reconciliation.',
      '18. Record the source/table/page for NPV/IRR, prices and major assumptions. Payability, TC/RC, royalties, tax and other material assumptions must match the technical report economic case used for the report NPV/IRR.',
      '19. reportedCostCheckpoints contains report C1/AISC checkpoints only. These values must never override Project/Corporate economics; they are used to test reconstructed cost metrics and benchmark compatibility.',
      '20. Schema-valid/runnable is not the same as VERIFIED. A project is VERIFIED only after the SAME Project engine, run with the report deck, reproduces report NPV and IRR within tolerance and all mandatory period/CAPEX/closure/WC/assumption hard checks pass.'
    ],
    _single_source_rules: {
      site_opex: 'costModel = AGGREGATE XOR COMPONENTS. UNKNOWN is draft-only.',
      selling_offsite: 'sellingModel = NONE XOR AGGREGATE XOR COMPONENTS. UNKNOWN is draft-only.',
      royalty: 'royaltyModel = NONE XOR RULES XOR LOCKED_SERIES. UNKNOWN is draft-only.',
      tax: 'taxModel = FLAT_RATE XOR LOCKED_SERIES. UNKNOWN is draft-only.',
      byproducts: 'Secondary-metal revenue is represented through metals once; by-product credit is derived only for a cost metric recipe.',
      verification: 'Report NPV/IRR/C1/AISC are checkpoints/oracles, never alternative economic inputs.'
    },
    _null_vs_zero: {
      null: 'Unknown, unavailable or not yet verified. This must not be treated as zero.',
      zero: 'Explicitly zero in the report or verified not applicable.',
      warning: 'A template zero can silently create a false economic result, so the blank V3 template intentionally uses null/UNKNOWN rather than economic zeros.'
    },
    _report_reconciliation_hard_checks: [
      'Period mapping: masterN and periodEndDatesUtc[] match the technical report year-for-year; productionStartPeriod and phases match construction/ramp-up/operations/closure.',
      'Capital mapping: initial CAPEX, sustaining CAPEX, closure/reclamation, working-capital unwind and terminal proceeds are in the same report periods.',
      'Assumption lock: use the report economic-case metal prices and verified price keys; match payable, TC/RC, royalties, tax and other material assumptions; no invented FX.',
      'Same-engine calculation: run the normal Project engine with the report price deck and report discount convention.',
      'NPV/IRR control: compare report NPV/IRR with engine NPV/IRR and require the stated tolerance (normally 1-2% relative unless explicitly justified otherwise).',
      'If any hard check cannot be verified, status is Ej verifierad and the missing evidence must be stated explicitly.'
    ],
    _mapping_examples: {
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
      notes: 'Fill strictly from the technical report. Never infer missing report semantics. Remove or replace all template placeholders before runtime use.',
    },
    time: {
      masterN: 10,
      productionStartPeriod: 2,
      periodEndDatesUtc,
      phaseByPeriod: ['construction', 'construction', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'closure'],
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