import assert from 'node:assert/strict';
import { deriveCorporateProductionLife } from '../preRevenueProductionLife.ts';

const continuous = deriveCorporateProductionLife({
  payableQtyByMetal: {
    Cu: [0, 10, 20, 30, 0],
    Au: [0, 0, 1, 1, 0],
  },
  corporateYearsByPeriod: [2029, 2030, 2031, 2032, 2033],
});
assert.equal(continuous.status, 'OK');
assert.equal(continuous.lomYears, 3);
assert.equal(continuous.activeProductionYears, 3);
assert.equal(continuous.firstProductionYear, 2030);
assert.equal(continuous.lastProductionYear, 2032);

const gap = deriveCorporateProductionLife({
  payableQtyByMetal: {
    Cu: [0, 10, 0, 30, 0],
    Au: [0, 0, 0, 0, 0],
  },
  corporateYearsByPeriod: [2029, 2030, 2031, 2032, 2033],
});
assert.equal(gap.status, 'OK');
assert.equal(gap.lomYears, 3, 'A zero-production year inside first-to-last payable production remains inside chronological LOM');
assert.equal(gap.activeProductionYears, 2, 'Active production years remain separately observable');

const closureExcluded = deriveCorporateProductionLife({
  payableQtyByMetal: { Cu: [0, 10, 20, 0, 0] },
  corporateYearsByPeriod: [2030, 2031, 2032, 2033, 2034],
});
assert.equal(closureExcluded.lomYears, 2);
assert.equal(closureExcluded.lastProductionYear, 2032);

const metalIndependent = deriveCorporateProductionLife({
  payableQtyByMetal: {
    Cu: [0, 10, 0, 0],
    Zn: [0, 0, 5, 0],
    Au: [0, 0, 0, 0],
  },
  corporateYearsByPeriod: [2030, 2031, 2032, 2033],
});
assert.equal(metalIndependent.lomYears, 2, 'LOM uses union of physical payable metals, not an Au/AuEq selector');

const unknownInside = deriveCorporateProductionLife({
  payableQtyByMetal: {
    Cu: [0, 10, null, 20, 0],
    Zn: [0, 0, null, 0, 0],
  },
});
assert.equal(unknownInside.status, 'INVALID_PAYABLE_SERIES');
assert.equal(unknownInside.lomYears, null);

const negative = deriveCorporateProductionLife({ payableQtyByMetal: { Cu: [0, 10, -1, 0] } });
assert.equal(negative.status, 'INVALID_PAYABLE_SERIES');
assert.equal(negative.lomYears, null);

console.log('preRevenueProductionLife.test.ts passed');
