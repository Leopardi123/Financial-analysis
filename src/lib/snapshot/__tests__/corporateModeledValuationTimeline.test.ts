import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCorporateModeledValuationTimeline } from '../corporateModeledValuationTimeline.ts';

test('corporate modeled valuation markers use corporate tp directly with passing sanity checks', () => {
  const masterN = 10;
  const corporatePeriodEndDatesUtc = Array.from({ length: masterN + 1 }, (_, t) => `${2030 + t}-12-31`);
  const fcfUSDTotal = Array.from({ length: masterN + 1 }, (_, t) => 100 + t * 10);

  const timeline = buildCorporateModeledValuationTimeline({
    projects: [
      {
        productionStartPeriod: 4,
        periodEndDatesUtc: corporatePeriodEndDatesUtc,
      },
      {
        productionStartPeriod: 5,
        periodEndDatesUtc: corporatePeriodEndDatesUtc,
      },
    ],
    corporatePeriodEndDatesUtc,
    fcfUSD_total: fcfUSDTotal,
    masterN,
    discountRate: 0.1,
    shares_post_financing: 100,
    fx_USD_to_TargetCurrency: 1,
    npvToday_USD: 1000,
    includeDebugSanity: true,
  });

  assert.equal(timeline.markers.length, 2);

  assert.equal(timeline.markers[0].tp, 4);
  assert.equal(timeline.markers[0].corporateTpIndexUsed, 4);
  assert.equal(timeline.markers[0].yearLabelUsed, corporatePeriodEndDatesUtc[4]);
  assert.equal(timeline.markers[0].sanity?.tpMatches, true);
  assert.equal(timeline.markers[0].sanity?.yearLabelMatches, true);
  assert.equal(timeline.markers[0].sanity?.fcfTailMatches, true);

  assert.equal(timeline.markers[1].tp, 5);
  assert.equal(timeline.markers[1].corporateTpIndexUsed, 5);
  assert.equal(timeline.markers[1].yearLabelUsed, corporatePeriodEndDatesUtc[5]);
  assert.equal(timeline.markers[1].sanity?.tpMatches, true);
  assert.equal(timeline.markers[1].sanity?.yearLabelMatches, true);
  assert.equal(timeline.markers[1].sanity?.fcfTailMatches, true);
});
