import { buildProducerJsonV1Template } from './template.ts';
import type { ProducerJsonV1 } from './types.ts';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function scenarioProvenance(reason: string): Record<string, unknown> {
  return {
    sourceId: 'src_analyst_base',
    estimateClass: 'scenario',
    confidence: 'medium',
    confidenceReason: reason,
  };
}

function canonicalEditorDocumentation(base: Record<string, unknown>): Record<string, unknown> {
  const baseReference = asRecord(base._reference);
  const baseNumericClaim = asRecord(baseReference.numericClaim);
  const baseProduction = asRecord(baseReference.production);
  const baseExampleProject = asRecord(base._example_project);

  return {
    _how_to_fill: [
      '1. Fill company and primarySecurity first. Ticker must match the company route/storage symbol.',
      '2. Add every source document to sources[] and reference it with provenance.sourceId everywhere source evidence is used.',
      '3. Add the latest usable balance sheet under valuation.balanceSheet for EV. Current spot price, FX and market cap are runtime data and normally should not be entered manually.',
      '4. Add one projects[] object per mine/project. Keep ownership, financial consolidation and production timing separate.',
      '5. Store company disclosures exactly as published in production/costs/reportedMetrics. Do not midpoint ranges or turn multi-year averages into annual source facts.',
      '6. For years beyond explicit guidance, use forecastAssumptions instead of fabricating source disclosures. carry_forward, periodize_source and explicit scenario rules are supported.',
      '7. A forecast rule must use estimateClass scenario, analyst_consensus, derived or mine_plan_derived. Explicit annual source data always wins over a forecast assumption for the same item.',
      '8. Add decomposable cost components where disclosed. Reported AISC/cash cost belong in reportedMetrics and do NOT substitute for canonical cost components needed for EBITDA/FCFF.',
      '9. If a disclosed cost already contains another canonical component, declare that under definition.includesComponents so coverage is satisfied without double counting.',
      '10. Aim to cover the current forecast year plus at least four following calendar years. Missing information may remain missing, but forecast hypotheses should be explicit and reviewable rather than hidden.',
    ],
    _hard_rules: [
      'No guessing disguised as source data. No hidden midpointing. No silent annualization of year-range averages/totals.',
      'Use point only for an actual point estimate. Use approximate/range/upper_bound/lower_bound when that is what the source says.',
      'Closed range claims may propagate as closed calculation intervals. They are never collapsed to a midpoint. upper_bound/lower_bound remain open bounds unless an explicit forecast scenario converts them to a closed assumption.',
      'A company without a saved producer_json_v1 is not shown in COMPARE STOCKS.',
      'SPOT price deck, current FX, current quote/market cap and run valuation date come from Instrumentbrädan runtime infrastructure.',
      'For physical peer production/AuEq, produced quantity is required. sold/payable do not replace produced for that metric.',
      'For revenue quantity the engine prefers payable, then sold, then produced. Using produced as revenue quantity is explicitly marked approximation.',
      'If only reported AISC/cash cost exists, keep it as reportedMetrics. Do not manufacture canonical EBITDA or FCFF from AISC alone.',
      'project_100pct production is ownership-adjusted for attributable Au/AuEq. Revenue/EBITDA/FCFF must use the verified financialConsolidation basis when accounting consolidation differs from equity ownership.',
      'Do not use legal ownershipPct as a substitute for financial consolidation. A fully consolidated non-100%-owned mine may contribute 100% of revenue/EBITDA while NCI belongs in the EV bridge.',
      'forecastAssumptions are model hypotheses, never company facts. Exact annual evidence has precedence and forecast rules are fallback-only.',
      'A carry_forward rule must name the exact source disclosure/cost it extends and must state its annual production change or cost escalation explicitly, including 0 when flat.',
      'Do not encode ore milled/mined as a metal denominator. $/t ore engineering forecasts require a separate operating-driver extension and are not supported by producer_json_v1 yet.',
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
      forecastAssumptions: {
        _description: 'Optional analyst forecast layer. These rules create run-time exact-year scenario disclosures without changing the underlying evidence arrays.',
        production: [
          {
            id: 'mine1-production-flat-2027-2030',
            method: 'carry_forward',
            sourceDisclosureId: 'mine1-au-produced-2026',
            appliesTo: { startYear: 2027, endYear: 2030 },
            annualChangePct: 0,
            provenance: scenarioProvenance('BASE assumption: latest verified steady-state production continues until a newer mine-plan/guidance disclosure supersedes it.'),
          },
          {
            id: 'mine1-target-periodized',
            method: 'periodize_source',
            sourceDisclosureId: 'mine1-medium-term-target',
            appliesTo: { startYear: 2028, endYear: 2030 },
            quantity: { kind: 'range', low: 270, high: 330 },
            _description_quantity: 'Optional scenario override. Use when the source is approximate/open-ended and the analyst explicitly chooses a closed range for modeling. Omit quantity to carry the source claim unchanged.',
            provenance: scenarioProvenance('BASE periodization of a source-backed medium-term company target into explicit calendar years.'),
          },
        ],
        costs: [
          {
            id: 'mine1-cash-cost-forward-2027-2030',
            method: 'carry_forward',
            sourceCostId: 'mine1-opex-2026',
            appliesTo: { startYear: 2027, endYear: 2030 },
            annualEscalationPct: 0.025,
            provenance: scenarioProvenance('BASE assumption: latest verified operating-cost basis continues with explicit 2.5% annual escalation.'),
          },
          {
            id: 'mine1-wc-normalized-zero-2027-2030',
            method: 'explicit',
            appliesTo: { startYear: 2027, endYear: 2030 },
            component: 'working_capital_delta',
            economicBasis: 'project_100pct',
            canonicalClassification: 'working_capital',
            model: {
              type: 'fixed_amount',
              amount: { kind: 'point', value: 0 },
              currency: 'USD',
            },
            provenance: scenarioProvenance('BASE steady-state working-capital assumption. This is a model assumption, not a reported zero.'),
          },
        ],
      },
    },
    _example_forecastAssumptions: {
      _description: 'Top-level forecast assumptions currently support company-level corporate cost rules. Project production and project costs belong under projects[].forecastAssumptions.',
      corporateCosts: [
        {
          id: 'corporate-gna-forward-2027-2030',
          method: 'carry_forward',
          sourceCostId: 'corporate-gna-2026',
          appliesTo: { startYear: 2027, endYear: 2030 },
          annualEscalationPct: 0.02,
          provenance: scenarioProvenance('BASE assumption: latest verified corporate G&A continues with explicit 2% annual escalation.'),
        },
      ],
    },
    _reference: {
      ...baseReference,
      numericClaim: {
        ...baseNumericClaim,
        _description: 'Choose exactly one claim shape. point/approximate can become scalar values. A closed range remains a range and may propagate through interval production/revenue/cost/EBITDA/FCFF calculations without midpointing. upper_bound/lower_bound remain open bounds unless an explicit scenario rule supplies a closed assumption.',
      },
      production: {
        ...baseProduction,
        _replacement_rules: [
          'Physical peer production and physical AuEq: produced is required; sold/payable are not substitutes.',
          'Revenue quantity: payable > sold > produced. produced fallback is marked approximation.',
          'Closed annual ranges are valid calculation inputs and remain ranges; do not midpoint them.',
          'Do not enter the same source disclosure twice on both attributable and project_100pct basis.',
          'project_100pct production uses ownership for attributable Au/AuEq; project economics use financialConsolidation when accounting consolidation differs from ownership.',
          'Forecast rules materialize as estimateClass scenario/derived and do not rewrite the source production array.',
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
      forecastAssumptions: {
        _description: 'Explicit analyst forecast layer. Source evidence remains immutable. At run time a valid rule is materialized into an exact-year scenario disclosure only when no explicit annual disclosure already covers the same item.',
        _production_methods: {
          carry_forward: 'Copies one exact-year production disclosure forward. annualChangePct is mandatory; use 0 for flat steady-state. Point source claims become approximation-quality forecast points.',
          periodize_source: 'Assigns a source disclosure such as a medium-term target or multi-year average to explicit forecast years. Optional quantity may replace an open/approximate source with an explicit analyst scenario range.',
          explicit: 'Defines a direct analyst production assumption for an explicit year range. Use only when no source disclosure can be cleanly referenced.',
        },
        _cost_methods: {
          carry_forward: 'Copies one exact-year cost disclosure forward. annualEscalationPct is mandatory; use 0 for nominally flat. Per-unit costs remain per-unit and therefore scale with future forecast production.',
          explicit: 'Defines an explicit cost assumption over a year range, including a deliberately modeled zero. The provenance must state why the assumption is reasonable.',
        },
        _precedence: [
          'Explicit annual evidence always wins over forecast assumptions.',
          'Two overlapping forecast rules for the same production measure are rejected for that run rather than resolved by array order.',
          'Overlapping forecast cost coverage is rejected rather than double-counted.',
          'Forecast provenance must use scenario, analyst_consensus, derived or mine_plan_derived. actual/company_guidance/company_target belong in source evidence arrays.',
        ],
        _source_hierarchy_guidance: [
          'Prefer explicit annual company guidance/mine plan first.',
          'Then use source-backed periodization of multi-year company targets where calendar mapping is an explicit analyst assumption.',
          'Then carry forward the latest verified steady-state only when no source-backed change is known.',
          'Override carry-forward when a source indicates depletion, expansion, grade transition, throughput change, closure or another material operational change.',
        ],
      },
    },
  };
}

function calculabilityDocumentation(): Record<string, unknown> {
  return {
    _calculability_requirements: {
      _description: 'This section is editor documentation only. It states what must exist for each peer-table metric. Missing source data should remain missing, but an explicit forecastAssumption may provide a scenario/derived annual input for forecast years.',
      _five_year_target: 'For a useful Producer peer model, aim to cover the current forecast year plus at least the following four calendar years. Source facts and analyst assumptions remain separate. Closed annual ranges may be calculated as ranges; multi-year averages remain evidence unless an explicit periodize_source forecast rule maps them into calendar years.',
      'Au/AuEq': {
        required: [
          'For every economically active included project: projects[].production with measure=produced covering the selected year, OR a valid projects[].forecastAssumptions.production rule that materializes produced quantity for that year.',
          'If production.basis=project_100pct: projects[].ownership covering the whole selected year is required for attributable Au/AuEq.',
          'If a project is explicitly pre-production or already closed in the selected year: add projects[].productionWindow so the engine can treat years outside the disclosed operating window as non-producing instead of missing.',
        ],
        alternatives: [
          'Company-level reportedMetrics metric=production can be displayed as reported evidence when canonical attributable production is incomplete.',
          'A closed annual range is a valid interval input; do not midpoint it.',
          'A carry_forward forecast can represent steady-state continuation. A periodize_source rule can map a medium-term target to explicit years when that calendar mapping is an analyst assumption.',
        ],
      },
      Revenue: {
        required: [
          'Production quantity by metal for the selected year, from evidence or forecastAssumptions. Revenue quantity preference is payable > sold > produced.',
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
          'Each required cost may come from exact-year evidence or an explicit forecastAssumptions cost rule.',
          'A company-level corporateCosts disclosure/rule may replace project-by-project disclosures for a component only when it truly covers the whole company.',
          'If one disclosed composite cost includes other components, state them in CostDisclosure.definition.includesComponents; do not add the same cost twice.',
          'An explicit scenario zero is allowed when the analyst deliberately models the component as zero/non-applicable. It must be labeled scenario; it is not a reported zero.',
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
          'other_cash where recurring pre-growth cash spend exists, or an explicit scenario zero/non-applicability assumption.',
        ],
        alternatives: [
          'reportedMetrics metric=fcf is evidence/display only unless its definition is explicitly bridged to canonical FCFF.',
          'Historical/guide sustaining costs may be carried forward with an explicit annualEscalationPct when the analyst judges steady-state continuation reasonable.',
        ],
      },
      'FCFF efter growth': {
        formula: 'FCFF före growth - growth CAPEX - growth exploration/development.',
        required: [
          'Canonical FCFF före growth route above.',
          'growth_capex',
          'growth_exploration where applicable, or explicit scenario zero/non-applicability.',
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
      _known_limitations: [
        'The current Producer cost denominator supports produced/sold/payable metal quantities, not ore mined or ore milled. Do not fake $/t ore as a metal cost. An operating-driver extension is required for throughput × $/t ore engineering forecasts.',
        'derived CostModel remains evidence unless its derivation is implemented explicitly. forecastAssumptions cannot make an opaque derived formula canonical merely by carrying it forward.',
      ],
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
    forecastAssumptions: current.forecastAssumptions,
    reportedMetrics: Array.isArray(current.reportedMetrics) ? current.reportedMetrics : [],
    sources: Array.isArray(current.sources) ? current.sources : [],
  } as unknown as ProducerJsonV1 & Record<string, unknown>;
}

export function buildDocumentedProducerJsonTemplate(symbol: string): ProducerJsonV1 & Record<string, unknown> {
  return decorateProducerJsonForEditor(buildProducerJsonV1Template(symbol), symbol);
}
