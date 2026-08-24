import { materializeProducerForecastForYear } from '../forecast.ts';
import { computeProducerIntervalEconomics } from '../intervalEconomics.ts';
import type { CostComponent, ProducerJsonV1, Provenance } from '../types.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
}

const sourceProvenance: Provenance = { sourceId: 'company', estimateClass: 'company_target', confidence: 'high' };
const scenarioProvenance: Provenance = {
  sourceId: 'analyst-base',
  estimateClass: 'scenario',
  confidence: 'medium',
  confidenceReason: 'Synthetic regression fixture for a transparent analyst scenario bridge.',
};

const mineSiteIncluded: CostComponent[] = [
  'royalty',
  'production_tax',
  'tc_rc',
  'site_gna',
  'other_recurring_operating',
];

const producer: ProducerJsonV1 = {
  version: 'producer_json_v1',
  company: { id: 'ANALYST_BASE_PATTERN', name: 'Analyst BASE Pattern' },
  valuation: { valuationDateUtc: '2026-08-24' },
  projects: [{
    id: 'mine',
    name: 'Mine',
    primaryMetal: 'Au',
    statusAsOfValuationDate: 'operating',
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 1, provenance: sourceProvenance }],
    financialConsolidation: { method: 'full', provenance: sourceProvenance },
    production: [{
      id: 'mine-au-2030',
      metal: 'Au',
      measure: 'produced',
      period: { kind: 'year', year: 2030 },
      quantity: { kind: 'point', value: 100 },
      unit: 'toz',
      basis: 'project_100pct',
      provenance: sourceProvenance,
    }],
    forecastAssumptions: {
      costs: [{
        id: 'mine-analyst-base-cash-cost-2030',
        method: 'explicit',
        appliesTo: { startYear: 2030, endYear: 2030 },
        component: 'cash_operating_cost',
        economicBasis: 'project_100pct',
        canonicalClassification: 'operating',
        model: {
          type: 'per_unit',
          amount: { kind: 'point', value: 1_000 },
          currency: 'USD',
          denominator: { metal: 'Au', unit: 'toz', measure: 'produced' },
          netOfByproductCredits: false,
        },
        // The 1,000/oz composite is subtracted once. includesComponents is coverage metadata;
        // it must not create synthetic zero rows or double-count any included component.
        definition: { includesComponents: mineSiteIncluded },
        provenance: scenarioProvenance,
      }],
    },
  }],
  corporateCosts: [],
  forecastAssumptions: {
    corporateCosts: [
      {
        id: 'corp-gna', method: 'explicit', appliesTo: { startYear: 2030, endYear: 2030 },
        component: 'corporate_gna', economicBasis: 'company', canonicalClassification: 'operating',
        model: { type: 'fixed_amount', amount: { kind: 'point', value: 10_000 }, currency: 'USD' }, provenance: scenarioProvenance,
      },
      {
        id: 'sust-capex', method: 'explicit', appliesTo: { startYear: 2030, endYear: 2030 },
        component: 'sustaining_capex', economicBasis: 'company', canonicalClassification: 'sustaining',
        model: { type: 'fixed_amount', amount: { kind: 'point', value: 10_000 }, currency: 'USD' }, provenance: scenarioProvenance,
      },
      {
        id: 'sust-explore', method: 'explicit', appliesTo: { startYear: 2030, endYear: 2030 },
        component: 'sustaining_exploration', economicBasis: 'company', canonicalClassification: 'sustaining',
        model: { type: 'fixed_amount', amount: { kind: 'point', value: 0 }, currency: 'USD' }, provenance: scenarioProvenance,
      },
      {
        id: 'cash-tax', method: 'explicit', appliesTo: { startYear: 2030, endYear: 2030 },
        component: 'cash_income_tax', economicBasis: 'company', canonicalClassification: 'tax',
        model: { type: 'fixed_amount', amount: { kind: 'point', value: 10_000 }, currency: 'USD' }, provenance: scenarioProvenance,
      },
      {
        id: 'wc', method: 'explicit', appliesTo: { startYear: 2030, endYear: 2030 },
        component: 'working_capital_delta', economicBasis: 'company', canonicalClassification: 'working_capital',
        model: { type: 'fixed_amount', amount: { kind: 'point', value: 0 }, currency: 'USD' }, provenance: scenarioProvenance,
      },
      {
        id: 'other-cash', method: 'explicit', appliesTo: { startYear: 2030, endYear: 2030 },
        component: 'other_cash', economicBasis: 'company', canonicalClassification: 'sustaining',
        model: { type: 'fixed_amount', amount: { kind: 'point', value: 0 }, currency: 'USD' }, provenance: scenarioProvenance,
      },
      {
        id: 'growth-capex', method: 'explicit', appliesTo: { startYear: 2030, endYear: 2030 },
        component: 'growth_capex', economicBasis: 'company', canonicalClassification: 'growth',
        model: { type: 'fixed_amount', amount: { kind: 'point', value: 20_000 }, currency: 'USD' }, provenance: scenarioProvenance,
      },
      {
        id: 'growth-explore', method: 'explicit', appliesTo: { startYear: 2030, endYear: 2030 },
        component: 'growth_exploration', economicBasis: 'company', canonicalClassification: 'growth',
        model: { type: 'fixed_amount', amount: { kind: 'point', value: 0 }, currency: 'USD' }, provenance: scenarioProvenance,
      },
    ],
  },
  sources: [
    { id: 'company', sourceType: 'company_release', publisher: 'Issuer', title: 'Source production' },
    { id: 'analyst-base', sourceType: 'other', publisher: 'Analyst model', title: 'Explicit BASE assumptions' },
  ],
};

const materialized = materializeProducerForecastForYear(producer, 2030);
assertEqual(materialized.appliedRuleIds.length, 9, 'All explicit Analyst BASE cost rules must materialize');

const economics = computeProducerIntervalEconomics({
  producer: materialized.producer,
  year: 2030,
  caseMode: 'BASE',
  basis: 'financial',
  deck: {
    id: 'test-deck',
    mode: 'SPOT',
    valuationDateUtc: '2026-08-24',
    pricesByMetal: {
      Au: { metal: 'Au', valueUSD: 2_000, unit: 'USD_per_toz', readiness: 'production_ready' },
    },
    warnings: [],
  },
});

assertEqual(economics.revenueUSD.range?.low, 200_000, 'Analyst BASE revenue remains canonical shared-deck revenue');
assertEqual(economics.ebitdaUSD.range?.low, 90_000, 'Composite mine-site Analyst BASE cost must satisfy operating coverage without double counting included components');
assertEqual(economics.fcffBeforeGrowthUSD.range?.low, 70_000, 'Explicit sustaining/tax/WC Analyst BASE bridge must produce FCFF before growth');
assertEqual(economics.fcffAfterGrowthUSD.range?.low, 50_000, 'Explicit growth Analyst BASE bridge must produce FCFF after growth');

console.log('Mining Producer Analyst BASE bridge tests passed');
