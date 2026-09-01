import assert from 'node:assert/strict';
import { deriveCorporateRealPayback } from '../payback.ts';

// Viscaria regression from the Corporate project table audited 2026-09-01.
// Internal Corporate axis: 2025..2045. Production starts in 2027 => tp=2.
// The full-project deficit at production start must include 2025 and 2026 FCFF.
const viscariaFcffUSD = [
  -91_881_166,
  -261_992_719,
  -131_156_586.986,
  113_100_874.556,
  223_626_296.919,
  257_972_545.966,
  267_268_816.51,
  264_546_203.425,
  268_216_525.095,
  239_563_357.85,
  236_720_121.135,
  242_865_510.298,
  217_791_389.431,
  216_666_938.596,
  152_035_696.85,
  121_736_392.607,
  108_579_653.325,
  116_192_028.253,
  112_684_574.304,
  63_121_775.899,
  3_721_068,
];

const viscaria = deriveCorporateRealPayback({
  fcffUSD: viscariaFcffUSD,
  productionStartPeriod: 2,
  masterN: 20,
});

assert.equal(viscaria.productionStartPeriod, 2);
assert.equal(viscaria.cumulativeAtProductionStartUSD, -353_873_885);
assert.equal(viscaria.initialDeficitUSD, 353_873_885);
assert.equal(viscaria.crossingPeriod, 5, 'full-project cumulative FCFF should cross zero during 2030');
assert.ok(Math.abs((viscaria.paybackYears ?? 0) - 3.5748801677933044) < 1e-12);
assert.equal(Math.round((viscaria.paybackYears ?? 0) * 10) / 10, 3.6, 'displayed real payback should be 3.6 years from production start');
assert.equal(viscaria.diagnostic, null);

// Guard against the exact axis/sunk-cost regression found in the audit: if 2025 is
// incorrectly dropped and 2026 is treated as the first project period, the result is
// about 3.2 years. That is forward-looking payback, not canonical full-project payback.
const rebasedFrom2026 = deriveCorporateRealPayback({
  fcffUSD: viscariaFcffUSD.slice(1),
  productionStartPeriod: 1,
  masterN: 19,
});
assert.ok(Math.abs((rebasedFrom2026.paybackYears ?? 0) - 3.218713249789485) < 1e-9);
assert.notEqual(Math.round((rebasedFrom2026.paybackYears ?? 0) * 10) / 10, 3.6);

const invalid = deriveCorporateRealPayback({
  fcffUSD: [-10, null, 20],
  productionStartPeriod: 1,
});
assert.equal(invalid.paybackYears, null);
assert.match(invalid.diagnostic ?? '', /missing\/non-finite/);

console.log('payback.test.ts passed');
