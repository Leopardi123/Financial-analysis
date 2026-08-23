import { buildProducerJsonV1Template } from './template.ts';
import type { ProducerJsonV1 } from './types.ts';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function canonicalEditorDocumentation(base: Record<string, unknown>): Record<string, unknown> {
  const baseReference = asRecord(base._reference);
  const baseNumericClaim = asRecord(baseReference.numericClaim);
  const baseProduction = asRecord(baseReference.production);
  const baseExampleProject = asRecord(base._example_project);

  return {
    _hard_rules: [
      'No guessing. No hidden midpointing. No silent annualization of year-range averages/totals.',
      'Use point only for an actual point estimate. Use approximate/range/upper_bound/lower_bound when that is what the source says.',
      'Closed range claims may propagate as closed calculation intervals. They are never collapsed to a midpoint. upper_bound/lower_bound remain open bounds and are not promoted to closed intervals.',
      'A company without a saved producer_json_v1 is not shown in COMPARE STOCKS.',
      'SPOT price deck, current FX, current quote/market cap and run valuation date come from Instrumentbrädan runtime infrastructure.',
      'For physical peer production/AuEq, produced quantity is required. sold/payable do not replace produced for that metric.',
      'For revenue quantity the engine prefers payable, then sold, then produced. Using produced as revenue quantity is explicitly marked approximation.',
      'If only reported AISC/cash cost exists, keep it as reportedMetrics. Do not manufacture canonical EBITDA or FCFF from AISC alone.',
      'project_100pct production is ownership-adjusted for attributable Au/AuEq. Revenue/EBITDA/FCFF must use the verified financialConsolidation basis when accounting consolidation differs from equity ownership.',
      'Do not use legal ownershipPct as a substitute for financial consolidation. A fully consolidated non-100%-owned mine may contribute 100% of revenue/EBITDA while NCI belongs in the EV bridge.',
    ],
    _example_project: {
      ...baseExampleProject,
      productionWindow: {
        startYear: 2026,
        endYear: 2038,
        _description: 'Optional. Use only when a source supports the producing calendar window. It prevents years before first production or after closure from being treated as unexplained missing production.',
        provenance: {
          sourceId: 'src_mine_plan',
          estimateClass: 'technical_report',
          confidence: 'high',
          confidenceReason: 'Explicit production years in source.',
        },
      },
      financialConsolidation: {
        method: 'full',
        _choices_method: ['full', 'proportionate', 'equity_method'],
        _description: 'Accounting consolidation basis, separate from equity ownership. full = 100% operating results consolidated; proportionate requires consolidationPct; equity_method = no line-by-line project revenue/EBITDA consolidation.',
        provenance: {
          sourceId: 'src_financials',
          estimateClass: 'actual',
          confidence: 'high',
          confidenceReason: 'Consolidation basis verified from financial statements.',
        },
      },
    },
    _reference: {
      ...baseReference,
      numericClaim: {
        ...baseNumericClaim,
        _description: 'Choose exactly one claim shape. point/approximate can become scalar values. A closed range remains a range and may propagate through interval production/revenue/cost/EBITDA/FCFF calculations without midpointing. upper_bound/lower_bound remain open bounds and cannot become a closed interval.',
      },
      production: {
        ...baseProduction,
        _replacement_rules: [
          'Physical peer production and physical AuEq: produced is required; sold/payable are not substitutes.',
          'Revenue quantity: payable > sold > produced. produced fallback is marked approximation.',
          'Closed annual ranges are valid calculation inputs and remain ranges; do not midpoint them.',
          'Do not enter the same disclosure twice on both attributable and project_100pct basis.',
          'project_100pct production uses ownership for attributable Au/AuEq; project economics use financialConsolidation when accounting consolidation differs from ownership.',
        ],
      },
      productionWindow: {
        _description: 'Optional project-level calendar window. Use only when a source explicitly supports first/last producing years.',
        example: {
          startYear: 2028,
          endYear: 2036,
          provenance: {
            sourceId: 'src_mine_plan',
            estimateClass: 'technical_report',
            confidence: 'high',
          },
        },
      },
      financialConsolidation: {
        _description: 'Project-level accounting consolidation basis. This is separate from ownershipPct and is used for Revenue/EBITDA/FCFF normalization.',
        _choices_method: ['full', 'proportionate', 'equity_method'],
        alternatives: [
          { method: 'full' },
          { method: 'proportionate', consolidationPct: 0.8 },
          { method: 'equity_method' },
        ],
      },
    },
  };
}

function calculabilityDocumentation(): Record<string, unknown> {
  return {
    _calculability_requirements: {
      _description: 'This section is editor documentation only. It states what must exist for each peer-table metric. Missing source data should remain missing; use the alternative routes explicitly listed here rather than inventing zeroes or midpoint values.',
      _five_year_target: 'For a useful Producer peer model, aim to cover the current forecast year plus at least the following four calendar years. Exact annual points are not mandatory: source-backed closed annual ranges may be stored and calculated as ranges. Multi-year averages remain evidence unless the source explicitly provides annual values.',
      'Au/AuEq': {
        required: [
          'For every economically active included project: projects[].production with measure=produced covering the selected year.',
          'If production.basis=project_100pct: projects[].ownership covering the whole selected year is required for attributable Au/AuEq.',
          'If a project is explicitly pre-production or already closed in the selected year: add projects[].productionWindow so the engine can treat years outside the disclosed operating window as non-producing instead of missing.',
        ],
        alternatives: [
          'Company-level reportedMetrics metric=production can be displayed as reported evidence when canonical attributable production is incomplete.',
          'A closed annual range is valid evidence and a valid interval input; do not midpoint it.',
        ],
      },
      Revenue: {
        required: [
          'Production quantity by metal for the selected year. Revenue quantity preference is payable > sold > produced.',
          'A selected metal price. SPOT/LT prices come from runtime; REPORTED requires a matching reportedPriceDeck.',
          'Financial consolidation basis must be known when source project production is reported at 100% but financial statements consolidate a different share.',
        ],
        alternatives: [
          'If only company-level reported production exists, the UI may show a reported-production × selected-price revenue range/proxy, clearly labelled non-canonical.',
          'reportedMetrics metric=revenue may be displayed separately, but does not become shared-deck canonical Revenue unless repricing is explicitly supported.',
        ],
      },
      EBITDA: {
        formula: 'Revenue - cash operating cost - royalties - production taxes - TC/RC - site G&A - corporate G&A - other recurring operating cash expenses.',
        required: [
          'Canonical Revenue route above.',
          'cash_operating_cost',
          'royalty',
          'production_tax',
          'tc_rc',
          'site_gna',
          'corporate_gna',
          'other_recurring_operating',
        ],
        replacement_rules: [
          'A company-level corporateCosts disclosure for a component may replace project-by-project disclosures for that component when the source truly covers the whole company.',
          'If one disclosed composite cost includes other components, state them in CostDisclosure.definition.includesComponents; do not add the same cost twice.',
          'A source-backed explicit zero is acceptable. Missing is not zero.',
          'AISC/cash cost reportedMetrics do not by themselves replace the EBITDA bridge.',
        ],
      },
      'FCFF före growth': {
        formula: 'EBITDA - sustaining CAPEX - sustaining exploration/development - cash income tax - working-capital delta - other recurring non-EBITDA cash spend.',
        required: [
          'Canonical EBITDA route above.',
          'sustaining_capex',
          'sustaining_exploration and/or deferred_stripping / underground_development as applicable',
          'cash_income_tax',
          'working_capital_delta',
          'other_cash where recurring pre-growth cash spend exists, or source-backed explicit zero/non-applicability.',
        ],
        alternatives: ['reportedMetrics metric=fcf is evidence/display only unless its definition is explicitly bridged to canonical FCFF.'],
      },
      'FCFF efter growth': {
        formula: 'FCFF före growth - growth CAPEX - growth exploration/development.',
        required: [
          'Canonical FCFF före growth route above.',
          'growth_capex',
          'growth_exploration where applicable, or source-backed explicit zero/non-applicability.',
        ],
      },
      EV: {
        required: [
          'Live Market Cap from runtime, or explicit reportedMarketCap evidence.',
          'valuation.balanceSheet.cashAndEquivalents',
          'valuation.balanceSheet.totalDebt',
          'A current usable balance-sheet date; stale_after_material_event deliberately blocks EV.',
        ],
        optional_but_material_if_present: ['leaseLiabilities', 'preferredEquity', 'nonControllingInterest', 'nonOperatingInvestments', 'otherEnterpriseAdjustments'],
      },
      _project_timing_and_consolidation_examples: {
        productionWindow: {
          startYear: 2028,
          endYear: 2036,
          _description: 'Use only when the source supports an operating/production window. Years before startYear and after endYear are then not treated as unexplained missing production.',
          provenance: {
            sourceId: 'src_mine_plan',
            estimateClass: 'technical_report',
            confidence: 'high',
            confidenceReason: 'Explicit production years in mine plan.',
          },
        },
        financialConsolidation: {
          method: 'full',
          _choices_method: ['full', 'proportionate', 'equity_method'],
          _description: 'Separate accounting consolidation from equity ownership. full means 100% project operating results are consolidated and NCI belongs in EV; proportionate requires consolidationPct; equity_method means project revenue/EBITDA is not consolidated line-by-line.',
          provenance: {
            sourceId: 'src_financials',
            estimateClass: 'actual',
            confidence: 'high',
            confidenceReason: 'Consolidation basis verified from financial statements.',
          },
        },
      },
    },
  };
}

/**
 * Adds the canonical editor-only _description/_choices/_example/_reference metadata
 * to an existing Producer JSON while preserving every real company input.
 *
 * Arrays containing real evidence (projects, costs, metrics, sources, decks) are
 * never merged with examples; the existing arrays win unchanged. Examples live
 * only in underscore-prefixed metadata fields and are ignored by the engine.
 */
export function decorateProducerJsonForEditor(
  producer: ProducerJsonV1,
  symbol: string,
): ProducerJsonV1 & Record<string, unknown> {
  const base = buildProducerJsonV1Template(
    symbol,
    producer.valuation?.valuationDateUtc ?? new Date().toISOString().slice(0, 10),
  ) as unknown as Record<string, unknown>;
  const current = producer as unknown as Record<string, unknown>;

  const baseCompany = asRecord(base.company);
  const currentCompany = asRecord(current.company);
  const baseSecurity = asRecord(baseCompany.primarySecurity);
  const currentSecurity = asRecord(currentCompany.primarySecurity);
  const baseValuation = asRecord(base.valuation);
  const currentValuation = asRecord(current.valuation);

  return {
    ...base,
    ...current,
    ...canonicalEditorDocumentation(base),
    ...calculabilityDocumentation(),
    company: {
      ...baseCompany,
      ...currentCompany,
      primarySecurity: {
        ...baseSecurity,
        ...currentSecurity,
      },
    },
    valuation: {
      ...baseValuation,
      ...currentValuation,
    },
    // Explicitly preserve evidence arrays as-is. The template keeps its examples
    // in underscore-prefixed sibling fields, never inside these arrays.
    reportedPriceDecks: Array.isArray(current.reportedPriceDecks) ? current.reportedPriceDecks : [],
    projects: Array.isArray(current.projects) ? current.projects : [],
    corporateCosts: Array.isArray(current.corporateCosts) ? current.corporateCosts : [],
    reportedMetrics: Array.isArray(current.reportedMetrics) ? current.reportedMetrics : [],
    sources: Array.isArray(current.sources) ? current.sources : [],
  } as unknown as ProducerJsonV1 & Record<string, unknown>;
}

export function buildDocumentedProducerJsonTemplate(symbol: string): ProducerJsonV1 & Record<string, unknown> {
  return decorateProducerJsonForEditor(buildProducerJsonV1Template(symbol), symbol);
}
