import type { ProducerJsonV1, Provenance, ReportedMetric } from '../types.ts';

const OUTLOOK_SOURCE = 'lug-2026-guidance-three-year-outlook';
const Q2_SOURCE = 'lug-q2-2026-results';
const AISC_DEFINITION_SOURCE = 'lug-q1-2026-mda';
const STREAM_SOURCE = 'lug-lunr-silver-stream-2026';
const SHARE_SOURCE = 'lug-share-capital-2026-05-29';

function provenance(
  sourceId: string,
  estimateClass: Provenance['estimateClass'],
  rawText?: string,
  confidence: Provenance['confidence'] = 'high',
): Provenance {
  return {
    sourceId,
    estimateClass,
    confidence,
    confidenceReason: confidence === 'high'
      ? 'Direct Lundin Gold disclosure; ranges and commercial terms are preserved without interpolation.'
      : 'Disclosure is retained with an explicit limitation and is not promoted to an exact canonical value.',
    ...(rawText ? { rawText } : {}),
  };
}

function reportedCostMetric(args: {
  id: string;
  year: number;
  metric: 'cash_cost' | 'aisc';
  low: number;
  high: number;
  definition?: ReportedMetric['definition'];
}): ReportedMetric {
  return {
    id: args.id,
    scope: { type: 'project', projectId: 'fdn-district' },
    period: { kind: 'year', year: args.year },
    metric: args.metric,
    value: { kind: 'range', low: args.low, high: args.high },
    unit: 'USD_per_toz_sold',
    sourcePriceDeckRef: 'lug-guidance-2026-2028',
    definition: args.definition,
    provenance: provenance(OUTLOOK_SOURCE, 'company_guidance'),
  };
}

export function buildLundinGoldProducerJsonV1(valuationDateUtc: string): ProducerJsonV1 {
  const guidance = provenance(OUTLOOK_SOURCE, 'company_guidance');
  const q2Actual = provenance(Q2_SOURCE, 'actual');
  const aiscDefinition = provenance(
    AISC_DEFINITION_SOURCE,
    'actual',
    'AISC is cash operating costs + corporate social responsibility + treatment/refining charges + restoration accretion + sustaining capital expenditures - silver revenues, divided by gold ounces sold.',
  );
  const stream = provenance(
    STREAM_SOURCE,
    'actual',
    'Silver stream effective March 1, 2026. Tier selection for a future calendar year requires cumulative delivered payable silver; this dataset does not infer that quantity.',
  );

  const aiscDefinitionFields: ReportedMetric['definition'] = {
    includes: [
      'cash operating costs',
      'corporate social responsibility costs',
      'treatment and refining charges',
      'accretion of restoration provision',
      'sustaining capital expenditures',
    ],
    excludes: [],
    netOfByproductCredits: true,
    denominatorMeasure: 'sold',
  };

  return {
    version: 'producer_json_v1',
    company: {
      id: 'lug',
      name: 'Lundin Gold Inc.',
      reportingCurrency: 'USD',
      primarySecurity: {
        ticker: 'LUG',
        exchange: 'TSX',
        quoteCurrency: 'CAD',
        securityType: 'common',
      },
    },
    valuation: {
      valuationDateUtc,
      // Deliberately no sharesOutstanding fallback here. The May 29 issued-share count is retained as source evidence,
      // but live Market Cap should come from the current provider snapshot rather than current price × a potentially stale count.
      balanceSheet: {
        asOfDate: '2026-06-30',
        cashAndEquivalents: {
          value: 507_130_000,
          currency: 'USD',
          asOfDate: '2026-06-30',
          provenance: q2Actual,
        },
        // Q2 public results used here disclose current cash but do not state a June 30 debt amount in the cited table.
        // Do not carry forward Q1's "no debt" statement as a silent June 30 exact balance.
      },
    },
    reportedPriceDecks: [
      {
        id: 'lug-guidance-2026-2028',
        label: 'Lundin Gold 2026-2028 guidance assumptions',
        metals: {
          Au: { value: 4_000, unit: 'USD_per_toz' },
          Ag: { value: 44, unit: 'USD_per_toz' },
        },
        provenance: guidance,
      },
    ],
    projects: [
      {
        id: 'fdn-district',
        name: 'Fruta del Norte District',
        primaryMetal: 'Au',
        statusAsOfValuationDate: 'operating',
        ownership: [
          {
            effectiveFrom: '2014-01-01',
            ownershipPct: 1,
            provenance: provenance(Q2_SOURCE, 'actual', 'Lundin Gold describes Fruta del Norte as 100%-owned.'),
          },
        ],
        production: [
          {
            id: 'fdn-au-2026-guidance',
            metal: 'Au',
            measure: 'produced',
            period: { kind: 'year', year: 2026 },
            quantity: { kind: 'range', low: 475_000, high: 525_000 },
            unit: 'toz',
            basis: 'project_100pct',
            provenance: guidance,
          },
          {
            id: 'fdn-au-2027-outlook',
            metal: 'Au',
            measure: 'produced',
            period: { kind: 'year', year: 2027 },
            quantity: { kind: 'range', low: 475_000, high: 525_000 },
            unit: 'toz',
            basis: 'project_100pct',
            provenance: guidance,
          },
          {
            id: 'fdn-au-2028-outlook',
            metal: 'Au',
            measure: 'produced',
            period: { kind: 'year', year: 2028 },
            quantity: { kind: 'range', low: 475_000, high: 525_000 },
            unit: 'toz',
            basis: 'project_100pct',
            provenance: {
              ...guidance,
              rawText: 'Production levels for 2028 may vary depending on the outcome of the expansion study and its investment decision.',
            },
          },
        ],
        metalStreams: [
          {
            id: 'fdn-lunr-silver-stream',
            metal: 'Ag',
            effectiveFrom: '2026-03-01',
            deliveryMeasure: 'payable',
            tiers: [
              {
                cumulativeDeliveryThresholdToz: 12_200_000,
                streamedPayablePct: 1,
                ongoingPaymentPctSpot: 0.10,
              },
              {
                cumulativeDeliveryThresholdToz: 20_000_000,
                streamedPayablePct: 0.50,
                ongoingPaymentPctSpot: 0.20,
              },
              {
                cumulativeDeliveryThresholdToz: null,
                streamedPayablePct: 0.075,
                ongoingPaymentPctSpot: 0.30,
              },
            ],
            provenance: stream,
          },
        ],
        costs: [
          {
            id: 'fdn-sustaining-2026-guidance',
            component: 'sustaining_capex',
            period: { kind: 'year', year: 2026 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'sustaining',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 75_000_000, high: 90_000_000 }, currency: 'USD' },
            provenance: guidance,
          },
          {
            id: 'fdn-sustaining-2027-outlook',
            component: 'sustaining_capex',
            period: { kind: 'year', year: 2027 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'sustaining',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 80_000_000, high: 95_000_000 }, currency: 'USD' },
            provenance: guidance,
          },
          {
            id: 'fdn-sustaining-2028-outlook',
            component: 'sustaining_capex',
            period: { kind: 'year', year: 2028 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'sustaining',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 50_000_000, high: 85_000_000 }, currency: 'USD' },
            provenance: guidance,
          },
          {
            id: 'fdn-exploration-2026-guidance',
            component: 'growth_exploration',
            period: { kind: 'year', year: 2026 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'growth',
            model: { type: 'fixed_amount', amount: { kind: 'point', value: 85_000_000 }, currency: 'USD' },
            provenance: guidance,
          },
        ],
        reportedMetrics: [
          reportedCostMetric({ id: 'fdn-cash-cost-2026-guidance', year: 2026, metric: 'cash_cost', low: 900, high: 960, definition: { denominatorMeasure: 'sold' } }),
          reportedCostMetric({ id: 'fdn-aisc-2026-guidance', year: 2026, metric: 'aisc', low: 1_110, high: 1_170, definition: aiscDefinitionFields }),
          reportedCostMetric({ id: 'fdn-cash-cost-2027-outlook', year: 2027, metric: 'cash_cost', low: 900, high: 960, definition: { denominatorMeasure: 'sold' } }),
          reportedCostMetric({ id: 'fdn-aisc-2027-outlook', year: 2027, metric: 'aisc', low: 1_110, high: 1_180, definition: aiscDefinitionFields }),
          reportedCostMetric({ id: 'fdn-cash-cost-2028-outlook', year: 2028, metric: 'cash_cost', low: 905, high: 965, definition: { denominatorMeasure: 'sold' } }),
          reportedCostMetric({ id: 'fdn-aisc-2028-outlook', year: 2028, metric: 'aisc', low: 1_060, high: 1_170, definition: aiscDefinitionFields }),
        ].map((metric) => metric.metric === 'aisc' ? { ...metric, provenance: aiscDefinition } : metric),
      },
    ],
    sources: [
      {
        id: OUTLOOK_SOURCE,
        sourceType: 'company_release',
        publisher: 'Lundin Gold Inc.',
        title: 'Lundin Gold Provides 2026 Guidance and Strategic Three-Year Outlook Highlighting Continued Growth and Exploration',
        publishedDate: '2025-12-08',
        url: 'https://lundingold.com/news/lundin-gold-provides-2026-guidance-and-strategic-t-122826/',
      },
      {
        id: Q2_SOURCE,
        sourceType: 'company_release',
        publisher: 'Lundin Gold Inc.',
        title: 'Lundin Gold Reports Second Quarter 2026 Results',
        publishedDate: '2026-08-06',
        url: 'https://lundingold.com/news/lundin-gold-reports-second-quarter-2026-results-122856/',
      },
      {
        id: AISC_DEFINITION_SOURCE,
        sourceType: 'financial_statement',
        publisher: 'Lundin Gold Inc.',
        title: 'Management’s Discussion and Analysis – Three Months Ended March 31, 2026',
        publishedDate: '2026-05-06',
        url: 'https://lundingold.com/site/assets/files/111781/lug_q1_2026_shareholder_report.pdf',
      },
      {
        id: STREAM_SOURCE,
        sourceType: 'company_release',
        publisher: 'Lundin Gold Inc.',
        title: 'Lundin Gold Announces $670 Million Silver Stream-for-Equity Transaction with LunR Royalties',
        publishedDate: '2026-02-22',
        url: 'https://lundingold.com/news/lundin-gold-announces-670-million-silver-stream-f-122835/',
      },
      {
        id: SHARE_SOURCE,
        sourceType: 'company_release',
        publisher: 'Lundin Gold Inc.',
        title: 'Lundin Gold Share Capital and Voting Rights Update',
        publishedDate: '2026-05-29',
        url: 'https://lundingold.com/news/lundin-gold-share-capital-and-voting-rights-update-122849/',
      },
    ],
  };
}
