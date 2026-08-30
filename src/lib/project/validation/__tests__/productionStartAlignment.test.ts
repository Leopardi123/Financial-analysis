import assert from 'node:assert/strict';
import {
  buildProductionDriverFirstNonZeroMap,
  productionStartDriverDisagreement,
  productionStartIndexCandidate,
} from '../productionStartAlignment.ts';

const bergLike = buildProductionDriverFirstNonZeroMap({
  oreMinedTonnes: [5, 24, 10, 17, 49],
  oreMilledTonnes: [0, 0, 0, 32, 48],
  payableQtyByMetal: {
    Cu: [0, 0, 0, 228, 293],
    Mo: [0, 0, 0, 22, 22],
    Ag: [0, 0, 0, 3499, 4427],
    Au: [0, 0, 0, 17, 21],
  },
});
assert.equal(productionStartIndexCandidate(bergLike), 3, 'pre-production ore mining must not move tp ahead of first mill/payable production');
assert.deepEqual(productionStartDriverDisagreement(bergLike), { candidate: 3, disagreeingDrivers: [] });

const miningOnly = buildProductionDriverFirstNonZeroMap({
  oreMinedTonnes: [0, 12, 8],
  oreMilledTonnes: [0, 0, 0],
  payableQtyByMetal: {},
});
assert.equal(productionStartIndexCandidate(miningOnly), 1, 'ore mined is the fallback when no mill/payable production exists');

const conflictingActualDrivers = buildProductionDriverFirstNonZeroMap({
  oreMinedTonnes: [1, 2, 3, 4, 5],
  oreMilledTonnes: [0, 0, 0, 10, 10],
  payableQtyByMetal: {
    Cu: [0, 0, 0, 0, 1],
  },
});
assert.equal(productionStartIndexCandidate(conflictingActualDrivers), 3);
assert.deepEqual(productionStartDriverDisagreement(conflictingActualDrivers), {
  candidate: 3,
  disagreeingDrivers: [{ driver: 'metals.payableQtyByMetal.Cu', firstNonZeroIndex: 4 }],
});

console.log('productionStartAlignment.test.ts passed');
