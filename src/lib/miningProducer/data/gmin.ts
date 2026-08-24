import type { ProducerJsonV1, Provenance } from '../types.ts';

const Q2_2026_SOURCE = 'gmin-q2-2026';
const G2_CLOSE_SOURCE = 'gmin-g2-close-2026-07-29';
const OKO_CURRENT_SOURCE = 'gmin-oko-current-2026';
const GURUPI_CURRENT_SOURCE = 'gmin-gurupi-current-2026';

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
      ? 'Direct company disclosure; no interpolation or midpointing applied.'
      : 'Derived only where the source explicitly constrains the result.',
    ...(rawText ? { rawText } : {}),
  };
}

export function buildGminProducerJsonV1(valuationDateUtc: string): ProducerJsonV1 {
  const q2Guidance = provenance(Q2_2026_SOURCE, 'company_guidance');
  const q2Actual = provenance(Q2_2026_SOURCE, 'actual');
  const okoTarget = provenance(
    OKO_CURRENT_SOURCE,
    'company_target',
    'Combined Oko project: average life-of-mine annual production of approximately 500k Au oz; exact timing to be confirmed in an updated feasibility study targeted for mid-2027.',
  );
  const okoZero2026 = provenance(
    Q2_2026_SOURCE,
    'derived',
    'Company targets first gold pour in H2 2027; therefore 2026 Oko gold production is explicitly constrained to zero.',
    'medium',
  );
  const ownershipQ2 = provenance(Q2_2026_SOURCE, 'actual');
  const ownershipOko = provenance(OKO_CURRENT_SOURCE, 'actual');
  const ownershipGurupi = provenance(GURUPI_CURRENT_SOURCE, 'actual');

  return {
    version: 'producer_json_v1',
    company: {
      id: 'gmin',
      name: 'G Mining Ventures Corp.',
      reportingCurrency: 'USD',
      primarySecurity: {
        ticker: 'GMIN',
        exchange: 'TSX',
        quoteCurrency: 'CAD',
        securityType: 'common',
      },
    },
    valuation: {
      valuationDateUtc,
      balanceSheet: {
        asOfDate: '2026-06-30',
        usability: valuationDateUtc >= '2026-07-29' ? 'stale_after_material_event' : 'current_as_of_date',
        usabilityReason: valuationDateUtc >= '2026-07-29'
          ? 'G2 Goldfields acquisition closed on 2026-07-29 after the 2026-06-30 balance-sheet date; pre-transaction cash/debt must not be presented as current post-deal EV inputs.'
          : undefined,
        cashAndEquivalents: {
          value: 225_734_000,
          currency: 'USD',
          asOfDate: '2026-06-30',
          provenance: q2Actual,
        },
        totalDebt: {
          value: 33_019_000,
          currency: 'USD',
          asOfDate: '2026-06-30',
          provenance: q2Actual,
        },
      },
    },
    reportedPriceDecks: [
      {
        id: 'gmin-guidance-2026',
        label: 'GMIN 2026 guidance assumptions (Q2 2026 update)',
        metals: {
          Au: { value: 4_300, unit: 'USD_per_toz' },
        },
        fx: {
          BRL_per_USD: 5.15,
          CAD_per_USD: 1.40,
        },
        provenance: q2Guidance,
      },
      {
        id: 'gmin-guidance-2027',
        label: 'GMIN 2027 guidance assumptions maintained in Q2 2026 update',
        metals: {
          Au: { value: 4_000, unit: 'USD_per_toz' },
        },
        fx: {
          BRL_per_USD: 5.55,
          CAD_per_USD: 1.40,
        },
        provenance: q2Guidance,
      },
    ],
    projects: [
      {
        id: 'tocantinzinho',
        name: 'Tocantinzinho',
        primaryMetal: 'Au',
        statusAsOfValuationDate: 'operating',
        ownership: [
          { effectiveFrom: '2024-01-01', ownershipPct: 1, provenance: ownershipQ2 },
        ],
        production: [
          {
            id: 'tz-au-produced-2026-guidance',
            metal: 'Au',
            measure: 'produced',
            period: { kind: 'year', year: 2026 },
            quantity: { kind: 'range', low: 160, high: 190 },
            unit: 'koz',
            basis: 'project_100pct',
            provenance: q2Guidance,
          },
          {
            id: 'tz-au-produced-2027-guidance',
            metal: 'Au',
            measure: 'produced',
            period: { kind: 'year', year: 2027 },
            quantity: { kind: 'range', low: 200, high: 235 },
            unit: 'koz',
            basis: 'project_100pct',
            provenance: {
              ...q2Guidance,
              rawText: '2027 production guidance excludes production from Oko West.',
            },
          },
        ],
        costs: [
          {
            id: 'tz-sustaining-capex-2026-guidance',
            component: 'sustaining_capex',
            period: { kind: 'year', year: 2026 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'sustaining',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 38_000_000, high: 45_000_000 }, currency: 'USD' },
            provenance: q2Guidance,
          },
          {
            id: 'tz-stripping-2026-guidance',
            component: 'deferred_stripping',
            period: { kind: 'year', year: 2026 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'sustaining',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 31_000_000, high: 36_000_000 }, currency: 'USD' },
            provenance: q2Guidance,
          },
          {
            id: 'tz-exploration-2026-guidance',
            component: 'growth_exploration',
            period: { kind: 'year', year: 2026 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'growth',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 8_000_000, high: 10_000_000 }, currency: 'USD' },
            provenance: q2Guidance,
          },
          {
            id: 'tz-sustaining-capex-2027-guidance',
            component: 'sustaining_capex',
            period: { kind: 'year', year: 2027 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'sustaining',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 19_000_000, high: 23_000_000 }, currency: 'USD' },
            provenance: q2Guidance,
          },
          {
            id: 'tz-stripping-2027-guidance',
            component: 'deferred_stripping',
            period: { kind: 'year', year: 2027 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'sustaining',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 43_000_000, high: 51_000_000 }, currency: 'USD' },
            provenance: q2Guidance,
          },
          {
            id: 'tz-exploration-2027-guidance',
            component: 'growth_exploration',
            period: { kind: 'year', year: 2027 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'growth',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 8_000_000, high: 10_000_000 }, currency: 'USD' },
            provenance: q2Guidance,
          },
        ],
        reportedMetrics: [
          {
            id: 'tz-cash-cost-2026-guidance',
            scope: { type: 'project', projectId: 'tocantinzinho' },
            period: { kind: 'year', year: 2026 },
            metric: 'cash_cost',
            value: { kind: 'range', low: 836, high: 965 },
            unit: 'USD_per_toz_sold',
            sourcePriceDeckRef: 'gmin-guidance-2026',
            definition: { denominatorMeasure: 'sold' },
            provenance: q2Guidance,
          },
          {
            id: 'tz-aisc-2026-guidance',
            scope: { type: 'project', projectId: 'tocantinzinho' },
            period: { kind: 'year', year: 2026 },
            metric: 'aisc',
            value: { kind: 'range', low: 1_330, high: 1_544 },
            unit: 'USD_per_toz_sold',
            sourcePriceDeckRef: 'gmin-guidance-2026',
            definition: { denominatorMeasure: 'sold' },
            provenance: q2Guidance,
          },
          {
            id: 'tz-cash-cost-2027-guidance',
            scope: { type: 'project', projectId: 'tocantinzinho' },
            period: { kind: 'year', year: 2027 },
            metric: 'cash_cost',
            value: { kind: 'range', low: 633, high: 743 },
            unit: 'USD_per_toz_sold',
            sourcePriceDeckRef: 'gmin-guidance-2027',
            definition: { denominatorMeasure: 'sold' },
            provenance: q2Guidance,
          },
          {
            id: 'tz-aisc-2027-guidance',
            scope: { type: 'project', projectId: 'tocantinzinho' },
            period: { kind: 'year', year: 2027 },
            metric: 'aisc',
            value: { kind: 'range', low: 977, high: 1_146 },
            unit: 'USD_per_toz_sold',
            sourcePriceDeckRef: 'gmin-guidance-2027',
            definition: { denominatorMeasure: 'sold' },
            provenance: q2Guidance,
          },
        ],
      },
      {
        id: 'oko',
        name: 'Oko Gold Project',
        primaryMetal: 'Au',
        statusAsOfValuationDate: 'construction',
        ownership: [
          { effectiveFrom: '2026-07-29', ownershipPct: 1, provenance: ownershipOko },
        ],
        production: [
          {
            id: 'oko-au-produced-2026-zero-before-first-gold',
            metal: 'Au',
            measure: 'produced',
            period: { kind: 'year', year: 2026 },
            quantity: { kind: 'point', value: 0 },
            unit: 'toz',
            basis: 'project_100pct',
            provenance: okoZero2026,
          },
          {
            id: 'oko-combined-lom-average-target',
            metal: 'Au',
            measure: 'produced',
            period: {
              kind: 'not_periodized',
              label: 'Combined Oko life-of-mine annual average; exact annual timing pending updated FS targeted mid-2027',
            },
            quantity: { kind: 'approximate', value: 500 },
            unit: 'koz',
            basis: 'project_100pct',
            provenance: okoTarget,
          },
        ],
        costs: [
          {
            id: 'oko-development-2026-guidance',
            component: 'growth_capex',
            period: { kind: 'year', year: 2026 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'growth',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 514_000_000, high: 568_000_000 }, currency: 'USD' },
            provenance: q2Guidance,
          },
          {
            id: 'oko-exploration-2026-guidance',
            component: 'growth_exploration',
            period: { kind: 'year', year: 2026 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'growth',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 15_000_000, high: 17_000_000 }, currency: 'USD' },
            provenance: q2Guidance,
          },
          {
            id: 'oko-development-2027-guidance',
            component: 'growth_capex',
            period: { kind: 'year', year: 2027 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'growth',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 217_000_000, high: 240_000_000 }, currency: 'USD' },
            provenance: q2Guidance,
          },
          {
            id: 'oko-exploration-2027-guidance',
            component: 'growth_exploration',
            period: { kind: 'year', year: 2027 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'growth',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 14_000_000, high: 18_000_000 }, currency: 'USD' },
            provenance: q2Guidance,
          },
        ],
      },
      {
        id: 'gurupi',
        name: 'Gurupi Project',
        primaryMetal: 'Au',
        statusAsOfValuationDate: 'study',
        ownership: [
          { effectiveFrom: '2024-12-19', ownershipPct: 1, provenance: ownershipGurupi },
        ],
        production: [],
        costs: [
          {
            id: 'gurupi-exploration-2026-guidance',
            component: 'growth_exploration',
            period: { kind: 'year', year: 2026 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'growth',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 19_000_000, high: 23_000_000 }, currency: 'USD' },
            provenance: q2Guidance,
          },
          {
            id: 'gurupi-exploration-2027-guidance',
            component: 'growth_exploration',
            period: { kind: 'year', year: 2027 },
            economicBasis: 'project_100pct',
            canonicalClassification: 'growth',
            model: { type: 'fixed_amount', amount: { kind: 'range', low: 18_000_000, high: 22_000_000 }, currency: 'USD' },
            provenance: q2Guidance,
          },
        ],
      },
    ],
    sources: [
      {
        id: Q2_2026_SOURCE,
        sourceType: 'company_release',
        publisher: 'G Mining Ventures Corp.',
        title: 'G Mining Ventures Reports Second Quarter 2026 Results – Strong Quarterly Free Cash Flow Reflects Solid Operational Performance',
        publishedDate: '2026-08-12',
        url: 'https://investors.gmin.gold/English/news/news-details/2026/G-Mining-Ventures-Reports-Second-Quarter-2026-Results--Strong-Quarterly-Free-Cash-Flow-Reflects-Solid-Operational-Performance/default.aspx',
      },
      {
        id: G2_CLOSE_SOURCE,
        sourceType: 'company_release',
        publisher: 'G Mining Ventures Corp.',
        title: 'G Mining Ventures and G2 Goldfields Announce Closing of Arrangement',
        publishedDate: '2026-07-29',
        url: 'https://investors.gmin.gold/English/news/news-details/2026/G-Mining-Ventures-and-G2-Goldfields-Announce-Closing-of-Arrangement/default.aspx',
      },
      {
        id: OKO_CURRENT_SOURCE,
        sourceType: 'other',
        publisher: 'G Mining Ventures Corp.',
        title: 'Oko Gold Project – Guyana',
        url: 'https://gmin.gold/assets/oko/',
      },
      {
        id: GURUPI_CURRENT_SOURCE,
        sourceType: 'other',
        publisher: 'G Mining Ventures Corp.',
        title: 'Gurupi Gold Project – Brazil',
        url: 'https://gmin.gold/assets/gurupi/',
      },
    ],
  };
}
