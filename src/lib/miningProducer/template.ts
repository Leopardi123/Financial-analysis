import type { ProducerJsonV1 } from './types.ts';

const PROJECT_STATUS_CHOICES = [
  'operating',
  'ramp_up',
  'construction',
  'sanctioned',
  'development',
  'study',
  'care_maintenance',
  'closed',
] as const;

const PRODUCTION_MEASURE_CHOICES = ['produced', 'sold', 'payable'] as const;
const PRODUCTION_UNIT_CHOICES = ['toz', 'koz', 'Moz', 'tonne', 'kt', 'lb'] as const;
const PRODUCTION_BASIS_CHOICES = ['attributable', 'project_100pct'] as const;
const ESTIMATE_CLASS_CHOICES = [
  'actual',
  'company_guidance',
  'company_target',
  'technical_report',
  'mine_plan',
  'mine_plan_derived',
  'analyst_consensus',
  'derived',
  'scenario',
] as const;
const CONFIDENCE_CHOICES = ['high', 'medium', 'low'] as const;
const SOURCE_TYPE_CHOICES = [
  'company_release',
  'company_presentation',
  'financial_statement',
  'technical_report',
  'regulatory_filing',
  'analyst_report',
  'other',
] as const;
const COST_COMPONENT_CHOICES = [
  'cash_operating_cost',
  'royalty',
  'production_tax',
  'tc_rc',
  'site_gna',
  'corporate_gna',
  'sustaining_capex',
  'sustaining_exploration',
  'deferred_stripping',
  'underground_development',
  'growth_capex',
  'growth_exploration',
  'cash_income_tax',
  'working_capital_delta',
  'reclamation_cash',
  'reclamation_accretion',
  'other_recurring_operating',
  'other_cash',
] as const;
const COST_CLASSIFICATION_CHOICES = [
  'operating',
  'sustaining',
  'growth',
  'tax',
  'working_capital',
  'noncash',
  'excluded',
  'unknown',
] as const;
const ECONOMIC_BASIS_CHOICES = ['project_100pct', 'attributable', 'company'] as const;
const REPORTED_METRIC_CHOICES = ['revenue', 'ebitda', 'fcf', 'cash_cost', 'aisc', 'aueq', 'production'] as const;
const SHARES_BASIS_CHOICES = [
  'basic_actual',
  'fully_diluted',
  'weighted_average_basic',
  'weighted_average_diluted',
] as const;

export type ProducerJsonV1Template = ProducerJsonV1 & Record<string, unknown>;

function exampleProvenance(sourceId = 'src_1'): Record<string, unknown> {
  return {
    sourceId,
    estimateClass: 'company_guidance',
    confidence: 'high',
    confidenceReason: 'Direct company disclosure; no interpolation.',
    locator: 'p. 12 / Guidance table',
    rawText: 'Optional short source excerpt or note.',
  };
}

export function buildProducerJsonV1Template(
  symbol: string,
  valuationDateUtc = new Date().toISOString().slice(0, 10),
): ProducerJsonV1Template {
  const ticker = symbol.trim().toUpperCase();

  return {
    version: 'producer_json_v1',
    _description: 'Corporate/Producer evidence contract. Store company disclosures here; the Producer engine creates normalized production, revenue, EBITDA, FCFF, AuEq and valuation metrics from this evidence. Unknown data must be omitted, not replaced with zero.',
    _choices_version: ['producer_json_v1'],
    _how_to_fill: [
      '1. Fill company and primarySecurity first. Ticker must match the company route/storage symbol.',
      '2. Add every source document to sources[] and reference it with provenance.sourceId everywhere data is used.',
      '3. Add the latest usable balance sheet under valuation.balanceSheet for EV. Current spot price, FX and market cap are runtime data and normally should not be entered manually.',
      '4. Add one projects[] object per mine/project. Add ownership periods before production/cost disclosures.',
      '5. Add production disclosures exactly as published. Do not midpoint ranges or turn multi-year averages into individual years.',
      '6. Add decomposable cost components where disclosed. Reported AISC/cash cost belong in reportedMetrics and do NOT substitute for canonical cost components needed for EBITDA/FCFF.',
      '7. Add reportedPriceDecks only for company/source assumptions used in REPORTED mode. appliesTo determines which calendar year uses each deck.',
      '8. Validate before saving. Missing information should remain missing; never invent values to make a metric calculable.',
    ],
    _hard_rules: [
      'No guessing. No hidden midpointing. No silent annualization of year-range averages/totals.',
      'Use point only for an actual point estimate. Use approximate/range/upper_bound/lower_bound when that is what the source says.',
      'A company without a saved producer_json_v1 is not shown in COMPARE STOCKS.',
      'SPOT price deck, current FX, current quote/market cap and run valuation date come from Instrumentbrädan runtime infrastructure.',
      'For physical peer production/AuEq, produced quantity is required. sold/payable do not replace produced for that metric.',
      'For revenue quantity the engine prefers payable, then sold, then produced. Using produced as revenue quantity is explicitly marked approximation.',
      'If only reported AISC/cash cost exists, keep it as reportedMetrics. Do not manufacture canonical EBITDA or FCFF from AISC alone.',
      'project_100pct production/costs are ownership-adjusted by the engine. attributable inputs must not be ownership-adjusted a second time.',
    ],

    company: {
      _description: 'Identity and primary traded security used to resolve live market data.',
      id: ticker.toLowerCase(),
      _description_id: 'Stable internal company id. Must be unique across saved Producer JSON files. It does not have to equal ticker, but should remain stable if ticker changes.',
      name: '',
      reportingCurrency: 'USD',
      _description_reportingCurrency: 'Company reporting currency. This is metadata; individual monetary disclosures still carry their own currency where required.',
      primarySecurity: {
        _description: 'Primary security used for live quote/market-cap resolution. Do not guess exchange suffixes; ticker must match the storage route exactly.',
        ticker,
        exchange: '',
        quoteCurrency: 'USD',
        securityType: 'common',
        _choices_securityType: ['common', 'adr'],
        _description_adrRatio: 'Only relevant for ADR. If securityType=adr, provide adrRatio only when explicitly verified. Price×shares fallback is intentionally blocked for ADR unless share-class normalization is safe.',
        _example_adrRatio: 0.5,
      },
    },

    valuation: {
      _description: 'Balance-sheet evidence for EV plus optional market-value evidence. valuationDateUtc is required by the contract but is overwritten on a runtime copy with the current Producer run date.',
      valuationDateUtc,
      _description_valuationDateUtc: 'Required storage placeholder / evidence date. Current Producer runs replace this with the run valuation date so saved JSON does not become stale merely because a day passes.',
      _description_market_value_alternatives: 'Normally omit manual marketPrice/reportedMarketCap/sharesOutstanding because live runtime hydrates them. If used as explicit evidence, market cap precedence is reportedMarketCap first; otherwise marketPrice × sharesOutstanding is allowed only for basic_actual common shares. Weighted-average shares are not a valid current-share substitute.',
      _example_marketPrice: {
        value: 42.5,
        currency: 'CAD',
        asOfDate: '2026-08-23',
        provenance: exampleProvenance('src_market'),
      },
      _example_reportedMarketCap: {
        value: 5_000_000_000,
        currency: 'CAD',
        asOfDate: '2026-08-23',
        provenance: exampleProvenance('src_market'),
      },
      _example_sharesOutstanding: {
        value: 117_647_059,
        basis: 'basic_actual',
        asOfDate: '2026-08-23',
        provenance: exampleProvenance('src_shares'),
      },
      _choices_sharesOutstanding_basis: [...SHARES_BASIS_CHOICES],
      _description_balanceSheet: 'Needed for EV. totalDebt and cashAndEquivalents are required for an exact EV bridge; optional preferred/NCI/leases/investments default to zero only when deliberately omitted. Mark a pre-transaction balance stale_after_material_event if a material acquisition/financing makes it non-current.',
      _example_balanceSheet: {
        asOfDate: '2026-06-30',
        usability: 'current_as_of_date',
        _choices_usability: ['current_as_of_date', 'stale_after_material_event'],
        usabilityReason: 'Required explanation when usability=stale_after_material_event.',
        cashAndEquivalents: {
          value: 250_000_000,
          currency: 'USD',
          asOfDate: '2026-06-30',
          provenance: exampleProvenance('src_q2'),
        },
        totalDebt: {
          value: 100_000_000,
          currency: 'USD',
          asOfDate: '2026-06-30',
          provenance: exampleProvenance('src_q2'),
        },
        leaseLiabilities: {
          value: 25_000_000,
          currency: 'USD',
          provenance: exampleProvenance('src_q2'),
        },
        preferredEquity: {
          value: 0,
          currency: 'USD',
          provenance: exampleProvenance('src_q2'),
        },
        nonControllingInterest: {
          value: 0,
          currency: 'USD',
          provenance: exampleProvenance('src_q2'),
        },
        nonOperatingInvestments: {
          value: 0,
          currency: 'USD',
          provenance: exampleProvenance('src_q2'),
        },
        otherEnterpriseAdjustments: [
          {
            id: 'stream_obligation_example',
            amount: 50_000_000,
            currency: 'USD',
            treatment: 'add',
            _choices_treatment: ['add', 'subtract'],
            description: 'Example only. Add an EV adjustment only when its treatment is explicitly justified.',
            provenance: exampleProvenance('src_q2'),
          },
        ],
      },
    },

    reportedPriceDecks: [],
    _description_reportedPriceDecks: 'Optional source/company price assumptions for REPORTED mode. These do not affect SPOT. Each deck used by REPORTED should have exactly one non-overlapping appliesTo period.',
    _example_reportedPriceDeck: {
      id: 'guidance-2026',
      label: '2026 guidance assumptions',
      appliesTo: { year: 2026 },
      _description_appliesTo: 'Choose exactly one shape: {year} OR {startYear,endYear}. Overlapping decks are rejected as ambiguous.',
      _examples_appliesTo: [
        { year: 2026 },
        { startYear: 2027, endYear: 2029 },
      ],
      metals: {
        Au: { value: 3_000, unit: 'USD_per_toz' },
        Ag: { value: 35, unit: 'USD_per_toz' },
        Cu: { value: 9_500, unit: 'USD_per_tonne' },
      },
      fx: {
        CAD_per_USD: 1.35,
        BRL_per_USD: 5.2,
      },
      provenance: exampleProvenance('src_guidance'),
    },

    projects: [],
    _description_projects: 'One object per mine/project. A mine may have multiple production disclosures by metal/measure/year. Do not combine separate assets merely to make company totals easier.',
    _example_project: {
      id: 'mine_1',
      name: 'Mine 1',
      primaryMetal: 'Au',
      statusAsOfValuationDate: 'operating',
      _choices_statusAsOfValuationDate: [...PROJECT_STATUS_CHOICES],
      _description_statusAsOfValuationDate: 'BASE includes operating/ramp_up/construction/sanctioned. GROWTH additionally includes development/study. care_maintenance/closed are excluded from both unless model rules are changed explicitly.',
      ownership: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: '2026-12-31',
          ownershipPct: 0.8,
          _description_ownershipPct: 'Decimal 0..1, not percent 0..100. Omit effectiveTo for open-ended ownership. Mid-year ambiguity is not silently prorated.',
          provenance: exampleProvenance('src_ownership'),
        },
        {
          effectiveFrom: '2027-01-01',
          ownershipPct: 1,
          provenance: exampleProvenance('src_ownership_2'),
        },
      ],
      production: [
        {
          id: 'mine1-au-produced-2026',
          metal: 'Au',
          measure: 'produced',
          _choices_measure: [...PRODUCTION_MEASURE_CHOICES],
          _description_measure: 'produced is required for physical peer production/AuEq. For revenue, payable replaces sold, and sold replaces produced when available: payable > sold > produced.',
          period: { kind: 'year', year: 2026 },
          quantity: { kind: 'range', low: 180, high: 200 },
          unit: 'koz',
          _choices_unit: [...PRODUCTION_UNIT_CHOICES],
          basis: 'project_100pct',
          _choices_basis: [...PRODUCTION_BASIS_CHOICES],
          provenance: exampleProvenance('src_guidance'),
        },
      ],
      metalStreams: [
        {
          id: 'ag_stream_1',
          metal: 'Ag',
          effectiveFrom: '2026-03-01',
          deliveryMeasure: 'payable',
          _choices_deliveryMeasure: ['payable'],
          tiers: [
            {
              cumulativeDeliveryThresholdToz: 5_000_000,
              streamedPayablePct: 1,
              ongoingPaymentPctSpot: 0.1,
            },
            {
              cumulativeDeliveryThresholdToz: null,
              streamedPayablePct: 0.075,
              ongoingPaymentPctSpot: 0.3,
            },
          ],
          _description_tiers: 'Use null threshold for final open-ended tier. If the active future tier cannot be determined from cumulative deliveries, future stream economics remain unresolved rather than guessed.',
          provenance: exampleProvenance('src_stream'),
        },
      ],
      costs: [
        {
          id: 'mine1-opex-2026',
          component: 'cash_operating_cost',
          period: { kind: 'year', year: 2026 },
          economicBasis: 'project_100pct',
          canonicalClassification: 'operating',
          model: {
            type: 'per_unit',
            amount: { kind: 'point', value: 900 },
            currency: 'USD',
            denominator: { metal: 'Au', unit: 'toz', measure: 'produced' },
            netOfByproductCredits: false,
          },
          provenance: exampleProvenance('src_guidance'),
        },
      ],
      reportedMetrics: [
        {
          id: 'mine1-aisc-2026',
          scope: { type: 'project', projectId: 'mine_1' },
          period: { kind: 'year', year: 2026 },
          metric: 'aisc',
          value: { kind: 'range', low: 1_250, high: 1_350 },
          unit: 'USD_per_toz_sold',
          sourcePriceDeckRef: 'guidance-2026',
          definition: {
            definitionSourceId: 'src_aisc_definition',
            includes: ['cash costs', 'royalties', 'sustaining capital'],
            excludes: ['growth capital'],
            netOfByproductCredits: true,
            denominatorMeasure: 'sold',
          },
          provenance: exampleProvenance('src_guidance'),
        },
      ],
    },

    corporateCosts: [],
    _description_corporateCosts: 'Company-level costs not belonging to one project, e.g. corporate G&A, company cash tax or other recurring cash items. Use economicBasis=company. Do not duplicate a cost already included at project level.',
    _example_corporateCost: {
      id: 'corporate-gna-2026',
      component: 'corporate_gna',
      period: { kind: 'year', year: 2026 },
      economicBasis: 'company',
      canonicalClassification: 'operating',
      model: {
        type: 'fixed_amount',
        amount: { kind: 'point', value: 60_000_000 },
        currency: 'USD',
      },
      provenance: exampleProvenance('src_guidance'),
    },

    reportedMetrics: [],
    _description_reportedMetrics: 'Company-level reported/non-GAAP metrics used for display/evidence. These do not silently replace canonical engine inputs. In particular reported AISC/cash_cost alone cannot synthesize canonical EBITDA/FCFF.',
    _example_reportedMetric: {
      id: 'company-aisc-2026',
      scope: { type: 'company' },
      period: { kind: 'year', year: 2026 },
      metric: 'aisc',
      value: { kind: 'range', low: 1_300, high: 1_400 },
      unit: 'USD_per_toz_sold',
      sourcePriceDeckRef: 'guidance-2026',
      definition: {
        definitionSourceId: 'src_aisc_definition',
        netOfByproductCredits: true,
        denominatorMeasure: 'sold',
      },
      provenance: exampleProvenance('src_guidance'),
    },

    sources: [],
    _description_sources: 'Source registry. Every provenance.sourceId and definitionSourceId should resolve to one source id here. Prefer primary company/regulatory/technical-report sources; analyst consensus must be explicitly labelled as such.',
    _example_source: {
      id: 'src_guidance',
      sourceType: 'company_release',
      _choices_sourceType: [...SOURCE_TYPE_CHOICES],
      publisher: 'Example Mining Co.',
      title: '2026 Guidance',
      publishedDate: '2026-02-15',
      url: 'https://example.com/source',
    },

    _reference: {
      numericClaim: {
        _description: 'Choose exactly one claim shape. Only point and approximate can become scalar engine values. range/upper_bound/lower_bound remain non-scalar and are not midpointed.',
        alternatives: [
          { kind: 'point', value: 200 },
          { kind: 'approximate', value: 200 },
          { kind: 'range', low: 180, high: 220 },
          { kind: 'upper_bound', value: 220 },
          { kind: 'lower_bound', value: 180 },
        ],
      },
      periodClaim: {
        _description: 'Choose exactly one period shape. Only kind=year maps directly to a calendar-year peer value. year_range_average/year_range_total/not_periodized remain evidence and are not fabricated into annual points.',
        alternatives: [
          { kind: 'year', year: 2026 },
          { kind: 'year_range_average', startYear: 2030, endYear: 2033 },
          { kind: 'year_range_total', startYear: 2026, endYear: 2028 },
          { kind: 'not_periodized', label: 'LOM average; annual timing not disclosed' },
        ],
      },
      provenance: {
        _description: 'Attach to every sourced/derived disclosure. estimateClass says what the number objectively is; confidence is a separate assessment and should include a reason.',
        _choices_estimateClass: [...ESTIMATE_CLASS_CHOICES],
        _choices_confidence: [...CONFIDENCE_CHOICES],
        example: exampleProvenance(),
      },
      production: {
        _choices_measure: [...PRODUCTION_MEASURE_CHOICES],
        _choices_unit: [...PRODUCTION_UNIT_CHOICES],
        _choices_basis: [...PRODUCTION_BASIS_CHOICES],
        _replacement_rules: [
          'Physical peer production and physical AuEq: produced is required; sold/payable are not substitutes.',
          'Revenue quantity: payable > sold > produced. produced fallback is marked approximation.',
          'Do not enter the same disclosure twice on both attributable and project_100pct basis.',
        ],
      },
      projectStatus: {
        _choices: [...PROJECT_STATUS_CHOICES],
        _case_rules: {
          BASE: ['operating', 'ramp_up', 'construction', 'sanctioned'],
          GROWTH_additionally_includes: ['development', 'study'],
          excluded: ['care_maintenance', 'closed'],
        },
      },
      costDisclosure: {
        _choices_component: [...COST_COMPONENT_CHOICES],
        _choices_economicBasis: [...ECONOMIC_BASIS_CHOICES],
        _choices_canonicalClassification: [...COST_CLASSIFICATION_CHOICES],
        _description: 'Each cost disclosure chooses exactly one model shape below. AISC/cash cost should normally be reportedMetrics, not invented as canonical cost components.',
        _replacement_rules: [
          'fixed_amount and per_unit are alternative representations of a cost, not additive descriptions of the same cost.',
          'percent_revenue is for explicitly revenue-linked items such as royalties/taxes.',
          'price_linked is only for a source that gives an explicit reference value and sensitivity formula.',
          'reported_total is allowed as evidence when a total is reported but cannot be decomposed; priceSensitivity=unknown prevents false repricing.',
          'derived requires explicit inputIds and method; it must not hide assumptions.',
          'Reported AISC/cash cost does not replace cash_operating_cost/royalty/TC-RC/G&A/sustaining inputs required by canonical EBITDA/FCFF.',
        ],
        _examples_models: {
          fixed_amount: {
            type: 'fixed_amount',
            amount: { kind: 'point', value: 50_000_000 },
            currency: 'USD',
          },
          per_unit: {
            type: 'per_unit',
            amount: { kind: 'point', value: 900 },
            currency: 'USD',
            denominator: { metal: 'Au', unit: 'toz', measure: 'produced' },
            netOfByproductCredits: false,
            sourcePriceDeckRef: 'guidance-2026',
          },
          percent_revenue: {
            type: 'percent_revenue',
            rate: { kind: 'point', value: 0.02 },
            revenueScope: { type: 'total_metal_revenue' },
            _alternative_revenueScope: { type: 'metal', metal: 'Au' },
          },
          price_linked: {
            type: 'price_linked',
            referenceValue: { kind: 'point', value: 1_300 },
            output: {
              kind: 'per_unit',
              currency: 'USD',
              denominator: { metal: 'Au', unit: 'toz', measure: 'sold' },
              netOfByproductCredits: true,
            },
            sensitivities: [
              {
                driverMetal: 'Au',
                referencePrice: 3_000,
                driverPriceUnit: 'USD_per_toz',
                slope: 0.12,
              },
            ],
            sourcePriceDeckRef: 'guidance-2026',
          },
          reported_total: {
            type: 'reported_total',
            amount: { kind: 'point', value: 100_000_000 },
            currency: 'USD',
            sourcePriceDeckRef: 'guidance-2026',
            priceSensitivity: 'unknown',
            _choices_priceSensitivity: ['not_price_sensitive', 'unknown'],
          },
          derived: {
            type: 'derived',
            method: 'Explicitly describe the calculation.',
            inputIds: ['cost_input_1', 'cost_input_2'],
          },
        },
      },
      reportedMetric: {
        _choices_metric: [...REPORTED_METRIC_CHOICES],
        _description: 'Use for company/project metrics exactly as reported. These remain separate from canonical economics unless the engine has an explicit bridge.',
        _scope_alternatives: [
          { type: 'company' },
          { type: 'project', projectId: 'mine_1' },
        ],
      },
      units: {
        preciousMetals: 'Au/Ag physical production canonicalizes to troy ounces (toz). Accepted input: toz/koz/Moz.',
        baseMetals: 'Cu/Zn/Pb/Ni physical production canonicalizes to tonnes. Accepted input: tonne/kt/lb.',
        money: 'Monetary amounts are full currency units, never thousands/millions unless the field explicitly says so.',
        rates: 'Percent/rate fields use decimal form where model expects a fraction, e.g. 0.02 = 2%. ownershipPct is 0..1.',
      },
    },
  } as unknown as ProducerJsonV1Template;
}
