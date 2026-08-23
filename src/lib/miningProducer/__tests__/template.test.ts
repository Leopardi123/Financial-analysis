import assert from 'node:assert/strict';
import { buildProducerJsonV1Template } from '../template.ts';
import { validateProducerJsonV1 } from '../schema.ts';

const template = buildProducerJsonV1Template('BTO.TO', '2026-08-23') as Record<string, any>;

assert.equal(template.version, 'producer_json_v1');
assert.equal(template.company.primarySecurity.ticker, 'BTO.TO');
assert.equal(template.valuation.valuationDateUtc, '2026-08-23');
assert.ok(Array.isArray(template._how_to_fill) && template._how_to_fill.length >= 8);
assert.ok(Array.isArray(template._hard_rules) && template._hard_rules.some((rule: string) => rule.includes('No guessing')));

assert.deepEqual(
  template._reference.numericClaim.alternatives.map((item: any) => item.kind),
  ['point', 'approximate', 'range', 'upper_bound', 'lower_bound'],
);
assert.deepEqual(
  template._reference.periodClaim.alternatives.map((item: any) => item.kind),
  ['year', 'year_range_average', 'year_range_total', 'not_periodized'],
);
assert.deepEqual(template._reference.production._choices_measure, ['produced', 'sold', 'payable']);
assert.ok(template._reference.production._replacement_rules.some((rule: string) => rule.includes('payable > sold > produced')));

const costModels = template._reference.costDisclosure._examples_models;
assert.deepEqual(
  Object.keys(costModels).sort(),
  ['derived', 'fixed_amount', 'per_unit', 'percent_revenue', 'price_linked', 'reported_total'].sort(),
);
assert.ok(template._reference.costDisclosure._replacement_rules.some((rule: string) => rule.includes('Reported AISC/cash cost does not replace')));
assert.deepEqual(template._reference.projectStatus._case_rules.BASE, ['operating', 'ramp_up', 'construction', 'sanctioned']);
assert.deepEqual(template._reference.projectStatus._case_rules.GROWTH_additionally_includes, ['development', 'study']);

assert.ok(template.valuation._description_market_value_alternatives.includes('reportedMarketCap'));
assert.ok(template.valuation._description_market_value_alternatives.includes('marketPrice × sharesOutstanding'));
assert.ok(template.valuation._description_balanceSheet.includes('totalDebt'));
assert.ok(template.valuation._description_balanceSheet.includes('cashAndEquivalents'));

assert.ok(template._example_reportedPriceDeck.appliesTo);
assert.ok(Array.isArray(template._example_project.ownership));
assert.ok(Array.isArray(template._example_project.production));
assert.ok(Array.isArray(template._example_project.costs));
assert.ok(Array.isArray(template._example_project.metalStreams));
assert.ok(Array.isArray(template._example_project.reportedMetrics));
assert.ok(template._example_source);

// Instruction/example metadata must not prevent the runtime validator from accepting a filled template.
template.company.name = 'B2Gold Corp.';
validateProducerJsonV1(template as any);

console.log('Producer self-documenting template tests passed');
